import { createLogger } from "../logger";
import type {
  ClientMessage,
  ClientMove,
  ServerMessage,
  ServerInfo,
  ConnectionStatus,
} from "../../relay/types";

const log = createLogger("relayClient");

export type RelayEventHandler = {
  onOpen?: () => void;
  onStatus?: (
    status: ConnectionStatus,
    message?: string,
    connectSequence?: number,
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
};

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
        // Binary message — game packet from server
        this.handlers.onGamePacket?.(new Uint8Array(event.data));
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
          message.connectSequence,
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
      case "error":
        this.handlers.onError?.(message.message);
        break;
    }
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

  /** Forward a T2csri auth event to the relay. */
  sendAuthEvent(command: string, args: string[]): void {
    this.send({ type: "sendCommand", command, args });
  }

  /** Send a commandToServer through the relay. */
  sendCommand(command: string, args: string[]): void {
    this.send({ type: "sendCommand", command, args });
  }

  /** Send a CRC challenge response through the relay (legacy echo). */
  sendCRCResponse(crcValue: number, field1: number, field2: number): void {
    this.send({ type: "sendCRCResponse", crcValue, field1, field2 });
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
