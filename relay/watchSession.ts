import { gzipSync } from "node:zlib";
import type { WebSocket } from "ws";
import {
  createLiveParser,
  passiveObserverProtocolState,
  GhostStateAccumulator,
  type LiveParserKit,
  type ParsedData,
  type RemoteCommandEventData,
  type CRCChallengeEventData,
  type GhostingMessageEventData,
} from "t2-demo-parser";
import { GameConnection } from "./gameConnection.js";
import {
  AUTH_COMMANDS,
  MAX_RETRIES,
  RETRY_DELAY_MS,
  shouldRetryDisconnect,
  retryStatusMessage,
  buildCRCDataBlockList,
} from "./shared.js";
import { WatchStateAccumulator } from "./watchState.js";
import { serializeCatchupPayload } from "./watchSerialize.js";
import { buildCatchupPayload } from "./watchCatchup.js";
import type { DemoCoordinator } from "./demoCoordinator.js";
import type { DemoRecorder } from "./demoRecorder.js";
import { relayLog } from "./logger.js";
import type {
  ConnectionStatus,
  ServerInfo,
  ServerMessage,
  WatchStatus,
} from "./types.js";

const WATCH_IDLE_GRACE_MS = parseInt(
  process.env.WATCH_IDLE_GRACE_MS || `${5 * 60_000}`,
  10,
);
/** Matches the real client's lobby refresh (LobbyGui.cs updateLobbyPlayerList). */
const SCORES_POLL_MS = 4_000;
/**
 * Live in-game score-HUD poll cadence (ms), 0 = off. Opens the score
 * screen (ShowHud) for one snapshot then closes it (HideHud) so the
 * server sends the SetLineHud scoreboard once per poll instead of the
 * continuous every-3s flood that deadlocks the observer's receive
 * window on busy servers. The only live per-player score source on
 * servers (TacoServer) whose MsgPlayerScore reports 0.
 */
const SCORE_HUD_POLL_MS = parseInt(
  process.env.WATCH_SCORE_HUD_POLL_MS || "0",
  10,
);
/** Delay before HideHud cancels the server's 3s reschedule (< 3s). */
const SCORE_HUD_CLOSE_MS = 2_000;
/** Grace before reverting an observer that got placed on a team, and how
 *  many times to re-send the revert if it doesn't take. */
const REOBSERVE_DELAY_MS = 2_000;
const REOBSERVE_MAX_ATTEMPTS = 3;
/** serverCmdWatchOnly pass that flags us isWatchOnly (exempt from the
 *  observer auto-kick); "ImaWatcher" is the stock $Host::ObserverOnlyPass. */
const WATCH_ONLY_PASS = process.env.WATCH_ONLY_PASS || "ImaWatcher";
/** Matches the real client's chat input limit ($Host::MaxMessageLen). */
const CHAT_MAX_LENGTH = 255;
const CATCHUP_CHUNK_BYTES = 256 * 1024;
/** The vote-menu answer and the join banner both land seconds after
 *  connect; nothing by then (e.g. a vote was in progress, so the menu
 *  wasn't sent) means "not tournament mode" until the next epoch asks. */
const TOURNEY_DECISION_GRACE_MS = 8_000;
/** Min gap between recording-driven mission-cycle reconnects — a second
 *  cycle sooner than this rides in place instead (no reconnect loops). */
const CYCLE_RECONNECT_MIN_MS = 60_000;
/** How long watchers keep the frozen end-of-match state (scoreboard,
 *  game-over sound, end chat) before a mission-cycle rotation reconnects. */
function cycleLingerMs(): number {
  return parseInt(process.env.WATCH_CYCLE_LINGER_MS || "5000", 10);
}

function toWatchStatus(status: ConnectionStatus): WatchStatus {
  switch (status) {
    case "connecting":
    case "challenging":
      return "connecting";
    case "authenticating":
      return "authenticating";
    case "connected":
      return "live";
    case "disconnected":
      return "ended";
  }
}

function sendJson(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export interface WatchSessionManagerOptions {
  gameBasePath: string;
  getCachedServer: (address: string) => ServerInfo | undefined;
  /** When present and enabled, sessions auto-record each mission to a .rec. */
  demoCoordinator?: DemoCoordinator;
  /** Fired whenever the set of session addresses changes (persistence
   *  hook for warm-booting after a restart). */
  onSessionsChanged?: (addresses: string[]) => void;
  /**
   * Watcher-facing stream delay (ms) applied while a server is in
   * tournament mode (anti screen-peek). Recording and protocol handling
   * stay live; 0/unset never delays.
   */
  tourneyDelayMs?: number;
  /**
   * Mission-type display names (case-insensitive) that never run in
   * tournament mode (e.g. LakRabbit) — skip the check and never delay.
   */
  tourneySkipTypes?: string[];
  /** Test seam: construct the game connection (default: real UDP). */
  createConnection?: (address: string) => GameConnection;
}

export class WatchSessionManager {
  private sessions = new Map<string, WatchSession>();
  private options: WatchSessionManagerOptions;

  constructor(options: WatchSessionManagerOptions) {
    this.options = options;
  }

  /** Attach a watcher socket to the session for `address`, creating it. */
  watch(ws: WebSocket, address: string): void {
    // A socket watches at most one server.
    this.detachSocket(ws);
    const session = this.getOrCreateSession(address);
    session.attach(ws);
  }

  /**
   * Boot-time session pre-warm (restart continuity): reconnect to a
   * server that was being watched before the restart, so returning
   * watchers get instant catch-up. With no watchers attached, the idle
   * grace timer bounds the session's life if nobody comes back.
   */
  warmStart(address: string): void {
    const session = this.getOrCreateSession(address);
    session.ensureIdleGrace();
  }

  /** Patrol: create (if needed) and pin a session — exempt from idle
   *  teardown until unpinned. */
  pin(address: string): void {
    this.getOrCreateSession(address).pin();
  }

  unpin(address: string): void {
    this.sessions.get(normalizeAddress(address))?.unpin();
  }

  getSession(address: string): WatchSession | undefined {
    return this.sessions.get(normalizeAddress(address));
  }

  private getOrCreateSession(address: string): WatchSession {
    const key = normalizeAddress(address);
    let session = this.sessions.get(key);
    if (!session) {
      session = new WatchSession(key, this.options, () => {
        this.sessions.delete(key);
        this.notifySessionsChanged();
      });
      this.sessions.set(key, session);
      session.start();
      this.notifySessionsChanged();
    }
    return session;
  }

  private notifySessionsChanged(): void {
    this.options.onSessionsChanged?.([...this.sessions.keys()]);
  }

  /** Whether an active session exists for this address. */
  has(address: string): boolean {
    return this.sessions.has(normalizeAddress(address));
  }

  /** Detach a watcher (leaveServer or socket close). */
  detachSocket(ws: WebSocket): void {
    for (const session of this.sessions.values()) {
      session.detach(ws);
    }
  }

  /** Send chat from a watcher through its session's shared identity. */
  sendChat(ws: WebSocket, text: string): void {
    for (const session of this.sessions.values()) {
      if (session.hasWatcher(ws)) {
        session.sendChat(text);
        return;
      }
    }
  }

  getStatusSummary(): Array<{
    address: string;
    status: WatchStatus;
    watchers: number;
    recording: boolean;
    pinned: boolean;
    /** Watcher-facing tournament delay in effect (ms); 0 = live. */
    delayMs: number;
  }> {
    return [...this.sessions.values()].map((s) => ({
      address: s.key,
      status: s.watchStatus,
      watchers: s.watcherCount,
      recording: s.recording,
      pinned: s.isPinned,
      delayMs: s.streamDelayMs,
    }));
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
      // Tell watchers this is a restart (auto-reattach) before the
      // session's teardown messages reach them.
      session.notifyRestarting();
      session.destroy("Relay shutting down");
    }
    this.sessions.clear();
  }
}

export function normalizeAddress(address: string): string {
  const trimmed = address.trim().toLowerCase();
  return trimmed.includes(":") ? trimmed : `${trimmed}:28000`;
}

/** One step of the delayed (tournament) watcher stream. */
type DelayedItem =
  | { kind: "packet"; at: number; data: Uint8Array }
  | { kind: "epoch"; at: number; epoch: number }
  | { kind: "connected"; at: number };

/**
 * The watcher-facing replica of the live parse, fed from the delay queue:
 * a second parser + accumulators exactly `delayMs` behind, so both the
 * fan-out and late-joiner catch-up describe the past, never the present.
 */
interface DelayedReplica {
  epoch: number;
  kit: LiveParserKit;
  ghostState: GhostStateAccumulator;
  watchState: WatchStateAccumulator;
  connectSynced: boolean;
  connected: boolean;
  packetCount: number;
}

/** What a catch-up is built from: the live pipeline or the delayed replica. */
interface CatchupSource {
  kind: "live" | "delayed";
  packetParser: LiveParserKit["packetParser"];
  ghostTracker: LiveParserKit["ghostTracker"];
  ghostState: GhostStateAccumulator;
  watchState: WatchStateAccumulator;
  epoch: number;
  packetCount: number;
}

/**
 * One shared game-server connection plus its parsed world state and
 * watcher fan-out. The session owns every protocol response (auth,
 * mission phases, CRC, ghost acks) — watchers are strictly read-only.
 *
 * Per-datagram work is fully synchronous (parse → accumulate → respond
 * → forward), and catch-up delivery happens in one macrotask, so a
 * watcher's catch-up reflects exactly packets 1..N and the first live
 * frame it receives is packet N+1.
 */
export class WatchSession {
  readonly key: string;
  private connection: GameConnection | null = null;
  private parserKit: LiveParserKit;
  private ghostState = new GhostStateAccumulator();
  private watchState = new WatchStateAccumulator();
  /** Sockets receiving the live raw packet stream. */
  private watchers = new Set<WebSocket>();
  /** Sockets awaiting handshake completion + catch-up delivery. */
  private pending = new Set<WebSocket>();
  private epoch = 0;
  private packetCount = 0;
  private connectSynced = false;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private scoresTimer: ReturnType<typeof setInterval> | null = null;
  private scoreHudTimer: ReturnType<typeof setInterval> | null = null;
  private scoreHudCloseTimer: ReturnType<typeof setTimeout> | null = null;
  private reObserveTimer: ReturnType<typeof setTimeout> | null = null;
  private reObserveAttempts = 0;
  /** A team-revert sequence is in progress or exhausted; cleared only when
   *  we're confirmed back on the observer team. */
  private reObserveActive = false;
  private retryCount = 0;
  /** Re-syncs without a healthy stretch (~5000 packets) in between. */
  private resyncCount = 0;
  /** One recorder per connection epoch (one connection = one demo). */
  private recorder: DemoRecorder | null = null;
  private lastCycleReconnectAt = 0;
  /** Mission-cycle rotation pending: stream frozen until reconnect. */
  private rotating = false;
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  /** Patrol pin: exempt from idle teardown while set. */
  private pinned = false;
  private destroyed = false;
  private lastStatus: ConnectionStatus = "connecting";
  private lastPingMs: number | null = null;
  private cachedPayload: {
    kind: CatchupSource["kind"];
    epoch: number;
    packetCount: number;
    gzipped: Uint8Array;
  } | null = null;
  /** Watcher-facing delay for the current epoch (ms); 0 = live. */
  private delayMs = 0;
  /** Whether this epoch's tournament status has been acted on yet. */
  private tourneyResolved = false;
  private tourneyDecisionTimer: ReturnType<typeof setTimeout> | null = null;
  private delayQueue: DelayedItem[] = [];
  /** Epoch ms when the delayed stream first has frames to serve (the
   *  live connect time + delayMs); meaningful only while buffering. */
  private delayReadyAt = 0;
  private delayTimer: ReturnType<typeof setTimeout> | null = null;
  private replica: DelayedReplica | null = null;

  private options: WatchSessionManagerOptions;
  private onDestroyed: () => void;

  constructor(
    key: string,
    options: WatchSessionManagerOptions,
    onDestroyed: () => void,
  ) {
    this.key = key;
    this.options = options;
    this.onDestroyed = onDestroyed;
    this.parserKit = createLiveParser();
  }

  get watcherCount(): number {
    return this.watchers.size + this.pending.size;
  }

  /** True when this socket is attached (live watchers only, not pending —
   *  no chatting before the world is visible). */
  hasWatcher(ws: WebSocket): boolean {
    return this.watchers.has(ws);
  }

  /** Relay a watcher's chat line as the shared identity (global chat via
   *  serverCmdMessageSent → chatMessageAll, hud.cs:862). Spam handling is
   *  the game server's business. */
  sendChat(text: string): void {
    if (this.lastStatus !== "connected") return;
    const trimmed = text.trim().slice(0, CHAT_MAX_LENGTH);
    if (!trimmed) return;
    this.connection?.sendCommand("messageSent", trimmed);
  }

  get watchStatus(): WatchStatus {
    return toWatchStatus(this.lastStatus);
  }

  start(): void {
    this.stopRecording("restart");
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }
    this.rotating = false;
    this.epoch++;
    this.connectSynced = false;
    this.packetCount = 0;
    this.cachedPayload = null;
    this.parserKit = createLiveParser();
    this.ghostState = new GhostStateAccumulator();
    this.watchState = new WatchStateAccumulator();
    this.cancelTourneyDecision();

    // Fail safe: when a tournament delay is configured, every epoch
    // starts DELAYED and only lifts once the server is confirmed NOT in
    // tournament mode (a few seconds in). A leak would defeat the anti-
    // screen-peek purpose, so the cost is instead a brief cold start —
    // watchers wait a beat before their first frame, never the reverse.
    // (A queue carried over from the previous epoch keeps draining; the
    // enqueued epoch marker rebuilds the replica when it is reached.)
    this.tourneyResolved = false;
    this.delayMs = this.options.tourneyDelayMs ?? 0;
    if (this.delayMs > 0) {
      this.enqueueDelayed({ kind: "epoch", at: Date.now(), epoch: this.epoch });
    }

    const conn =
      this.options.createConnection?.(this.key) ?? new GameConnection(this.key);
    this.connection = conn;
    // Authenticated: our account GUID identifies our own client for the
    // observer-team guard (falls back to the welcome join without it).
    this.watchState.expectedSelfGuid = conn.selfGuid;
    const cached = this.options.getCachedServer(this.key);
    if (cached?.mapName) conn.setMapName(cached.mapName);

    this.recorder =
      this.options.demoCoordinator?.createRecorder({
        address: this.key,
        getConnectSequence: () => conn.connectSequence,
        getServerInfo: () => this.options.getCachedServer(this.key),
        getServerIdentity: () => {
          // Stream-known values (watchState) win; the server-list cache
          // fills gaps live at sample time — an entry may only appear on a
          // later poll, `mod` has no stream source at all, and the cache
          // covers a name across the reconnect gap before the new epoch's
          // MsgMissionDropInfo re-learns it. gameType is mission-scoped, so
          // watchState.missionType (reset each epoch) is authoritative.
          const info = this.options.getCachedServer(this.key);
          return {
            name: this.watchState.serverName ?? info?.name,
            gameType: this.watchState.missionType ?? info?.gameType,
            mod: info?.mod,
          };
        },
        getActivePlayerCount: () => this.watchState.countActivePlayers(),
        getPlayerNames: () => this.watchState.getRosterNames(),
        getMatchStarted: () => this.watchState.matchStarted,
        getRecordContext: () => ({
          pinned: this.pinned,
          watchers: this.watcherCount,
        }),
        onStateChange: () => this.fanOutSessionStatus(),
      }) ?? null;

    conn.on("status", (status: ConnectionStatus, message?: string) => {
      if (this.connection !== conn) return;
      this.handleStatus(conn, status, message);
    });
    conn.on("packet", (data: Uint8Array) => {
      if (this.connection !== conn) return;
      this.handlePacket(data);
    });
    conn.on("sent", () => {
      if (this.connection !== conn) return;
      this.recorder?.onSent();
    });
    conn.on("ping", (ms: number) => {
      if (this.connection !== conn) return;
      this.lastPingMs = ms;
      this.fanOut({ type: "ping", ms });
    });
    conn.on("error", (err: Error) => {
      if (this.connection !== conn) return;
      relayLog.error({ err, address: this.key }, "Watch session game error");
    });

    conn.connect().catch((err) => {
      relayLog.error(
        { err, address: this.key },
        "Watch session connect failed",
      );
      if (this.connection === conn) {
        this.endSession(
          `Connect failed: ${err instanceof Error ? err.message : err}`,
        );
      }
    });
  }

  // ── Watcher lifecycle ──

  /** Start the idle grace clock when no watchers are attached — used
   *  for warm-started sessions, which would otherwise never expire. */
  ensureIdleGrace(): void {
    if (
      !this.destroyed &&
      !this.pinned &&
      this.watcherCount === 0 &&
      !this.idleTimer
    ) {
      this.startIdleTimer();
    }
  }

  // ── Patrol pinning ──

  get isPinned(): boolean {
    return this.pinned;
  }

  /** Accurate non-observer player count (post-join roster). */
  get activePlayerCount(): number {
    return this.watchState.countActivePlayers();
  }

  /** Exempt this session from idle teardown (patrol recording). */
  pin(): void {
    if (this.destroyed) return;
    this.pinned = true;
    this.cancelIdleTimer();
  }

  unpin(): void {
    this.pinned = false;
    this.ensureIdleGrace();
  }

  /** Deploy/restart imminent: watchers should reattach, not give up. */
  notifyRestarting(): void {
    this.fanOut({ type: "relayRestarting" });
  }

  attach(ws: WebSocket): void {
    if (this.destroyed) return;
    this.cancelIdleTimer();
    this.pending.add(ws);
    this.sendSessionStatus(ws);
    this.broadcastWatcherCount();
    if (this.lastStatus === "connected") {
      this.deliverCatchup(ws);
    }
  }

  detach(ws: WebSocket): void {
    const removed = this.watchers.delete(ws) || this.pending.delete(ws);
    if (!removed) return;
    this.broadcastWatcherCount();
    if (this.watcherCount === 0 && !this.pinned) {
      this.startIdleTimer();
    }
  }

  private startIdleTimer(): void {
    this.cancelIdleTimer();
    relayLog.info(
      { address: this.key, graceMs: WATCH_IDLE_GRACE_MS },
      "No watchers left — starting idle grace timer",
    );
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.watcherCount === 0) {
        relayLog.info(
          { address: this.key },
          "Idle grace expired — ending session",
        );
        this.destroy();
      }
    }, WATCH_IDLE_GRACE_MS);
  }

  private cancelIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  // ── Status / reconnect ──

  private handleStatus(
    conn: GameConnection,
    status: ConnectionStatus,
    message?: string,
  ): void {
    relayLog.info(
      { address: this.key, status, message, watchers: this.watcherCount },
      "Watch session status changed",
    );
    this.lastStatus = status;

    if (status === "connected") {
      this.retryCount = 0;
      // Observer team was enforced by GameConnection; scope the whole map
      // so every watcher's free camera sees all ghosts regardless of
      // position (commander-map scoping, binary-verified server behavior).
      conn.sendCommand("ScopeCommanderMap", "1");
      // TacoServer-based servers auto-kick observers on a fixed timer
      // ($Host::KickObserverTimeout, "Observer Timeout") regardless of
      // activity; WATCH_ONLY_PASS exempts us. Unknown serverCmds are
      // no-ops elsewhere.
      conn.sendCommand("WatchOnly", WATCH_ONLY_PASS);
      this.startScoresPoll();
      this.startScoreHudPoll();
      if (this.delayMs > 0) {
        this.delayReadyAt = Date.now() + this.delayMs;
        this.enqueueDelayed({ kind: "connected", at: Date.now() });
        // Tournament-mode probe: sendGameVoteMenu answers with
        // VoteFFAMode (tournament) or VoteTournamentMode (normal) under
        // this key. Non-tournament servers lift the provisional delay.
        conn.sendCommand("GetVoteMenu", "TourneyQuery");
        this.startTourneyDecision();
      }
      // Serve everyone who was waiting on the handshake. A live/warm
      // session hands them a catch-up; a delayed session still in its
      // cold-start buffer sends the "delayed, live in ~Xs" status.
      for (const ws of [...this.pending]) {
        this.deliverCatchup(ws);
      }
      if (this.isDelayBuffering()) {
        for (const ws of this.pending) this.sendSessionStatus(ws);
      }
      return;
    }

    if (status === "disconnected") {
      this.stopScoresPoll();
      this.stopScoreHudPoll();
      this.cancelReObserve();
      // Covers both cycle styles: servers that hard-disconnect at mission
      // change ("Server is cycling mission") and terminal disconnects.
      this.stopRecording(`disconnected: ${message ?? "unknown"}`);
      // Pinned (patrol) sessions retry like watched ones — without this
      // a disconnect-style mission cycle would destroy the session and
      // cost the next mission's recording.
      if (
        shouldRetryDisconnect(message, this.retryCount) &&
        (this.watcherCount > 0 || this.pinned)
      ) {
        this.retryCount++;
        relayLog.info(
          { address: this.key, attempt: this.retryCount },
          "Retryable disconnect — session will reconnect",
        );
        // A new connection means new sequence state and ghost IDs: every
        // watcher goes back to pending and re-hydrates from a fresh epoch.
        this.rehydrateWatchers();
        this.fanOut({
          type: "sessionStatus",
          status: "connecting",
          message: retryStatusMessage(message ?? "", this.retryCount),
          address: this.key,
          mapName: this.sessionMapName(),
          watcherCount: this.watcherCount,
        });
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          if (!this.destroyed && (this.watcherCount > 0 || this.pinned)) {
            this.start();
          }
        }, RETRY_DELAY_MS);
        return;
      }
      this.endSession(message);
      return;
    }

    this.fanOutSessionStatus(message);
  }

  private endSession(message?: string): void {
    this.fanOut({
      type: "sessionStatus",
      status: "ended",
      message,
      address: this.key,
      watcherCount: 0,
    });
    this.destroy();
  }

  destroy(reason?: string): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.cancelIdleTimer();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.rotateTimer) clearTimeout(this.rotateTimer);
    if (this.delayTimer) clearTimeout(this.delayTimer);
    this.delayQueue = [];
    this.replica = null;
    this.cancelTourneyDecision();
    this.stopScoresPoll();
    this.stopScoreHudPoll();
    this.cancelReObserve();
    this.stopRecording(reason ?? "session ended");
    if (reason) {
      this.fanOut({
        type: "sessionStatus",
        status: "ended",
        message: reason,
        address: this.key,
        watcherCount: 0,
      });
    }
    this.watchers.clear();
    this.pending.clear();
    const conn = this.connection;
    this.connection = null;
    if (conn && conn.status !== "disconnected") {
      conn.disconnect();
    }
    this.onDestroyed();
  }

  // ── Packet pipeline ──

  private handlePacket(data: Uint8Array): void {
    // Frozen for a pending mission-cycle rotation: the epoch's parser
    // state is dead and watchers are deliberately left on their
    // end-of-match view until the reconnect re-hydrates them.
    if (this.rotating) return;
    // Detection can lift the delay mid-packet (a non-tournament server
    // resolving); remember the state we entered with so the tail below
    // doesn't also raw-send a packet the lift's catch-up already carried.
    const wasDelayed = this.delayMs > 0;
    this.syncConnectSequence(data);
    let parsed;
    try {
      parsed = this.parserKit.packetParser.parsePacket(data);
    } catch (e) {
      relayLog.error(
        { err: e, address: this.key, packet: this.packetCount },
        "Watch session packet parse failed",
      );
      // Our state skipped this packet; forwarding it would put every
      // watcher permanently ahead of the state we seed late joiners with.
      this.resyncSession("packet parse failed");
      return;
    }

    // Record only packets the parser handled — an unparseable packet in
    // the demo would break playback at the same spot (the resync above
    // finalizes the recording, so the file stays valid to its last byte).
    this.recorder?.onPacket(data);

    if (parsed) {
      this.packetCount++;
      // A long healthy stretch forgives past re-syncs, so rare faults
      // over a session's lifetime never exhaust the re-sync budget.
      if (this.resyncCount > 0 && this.packetCount > 5000) {
        this.resyncCount = 0;
      }
      // NetStrings apply before responders so funcName refs resolve.
      // The relay's own accumulators only feed catch-up snapshots and
      // recording metadata — watchers parse the raw packet themselves and
      // the demo already captured it above (onPacket) — so a parsing bug
      // here must never crash the process and lose every in-flight demo.
      // Contain it: log, skip this packet's local state update, carry on.
      try {
        this.watchState.applyPacket(parsed);
        this.ghostState.applyPacket(parsed);
        this.maybeReObserve();
      } catch (e) {
        relayLog.error(
          { err: e, address: this.key, packet: this.packetCount },
          "Watch state update threw — skipping this packet's state update",
        );
      }
      // A skipped type — known only from the stream (MsgLoadInfo /
      // MsgMissionDropInfo), never the server-list cache — lifts the
      // provisional delay immediately, ahead of the vote-menu answer.
      if (this.isTourneySkippedType(this.watchState.missionType)) {
        this.setTournamentMode(false);
      } else {
        const tourney = this.watchState.tournamentMode;
        if (tourney !== null) this.setTournamentMode(tourney);
      }
      for (const event of parsed.events) {
        if (event.parsedData) this.handleResponderEvent(event.parsedData);
      }

      // The packet that triggered a rotation (EndGhosting) is recorded
      // but NOT forwarded — watchers keep the final world frozen.
      if (this.rotating) return;

      // Invariant: the accumulator must mirror the parser's ghost tracker
      // exactly — any mismatch would seed late joiners with a tracker
      // that diverges from ours, corrupting everything they parse next.
      if (
        this.packetCount % 500 === 0 &&
        !this.checkAccumulatorInvariant("periodic")
      ) {
        this.resyncSession("ghost accumulator diverged");
        return;
      }
    }

    if (this.delayMs > 0) {
      // Tournament delay: watchers get this packet `delayMs` later, via
      // the replica. Copy — `data` is a view over the dgram pool buffer.
      this.enqueueDelayed({
        kind: "packet",
        at: Date.now(),
        data: data.slice(),
      });
      return;
    }
    // Delayed at entry but lifted while processing this packet: the
    // lift re-hydrated watchers from a catch-up that already reflects
    // it, so a raw send here would deliver it twice.
    if (wasDelayed) return;
    for (const ws of this.watchers) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data, { binary: true });
      }
    }
  }

  // ── Tournament-mode stream delay ──

  /** Watcher-facing delay currently applied (ms); 0 when live. */
  get streamDelayMs(): number {
    return this.delayMs;
  }

  /** Whether a mission-type display name is exempt from the tournament
   *  delay (case-insensitive; e.g. LakRabbit can't be tournament). */
  private isTourneySkippedType(gameType: string | undefined): boolean {
    if (!gameType) return false;
    const key = gameType.trim().toLowerCase();
    return (this.options.tourneySkipTypes ?? []).some(
      (t) => t.trim().toLowerCase() === key,
    );
  }

  /** Delayed, connected, but the first `delayMs` of buffer hasn't
   *  elapsed — no delayed frames to serve a watcher yet. */
  private isDelayBuffering(): boolean {
    return (
      this.delayMs > 0 &&
      this.lastStatus === "connected" &&
      !this.replica?.connected
    );
  }

  /**
   * Watcher-facing delay in ms: 0 until tournament mode is CONFIRMED, so
   * the provisional (fail-safe) delay during the ~1s decision window
   * never surfaces as a "delayed" badge/notice on the client. The real
   * (possibly provisional) delay stays visible to ops via getStatusSummary.
   */
  private confirmedDelayMs(): number {
    return this.tourneyResolved ? this.delayMs : 0;
  }

  /**
   * Rough ms until the delayed stream begins, while buffering — but only
   * once tournament mode is CONFIRMED. Before that the delay is
   * provisional (fail-safe) and usually lifts within ~1s, so the notice
   * would flash on every ordinary join; undefined suppresses it.
   */
  private delayReadyInMs(): number | undefined {
    if (!this.tourneyResolved || !this.isDelayBuffering()) return undefined;
    return Math.max(0, this.delayReadyAt - Date.now());
  }

  /**
   * Resolve this epoch's tournament status (from the vote-menu answer /
   * banner, or the grace timeout). Tournament keeps the provisional
   * delay; not-tournament lifts it. Idempotent per epoch. Also a test
   * seam. No effect once resolved or when no delay is configured.
   */
  setTournamentMode(on: boolean): void {
    if (this.tourneyResolved || this.delayMs === 0 || this.destroyed) return;
    this.tourneyResolved = true;
    this.cancelTourneyDecision();
    relayLog.info(
      { address: this.key, tournamentMode: on, delayMs: this.delayMs },
      "Tournament mode resolved",
    );
    if (!on) {
      this.liftDelay();
    } else {
      // Confirmed tournament while still buffering: push the now-known
      // delay countdown to watchers waiting in the cold-start window.
      for (const ws of this.pending) this.sendSessionStatus(ws);
    }
  }

  /**
   * Stop delaying: drop the buffer and re-hydrate every watcher from the
   * live pipeline (jump to the present). In the common case (a
   * non-tournament server resolving during its cold-start window) the
   * queue holds only a second or two and no watcher has seen the delayed
   * stream yet, so the jump is invisible. A mid-session tournament→normal
   * switch (rare, admin-driven) fast-forwards watchers past the ended
   * match's tail to live.
   */
  private liftDelay(): void {
    if (this.delayMs === 0) return;
    this.delayMs = 0;
    if (this.delayTimer) {
      clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    this.delayQueue = [];
    this.replica = null;
    for (const ws of this.watchers) this.pending.add(ws);
    this.watchers.clear();
    this.broadcastWatcherCount();
    if (this.lastStatus === "connected" && !this.rotating) {
      for (const ws of [...this.pending]) this.deliverCatchup(ws);
    }
  }

  private startTourneyDecision(): void {
    this.cancelTourneyDecision();
    this.tourneyDecisionTimer = setTimeout(() => {
      this.tourneyDecisionTimer = null;
      this.setTournamentMode(this.watchState.tournamentMode === true);
    }, TOURNEY_DECISION_GRACE_MS);
  }

  private cancelTourneyDecision(): void {
    if (this.tourneyDecisionTimer) {
      clearTimeout(this.tourneyDecisionTimer);
      this.tourneyDecisionTimer = null;
    }
  }

  private enqueueDelayed(item: DelayedItem): void {
    this.delayQueue.push(item);
    this.scheduleRelease();
  }

  private scheduleRelease(): void {
    if (this.delayTimer || this.delayQueue.length === 0 || this.destroyed) {
      return;
    }
    const dueIn = this.delayQueue[0].at + this.delayMs - Date.now();
    this.delayTimer = setTimeout(
      () => {
        this.delayTimer = null;
        this.releaseDue();
      },
      Math.max(0, dueIn),
    );
  }

  private releaseDue(): void {
    const cutoff = Date.now() - this.delayMs;
    while (this.delayQueue.length > 0 && this.delayQueue[0].at <= cutoff) {
      this.applyDelayed(this.delayQueue.shift()!);
      // Catch up pending watchers as soon as the replica can serve them,
      // before any later packet in this batch goes out (same packets-
      // 1..N-then-N+1 guarantee as the live path).
      if (this.pending.size > 0 && this.replica?.connected) {
        for (const ws of [...this.pending]) this.deliverCatchup(ws);
      }
    }
    this.scheduleRelease();
  }

  private applyDelayed(item: DelayedItem): void {
    switch (item.kind) {
      case "epoch": {
        // The delayed stream reaches a new connection: fresh replica, and
        // every watcher re-hydrates from it once its handshake completes.
        this.replica = {
          epoch: item.epoch,
          kit: createLiveParser(),
          ghostState: new GhostStateAccumulator(),
          watchState: new WatchStateAccumulator(),
          connectSynced: false,
          connected: false,
          packetCount: 0,
        };
        for (const ws of this.watchers) this.pending.add(ws);
        this.watchers.clear();
        return;
      }
      case "connected": {
        if (this.replica) this.replica.connected = true;
        return;
      }
      case "packet": {
        const r = this.replica;
        if (!r) return;
        if (!r.connectSynced && item.data.length >= 1) {
          r.kit.packetParser.setConnectionProtocolState(
            passiveObserverProtocolState(item.data[0]),
          );
          r.connectSynced = true;
        }
        let parsed;
        try {
          parsed = r.kit.packetParser.parsePacket(item.data);
        } catch (e) {
          // The live pipeline re-synced at this very packet `delayMs`
          // ago; its "epoch" marker follows in the queue. Forwarding the
          // packet would desync watchers the same way.
          relayLog.debug(
            { err: e, address: this.key },
            "Delayed replica packet parse failed",
          );
          return;
        }
        if (parsed) {
          r.packetCount++;
          r.watchState.applyPacket(parsed);
          r.ghostState.applyPacket(parsed);
        }
        for (const ws of this.watchers) {
          if (ws.readyState === ws.OPEN) {
            ws.send(item.data, { binary: true });
          }
        }
        return;
      }
    }
  }

  /**
   * Hard re-sync: the parser or accumulators no longer mirror the stream
   * (parse failure or ghost divergence), so watcher state and any future
   * catch-up would be corrupt. Reconnect from scratch — the server
   * re-sends datablocks and the ghost-always stream on a fresh
   * connection, and every watcher re-hydrates from a new epoch.
   */
  private resyncSession(reason: string): void {
    if (this.destroyed) return;
    if (this.resyncCount >= MAX_RETRIES) {
      this.endSession(`Stream state diverged: ${reason}`);
      return;
    }
    this.resyncCount++;
    relayLog.warn(
      { address: this.key, reason, attempt: this.resyncCount },
      "Watch session re-syncing from a fresh connection",
    );
    this.stopRecording(`resync: ${reason}`);
    this.reconnect("Re-syncing with server...");
  }

  /**
   * Every watcher re-hydrates from a fresh epoch. With the tournament
   * delay active the switch happens when the delayed stream reaches the
   * new epoch (its queued "epoch" marker) — until then watchers keep
   * receiving the previous epoch's delayed packets.
   */
  private rehydrateWatchers(): void {
    if (this.delayMs > 0) return;
    for (const ws of this.watchers) this.pending.add(ws);
    this.watchers.clear();
  }

  /**
   * Tear down the current connection and start a fresh epoch: every
   * watcher goes back to pending and re-hydrates from a new catch-up
   * (new sequence state and ghost IDs).
   */
  private reconnect(statusMessage: string): void {
    this.lastStatus = "connecting";
    this.rehydrateWatchers();
    this.fanOut({
      type: "sessionStatus",
      status: "connecting",
      message: statusMessage,
      address: this.key,
      mapName: this.sessionMapName(),
      watcherCount: this.watcherCount,
    });
    const conn = this.connection;
    this.connection = null;
    if (conn && conn.status !== "disconnected") {
      conn.disconnect();
    }
    this.start();
  }

  // ── Demo recording ──

  get recording(): boolean {
    return this.recorder?.state === "recording";
  }

  /** Detach the recorder and hand it to the coordinator to finalize —
   *  detaching first so no later packet can write to a finalizing file. */
  private stopRecording(reason: string): void {
    const recorder = this.recorder;
    if (!recorder) return;
    this.recorder = null;
    this.options.demoCoordinator?.finalize(recorder, reason);
  }

  /**
   * Mission cycle observed in-stream (EndGhosting, or a Phase1 mission
   * change that arrived without one). When recording, rotate the demo by
   * reconnecting: the old file keeps the match end and world teardown,
   * and the fresh connection captures the new mission's full datablock +
   * ghost-always preamble from packet 1. Watchers ride the normal
   * re-hydrate flow during the intermission.
   */
  private handleMissionCycle(trigger: string): void {
    if (!this.recorder || this.destroyed) return;
    // A cycle before Phase1 ever arrived (we joined mid-cycle): keep
    // buffering — the from-connect stream stays valid across an in-place
    // cycle, and the new mission's Phase1 flushes it under its name.
    if (this.recorder.state === "buffering") return;
    const now = Date.now();
    if (now - this.lastCycleReconnectAt < CYCLE_RECONNECT_MIN_MS) {
      relayLog.warn(
        { address: this.key, trigger },
        "Mission cycle too soon after last recording reconnect — riding in place",
      );
      this.stopRecording(`mission-cycle (${trigger}, riding in place)`);
      return;
    }
    this.lastCycleReconnectAt = now;
    const lingerMs = cycleLingerMs();
    relayLog.info(
      { address: this.key, trigger, lingerMs },
      "Mission cycle — rotating demo recording via reconnect",
    );
    this.stopRecording(`mission-cycle (${trigger})`);
    // Freeze the stream (no more parsing or forwarding) so watchers
    // keep the end-of-match state — scoreboard, game-over sound, end
    // chat — for a few seconds before the new epoch re-hydrates them.
    // The fresh connection re-downloads everything regardless, so the
    // delay costs the next mission's demo nothing.
    this.rotating = true;
    this.rotateTimer = setTimeout(() => {
      this.rotateTimer = null;
      if (this.destroyed || !this.rotating) return;
      this.reconnect("Mission changing...");
    }, lingerMs);
  }

  /**
   * The session parser is a passive observer of the server→client stream
   * (GameConnection owns the client→server side), so ack validation must
   * never reject; mirror of LiveStreamAdapter.syncConnectSequence.
   */
  private syncConnectSequence(data: Uint8Array): void {
    if (this.connectSynced || data.length < 1) return;
    this.connectSynced = true;
    this.parserKit.packetParser.setConnectionProtocolState(
      passiveObserverProtocolState(data[0]),
    );
  }

  /**
   * Protocol responses formerly driven by the (single) browser client —
   * ported from LiveStreamAdapter.handleRelayCommands/handleCRCChallenge/
   * handleGhostingMessage (src/stream/liveStreaming.ts).
   */
  private handleResponderEvent(data: ParsedData): void {
    const conn = this.connection;
    if (!conn) return;

    if (data.type === "RemoteCommandEvent") {
      const cmd = data as RemoteCommandEventData;
      const funcName = this.watchState.resolveNetString(cmd.funcName ?? "");
      const resolvedArgs = (cmd.args ?? []).map((a) =>
        this.watchState.resolveNetString(a),
      );

      if (AUTH_COMMANDS.includes(funcName)) {
        conn.handleAuthEvent(
          funcName,
          resolvedArgs.filter((a) => a !== ""),
        );
      } else if (funcName === "MissionStartPhase1") {
        const seq = resolvedArgs[0] ?? "";
        const newMissionName = resolvedArgs[1] ?? null;
        if (newMissionName && newMissionName !== this.watchState.missionName) {
          this.watchState.missionName = newMissionName;
          this.watchState.beginMissionChange();
          // A mission change reaching an already-open file means the
          // EndGhosting cycle trigger was missed — rotate late.
          this.handleMissionCycle("Phase1");
        }
        if (newMissionName) this.recorder?.setMissionName(newMissionName);
        conn.sendCommand("MissionStartPhase1Done", seq);
      } else if (funcName === "MissionStartPhase2") {
        conn.sendCommand("MissionStartPhase2Done", resolvedArgs[0] ?? "");
      } else if (funcName === "MissionStartPhase3") {
        const seq = resolvedArgs[0] ?? "";
        const currentMission = resolvedArgs[1] ?? null;
        if (currentMission) this.watchState.missionName = currentMission;
        conn.sendCommand("setClientFav", "");
        conn.sendCommand("MissionStartPhase3Done", seq);
      }
      return;
    }

    if (data.type === "CRCChallengeEvent") {
      const crc = data as CRCChallengeEventData;
      const includeTextures = (crc.field1 & 1) !== 0;
      const datablocks = buildCRCDataBlockList(
        this.parserKit.packetParser.getDataBlockDataMap(),
        this.watchState.dataBlockClassNames,
      );
      conn.computeAndSendCRC(
        crc.crcValue,
        crc.field2,
        datablocks,
        includeTextures,
        this.options.gameBasePath,
      );
      return;
    }

    if (data.type === "GhostingMessageEvent") {
      const ghosting = data as GhostingMessageEventData;
      // GhostAlwaysDone (0) → ack with type 1 so the server begins ghosting.
      if (ghosting.message === 0) {
        conn.handleGhostAlwaysDone(ghosting.sequence, ghosting.ghostCount);
      } else if (ghosting.message === 2) {
        // EndGhosting: in-place mission cycle beginning. The old demo has
        // already captured the match end (and this teardown packet).
        this.handleMissionCycle("EndGhosting");
      }
    }
  }

  /**
   * The accumulator's ghost membership must exactly mirror the parser's
   * tracker: the tracker decides create-vs-update on the wire, so a late
   * joiner seeded with different membership misparses the stream.
   * Returns false on divergence (callers re-sync).
   */
  private checkAccumulatorInvariant(
    context: string,
    source: CatchupSource = this.liveSource(),
  ): boolean {
    const tracker = source.ghostTracker.getAllGhosts();
    const seeds = new Map(
      source.ghostState.getGhostSeeds().map((s) => [s.index, s.classId]),
    );
    const missing: string[] = [];
    const extra: number[] = [];
    const classMismatch: string[] = [];
    for (const [index, entry] of tracker) {
      const seedClassId = seeds.get(index);
      if (seedClassId === undefined) {
        missing.push(`${index}:${entry.className}`);
      } else if (seedClassId !== entry.classId) {
        classMismatch.push(
          `${index}: tracker=${entry.classId}(${entry.className}) accumulator=${seedClassId}`,
        );
      }
    }
    for (const index of seeds.keys()) {
      if (!tracker.has(index)) extra.push(index);
    }
    if (missing.length > 0 || extra.length > 0 || classMismatch.length > 0) {
      relayLog.error(
        {
          address: this.key,
          context,
          source: source.kind,
          packetCount: source.packetCount,
          trackerSize: tracker.size,
          accumulatorSize: seeds.size,
          missingFromAccumulator: missing.slice(0, 25),
          extraInAccumulator: extra.slice(0, 25),
          classMismatch: classMismatch.slice(0, 25),
        },
        "Ghost accumulator diverged from parser tracker",
      );
      return false;
    }
    return true;
  }

  // ── Catch-up ──

  /**
   * Synchronous snapshot → send → promote-to-watcher. No datagram
   * callback can interleave, and WS frames are FIFO per socket, so the
   * first live binary frame this watcher sees is the packet right after
   * the snapshot.
   */
  private liveSource(): CatchupSource {
    return {
      kind: "live",
      packetParser: this.parserKit.packetParser,
      ghostTracker: this.parserKit.ghostTracker,
      ghostState: this.ghostState,
      watchState: this.watchState,
      epoch: this.epoch,
      packetCount: this.packetCount,
    };
  }

  /** Null when no catch-up can be built yet. */
  private catchupSource(): CatchupSource | null {
    if (this.delayMs > 0) {
      // Tournament delay: joiners see the replica's (past) state — the
      // live connection's status is irrelevant to them.
      const r = this.replica;
      if (!r || !r.connected) return null;
      return {
        kind: "delayed",
        packetParser: r.kit.packetParser,
        ghostTracker: r.kit.ghostTracker,
        ghostState: r.ghostState,
        watchState: r.watchState,
        epoch: r.epoch,
        packetCount: r.packetCount,
      };
    }
    // A re-sync may have started mid-delivery-loop; these watchers get a
    // fresh catch-up once the new connection is live. Same for a pending
    // rotation — its post-EndGhosting state would seed an empty world.
    if (this.lastStatus !== "connected" || this.rotating) return null;
    return this.liveSource();
  }

  private deliverCatchup(ws: WebSocket): void {
    if (this.destroyed || !this.pending.has(ws)) return;
    const source = this.catchupSource();
    if (!source) return;
    // Never seed a joiner from diverged state — re-sync instead (the
    // replica can't be re-synced; it is rebuilt at the next epoch marker).
    if (!this.checkAccumulatorInvariant("catchup-build", source)) {
      if (source.kind === "live")
        this.resyncSession("ghost accumulator diverged");
      return;
    }
    sendJson(ws, this.sessionStatus("syncing"));

    let gzipped: Uint8Array;
    try {
      gzipped = this.buildPayloadBytes(source);
    } catch (e) {
      relayLog.error({ err: e, address: this.key }, "Catch-up build failed");
      sendJson(ws, {
        type: "error",
        message: "Failed to build catch-up state",
      });
      return;
    }

    const chunkCount = Math.max(
      1,
      Math.ceil(gzipped.length / CATCHUP_CHUNK_BYTES),
    );
    sendJson(ws, {
      type: "catchupBegin",
      epoch: source.epoch,
      totalBytes: gzipped.length,
      chunkCount,
      encoding: "gzip",
    });
    for (let i = 0; i < gzipped.length; i += CATCHUP_CHUNK_BYTES) {
      if (ws.readyState !== ws.OPEN) return;
      ws.send(gzipped.subarray(i, i + CATCHUP_CHUNK_BYTES), { binary: true });
    }
    sendJson(ws, { type: "catchupEnd" });

    this.pending.delete(ws);
    this.watchers.add(ws);
    sendJson(ws, this.sessionStatus("live"));
    relayLog.info(
      {
        address: this.key,
        bytes: gzipped.length,
        ghosts: source.ghostState.size(),
        source: source.kind,
        watchers: this.watchers.size,
      },
      "Delivered catch-up to watcher",
    );
  }

  private buildPayloadBytes(source: CatchupSource): Uint8Array {
    const cached = this.cachedPayload;
    if (
      cached &&
      cached.kind === source.kind &&
      cached.epoch === source.epoch &&
      cached.packetCount === source.packetCount
    ) {
      return cached.gzipped;
    }

    const payload = buildCatchupPayload({
      packetParser: source.packetParser,
      ghostState: source.ghostState,
      watchState: source.watchState,
      epoch: source.epoch,
      serverAddress: this.key,
    });

    const json = serializeCatchupPayload(payload);
    const gzipped = gzipSync(json);
    this.cachedPayload = {
      kind: source.kind,
      epoch: source.epoch,
      packetCount: source.packetCount,
      gzipped,
    };
    return gzipped;
  }

  // ── Fan-out helpers ──

  /** Best-known map name: the live stream's mission (authoritative once
   *  the handshake runs) over the probe/master-list seed. */
  private sessionMapName(): string | undefined {
    return this.watchState.missionName ?? this.connection?.mapName;
  }

  /** Best-known server name: stream (MsgMissionDropInfo) over cache. */
  private sessionServerName(): string | undefined {
    return (
      this.watchState.serverName ?? this.options.getCachedServer(this.key)?.name
    );
  }

  private fanOut(message: ServerMessage): void {
    for (const ws of this.watchers) sendJson(ws, message);
    for (const ws of this.pending) sendJson(ws, message);
  }

  /**
   * The steady-state session-status payload shared by the syncing / live
   * broadcasts (catch-up, fan-out, per-socket resend). Callers add
   * `message` and `streamDelayReadyInMs` where those apply — the minimal
   * connecting/ended notices deliberately omit these fields and build
   * their own literals.
   */
  private sessionStatus(
    status: WatchStatus,
  ): Extract<ServerMessage, { type: "sessionStatus" }> {
    return {
      type: "sessionStatus",
      status,
      address: this.key,
      serverName: this.sessionServerName(),
      mapName: this.sessionMapName(),
      watcherCount: this.watcherCount,
      recording: this.recording,
      streamDelayMs: this.confirmedDelayMs(),
    };
  }

  private fanOutSessionStatus(message?: string): void {
    this.fanOut({
      ...this.sessionStatus(
        this.isDelayBuffering() ? "syncing" : this.watchStatus,
      ),
      message,
      streamDelayReadyInMs: this.delayReadyInMs(),
    });
  }

  private sendSessionStatus(ws: WebSocket): void {
    sendJson(ws, {
      ...this.sessionStatus(
        this.lastStatus === "connected" ? "syncing" : this.watchStatus,
      ),
      streamDelayReadyInMs: this.delayReadyInMs(),
    });
    if (this.lastPingMs != null) {
      sendJson(ws, { type: "ping", ms: this.lastPingMs });
    }
  }

  private broadcastWatcherCount(): void {
    this.fanOut({ type: "watcherCount", count: this.watcherCount });
  }

  // ── Scores poll ──

  private startScoresPoll(): void {
    this.stopScoresPoll();
    this.scoresTimer = setInterval(() => {
      if (this.watcherCount > 0 && this.lastStatus === "connected") {
        this.connection?.sendCommand("getScores");
      }
    }, SCORES_POLL_MS);
    this.connection?.sendCommand("getScores");
  }

  private stopScoresPoll(): void {
    if (this.scoresTimer) {
      clearInterval(this.scoresTimer);
      this.scoresTimer = null;
    }
  }

  /**
   * Poll the live score HUD in gentle open→snapshot→close cycles (see
   * SCORE_HUD_POLL_MS). ShowHud makes the server send one scoreboard and
   * schedule a +3s repeat; HideHud a couple seconds later cancels that
   * repeat, so the server never sustains the continuous flood that
   * overflows the observer's receive window. Off unless configured.
   */
  private startScoreHudPoll(): void {
    this.stopScoreHudPoll();
    if (SCORE_HUD_POLL_MS <= 0) return;
    const poll = () => {
      if (this.lastStatus !== "connected") return;
      this.connection?.sendCommand("ShowHud", "scoreScreen");
      this.scoreHudCloseTimer = setTimeout(() => {
        this.scoreHudCloseTimer = null;
        if (this.lastStatus === "connected") {
          this.connection?.sendCommand("HideHud", "scoreScreen");
        }
      }, SCORE_HUD_CLOSE_MS);
    };
    this.scoreHudTimer = setInterval(poll, SCORE_HUD_POLL_MS);
    poll();
  }

  private stopScoreHudPoll(): void {
    if (this.scoreHudTimer) {
      clearInterval(this.scoreHudTimer);
      this.scoreHudTimer = null;
    }
    if (this.scoreHudCloseTimer) {
      clearTimeout(this.scoreHudCloseTimer);
      this.scoreHudCloseTimer = null;
    }
  }

  /**
   * The relay watches as an observer (team 0); if an admin or the server
   * places it on a real team it would spawn and play, corrupting the
   * demo. Watch mode only — this whole class is the watch path, so a
   * client-is-the-player connection (its own GameConnection) never runs
   * this. On detecting a team, revert to observer after a grace period,
   * retrying a few times if the switch doesn't take, and stand down once
   * back on team 0.
   */
  private maybeReObserve(): void {
    const team = this.watchState.getSelfTeamId();
    if (team != null && team > 0) {
      if (!this.reObserveActive) {
        this.reObserveActive = true;
        this.reObserveAttempts = 0;
        relayLog.warn(
          { address: this.key, team },
          "Observer was placed on a team — will revert to observer",
        );
        this.scheduleReObserve();
      }
    } else if (this.reObserveActive) {
      // Confirmed back on the observer team (or self identity lost) — done.
      this.cancelReObserve();
    }
  }

  private scheduleReObserve(): void {
    if (this.reObserveTimer) return;
    this.reObserveTimer = setTimeout(() => {
      this.reObserveTimer = null;
      if (this.destroyed || this.lastStatus !== "connected") {
        this.cancelReObserve();
        return;
      }
      const team = this.watchState.getSelfTeamId();
      if (team == null || team <= 0) {
        // Resolved between scheduling and firing.
        this.cancelReObserve();
        return;
      }
      this.reObserveAttempts++;
      const conn = this.connection;
      relayLog.warn(
        { address: this.key, team, attempt: this.reObserveAttempts },
        "Reverting observer to team 0",
      );
      conn?.sendCommand("WatchOnly", WATCH_ONLY_PASS);
      conn?.sendCommand("setPlayerTeam", "0");
      if (this.reObserveAttempts < REOBSERVE_MAX_ATTEMPTS) {
        this.scheduleReObserve();
      } else {
        // Give up sending until we're teamed again (avoid an endless
        // stream of ignored commands); reObserveActive stays set so
        // maybeReObserve won't restart while still stuck on the team.
        relayLog.error(
          { address: this.key, attempts: this.reObserveAttempts },
          "Could not revert observer to team 0",
        );
      }
    }, REOBSERVE_DELAY_MS);
  }

  private cancelReObserve(): void {
    if (this.reObserveTimer) {
      clearTimeout(this.reObserveTimer);
      this.reObserveTimer = null;
    }
    this.reObserveActive = false;
    this.reObserveAttempts = 0;
  }
}
