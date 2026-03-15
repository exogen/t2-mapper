import dgram from "node:dgram";
import { EventEmitter } from "node:events";
import {
  ConnectionProtocol,
  ClientNetStringTable,
  buildConnectChallengeRequest,
  buildConnectRequest,
  buildClientGamePacket,
  buildRemoteCommandEvent,
  buildCRCChallengeResponseEvent,
  buildGhostingMessageEvent,
  buildDisconnectPacket,
  type ClientEvent,
  type ClientMoveData,
} from "./protocol.js";
import { BitStream } from "t2-demo-parser";
import { T2csriAuth, loadCredentials } from "./auth.js";
import { connLog } from "./logger.js";
import type { ConnectionStatus } from "./types.js";
import { computeGameCRC, type CRCDataBlock } from "./crc.js";

// Tribes 2 protocol version and class CRC from the binary.
// These must match what the server expects.
const PROTOCOL_VERSION = 0x33; // 51 — from Tribes2.exe binary

// Real T2 client sends at ~32ms tick rate. Using 32ms ensures the server
// receives steady acks for guaranteed event delivery (datablock phase).
const KEEPALIVE_INTERVAL_MS = 32;
const CONNECT_TIMEOUT_MS = 30000;

interface GameConnectionEvents {
  status: [status: ConnectionStatus, message?: string];
  packet: [data: Uint8Array];
  ping: [ms: number];
  error: [error: Error];
  close: [];
}

/**
 * Manages a UDP connection to a Tribes 2 game server.
 * Handles the connection handshake, keepalive, and packet forwarding.
 */
export class GameConnection extends EventEmitter<GameConnectionEvents> {
  private socket: dgram.Socket | null = null;
  private host: string;
  private port: number;
  private protocol = new ConnectionProtocol();
  private auth: T2csriAuth | null = null;

  private clientConnectSequence = Math.floor(Math.random() * 0xffffffff);
  private serverConnectSequence = 0;
  private _status: ConnectionStatus = "disconnected";
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private challengeRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private authDelayTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectRetryTimer: ReturnType<typeof setTimeout> | null = null;

  private nextSendEventSeq = 0;
  private pendingEvents: ClientEvent[] = [];
  /** Events sent but not yet acked, keyed by packet sequence number. */
  private sentEventsByPacket = new Map<
    number,
    { seq: number; event: ClientEvent }[]
  >();
  /** Events waiting to be sent (new or retransmitted from lost packets). */
  private eventSendQueue: { seq: number; event: ClientEvent }[] = [];
  private stringTable = new ClientNetStringTable();
  private dataPacketCount = 0;
  private rawMessageCount = 0;
  private _mapName?: string;
  private observerEnforced = false;
  private lastLoggedMove: string = "";
  /** Send timestamps by sequence number for RTT measurement. */
  private sendTimestamps = new Map<number, number>();
  /** Smoothed RTT in ms (exponential moving average). */
  private smoothedPing = 0;
  private lastPingEmit = 0;

  /** Warrior name to send in the ConnectRequest. */
  private warriorName: string;

  constructor(address: string, options?: { warriorName?: string }) {
    super();
    const [host, portStr] = address.split(":");
    this.host = host;
    this.port = parseInt(portStr, 10);
    this.warriorName = options?.warriorName || "";

    // Wire up packet delivery notifications for event retransmission.
    this.protocol.onNotify = (packetSeq, acked) => {
      this.handlePacketNotify(packetSeq, acked);
    };
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  get connectSequence(): number {
    return (this.clientConnectSequence ^ this.serverConnectSequence) >>> 0;
  }

  get mapName(): string | undefined {
    return this._mapName;
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    this._status = status;
    this.emit("status", status, message);
  }

  /** Initiate connection to the game server. */
  async connect(): Promise<void> {
    connLog.info(
      { host: this.host, port: this.port },
      "Connecting to game server",
    );
    const credentials = loadCredentials();
    if (credentials) {
      connLog.info("T2csri credentials loaded");
      this.auth = new T2csriAuth(credentials);
    } else {
      connLog.warn("No T2csri credentials — connecting without auth");
    }

    this.socket = dgram.createSocket("udp4");
    this.socket.on("message", (msg) => this.handleMessage(msg));
    this.socket.on("error", (err) => {
      this.emit("error", err);
      this.disconnect();
    });

    this.setStatus("connecting");

    // Start the handshake
    this.sendChallengeRequest();

    // Set overall connection timeout
    this.handshakeTimer = setTimeout(() => {
      if (this._status !== "connected" && this._status !== "authenticating") {
        connLog.warn("Connection timed out");
        this.setStatus("disconnected", "Connection timed out");
        this.disconnect();
      }
    }, CONNECT_TIMEOUT_MS);
  }

  /** Send the initial ConnectChallengeRequest. */
  private sendChallengeRequest(): void {
    this.setStatus("challenging");
    const packet = buildConnectChallengeRequest(
      PROTOCOL_VERSION,
      this.clientConnectSequence,
    );
    connLog.info(
      { bytes: packet.length, clientSeq: this.clientConnectSequence },
      "Sending ConnectChallengeRequest",
    );
    this.sendRaw(packet);

    // Retry challenge if no response
    this.challengeRetryTimer = setTimeout(() => {
      this.challengeRetryTimer = null;
      if (this._status === "challenging") {
        connLog.info("No challenge response, retrying");
        this.sendRaw(packet);
      }
    }, 2000);
  }

  /** Handle an incoming UDP message. */
  private handleMessage(msg: Buffer): void {
    if (msg.length === 0) return;

    this.rawMessageCount++;
    if (this.rawMessageCount <= 30 || this.rawMessageCount % 50 === 0) {
      connLog.debug(
        {
          bytes: msg.length,
          firstByte: msg[0],
          rawTotal: this.rawMessageCount,
        },
        "Raw UDP message received",
      );
    }

    const firstByte = msg[0];

    if (this.isOOBPacket(firstByte)) {
      connLog.debug(
        { type: firstByte, bytes: msg.length },
        "Received OOB packet",
      );
      this.handleOOBPacket(msg);
    } else {
      this.handleDataPacket(msg);
    }
  }

  /** Check if a packet is OOB (out-of-band) vs data protocol. */
  private isOOBPacket(firstByte: number): boolean {
    // Disconnect (38) can arrive at any time
    if (firstByte === 38) return true;
    const oobTypes = [26, 28, 30, 32, 34, 36, 38, 40];
    return (
      this._status !== "connected" &&
      this._status !== "authenticating" &&
      oobTypes.includes(firstByte)
    );
  }

  /** Handle out-of-band handshake packets. */
  private handleOOBPacket(msg: Buffer): void {
    const type = msg[0];

    switch (type) {
      case 28: // ChallengeReject
        this.handleChallengeReject(msg);
        break;
      case 30: // ConnectChallengeResponse
        this.handleChallengeResponse(msg);
        break;
      case 34: // ConnectReject
        this.handleConnectReject(msg);
        break;
      case 36: // ConnectAccept
        this.handleConnectAccept(msg);
        break;
      case 38: {
        // Disconnect — U8(type) + U32(seq1) + U32(seq2) + HuffString(reason)
        let reason = "Server disconnected";
        if (msg.length > 9) {
          try {
            const data = new Uint8Array(
              msg.buffer,
              msg.byteOffset,
              msg.byteLength,
            );
            // Skip 9-byte header (1 type + 4 connectSeq + 4 connectSeq2).
            // Reason is Huffman-encoded via BitStream::writeString (no stringBuffer).
            const bs = new BitStream(data.subarray(9));
            const parsed = bs.readString();
            if (parsed) reason = parsed;
          } catch {
            // Fall back to default reason
          }
        }
        connLog.warn(
          { reason, bytes: msg.length },
          "Server sent Disconnect packet",
        );
        if (this._status === "disconnected") {
          // We initiated the disconnect — this is the server's confirmation.
          this.onServerDisconnectConfirmed(reason);
        } else {
          // Server-initiated disconnect.
          this.setStatus("disconnected", reason);
          this.disconnect();
        }
        break;
      }
      default:
        connLog.warn({ type, bytes: msg.length }, "Unknown OOB packet type");
    }
  }

  /** Handle ChallengeReject (type 28): U8(28) + U32(clientSeq) + HuffString(reason). */
  private handleChallengeReject(msg: Buffer): void {
    if (msg.length < 5) return;
    const dv = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
    const seq = dv.getUint32(1, true);
    if (seq !== this.clientConnectSequence) {
      connLog.debug(
        { expected: this.clientConnectSequence, got: seq },
        "ChallengeReject sequence mismatch, ignoring",
      );
      return;
    }
    let reason = "Challenge rejected";
    if (msg.length > 5) {
      try {
        const data = new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
        const bs = new BitStream(data.subarray(5));
        const parsed = bs.readString();
        if (parsed) reason = parsed;
      } catch {
        // Fall back to default reason
      }
    }
    connLog.warn({ reason }, "ChallengeReject received");
    this.setStatus("disconnected", reason);
    this.disconnect();
  }

  /** Handle ConnectChallengeResponse. */
  private handleChallengeResponse(msg: Buffer): void {
    if (msg.length < 14) {
      connLog.error({ bytes: msg.length }, "ChallengeResponse too short");
      return;
    }

    const dv = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
    const serverProtocolVersion = dv.getUint32(1, true);
    this.serverConnectSequence = dv.getUint32(5, true);
    const echoedClientSeq = dv.getUint32(9, true);

    connLog.info(
      {
        serverProto: serverProtocolVersion,
        serverSeq: this.serverConnectSequence,
        echoedClientSeq,
      },
      "Received ChallengeResponse",
    );

    if (echoedClientSeq !== this.clientConnectSequence) {
      connLog.error(
        { expected: this.clientConnectSequence, got: echoedClientSeq },
        "Client connect sequence mismatch",
      );
      return;
    }

    // Send ConnectRequest
    const connectArgv = this.buildConnectArgv();
    const packet = buildConnectRequest(
      this.serverConnectSequence,
      this.clientConnectSequence,
      PROTOCOL_VERSION,
      false, // not pre-authenticated
      connectArgv,
    );
    connLog.info(
      { bytes: packet.length, argv: connectArgv },
      "Sending ConnectRequest",
    );
    this.sendRaw(packet);
  }

  /** Build the connection argv (name, race/gender, skin, voice, voicePitch). */
  private buildConnectArgv(): string[] {
    const name = this.warriorName || process.env.T2_ACCOUNT_NAME || "Observer";
    return [
      name, // player name
      "Male Human", // race/gender
      "beagle", // skin
      "male1", // voice
      "1.0", // voice pitch
    ];
  }

  /** Handle ConnectAccept. */
  private handleConnectAccept(_msg: Buffer): void {
    connLog.info(
      {
        clientSeq: this.clientConnectSequence,
        serverSeq: this.serverConnectSequence,
        xorSeq: this.connectSequence,
        connectSeqBit: this.connectSequence & 1,
      },
      "ConnectAccept received — connection established",
    );
    this.protocol.connectSequence = this.connectSequence;
    this.startKeepalive();

    if (this.auth) {
      connLog.info("Starting T2csri authentication");
      this.setStatus("authenticating");
    } else {
      this.enforceObserver();
      this.setStatus("connected");
    }
  }

  /** Handle ConnectReject. */
  /** Handle ConnectReject (type 34): U8(34) + U32(serverSeq) + U32(clientSeq) + HuffString(reason). */
  private handleConnectReject(msg: Buffer): void {
    if (msg.length < 9) return;
    const dv = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
    const serverSeq = dv.getUint32(1, true);
    const clientSeq = dv.getUint32(5, true);
    if (
      serverSeq !== this.serverConnectSequence ||
      clientSeq !== this.clientConnectSequence
    ) {
      connLog.debug(
        {
          expectedServer: this.serverConnectSequence,
          gotServer: serverSeq,
          expectedClient: this.clientConnectSequence,
          gotClient: clientSeq,
        },
        "ConnectReject sequence mismatch, ignoring",
      );
      return;
    }
    let reason = "Connection rejected";
    if (msg.length > 9) {
      try {
        const data = new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
        const bs = new BitStream(data.subarray(9));
        const parsed = bs.readString();
        if (parsed) reason = parsed;
      } catch {
        // Fall back to default reason
      }
    }
    connLog.warn({ reason }, "ConnectReject received");
    this.setStatus("disconnected", reason);
    this.disconnect();
  }

  /** Handle a data protocol packet (established connection). */
  private handleDataPacket(msg: Buffer): void {
    const data = new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);

    this.dataPacketCount++;
    if (this.dataPacketCount <= 20 || this.dataPacketCount % 50 === 0) {
      connLog.debug(
        { bytes: data.length, total: this.dataPacketCount },
        "Data packet received",
      );
    }

    // Forward the raw packet to the browser for parsing
    this.emit("packet", data);

    // We still need to process the dnet header locally to track ack state
    this.processPacketForAcks(data);
  }

  /** Process a packet's dnet header to maintain ack state. */
  private processPacketForAcks(data: Uint8Array): void {
    if (data.length < 4) return;

    const bs = new BitStream(data);

    bs.readFlag(); // gameFlag
    const connectSeqBit = bs.readInt(1);
    const seqNumber = bs.readInt(9);
    const highestAck = bs.readInt(9);
    const packetType = bs.readInt(2);
    const ackByteCount = bs.readInt(3);
    const ackMask = ackByteCount > 0 ? bs.readInt(8 * ackByteCount) : 0;

    const result = this.protocol.processReceivedHeader({
      seqNumber,
      highestAck,
      packetType,
      connectSeqBit,
      ackByteCount,
      ackMask,
    });

    // Respond to PingPackets (type=1) with our own PingPacket.
    // The server's processRawPacket calls sendPingResponse on receiving a
    // PingPacket. Without this response, the server may time us out.
    if (packetType === 1) {
      connLog.debug(
        { seq: seqNumber },
        "Received PingPacket, sending ping response",
      );
      const pingResponse = this.protocol.buildPingPacket();
      this.sendRaw(pingResponse);
    }

    if (this.dataPacketCount <= 20 || this.dataPacketCount % 50 === 0) {
      connLog.debug(
        {
          seq: seqNumber,
          ack: highestAck,
          type: packetType,
          csb: connectSeqBit,
          ackBytes: ackByteCount,
          accepted: result.accepted,
          dispatch: result.dispatchData,
          ourSeq: this.protocol.lastSendSeq,
          ourAck: this.protocol.lastSeqRecvd,
        },
        "Packet header parsed",
      );
    }

    // Measure RTT from the acked sequence's send timestamp.
    const sendTime = this.sendTimestamps.get(highestAck);
    if (sendTime) {
      const rtt = Date.now() - sendTime;
      this.sendTimestamps.delete(highestAck);
      // Exponential moving average (alpha=0.5 for responsive updates).
      this.smoothedPing =
        this.smoothedPing === 0 ? rtt : this.smoothedPing * 0.5 + rtt * 0.5;
      // Emit ping updates at most every 2 seconds.
      const now = Date.now();
      if (now - this.lastPingEmit >= 2000) {
        this.lastPingEmit = now;
        this.emit("ping", Math.round(this.smoothedPing));
      }
    }

    if (!result.accepted) {
      connLog.warn(
        {
          seq: seqNumber,
          ack: highestAck,
          type: packetType,
          csb: connectSeqBit,
          expectedCsb: this.protocol.connectSequence & 1,
          lastSeqRecvd: this.protocol.lastSeqRecvd,
          lastSendSeq: this.protocol.lastSendSeq,
          highestAckedSeq: this.protocol.highestAckedSeq,
          total: this.dataPacketCount,
        },
        "Data packet REJECTED by protocol",
      );
    }
  }

  /** Handle a parsed T2csri event from the browser. */
  handleAuthEvent(eventName: string, args: string[]): void {
    if (!this.auth) return;

    switch (eventName) {
      case "t2csri_pokeClient": {
        connLog.info(
          "Auth: received pokeClient, sending certificate + challenge",
        );
        const result = this.auth.onPokeClient(args[0] || "", this.host);
        for (const cmd of result.commands) {
          this.sendCommand(cmd.name, ...cmd.args);
        }
        break;
      }

      case "t2csri_getChallengeChunk": {
        connLog.debug(
          { chunkLen: args[0]?.length ?? 0 },
          "Auth: received challenge chunk",
        );
        this.auth.onChallengeChunk(args[0] || "");
        break;
      }

      case "t2csri_decryptChallenge": {
        connLog.info("Auth: decrypting challenge");
        const result = this.auth.onDecryptChallenge();
        if (result) {
          const delay = 64 + Math.floor(Math.random() * 448);
          connLog.info(
            { delayMs: delay },
            "Auth: challenge verified, sending response",
          );
          this.authDelayTimer = setTimeout(() => {
            this.authDelayTimer = null;
            if (this._status !== "authenticating") return;
            this.sendCommand(result.command.name, ...result.command.args);
            this.enforceObserver();
            this.setStatus("connected");
          }, delay);
        } else {
          connLog.error("Auth: challenge verification failed");
          this.setStatus("disconnected", "Authentication failed");
          this.disconnect();
        }
        break;
      }
    }
  }

  /** Respond to a CRCChallengeEvent by echoing values (legacy fallback). */
  handleCRCChallenge(crcValue: number, field1: number, field2: number): void {
    connLog.info(
      { crcValue, field1, field2 },
      "CRC challenge received, sending echo response (legacy)",
    );
    const event = buildCRCChallengeResponseEvent(crcValue, field1, field2);
    this.pendingEvents.push(event);
    this.flushEvents();
  }

  /**
   * Compute correct CRC over game shape files and send the response.
   * The browser sends us the datablock list (from SimDataBlockEvents)
   * along with the challenge seed and field2 to echo.
   */
  async computeAndSendCRC(
    seed: number,
    field2: number,
    datablocks: CRCDataBlock[],
    includeTextures: boolean,
    basePath: string,
  ): Promise<void> {
    connLog.info(
      {
        seed: `0x${(seed >>> 0).toString(16)}`,
        datablocks: datablocks.length,
        includeTextures,
      },
      "Computing CRC over game files",
    );
    try {
      const { crc, totalSize } = await computeGameCRC(
        seed,
        datablocks,
        basePath,
        includeTextures,
      );
      connLog.info(
        { crc: `0x${(crc >>> 0).toString(16)}`, totalSize },
        "CRC computed, sending response",
      );
      const event = buildCRCChallengeResponseEvent(crc, totalSize, field2);
      this.pendingEvents.push(event);
      this.flushEvents();
    } catch (e) {
      connLog.error({ err: e }, "CRC computation failed");
    }
  }

  /**
   * Respond to a GhostingMessageEvent type 0 (GhostAlwaysDone) from the server.
   * Sends back type 1 to enable ghosting (sets mGhosting=true on server).
   */
  handleGhostAlwaysDone(sequence: number, ghostCount: number): void {
    connLog.info(
      { sequence, ghostCount },
      "GhostAlwaysDone received, sending acknowledgment (type 1)",
    );
    const event = buildGhostingMessageEvent(sequence, 1, ghostCount);
    this.pendingEvents.push(event);
    this.flushEvents();
  }

  /** Send a commandToServer as a RemoteCommandEvent. */
  sendCommand(command: string, ...args: string[]): void {
    connLog.debug(
      { command, args, eventSeq: this.nextSendEventSeq },
      "Sending commandToServer",
    );
    const events = buildRemoteCommandEvent(this.stringTable, command, ...args);
    this.pendingEvents.push(...events);
    this.flushEvents();
  }

  /** Flush pending events in a data packet immediately. */
  private flushEvents(): void {
    if (this.pendingEvents.length === 0 && this.eventSendQueue.length === 0) {
      return;
    }
    this.emitDataPacket([], 0);
  }

  /** Handle packet delivery notification from the protocol layer. */
  private handlePacketNotify(packetSeq: number, acked: boolean): void {
    const events = this.sentEventsByPacket.get(packetSeq);
    if (!events || events.length === 0) {
      this.sentEventsByPacket.delete(packetSeq);
      return;
    }

    this.sentEventsByPacket.delete(packetSeq);

    if (acked) {
      connLog.debug(
        {
          packetSeq,
          ackedEvents: events.map((e) => e.seq),
        },
        "Guaranteed events acked",
      );
    } else {
      // Packet was lost — re-queue events at the HEAD of the send queue
      // so they are retransmitted in the next outgoing data packet.
      connLog.warn(
        {
          packetSeq,
          lostEvents: events.map((e) => e.seq),
        },
        "Packet lost, re-queuing guaranteed events for retransmission",
      );
      this.eventSendQueue.unshift(...events);
    }
  }

  /** Enforce observer team so we spectate instead of spawning. */
  private enforceObserver(): void {
    if (this.observerEnforced) return;
    this.observerEnforced = true;
    connLog.info("Enforcing observer mode (setPlayerTeam 0)");
    this.sendCommand("setPlayerTeam", "0");
  }

  /** Set the map name (from GameInfoResponse during server query). */
  setMapName(mapName: string): void {
    this._mapName = mapName;
  }

  /**
   * Send moves immediately to the game server.
   * The browser owns move indices and re-sends all unacked moves each tick,
   * just like real Tribes 2's moveWritePacket.
   */
  sendMoves(moves: ClientMoveData[], moveStartIndex: number): void {
    if (moves.length > 0) {
      const m = moves[moves.length - 1];
      const key = `${m.yaw.toFixed(4)},${m.pitch.toFixed(4)},${m.x.toFixed(2)},${m.y.toFixed(2)},${m.z.toFixed(2)},${m.trigger.map(Number).join("")}`;
      if (key !== this.lastLoggedMove) {
        this.lastLoggedMove = key;
        connLog.info(
          {
            idx: moveStartIndex,
            n: moves.length,
            yaw: +m.yaw.toFixed(4),
            pitch: +m.pitch.toFixed(4),
            x: +m.x.toFixed(2),
            y: +m.y.toFixed(2),
            z: +m.z.toFixed(2),
            trig: m.trigger.map(Number).join(""),
          },
          "browser → relay move",
        );
      }
    }
    this.emitDataPacket(moves, moveStartIndex);
  }

  /**
   * Internal: build and send a data packet with moves and/or pending events.
   * Used by both sendMoves (browser-initiated) and keepalive (idle).
   */
  private emitDataPacket(
    moves: ClientMoveData[],
    moveStartIndex: number,
  ): void {
    // Record send time for RTT measurement.
    const nextSeq9 = (this.protocol.lastSendSeq + 1) & 0x1ff;
    this.sendTimestamps.set(nextSeq9, Date.now());

    // Absorb any new pending events into the send queue.
    for (const event of this.pendingEvents.splice(0)) {
      const seq = this.nextSendEventSeq++;
      this.eventSendQueue.push({ seq, event });
    }

    let events: { seq: number; event: ClientEvent }[] | undefined;
    if (this.eventSendQueue.length > 0) {
      events = this.eventSendQueue.splice(0);
      const packetSeq = this.protocol.lastSendSeq + 1;
      this.sentEventsByPacket.set(packetSeq, events);
    }

    const packet = buildClientGamePacket(this.protocol, {
      moves,
      moveStartIndex,
      ...(events
        ? {
            events: events.map((e) => e.event),
            nextSendEventSeq: events[0].seq,
          }
        : {}),
    });
    this.sendRaw(packet);
  }

  /** Send an idle keepalive packet (no moves, but flushes pending events). */
  private sendKeepalive(): void {
    this.emitDataPacket([], 0);
  }

  /** Start keepalive timer. Sends idle packets when the browser isn't sending moves. */
  private startKeepalive(): void {
    let keepaliveCount = 0;
    this.keepaliveTimer = setInterval(() => {
      keepaliveCount++;
      if (keepaliveCount % 300 === 0) {
        connLog.info(
          {
            dataPackets: this.dataPacketCount,
            rawMessages: this.rawMessageCount,
            ourSeq: this.protocol.lastSendSeq,
            ourAck: this.protocol.lastSeqRecvd,
            theirAck: this.protocol.highestAckedSeq,
          },
          "Connection status",
        );
      }
      this.sendKeepalive();
    }, KEEPALIVE_INTERVAL_MS);
  }

  /** Send raw bytes to the server. */
  private sendRaw(data: Uint8Array): void {
    if (!this.socket) return;
    this.socket.send(data, this.port, this.host, (err) => {
      if (err) {
        connLog.error({ err, bytes: data.length }, "UDP send failed");
      }
    });
  }

  /** Clean up the socket and emit "close" (idempotent). */
  private closeSocket(): void {
    if (this.disconnectRetryTimer) {
      clearTimeout(this.disconnectRetryTimer);
      this.disconnectRetryTimer = null;
    }
    const hadSocket = this.socket != null;
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Already closed
      }
      this.socket = null;
    }
    // Only emit "close" once — the first call that actually tears down.
    if (hadSocket) {
      this.emit("close");
    }
  }

  /**
   * Called when the server confirms our disconnect by sending a type 38
   * packet back. Cancels any pending retransmissions and closes immediately.
   */
  private onServerDisconnectConfirmed(reason: string): void {
    connLog.info({ reason }, "Server confirmed disconnect");
    this.closeSocket();
  }

  /** Disconnect from the server, sending a Disconnect OOB packet first. */
  disconnect(): void {
    if (this._status === "disconnected" && !this.socket) return;

    connLog.info("Disconnecting");

    // Stop all periodic work immediately, including any in-progress
    // disconnect retransmission (guards against re-entrant calls from
    // socket error handlers during the retry window).
    if (this.disconnectRetryTimer) {
      clearTimeout(this.disconnectRetryTimer);
      this.disconnectRetryTimer = null;
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.challengeRetryTimer) {
      clearTimeout(this.challengeRetryTimer);
      this.challengeRetryTimer = null;
    }
    if (this.authDelayTimer) {
      clearTimeout(this.authDelayTimer);
      this.authDelayTimer = null;
    }
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }

    if (this._status !== "disconnected") {
      this.setStatus("disconnected");
    }

    // Send a Disconnect packet and wait for the server to confirm by
    // sending its own type 38 back. If no confirmation arrives within
    // 500ms, retransmit — UDP is unreliable and a single packet may be
    // lost. After 3 attempts, close the socket regardless.
    if (this.socket && this.serverConnectSequence !== 0) {
      const packet = buildDisconnectPacket(
        this.serverConnectSequence,
        this.clientConnectSequence,
      );
      let attempts = 0;
      const MAX_ATTEMPTS = 3;
      const RETRY_MS = 500;

      const trySend = () => {
        if (!this.socket) return; // Already confirmed and closed.
        attempts++;
        try {
          this.socket.send(packet, this.port, this.host);
          connLog.info(
            "Sent Disconnect packet (%d/%d)",
            attempts,
            MAX_ATTEMPTS,
          );
        } catch {
          connLog.warn("Failed to send Disconnect packet, closing socket");
          this.closeSocket();
          return;
        }
        if (attempts < MAX_ATTEMPTS) {
          this.disconnectRetryTimer = setTimeout(trySend, RETRY_MS);
        } else {
          // Give up waiting for confirmation.
          this.disconnectRetryTimer = setTimeout(() => {
            connLog.warn("No disconnect confirmation from server, closing");
            this.closeSocket();
          }, RETRY_MS);
        }
      };
      trySend();
    } else {
      this.closeSocket();
    }
  }
}
