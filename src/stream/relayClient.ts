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
    info: { address: string; serverName?: string; mapName?: string },
    watcherCount: number,
  ) => void;
  onWatcherCount?: (count: number) => void;
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
   */
  private catchupMode: "live" | "collecting" | "finalizing" = "live";
  private catchupChunks: Uint8Array[] = [];
  private catchupReceivedBytes = 0;
  private catchupTotalBytes = 0;
  private bufferedLivePackets: Uint8Array[] = [];

  constructor(url: string, handlers: RelayEventHandler) {
    this.url = url;
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = "arraybuffer";

    this.ws.onopen = () => {
      log.info("WebSocket connected to %s", this.url);
      this._connected = true;
      this.startWsPing();
      this.handlers.onOpen?.();
    };

    this.ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        const data = new Uint8Array(event.data);
        if (this.catchupMode === "collecting") {
          this.catchupChunks.push(data);
          this.catchupReceivedBytes += data.length;
          this.handlers.onCatchupProgress?.(
            this.catchupReceivedBytes,
            this.catchupTotalBytes,
          );
        } else if (this.catchupMode === "finalizing") {
          this.bufferedLivePackets.push(data);
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

    this.ws.onclose = () => {
      log.info("WebSocket disconnected");
      this._connected = false;
      this.stopWsPing();
      this.handlers.onClose?.();
    };

    this.ws.onerror = () => {
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
        this.handlers.onSessionStatus?.(
          message.status,
          message.message,
          {
            address: message.address,
            serverName: message.serverName,
            mapName: message.mapName,
          },
          message.watcherCount,
        );
        break;
      case "watcherCount":
        this.handlers.onWatcherCount?.(message.count);
        break;
      case "catchupBegin":
        this.catchupMode = "collecting";
        this.catchupChunks = [];
        this.catchupReceivedBytes = 0;
        this.catchupTotalBytes = message.totalBytes;
        this.handlers.onCatchupProgress?.(0, message.totalBytes);
        break;
      case "catchupEnd":
        this.finalizeCatchup();
        break;
      case "error":
        this.handlers.onError?.(message.message);
        break;
    }
  }

  private finalizeCatchup(): void {
    const chunks = this.catchupChunks;
    this.catchupChunks = [];
    this.catchupMode = "finalizing";
    gunzipToString(chunks)
      .then((json) => {
        const payload = deserializeCatchupPayload(json);
        log.info(
          "catch-up payload: %d ghosts, %d datablocks, epoch %d",
          payload.initialGhosts.length,
          payload.dataBlocks.length,
          payload.epoch,
        );
        this.handlers.onCatchup?.(payload);
      })
      .catch((e) => {
        log.error("Failed to decode catch-up payload: %o", e);
        this.handlers.onError?.("Failed to decode catch-up payload");
      })
      .finally(() => {
        this.catchupMode = "live";
        const buffered = this.bufferedLivePackets;
        this.bufferedLivePackets = [];
        for (const packet of buffered) {
          this.handlers.onGamePacket?.(packet);
        }
      });
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
    this.send({ type: "joinServer", address, warriorName });
  }

  /** Attach to a shared watch session for a game server (spectator). */
  watchServer(address: string): void {
    log.info("Watching server: %s", address);
    this.send({ type: "watchServer", address });
  }

  /** Detach from the current watch session; the socket stays open. */
  leaveServer(): void {
    this.send({ type: "leaveServer" });
    this.catchupMode = "live";
    this.catchupChunks = [];
    this.bufferedLivePackets = [];
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
