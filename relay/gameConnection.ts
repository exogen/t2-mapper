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

  private nextSendEventSeq = 0;
  private pendingEvents: ClientEvent[] = [];
  /** Events sent but not yet acked, keyed by packet sequence number. */
  private sentEventsByPacket = new Map<number, { seq: number; event: ClientEvent }[]>();
  /** Events waiting to be sent (new or retransmitted from lost packets). */
  private eventSendQueue: { seq: number; event: ClientEvent }[] = [];
  private stringTable = new ClientNetStringTable();
  /** Incrementing move index so the server doesn't deduplicate our moves. */
  private moveIndex = 0;
  private dataPacketCount = 0;
  private rawMessageCount = 0;
  private sendMoveCount = 0;
  private _mapName?: string;
  private observerEnforced = false;
  /** Buffered move state — merged into the next keepalive tick. */
  private bufferedMove: ClientMoveData | null = null;
  /** Ticks remaining to hold the current trigger state before clearing. */
  private triggerHoldTicks = 0;
  /** Send timestamps by sequence number for RTT measurement. */
  private sendTimestamps = new Map<number, number>();
  /** Smoothed RTT in ms (exponential moving average). */
  private smoothedPing = 0;
  private lastPingEmit = 0;

  constructor(address: string) {
    super();
    const [host, portStr] = address.split(":");
    this.host = host;
    this.port = parseInt(portStr, 10);

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
        { bytes: msg.length, firstByte: msg[0], rawTotal: this.rawMessageCount },
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
      case 38: { // Disconnect — U8(type) + U32(seq1) + U32(seq2) + HuffString(reason)
        let reason = "Server disconnected";
        if (msg.length > 9) {
          try {
            const data = new Uint8Array(msg.buffer, msg.byteOffset, msg.byteLength);
            // Skip 9-byte header (1 type + 4 connectSeq + 4 connectSeq2).
            // Reason is Huffman-encoded via BitStream::writeString (no stringBuffer).
            const bs = new BitStream(data.subarray(9));
            const parsed = bs.readString();
            if (parsed) reason = parsed;
          } catch {
            // Fall back to default reason
          }
        }
        connLog.warn({ reason, bytes: msg.length }, "Server sent Disconnect packet");
        this.setStatus("disconnected", reason);
        this.disconnect();
        break;
      }
      default:
        connLog.warn({ type, bytes: msg.length }, "Unknown OOB packet type");
    }
  }

  /** Handle ChallengeReject (type 28): U8(28) + U32(connectSeq) + ASCII reason. */
  private handleChallengeReject(msg: Buffer): void {
    let reason = "Challenge rejected";
    if (msg.length > 5) {
      const chars: number[] = [];
      for (let i = 5; i < msg.length && msg[i] !== 0; i++) {
        chars.push(msg[i]);
      }
      if (chars.length > 0) {
        reason = String.fromCharCode(...chars);
      }
    }
    connLog.warn({ reason }, "ChallengeReject received");
    this.setStatus("disconnected", reason);
    this.disconnect();
  }

  /** Handle ConnectChallengeResponse. */
  private handleChallengeResponse(msg: Buffer): void {
    if (msg.length < 14) {
      connLog.error(
        { bytes: msg.length },
        "ChallengeResponse too short",
      );
      return;
    }

    const dv = new DataView(
      msg.buffer,
      msg.byteOffset,
      msg.byteLength,
    );
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
    const name = process.env.T2_ACCOUNT_NAME || "Observer";
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
  private handleConnectReject(msg: Buffer): void {
    let reason = "Connection rejected";
    if (msg.length > 1) {
      const chars: number[] = [];
      for (let i = 1; i < msg.length && msg[i] !== 0; i++) {
        chars.push(msg[i]);
      }
      reason = String.fromCharCode(...chars);
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
      connLog.debug({ seq: seqNumber }, "Received PingPacket, sending ping response");
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
  handleAuthEvent(
    eventName: string,
    args: string[],
  ): void {
    if (!this.auth) return;

    switch (eventName) {
      case "t2csri_pokeClient": {
        connLog.info("Auth: received pokeClient, sending certificate + challenge");
        const result = this.auth.onPokeClient(
          args[0] || "",
          this.host,
        );
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
            this.sendCommand(
              result.command.name,
              ...result.command.args,
            );
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
      { seed: `0x${(seed >>> 0).toString(16)}`, datablocks: datablocks.length, includeTextures },
      "Computing CRC over game files",
    );
    try {
      const { crc, totalSize } = await computeGameCRC(seed, datablocks, basePath, includeTextures);
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
    connLog.debug({ command, args, eventSeq: this.nextSendEventSeq }, "Sending commandToServer");
    const events = buildRemoteCommandEvent(this.stringTable, command, ...args);
    this.pendingEvents.push(...events);
    this.flushEvents();
  }

  /** Flush pending events in a data packet. */
  private flushEvents(): void {
    // Assign sequence numbers to new pending events and add to send queue.
    for (const event of this.pendingEvents.splice(0)) {
      const seq = this.nextSendEventSeq++;
      this.eventSendQueue.push({ seq, event });
    }
    if (this.eventSendQueue.length === 0) return;

    this.sendDataPacketWithEvents();
  }

  /**
   * Build and send a data packet that includes events from the send queue.
   * Events stay tracked per-packet so they can be re-queued on loss.
   */
  private sendDataPacketWithEvents(
    move?: ClientMoveData,
  ): void {
    const events = this.eventSendQueue.splice(0);
    if (events.length === 0) return;

    const startSeq = events[0].seq;

    connLog.debug(
      {
        eventCount: events.length,
        seqRange: `${startSeq}-${events[events.length - 1].seq}`,
        sendSeq: this.protocol.lastSendSeq + 1,
      },
      "Sending data packet with guaranteed events",
    );

    // Track which events are in this packet for ack/loss handling.
    // lastSendSeq+1 because buildSendPacketHeader increments it.
    const packetSeq = this.protocol.lastSendSeq + 1;
    this.sentEventsByPacket.set(packetSeq, events);

    const moveData = move ?? {
      x: 0, y: 0, z: 0,
      yaw: 0, pitch: 0, roll: 0,
      freeLook: false,
      trigger: [false, false, false, false, false, false],
    };

    const packet = buildClientGamePacket(this.protocol, {
      moves: [moveData],
      moveStartIndex: this.moveIndex++,
      events: events.map((e) => e.event),
      nextSendEventSeq: startSeq,
    });
    this.sendRaw(packet);
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
   * Buffer a move to be sent in the next keepalive tick.
   * Moves are merged into the 32ms keepalive cadence rather than sent as
   * separate packets, because the server's Camera control object processes
   * moves from the regular tick stream (separate extra packets can be
   * ignored or cause trigger edge detection issues).
   */
  sendMove(move: ClientMoveData): void {
    this.sendMoveCount++;
    if (this.sendMoveCount <= 5 || this.sendMoveCount % 100 === 0) {
      connLog.debug(
        { yaw: move.yaw, pitch: move.pitch, x: move.x, y: move.y, z: move.z, total: this.sendMoveCount },
        "Sending move",
      );
    }
    // During trigger hold, merge trigger flags so rapid move updates
    // (e.g. from useFrame at 60fps) can't overwrite a pending trigger
    // before the server sees it.
    if (this.triggerHoldTicks > 0 && this.bufferedMove) {
      move = {
        ...move,
        trigger: this.bufferedMove.trigger.map(
          (held, i) => held || (move.trigger[i] ?? false),
        ),
      };
    }
    this.bufferedMove = move;
    // If any trigger is set, hold it for 2 ticks to ensure the server
    // sees the edge (true then false on the next tick).
    if (move.trigger.some(Boolean)) {
      this.triggerHoldTicks = 2;
    }
  }

  /** Send the current move state as a keepalive packet at the tick rate. */
  private sendTickMove(): void {
    const move: ClientMoveData = this.bufferedMove ?? {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      freeLook: false,
      trigger: [false, false, false, false, false, false],
    };

    // Record send time keyed by the 9-bit sequence number (0–511) that the
    // server will echo back in highestAck. lastSendSeq is the full counter;
    // the wire format uses only the low 9 bits.
    const nextSeq9 = (this.protocol.lastSendSeq + 1) & 0x1ff;
    this.sendTimestamps.set(nextSeq9, Date.now());

    // Absorb any new pending events into the send queue.
    for (const event of this.pendingEvents.splice(0)) {
      const seq = this.nextSendEventSeq++;
      this.eventSendQueue.push({ seq, event });
    }

    // If we have events waiting to be sent (new or re-queued from lost
    // packets), include them in this tick's data packet.
    if (this.eventSendQueue.length > 0) {
      this.sendDataPacketWithEvents(move);
    } else {
      const packet = buildClientGamePacket(this.protocol, {
        moves: [move],
        moveStartIndex: this.moveIndex++,
      });
      this.sendRaw(packet);
    }

    // Count down trigger hold, then clear triggers.
    if (this.triggerHoldTicks > 0) {
      this.triggerHoldTicks--;
      if (this.triggerHoldTicks === 0 && this.bufferedMove) {
        this.bufferedMove = {
          ...this.bufferedMove,
          trigger: [false, false, false, false, false, false],
        };
      }
    }
  }

  /** Start keepalive timer. */
  private startKeepalive(): void {
    let keepaliveCount = 0;
    this.keepaliveTimer = setInterval(() => {
      keepaliveCount++;
      if (keepaliveCount % 300 === 0) { // ~10s at 32ms tick rate
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
      this.sendTickMove();
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

  /** Disconnect from the server, sending a Disconnect OOB packet first. */
  disconnect(): void {
    if (this._status === "disconnected" && !this.socket) return;

    connLog.info("Disconnecting");

    // Send a Disconnect packet so the server knows we're leaving
    if (this.socket && this.serverConnectSequence !== 0) {
      try {
        const packet = buildDisconnectPacket(this.connectSequence);
        this.socket.send(packet, this.port, this.host);
        connLog.info("Sent Disconnect packet to server");
      } catch {
        // Best effort
      }
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
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // Already closed
      }
      this.socket = null;
    }
    if (this._status !== "disconnected") {
      this.setStatus("disconnected");
    }
    this.emit("close");
  }
}
