import { createLogger } from "../logger";
import { deserializeCatchupPayload } from "../../relay/watchSerialize";
import { normalizeAddress } from "../../relay/shared";
import {
  MAX_CATCHUP_BUFFERED_BYTES,
  MAX_CATCHUP_BUFFERED_FRAMES,
  MAX_CATCHUP_COMPRESSED_BYTES,
  MAX_CATCHUP_DECOMPRESSED_BYTES,
} from "../../relay/catchupLimits";
import type {
  ReplayState,
  ReplayClientMessage,
  ReplayServerMessage,
} from "../../relay/replayTypes";
import type {
  ClientMessage,
  ClientMove,
  ServerMessage,
  ServerInfo,
  ConnectionStatus,
  WatchCatchupPayload,
  WatchStatus,
  WatchEndReason,
} from "../../relay/types";

const log = createLogger("relayClient");
type SessionStatusMessage = Extract<ServerMessage, { type: "sessionStatus" }>;
type ReplayTickMessage = Extract<ReplayServerMessage, { type: "replayTick" }>;
type ReplayInfoMessage = Extract<ReplayServerMessage, { type: "replayInfo" }>;
type ReplayUploadProgressMessage = Extract<
  ReplayServerMessage,
  { type: "replayUploadProgress" }
>;

export type RelayEventHandler = {
  onReplayState?: (state: ReplayState) => void;
  onReplayTick?: (message: ReplayTickMessage) => void;
  onReplayInfo?: (message: ReplayInfoMessage) => void;
  onReplayUploadProgress?: (message: ReplayUploadProgressMessage) => void;
  onReplayError?: (message: string, sessionId?: string) => void;
  onOpen?: () => void;
  onStatus?: (
    status: ConnectionStatus,
    message?: string,
    mapName?: string,
    chatEnabled?: boolean,
  ) => void;
  onServerList?: (servers: ServerInfo[]) => void;
  onGamePacket?: (data: Uint8Array) => void;
  /** Relay↔T2 server RTT. */
  onPing?: (ms: number) => void;
  /** Browser↔relay WebSocket RTT. */
  onWsPing?: (ms: number) => void;
  onError?: (message: string, requestType?: "listServers") => void;
  onClose?: () => void;
  // ── Watch mode ──
  onSessionStatus?: (
    status: WatchStatus,
    message: string | undefined,
    info: {
      address: string;
      endReason?: WatchEndReason;
      serverName?: string;
      mapName?: string;
      channelId?: string;
      /** Whether demo retention is enabled for the mission being watched. */
      recording?: boolean;
      chatEnabled?: boolean;
      /** Watcher-facing stream delay in ms (0 = live). */
      streamDelayMs?: number;
      /** Rough ms until a still-buffering delayed stream begins. */
      streamDelayReadyInMs?: number;
    },
    watcherCount: number,
  ) => void;
  onWatcherCount?: (count: number) => void;
  /** The relay announced a restart/deploy — expect the socket to close;
   *  watchers should auto-reattach rather than treat the session as ended. */
  onRelayRestarting?: () => void;
  onCatchupProgress?: (receivedBytes: number, totalBytes: number) => void;
  /** Fires after the full catch-up payload is decompressed and parsed.
   *  Binary frames received while finalizing are flushed to onGamePacket
   *  right after this returns, preserving stream order. */
  onCatchup?: (payload: WatchCatchupPayload) => void;
};

async function gunzipToString(
  chunks: Uint8Array[],
  signal: AbortSignal,
): Promise<string> {
  const reader = new Blob(chunks as ConstructorParameters<typeof Blob>[0])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const cancel = () => {
    void reader.cancel(signal.reason).catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  let complete = false;
  try {
    const decoder = new TextDecoder();
    const text: string[] = [];
    let bytes = 0;
    signal.throwIfAborted();
    for (;;) {
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_CATCHUP_DECOMPRESSED_BYTES)
        throw new Error("Catch-up payload exceeds the 64 MiB decoded limit");
      text.push(decoder.decode(value, { stream: true }));
    }
    text.push(decoder.decode());
    complete = true;
    return text.join("");
  } finally {
    signal.removeEventListener("abort", cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

/**
 * WebSocket client that connects to the relay server.
 * Handles JSON control messages and binary game packet forwarding.
 */
export class RelayClient {
  private ws: WebSocket | null = null;
  private handlers: RelayEventHandler;
  private url: string;
  private _connected = false;
  private wsPingInterval: ReturnType<typeof setInterval> | null = null;
  private smoothedWsPing = 0;

  /**
   * Catch-up framing: between catchupBegin and catchupEnd every binary
   * frame is a gzip chunk; while the (async) decompress finalizes,
   * binary frames are live packets buffered for ordered flushing.
   * A new watch request discards old packets until its snapshot begins.
   */
  private catchupMode: "waiting" | "live" | "collecting" | "finalizing" =
    "live";
  private catchupBytes: Uint8Array | null = null;
  private catchupReceivedBytes = 0;
  private catchupReceivedChunks = 0;
  private catchupTotalBytes = 0;
  private catchupChunkCount = 0;
  private catchupEpoch = 0;
  private bufferedFrames: Array<
    Uint8Array | SessionStatusMessage | ReplayServerMessage
  > = [];
  private bufferedBytes = 0;
  private catchupDecode: AbortController | null = null;
  private replaySessionId: string | null = null;
  private replayCreating = false;
  private replayEpoch: number | null = null;
  private replayRevision = -1;
  private replayUpload: { uploadId: string; totalBytes: number } | null = null;
  /**
   * Bumped on each catch-up, socket close, or watch/join target change. The async
   * catch-up decode checks it on completion: a payload from a session
   * the user has since left must neither hydrate the new adapter nor
   * flip the framing state under the new session's own catch-up.
   */
  private sessionGeneration = 0;
  private watchAddress: string | null = null;

  constructor(url: string, handlers: RelayEventHandler) {
    this.url = url;
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      if (this.ws !== ws) return;
      log.info("WebSocket connected to %s", this.url);
      this._connected = true;
      this.startWsPing();
      this.handlers.onOpen?.();
    };

    ws.onmessage = (event) => {
      if (this.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
      if (event.data instanceof ArrayBuffer) {
        if (this.catchupMode === "waiting") return;
        const data = new Uint8Array(event.data);
        if (this.catchupMode === "collecting") {
          if (
            data.byteLength === 0 ||
            this.catchupReceivedChunks >= this.catchupChunkCount ||
            this.catchupReceivedBytes + data.byteLength > this.catchupTotalBytes
          ) {
            this.failCatchup(new Error("Catch-up payload exceeds its framing"));
            return;
          }
          this.catchupBytes!.set(data, this.catchupReceivedBytes);
          this.catchupReceivedBytes += data.length;
          this.catchupReceivedChunks++;
          this.handlers.onCatchupProgress?.(
            this.catchupReceivedBytes,
            this.catchupTotalBytes,
          );
        } else if (this.catchupMode === "finalizing") {
          this.bufferFrame(data);
        } else {
          // Binary message — game packet from server
          this.handlers.onGamePacket?.(data);
        }
      } else {
        // JSON control message
        try {
          const message: ServerMessage = JSON.parse(event.data as string);
          this.handleMessage(message);
        } catch (e) {
          log.error("Failed to parse relay message: %o", e);
        }
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      log.info("WebSocket disconnected");
      this.ws = null;
      this.replayUpload = null;
      this.resetSessionFraming();
      this._connected = false;
      this.stopWsPing();
      this.handlers.onClose?.();
    };

    ws.onerror = () => {
      if (this.ws !== ws) return;
      log.error("WebSocket error");
      this.handlers.onError?.("WebSocket connection error");
    };
  }

  private handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case "replayUploadProgress":
        if (
          this.replayUpload &&
          message.uploadId === this.replayUpload.uploadId &&
          message.totalBytes === this.replayUpload.totalBytes &&
          Number.isSafeInteger(message.receivedBytes) &&
          message.receivedBytes >= 0 &&
          message.receivedBytes <= message.totalBytes
        )
          this.handlers.onReplayUploadProgress?.(message);
        break;
      case "replayState": {
        if (this.replayCreating) {
          this.replaySessionId = message.sessionId;
          this.replayCreating = false;
        }
        if (message.sessionId !== this.replaySessionId) break;
        if (this.replayEpoch !== null && message.epoch < this.replayEpoch)
          break;
        if (
          message.epoch === this.replayEpoch &&
          message.revision < this.replayRevision
        )
          break;
        if (
          message.epoch !== this.replayEpoch ||
          ((message.status === "seeking" || message.status === "preparing") &&
            message.revision > this.replayRevision)
        ) {
          this.replayEpoch = message.epoch;
          this.resetSessionFraming("waiting");
        } else if (
          this.catchupMode === "collecting" ||
          this.catchupMode === "finalizing"
        ) {
          this.bufferFrame(message);
          break;
        }
        this.replayRevision = message.revision;
        const { type: _type, ...state } = message;
        this.handlers.onReplayState?.(state);
        break;
      }
      case "replayTick":
        if (
          message.sessionId !== this.replaySessionId ||
          message.epoch !== this.replayEpoch ||
          this.catchupMode === "waiting"
        )
          break;
        if (
          this.catchupMode === "collecting" ||
          this.catchupMode === "finalizing"
        )
          this.bufferFrame(message);
        else this.handlers.onReplayTick?.(message);
        break;
      case "replayInfo":
        if (
          message.sessionId !== this.replaySessionId ||
          message.epoch !== this.replayEpoch ||
          this.catchupMode === "waiting"
        )
          break;
        if (
          this.catchupMode === "collecting" ||
          this.catchupMode === "finalizing"
        )
          this.bufferFrame(message);
        else this.handlers.onReplayInfo?.(message);
        break;
      case "replayError":
        if (!message.sessionId || message.sessionId === this.replaySessionId)
          this.handlers.onReplayError?.(message.message, message.sessionId);
        break;
      case "serverList":
        this.handlers.onServerList?.(message.servers);
        break;
      case "status":
        this.handlers.onStatus?.(
          message.status,
          message.message,
          message.mapName,
          message.chatEnabled,
        );
        break;
      case "ping":
        this.handlers.onPing?.(message.ms);
        break;
      case "wsPong": {
        const rtt = Date.now() - message.ts;
        this.smoothedWsPing =
          this.smoothedWsPing === 0
            ? rtt
            : this.smoothedWsPing * 0.5 + rtt * 0.5;
        this.handlers.onWsPing?.(Math.round(this.smoothedWsPing));
        break;
      }
      case "sessionStatus":
        if (normalizeAddress(message.address) !== this.watchAddress) break;
        if (message.status === "ended") {
          // A terminal notice must beat any pending snapshot decode, including
          // a corrupt snapshot whose failure would otherwise trigger a retry.
          this.resetSessionFraming("waiting");
          this.watchAddress = null;
        }
        if (this.catchupMode === "waiting" && message.status === "live") break;
        if (this.catchupMode === "finalizing") {
          this.bufferFrame(message);
          break;
        }
        this.handlers.onSessionStatus?.(
          message.status,
          message.message,
          {
            address: message.address,
            endReason: message.endReason,
            serverName: message.serverName,
            mapName: message.mapName,
            channelId: message.channelId,
            recording: message.recording,
            chatEnabled: message.chatEnabled,
            streamDelayMs: message.streamDelayMs,
            streamDelayReadyInMs: message.streamDelayReadyInMs,
          },
          message.watcherCount,
        );
        break;
      case "watcherCount":
        this.handlers.onWatcherCount?.(message.count);
        break;
      case "relayRestarting":
        this.handlers.onRelayRestarting?.();
        break;
      case "catchupBegin":
        if (
          (!this.watchAddress && !this.replaySessionId) ||
          (this.replaySessionId &&
            (message.epoch !== this.replayEpoch ||
              (message.address &&
                message.address !== `replay:${this.replaySessionId}`))) ||
          (!this.replaySessionId &&
            message.address &&
            normalizeAddress(message.address) !== this.watchAddress)
        )
          break;
        if (
          !Number.isSafeInteger(message.epoch) ||
          message.epoch <= 0 ||
          !Number.isSafeInteger(message.totalBytes) ||
          message.totalBytes <= 0 ||
          message.totalBytes > MAX_CATCHUP_COMPRESSED_BYTES ||
          !Number.isSafeInteger(message.chunkCount) ||
          message.chunkCount <= 0 ||
          message.chunkCount > message.totalBytes ||
          message.encoding !== "gzip"
        ) {
          this.failCatchup(new Error("Invalid catch-up payload framing"));
          break;
        }
        // A newer snapshot supersedes any older asynchronous decode and
        // the packets already represented by this new snapshot.
        this.resetSessionFraming();
        this.catchupMode = "collecting";
        this.catchupTotalBytes = message.totalBytes;
        this.catchupChunkCount = message.chunkCount;
        this.catchupBytes = new Uint8Array(message.totalBytes);
        this.catchupEpoch = message.epoch;
        this.handlers.onCatchupProgress?.(0, message.totalBytes);
        break;
      case "catchupEnd":
        if (this.catchupMode === "waiting") break;
        this.finalizeCatchup();
        break;
      case "error":
        this.handlers.onError?.(message.message, message.requestType);
        break;
    }
  }

  private finalizeCatchup(): void {
    if (
      this.catchupMode !== "collecting" ||
      this.catchupReceivedBytes !== this.catchupTotalBytes ||
      this.catchupReceivedChunks !== this.catchupChunkCount
    ) {
      this.failCatchup(new Error("Incomplete catch-up payload"));
      return;
    }
    const bytes = this.catchupBytes!;
    const epoch = this.catchupEpoch;
    this.catchupBytes = null;
    this.catchupMode = "finalizing";
    const generation = this.sessionGeneration;
    const decode = new AbortController();
    this.catchupDecode = decode;
    gunzipToString([bytes], decode.signal)
      .then((json) => {
        if (generation !== this.sessionGeneration) return;
        const payload = deserializeCatchupPayload(json);
        if (payload.epoch !== epoch) {
          throw new Error("Catch-up epoch does not match its framing");
        }
        if (
          this.replaySessionId &&
          (payload.replay?.sessionId !== this.replaySessionId ||
            payload.replay.epoch !== this.replayEpoch)
        ) {
          throw new Error("Replay catch-up does not match the active session");
        }
        log.info(
          "catch-up payload: %d ghosts, %d datablocks, epoch %d",
          payload.initialGhosts.length,
          payload.dataBlocks.length,
          payload.epoch,
        );
        this.handlers.onCatchup?.(payload);
        if (generation !== this.sessionGeneration) return;
        this.catchupMode = "live";
        const buffered = this.bufferedFrames;
        this.bufferedFrames = [];
        this.bufferedBytes = 0;
        for (const frame of buffered) {
          // A packet handler may request another catch-up after a parse
          // fault. Never feed the rest of this epoch into its new adapter.
          if (generation !== this.sessionGeneration) break;
          if (frame instanceof Uint8Array) this.handlers.onGamePacket?.(frame);
          else this.handleMessage(frame);
        }
      })
      .catch((e) => {
        if (generation !== this.sessionGeneration) return;
        this.failCatchup(e);
      })
      .finally(() => {
        if (this.catchupDecode === decode) this.catchupDecode = null;
      });
  }

  private bufferFrame(
    frame: Uint8Array | SessionStatusMessage | ReplayServerMessage,
  ): void {
    const bytes =
      frame instanceof Uint8Array
        ? frame.byteLength
        : new TextEncoder().encode(JSON.stringify(frame)).byteLength;
    if (
      this.bufferedFrames.length >= MAX_CATCHUP_BUFFERED_FRAMES ||
      this.bufferedBytes + bytes > MAX_CATCHUP_BUFFERED_BYTES
    ) {
      this.failCatchup(new Error("Catch-up packet buffer exceeds its limit"));
      return;
    }
    this.bufferedFrames.push(frame);
    this.bufferedBytes += bytes;
  }

  private failCatchup(error: unknown): void {
    log.error("Failed to decode catch-up payload: %o", error);
    this.resetSessionFraming("waiting");
    if (this.replaySessionId)
      this.handlers.onReplayError?.(
        `Couldn't load replay state: ${error instanceof Error ? error.message : "Invalid catch-up payload"}`,
        this.replaySessionId,
      );
    else
      this.handlers.onError?.(
        "Failed to decode catch-up payload; reconnecting",
      );
    // Live viewers reconnect; replay errors end the pending attempt. Raw
    // packets cannot be decoded safely without a hydrated snapshot.
    this.ws?.close();
  }

  /** Forget any catch-up in flight for the previous session target. */
  private resetSessionFraming(mode: "live" | "waiting" = "live"): void {
    this.sessionGeneration++;
    this.catchupDecode?.abort();
    this.catchupDecode = null;
    this.catchupMode = mode;
    this.catchupBytes = null;
    this.catchupReceivedBytes = 0;
    this.catchupReceivedChunks = 0;
    this.catchupTotalBytes = 0;
    this.catchupChunkCount = 0;
    this.bufferedFrames = [];
    this.bufferedBytes = 0;
  }

  /** Request the server list from the master server. */
  listServers(): void {
    this.send({ type: "listServers" });
  }

  /** Send a WebSocket ping to measure browser↔relay RTT. */
  sendWsPing(): void {
    this.send({ type: "wsPing", ts: Date.now() });
  }

  /** Join a specific game server. */
  joinServer(address: string, warriorName?: string): void {
    this.replayUpload = null;
    log.info("Joining server: %s", address);
    this.resetSessionFraming();
    this.watchAddress = null;
    this.replaySessionId = null;
    this.replayCreating = false;
    this.replayEpoch = null;
    this.replayRevision = -1;
    this.send({ type: "joinServer", address, warriorName });
  }

  /** Attach to a shared watch session for a game server (spectator). */
  watchServer(address: string, channelId?: string): void {
    this.replayUpload = null;
    log.info("Watching server: %s", address);
    this.resetSessionFraming("waiting");
    this.watchAddress = normalizeAddress(address);
    this.replaySessionId = null;
    this.replayCreating = false;
    this.replayEpoch = null;
    this.replayRevision = -1;
    this.send({ type: "watchServer", address, channelId });
  }

  /** Detach from the current watch session; the socket stays open. */
  leaveServer(): void {
    this.replayUpload = null;
    this.send({ type: "leaveServer" });
    this.resetSessionFraming("waiting");
    this.watchAddress = null;
  }

  createReplay(demo: string, creatorId: string, tick?: number): void {
    this.replayUpload = null;
    this.resetSessionFraming("waiting");
    this.watchAddress = null;
    this.replaySessionId = null;
    this.replayCreating = true;
    this.replayEpoch = null;
    this.replayRevision = -1;
    this.send({ type: "createReplay", demo, creatorId, tick });
  }

  joinReplay(sessionId: string, ownerToken?: string): void {
    this.replayUpload = null;
    this.resetSessionFraming("waiting");
    this.watchAddress = null;
    this.replaySessionId = sessionId;
    this.replayCreating = false;
    this.replayEpoch = null;
    this.replayRevision = -1;
    this.send({ type: "joinReplay", sessionId, ownerToken });
  }

  controlReplay(
    sessionId: string,
    revision: number,
    action: Extract<ReplayClientMessage, { type: "controlReplay" }>["action"],
    tick?: number,
  ): void {
    this.send({ type: "controlReplay", sessionId, revision, action, tick });
  }

  /** Subscribe before HTTP upload begins so no server byte counts are missed. */
  watchReplayUpload(
    uploadId: string,
    totalBytes: number,
    creatorId: string,
  ): void {
    this.resetSessionFraming("waiting");
    this.watchAddress = null;
    this.replaySessionId = null;
    this.replayCreating = false;
    this.replayEpoch = null;
    this.replayRevision = -1;
    this.replayUpload = { uploadId, totalBytes };
    this.send({ type: "watchReplayUpload", uploadId, totalBytes, creatorId });
  }

  syncReplay(sessionId: string): void {
    this.resetSessionFraming("waiting");
    this.send({ type: "syncReplay", sessionId });
  }

  leaveReplay(): void {
    this.replayUpload = null;
    this.send({ type: "leaveReplay" });
    this.resetSessionFraming("waiting");
    this.replaySessionId = null;
    this.replayCreating = false;
    this.replayEpoch = null;
    this.replayRevision = -1;
  }

  /** Forward a T2csri auth event to the relay. */
  sendAuthEvent(command: string, args: string[]): void {
    this.send({ type: "sendCommand", command, args });
  }

  /** Send a commandToServer through the relay. */
  sendCommand(command: string, args: string[]): void {
    this.send({ type: "sendCommand", command, args });
  }

  /** Send datablock info for relay-side CRC computation over game files. */
  sendCRCCompute(
    seed: number,
    field2: number,
    datablocks: { objectId: number; className: string; shapeName: string }[],
    includeTextures: boolean,
  ): void {
    this.send({
      type: "sendCRCCompute",
      seed,
      field2,
      includeTextures,
      datablocks,
    });
  }

  /** Send a GhostAlwaysDone acknowledgment through the relay. */
  sendGhostAck(sequence: number, ghostCount: number): void {
    this.send({ type: "sendGhostAck", sequence, ghostCount });
  }

  /**
   * Queue new moves on the relay, which resends them until acked.
   */
  sendMoves(moves: ClientMove[], moveStartIndex: number): void {
    this.send({ type: "sendMoves", moves, moveStartIndex });
  }

  /** Close the WebSocket connection entirely. */
  close(): void {
    this.replayUpload = null;
    this.stopWsPing();
    this.resetSessionFraming();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
  }

  private startWsPing(): void {
    this.smoothedWsPing = 0;
    // Send immediately so we have a measurement before the server list arrives.
    this.send({ type: "wsPing", ts: Date.now() });
    this.wsPingInterval = setInterval(() => {
      this.send({ type: "wsPing", ts: Date.now() });
    }, 7000);
  }

  private stopWsPing(): void {
    if (this.wsPingInterval != null) {
      clearInterval(this.wsPingInterval);
      this.wsPingInterval = null;
    }
  }

  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      log.warn("send dropped (ws not open): %s", message.type);
    }
  }
}
