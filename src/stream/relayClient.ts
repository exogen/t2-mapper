import { createLogger } from "../logger";
import { deserializeCatchupPayload } from "../../relay/watchSerialize";
import type {
  ClientMessage,
  ClientMove,
  ServerMessage,
  ServerInfo,
  ConnectionStatus,
  WatchCatchupPayload,
  WatchStatus,
} from "../../relay/types";

const log = createLogger("relayClient");
type SessionStatusMessage = Extract<ServerMessage, { type: "sessionStatus" }>;

export type RelayEventHandler = {
  onOpen?: () => void;
  onStatus?: (
    status: ConnectionStatus,
    message?: string,
    mapName?: string,
  ) => void;
  onServerList?: (servers: ServerInfo[]) => void;
  onGamePacket?: (data: Uint8Array) => void;
  /** Relay↔T2 server RTT. */
  onPing?: (ms: number) => void;
  /** Browser↔relay WebSocket RTT. */
  onWsPing?: (ms: number) => void;
  onError?: (message: string) => void;
  onClose?: () => void;
  // ── Watch mode ──
  onSessionStatus?: (
    status: WatchStatus,
    message: string | undefined,
    info: {
      address: string;
      serverName?: string;
      mapName?: string;
      channelId?: string;
      /** Whether the stream at the watcher playhead was being recorded. */
      recording?: boolean;
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

async function gunzipToString(chunks: Uint8Array[]): Promise<string> {
  const stream = new Blob(chunks as BlobPart[])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const buffer = await new Response(stream).arrayBuffer();
  return new TextDecoder().decode(buffer);
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
  private catchupChunks: Uint8Array[] = [];
  private catchupReceivedBytes = 0;
  private catchupTotalBytes = 0;
  private catchupChunkCount = 0;
  private catchupEpoch = 0;
  private bufferedFrames: Array<Uint8Array | SessionStatusMessage> = [];
  /**
   * Bumped on each catch-up, socket close, or watch/join target change. The async
   * catch-up decode checks it on completion: a payload from a session
   * the user has since left must neither hydrate the new adapter nor
   * flip the framing state under the new session's own catch-up.
   */
  private sessionGeneration = 0;

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
          this.catchupChunks.push(data);
          this.catchupReceivedBytes += data.length;
          this.handlers.onCatchupProgress?.(
            this.catchupReceivedBytes,
            this.catchupTotalBytes,
          );
        } else if (this.catchupMode === "finalizing") {
          this.bufferedFrames.push(data);
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
      case "serverList":
        this.handlers.onServerList?.(message.servers);
        break;
      case "status":
        this.handlers.onStatus?.(
          message.status,
          message.message,
          message.mapName,
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
        if (this.catchupMode === "waiting" && message.status === "live") break;
        if (this.catchupMode === "finalizing") {
          this.bufferedFrames.push(message);
          break;
        }
        this.handlers.onSessionStatus?.(
          message.status,
          message.message,
          {
            address: message.address,
            serverName: message.serverName,
            mapName: message.mapName,
            channelId: message.channelId,
            recording: message.recording,
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
        // A newer snapshot supersedes any older asynchronous decode and
        // the packets already represented by this new snapshot.
        this.resetSessionFraming();
        this.catchupMode = "collecting";
        this.catchupTotalBytes = message.totalBytes;
        this.catchupChunkCount = message.chunkCount;
        this.catchupEpoch = message.epoch;
        this.handlers.onCatchupProgress?.(0, message.totalBytes);
        break;
      case "catchupEnd":
        if (this.catchupMode === "waiting") break;
        this.finalizeCatchup();
        break;
      case "error":
        this.handlers.onError?.(message.message);
        break;
    }
  }

  private finalizeCatchup(): void {
    if (
      this.catchupMode !== "collecting" ||
      this.catchupReceivedBytes !== this.catchupTotalBytes ||
      this.catchupChunks.length !== this.catchupChunkCount
    ) {
      this.failCatchup(new Error("Incomplete catch-up payload"));
      return;
    }
    const chunks = this.catchupChunks;
    const epoch = this.catchupEpoch;
    this.catchupChunks = [];
    this.catchupMode = "finalizing";
    const generation = this.sessionGeneration;
    gunzipToString(chunks)
      .then((json) => {
        if (generation !== this.sessionGeneration) return;
        const payload = deserializeCatchupPayload(json);
        if (payload.epoch !== epoch) {
          throw new Error("Catch-up epoch does not match its framing");
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
      });
  }

  private failCatchup(error: unknown): void {
    log.error("Failed to decode catch-up payload: %o", error);
    this.resetSessionFraming();
    this.handlers.onError?.("Failed to decode catch-up payload; reconnecting");
    // Trigger the normal reconnect path. Raw packets cannot be decoded
    // safely without a successfully hydrated snapshot.
    this.ws?.close();
  }

  /** Forget any catch-up in flight for the previous session target. */
  private resetSessionFraming(mode: "live" | "waiting" = "live"): void {
    this.sessionGeneration++;
    this.catchupMode = mode;
    this.catchupChunks = [];
    this.catchupReceivedBytes = 0;
    this.catchupTotalBytes = 0;
    this.catchupChunkCount = 0;
    this.bufferedFrames = [];
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
    log.info("Joining server: %s", address);
    this.resetSessionFraming();
    this.send({ type: "joinServer", address, warriorName });
  }

  /** Attach to a shared watch session for a game server (spectator). */
  watchServer(address: string, channelId?: string): void {
    log.info("Watching server: %s", address);
    this.resetSessionFraming("waiting");
    this.send({ type: "watchServer", address, channelId });
  }

  /** Detach from the current watch session; the socket stays open. */
  leaveServer(): void {
    this.send({ type: "leaveServer" });
    this.resetSessionFraming("waiting");
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

  /** Send moves to the relay for immediate forwarding to the game server. */
  sendMoves(moves: ClientMove[], moveStartIndex: number): void {
    this.send({ type: "sendMoves", moves, moveStartIndex });
  }

  /** Close the WebSocket connection entirely. */
  close(): void {
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
