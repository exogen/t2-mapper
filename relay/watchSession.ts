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
    const key = normalizeAddress(address);
    // A socket watches at most one server.
    this.detachSocket(ws);
    let session = this.sessions.get(key);
    if (!session) {
      session = new WatchSession(key, this.options, () => {
        this.sessions.delete(key);
      });
      this.sessions.set(key, session);
      session.start();
    }
    session.attach(ws);
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
  }> {
    return [...this.sessions.values()].map((s) => ({
      address: s.key,
      status: s.watchStatus,
      watchers: s.watcherCount,
    }));
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
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

    conn.on("status", (status: ConnectionStatus, message?: string) => {
      if (this.connection !== conn) return;
      this.handleStatus(conn, status, message);
    });
    conn.on("packet", (data: Uint8Array) => {
      if (this.connection !== conn) return;
      this.handlePacket(data);
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
      this.startScoresPoll();
      // Deliver catch-up to everyone who was waiting on the handshake.
      for (const ws of [...this.pending]) {
        this.deliverCatchup(ws);
      }
      return;
    }

    if (status === "disconnected") {
      this.stopScoresPoll();
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
    this.stopScoresPoll();
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
    this.syncConnectSequence(data);
    let parsed;
    try {
      parsed = this.parserKit.packetParser.parsePacket(data);
    } catch (e) {
      relayLog.error(
        { err: e, address: this.key, packet: this.packetCount },
        "Watch session packet parse failed",
      );
      parsed = null;
    }

    if (parsed) {
      this.packetCount++;
      // NetStrings apply before responders so funcName refs resolve.
      this.watchState.applyPacket(parsed);
      this.ghostState.applyPacket(parsed);
      for (const event of parsed.events) {
        if (event.parsedData) this.handleResponderEvent(event.parsedData);
      }

      // Invariant: the accumulator must mirror the parser's ghost tracker
      // exactly — any mismatch would seed late joiners with a tracker
      // that diverges from ours, corrupting everything they parse next.
      if (this.packetCount % 500 === 0) {
        this.checkAccumulatorInvariant("periodic");
      }
    }

    for (const ws of this.watchers) {
      if (ws.readyState === ws.OPEN) {
        ws.send(data, { binary: true });
      }
    }
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
        }
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
      }
    }
  }

  /**
   * The accumulator's ghost membership must exactly mirror the parser's
   * tracker: the tracker decides create-vs-update on the wire, so a late
   * joiner seeded with different membership misparses the stream.
   */
  private checkAccumulatorInvariant(context: string): void {
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
    }
  }

  // ── Catch-up ──

  /**
   * Synchronous snapshot → send → promote-to-watcher. No datagram
   * callback can interleave, and WS frames are FIFO per socket, so the
   * first live binary frame this watcher sees is the packet right after
   * the snapshot.
   */
  private deliverCatchup(ws: WebSocket): void {
    if (!this.pending.has(ws)) return;
    sendJson(ws, {
      type: "sessionStatus",
      status: "syncing",
      address: this.key,
      serverName: this.sessionServerName(),
      mapName: this.sessionMapName(),
      watcherCount: this.watcherCount,
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

    this.checkAccumulatorInvariant("catchup-build");
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
