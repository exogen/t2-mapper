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
  isRetryableDisconnect,
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
/** Matches the real client's chat input limit ($Host::MaxMessageLen). */
const CHAT_MAX_LENGTH = 255;
const CATCHUP_CHUNK_BYTES = 256 * 1024;
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
  }> {
    return [...this.sessions.values()].map((s) => ({
      address: s.key,
      status: s.watchStatus,
      watchers: s.watcherCount,
      recording: s.recording,
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
  private retryCount = 0;
  /** Re-syncs without a healthy stretch (~5000 packets) in between. */
  private resyncCount = 0;
  /** One recorder per connection epoch (one connection = one demo). */
  private recorder: DemoRecorder | null = null;
  private lastCycleReconnectAt = 0;
  /** Mission-cycle rotation pending: stream frozen until reconnect. */
  private rotating = false;
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private lastStatus: ConnectionStatus = "connecting";
  private lastPingMs: number | null = null;
  private cachedPayload: {
    epoch: number;
    packetCount: number;
    gzipped: Uint8Array;
  } | null = null;

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

    const conn =
      this.options.createConnection?.(this.key) ?? new GameConnection(this.key);
    this.connection = conn;
    const cached = this.options.getCachedServer(this.key);
    if (cached?.mapName) conn.setMapName(cached.mapName);

    this.recorder =
      this.options.demoCoordinator?.createRecorder({
        address: this.key,
        getConnectSequence: () => conn.connectSequence,
        getServerInfo: () => this.options.getCachedServer(this.key),
        getActivePlayerCount: () => this.watchState.countActivePlayers(),
        getMatchStarted: () => this.watchState.matchStarted,
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
    if (!this.destroyed && this.watcherCount === 0 && !this.idleTimer) {
      this.startIdleTimer();
    }
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
    if (this.watcherCount === 0) {
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
      // activity; serverCmdWatchOnly flags the client isWatchOnly, which
      // exempts it. "ImaWatcher" is the stock $Host::ObserverOnlyPass
      // default. Unknown serverCmds are no-ops elsewhere.
      conn.sendCommand(
        "WatchOnly",
        process.env.WATCH_ONLY_PASS || "ImaWatcher",
      );
      this.startScoresPoll();
      // Deliver catch-up to everyone who was waiting on the handshake.
      for (const ws of [...this.pending]) {
        this.deliverCatchup(ws);
      }
      return;
    }

    if (status === "disconnected") {
      this.stopScoresPoll();
      // Covers both cycle styles: servers that hard-disconnect at mission
      // change ("Server is cycling mission") and terminal disconnects.
      this.stopRecording(`disconnected: ${message ?? "unknown"}`);
      const retryable = isRetryableDisconnect(message);
      if (retryable && this.retryCount < MAX_RETRIES && this.watcherCount > 0) {
        this.retryCount++;
        relayLog.info(
          { address: this.key, attempt: this.retryCount },
          "Retryable disconnect — session will reconnect",
        );
        // A new connection means new sequence state and ghost IDs: every
        // watcher goes back to pending and re-hydrates from a fresh epoch.
        for (const ws of this.watchers) this.pending.add(ws);
        this.watchers.clear();
        this.fanOut({
          type: "sessionStatus",
          status: "connecting",
          message: `${message} — retrying (${this.retryCount}/${MAX_RETRIES})...`,
          address: this.key,
          mapName: this.sessionMapName(),
          watcherCount: this.watcherCount,
        });
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          if (!this.destroyed && this.watcherCount > 0) {
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
    this.stopScoresPoll();
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
      this.watchState.applyPacket(parsed);
      this.ghostState.applyPacket(parsed);
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

    for (const ws of this.watchers) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data, { binary: true });
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
   * Tear down the current connection and start a fresh epoch: every
   * watcher goes back to pending and re-hydrates from a new catch-up
   * (new sequence state and ghost IDs).
   */
  private reconnect(statusMessage: string): void {
    this.lastStatus = "connecting";
    for (const ws of this.watchers) this.pending.add(ws);
    this.watchers.clear();
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
  private checkAccumulatorInvariant(context: string): boolean {
    const tracker = this.parserKit.ghostTracker.getAllGhosts();
    const seeds = new Map(
      this.ghostState.getGhostSeeds().map((s) => [s.index, s.classId]),
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
          packetCount: this.packetCount,
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
  private deliverCatchup(ws: WebSocket): void {
    if (this.destroyed || !this.pending.has(ws)) return;
    // A re-sync may have started mid-delivery-loop; these watchers get a
    // fresh catch-up once the new connection is live. Same for a pending
    // rotation — its post-EndGhosting state would seed an empty world.
    if (this.lastStatus !== "connected" || this.rotating) return;
    // Never seed a joiner from diverged state — re-sync instead.
    if (!this.checkAccumulatorInvariant("catchup-build")) {
      this.resyncSession("ghost accumulator diverged");
      return;
    }
    sendJson(ws, {
      type: "sessionStatus",
      status: "syncing",
      address: this.key,
      serverName: this.sessionServerName(),
      mapName: this.sessionMapName(),
      watcherCount: this.watcherCount,
      recording: this.recording,
    });

    let gzipped: Uint8Array;
    try {
      gzipped = this.buildPayloadBytes();
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
      epoch: this.epoch,
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
    sendJson(ws, {
      type: "sessionStatus",
      status: "live",
      address: this.key,
      serverName: this.sessionServerName(),
      mapName: this.sessionMapName(),
      watcherCount: this.watcherCount,
      recording: this.recording,
    });
    relayLog.info(
      {
        address: this.key,
        bytes: gzipped.length,
        ghosts: this.ghostState.size(),
        watchers: this.watchers.size,
      },
      "Delivered catch-up to watcher",
    );
  }

  private buildPayloadBytes(): Uint8Array {
    const cached = this.cachedPayload;
    if (
      cached &&
      cached.epoch === this.epoch &&
      cached.packetCount === this.packetCount
    ) {
      return cached.gzipped;
    }

    const payload = buildCatchupPayload({
      packetParser: this.parserKit.packetParser,
      ghostState: this.ghostState,
      watchState: this.watchState,
      epoch: this.epoch,
      serverAddress: this.key,
    });

    const json = serializeCatchupPayload(payload);
    const gzipped = gzipSync(json);
    this.cachedPayload = {
      epoch: this.epoch,
      packetCount: this.packetCount,
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

  private fanOutSessionStatus(message?: string): void {
    this.fanOut({
      type: "sessionStatus",
      status: this.watchStatus,
      message,
      address: this.key,
      serverName: this.sessionServerName(),
      mapName: this.sessionMapName(),
      watcherCount: this.watcherCount,
      recording: this.recording,
    });
  }

  private sendSessionStatus(ws: WebSocket): void {
    sendJson(ws, {
      type: "sessionStatus",
      status: this.lastStatus === "connected" ? "syncing" : this.watchStatus,
      address: this.key,
      serverName: this.sessionServerName(),
      mapName: this.sessionMapName(),
      watcherCount: this.watcherCount,
      recording: this.recording,
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
}
