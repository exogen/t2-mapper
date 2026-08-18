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
  buildGamePingRequest,
  type ClientEvent,
  type ClientMoveData,
} from "./protocol.js";
import { BitStream } from "t2-demo-parser";
import { BitStreamWriter } from "./BitStreamWriter.js";
import { T2csriAuth, loadCredentials } from "./auth.js";
import { connLog } from "./logger.js";
import type { ConnectionStatus } from "./types.js";
import { computeGameCRC, type CRCDataBlock } from "./crc.js";

// Tribes 2 protocol version and class CRC from the binary.
// These must match what the server expects.
const PROTOCOL_VERSION = 0x33; // 51 — from Tribes2.exe binary

// Faithful reproduction of the real client's sender, binary-verified:
//
// NetConnection::checkPacketSend (Tribes2.exe FUN_005877e0) gates every
// outgoing data packet on `now >= mLastUpdateTime + 0x400/PacketRateToServer`
// — 32ms at the stock rate of 32pps (clamped [8, 32] by checkMaxRate,
// FUN_00586650). All queued events and the tick's moves ride in that one
// packet; the engine literally cannot send two data packets back-to-back.
const PACKET_UPDATE_DELAY_MS = 32;
// Stock $pref::Net::PacketSize. checkMaxRate clamps it to [200, 450] and
// checkPacketSend allocates the packet stream at exactly this size, so
// events that don't fit wait for the next send slot.
const PACKET_SIZE = 450;
// ConnectionProtocol::windowFull (FUN_0043d720): no sends while
// lastSendSeq - highestAckedSeq > 0x1d, i.e. 30 packets unacked.
const SEND_WINDOW = 30;
// The engine calls checkPacketSend every frame; a fast timer approximates
// that, with the 32ms gate above providing the actual pacing.
const SEND_LOOP_INTERVAL_MS = 8;

/** Out-of-band GamePingRequest cadence for the reported server RTT. */
const OOB_PING_INTERVAL_MS = 4000;
/** Consecutive unanswered probes before falling back to ack-derived RTT. */
const OOB_PING_FALLBACK_MISSES = 3;
// While move batches have arrived this recently, the browser's tick drives
// the send clock and the loop's empty keepalives stand down.
const MOVE_STREAM_TIMEOUT_MS = 100;
const CONNECT_TIMEOUT_MS = 30000;

/** An event queued for (re)transmission, with its serialized size cached. */
interface QueuedEvent {
  seq: number;
  event: ClientEvent;
  size?: number;
}

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
  private sentEventsByPacket = new Map<number, QueuedEvent[]>();
  /** Events waiting to be sent (new or retransmitted from lost packets). */
  private eventSendQueue: QueuedEvent[] = [];
  private stringTable = new ClientNetStringTable();
  /**
   * Mirror of mMaxRate.changed: a real client advertises its receive rate
   * (T1/LAN: 32ms delay, 450 bytes) in its first data packet, re-flagged
   * if that packet is lost (checkMaxRate sets it at construction).
   */
  private maxRateChanged = true;
  /** Packet seqs that carried the maxRate advert, for loss recovery. */
  private sentMaxRateByPacket = new Set<number>();
  /** Mirror of NetConnection::mLastUpdateTime — the send-rate gate. */
  private lastPacketSendTime = 0;
  /** Moves staged for the next send slot (latest browser tick wins). */
  private pendingMoves: ClientMoveData[] = [];
  private pendingMoveStartIndex = 0;
  /** When the last move batch arrived from the browser. */
  private lastMoveArrivalTime = 0;
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
  /** Out-of-band GamePingRequest probe: dedicated socket + schedule.
   *  The dnet ack-derived RTT drifts to absurd values on long-lived
   *  passive connections (multi-second readings while true RTT is
   *  ~20-60ms), so the reported ping comes from this query-port probe;
   *  the ack RTT remains a debug diagnostic and a fallback for servers
   *  that ignore query pings. */
  private oobPingSocket: dgram.Socket | null = null;
  private oobPingTimer: ReturnType<typeof setInterval> | null = null;
  private oobPingSentAt = 0;
  private oobPingOutstanding = false;
  private oobPingMisses = 0;

  /** Warrior name to send in the ConnectRequest. */
  private warriorName: string;

  /** The server address as "host:port". */
  get address(): string {
    return `${this.host}:${this.port}`;
  }

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
    // Retry every 2s until the handshake advances (like the real client);
    // the overall connect timeout bounds the attempts.
    const send = () => {
      this.sendRaw(packet);
      this.challengeRetryTimer = setTimeout(() => {
        this.challengeRetryTimer = null;
        if (this._status === "challenging") {
          connLog.info("No challenge response, retrying");
          send();
        }
      }, 2000);
    };
    send();
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

    // dnet discriminator: every data-protocol packet begins with the
    // gameFlag in the LSB of the first byte, while OOB packet types are
    // all even — so the low bit alone routes the packet. This also keeps
    // stray OOB packets (query responses, spoofed datagrams) from being
    // forwarded to watchers as game data.
    if ((msg[0] & 1) === 0) {
      connLog.debug({ type: msg[0], bytes: msg.length }, "Received OOB packet");
      this.handleOOBPacket(msg);
    } else {
      this.handleDataPacket(msg);
    }
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
    // A delayed duplicate must not tear down an established connection.
    if (this._status !== "challenging") return;
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
    // A duplicate response after the handshake advanced would re-send
    // the ConnectRequest mid-connection.
    if (this._status !== "challenging") return;
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
    // A duplicate accept would restart keepalive/ping timers.
    if (this._status !== "challenging") return;
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
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
    this.startOobPing();

    if (this.auth) {
      connLog.info("Starting T2csri authentication");
      this.setStatus("authenticating");
    } else {
      this.enforceObserver();
      this.setStatus("connected");
    }
  }

  /** Handle ConnectReject (type 34): U8(34) + U32(serverSeq) + U32(clientSeq) + HuffString(reason). */
  private handleConnectReject(msg: Buffer): void {
    // A delayed duplicate must not tear down an established connection.
    if (this._status !== "challenging") return;
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
    // Ignore data packets before the connection is fully established.
    // They arrive in the window between socket creation and ConnectAccept
    // and would confuse both the browser parser and our ack tracking.
    if (this._status !== "connected" && this._status !== "authenticating") {
      return;
    }

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
      // Ledger: pong packets consume a wire seq with no RTT timestamp —
      // log it so seq accounting stays auditable alongside "TX data".
      connLog.debug({ wireSeq: this.protocol.lastSendSeq }, "TX pong");
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

    // Ack-derived RTT: a debug diagnostic (it drifts on long-lived
    // passive connections), and the ping fallback while the out-of-band
    // probe goes unanswered.
    const sendTime = this.sendTimestamps.get(result.highestAck);
    if (sendTime) {
      const rtt = Date.now() - sendTime;
      connLog.debug(
        {
          ackedSeq: result.highestAck,
          rtt,
          ourSeq: this.protocol.lastSendSeq,
          unacked:
            (this.protocol.lastSendSeq - this.protocol.highestAckedSeq) >>> 0,
          pendingTimestamps: this.sendTimestamps.size,
        },
        "RTT sample",
      );
      if (this.oobPingMisses >= OOB_PING_FALLBACK_MISSES) {
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
    }
    // Prune every timestamp at or below the ack — acks can skip sequence
    // numbers (bundled acks, loss), and skipped entries would otherwise
    // accumulate for the lifetime of the connection.
    for (const seq of this.sendTimestamps.keys()) {
      if (seq <= result.highestAck) this.sendTimestamps.delete(seq);
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
        // Queue everything — the send loop bundles as many events as fit
        // per 450-byte packet at the 32ms rate, exactly like the engine.
        // (QoL-patch servers' native auth silently rejects packet bursts.)
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
      this.checkPacketSend();
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
    this.checkPacketSend();
  }

  /** Send a commandToServer as a RemoteCommandEvent. */
  sendCommand(command: string, ...args: string[]): void {
    connLog.debug(
      { command, args, eventSeq: this.nextSendEventSeq },
      "Sending commandToServer",
    );
    const events = buildRemoteCommandEvent(this.stringTable, command, ...args);
    this.pendingEvents.push(...events);
    this.checkPacketSend();
  }

  /**
   * Mirror of NetConnection::checkPacketSend (Tribes2.exe FUN_005877e0):
   * called opportunistically whenever there's new work and continuously
   * by the send loop. Gates on the send rate and the ack window, then
   * emits ONE packet bundling staged moves plus queued events.
   *
   * While the browser's move stream is active, its 32ms tick is the only
   * clock: empty keepalives are suppressed so every move batch finds the
   * gate open and ships the moment it arrives — reproducing the engine's
   * coupling of move generation to its send loop, without the relay's
   * timer phase adding staging delay. Idle (menus, hidden tab), the send
   * loop's keepalives keep the ack stream flowing.
   */
  private checkPacketSend(): void {
    const now = Date.now();
    if (now < this.lastPacketSendTime + PACKET_UPDATE_DELAY_MS) return;
    const hasContent =
      this.pendingMoves.length > 0 ||
      this.pendingEvents.length > 0 ||
      this.eventSendQueue.length > 0 ||
      this.maxRateChanged;
    if (
      !hasContent &&
      now - this.lastMoveArrivalTime < MOVE_STREAM_TIMEOUT_MS
    ) {
      return;
    }
    const unacked =
      (this.protocol.lastSendSeq - this.protocol.highestAckedSeq) >>> 0;
    if (unacked >= SEND_WINDOW) return;
    this.lastPacketSendTime = now;
    const moves = this.pendingMoves;
    const moveStartIndex = this.pendingMoveStartIndex;
    this.pendingMoves = [];
    this.emitDataPacket(moves, moveStartIndex);
  }

  /** Handle packet delivery notification from the protocol layer. */
  private handlePacketNotify(packetSeq: number, acked: boolean): void {
    // Re-advertise the receive rate if the packet carrying it was lost
    // (mirrors PacketNotify::maxRateChanged restoration).
    if (this.sentMaxRateByPacket.delete(packetSeq) && !acked) {
      this.maxRateChanged = true;
    }

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
   * Stage moves for the next send slot. The browser owns move indices and
   * re-sends all unacked moves each tick (like moveWritePacket), so the
   * latest call supersedes any still-staged batch. The opportunistic
   * checkPacketSend sends immediately when the rate gate allows — the
   * engine likewise sends the tick's moves in that tick's packet.
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
    this.pendingMoves = moves;
    this.pendingMoveStartIndex = moveStartIndex;
    this.lastMoveArrivalTime = Date.now();
    this.checkPacketSend();
  }

  /** Serialized size of an event in bytes, plus per-event header bits.
   *  Cached on the queue entry — event contents never change once built,
   *  and entries can sit through many send attempts. */
  private measureEvent(entry: QueuedEvent): number {
    if (entry.size == null) {
      const bs = new BitStreamWriter(1500);
      entry.event.write(bs);
      entry.size = bs.getByteCount() + 2;
    }
    return entry.size;
  }

  /**
   * Internal: build and send ONE data packet with the staged moves and as
   * many queued events as fit in the packet size budget. Only called via
   * checkPacketSend, which owns the rate gate.
   */
  private emitDataPacket(
    moves: ClientMoveData[],
    moveStartIndex: number,
  ): void {
    // Record send time for RTT measurement using the full 32-bit sequence
    // (not the 9-bit wire value) to avoid stale timestamps after wrap.
    const nextSeqFull = (this.protocol.lastSendSeq + 1) >>> 0;
    this.sendTimestamps.set(nextSeqFull, Date.now());

    // Absorb any new pending events into the send queue.
    for (const event of this.pendingEvents.splice(0)) {
      const seq = this.nextSendEventSeq++;
      this.eventSendQueue.push({ seq, event });
    }

    // Take events while they fit inside the packet size, like the engine's
    // eventWritePacket against the fixed-size packet stream. Leftovers go
    // in the next send slot. Header + moves are budgeted conservatively.
    let events: QueuedEvent[] | undefined;
    if (this.eventSendQueue.length > 0) {
      let budget = PACKET_SIZE - 24 - moves.length * 10;
      const taken: QueuedEvent[] = [];
      while (this.eventSendQueue.length > 0) {
        const size = this.measureEvent(this.eventSendQueue[0]);
        if (taken.length > 0 && size > budget) break;
        budget -= size;
        taken.push(this.eventSendQueue.shift()!);
      }
      events = taken;
      this.sentEventsByPacket.set(nextSeqFull, events);
    }

    // Advertise our receive rate (T1/LAN max) until it's been delivered.
    const advertiseMaxRate = this.maxRateChanged;
    if (advertiseMaxRate) {
      this.maxRateChanged = false;
      this.sentMaxRateByPacket.add(nextSeqFull);
    }

    const packet = buildClientGamePacket(this.protocol, {
      moves,
      moveStartIndex,
      ...(advertiseMaxRate
        ? {
            maxRate: {
              updateDelay: PACKET_UPDATE_DELAY_MS,
              packetSize: PACKET_SIZE,
            },
          }
        : {}),
      ...(events ? { events } : {}),
    });
    this.sendRaw(packet);
    // Send-side ledger for RTT forensics: stampedSeq is the timestamp
    // key recorded above; wireSeq is what the protocol actually stamped
    // into the header. They must always match — a divergence corrupts
    // every later RTT sample (ack maps to a stale timestamp).
    connLog.debug(
      {
        stampedSeq: nextSeqFull,
        wireSeq: this.protocol.lastSendSeq,
        bytes: packet.length,
        events: events?.length ?? 0,
        moves: moves.length,
      },
      "TX data",
    );
  }

  /**
   * Start the send loop — the analogue of the engine calling
   * checkPacketSend every frame. The 32ms gate inside checkPacketSend
   * provides the actual pacing; this just polls it, keeping the steady
   * ack/keepalive stream flowing when the browser isn't sending moves.
   */
  private startKeepalive(): void {
    let loopCount = 0;
    this.keepaliveTimer = setInterval(() => {
      loopCount++;
      if (loopCount % 1200 === 0) {
        connLog.info(
          {
            dataPackets: this.dataPacketCount,
            rawMessages: this.rawMessageCount,
            ourSeq: this.protocol.lastSendSeq,
            ourAck: this.protocol.lastSeqRecvd,
            theirAck: this.protocol.highestAckedSeq,
            queuedEvents: this.eventSendQueue.length,
          },
          "Connection status",
        );
      }
      this.checkPacketSend();
    }, SEND_LOOP_INTERVAL_MS);
  }

  /** Start the out-of-band ping probe (see field docs). */
  private startOobPing(): void {
    if (this.oobPingSocket) return;
    const socket = dgram.createSocket("udp4");
    this.oobPingSocket = socket;
    socket.on("error", () => {
      /* probe only — never fatal */
    });
    socket.on("message", (msg) => {
      // GamePingResponse (type 16) from our server = pong.
      if (msg[0] !== 16 || !this.oobPingOutstanding) return;
      this.oobPingOutstanding = false;
      this.oobPingMisses = 0;
      const rtt = Date.now() - this.oobPingSentAt;
      this.smoothedPing =
        this.smoothedPing === 0 ? rtt : this.smoothedPing * 0.5 + rtt * 0.5;
      this.lastPingEmit = Date.now();
      this.emit("ping", Math.round(this.smoothedPing));
    });
    // Connecting scopes the socket to the server — the OS drops datagrams
    // from any other source, so pongs can't be spoofed — and resolves any
    // DNS name once.
    socket.connect(this.port, this.host, () => {
      if (this.oobPingSocket !== socket) return; // stopped meanwhile
      this.oobPingTimer = setInterval(() => {
        if (this.oobPingOutstanding) {
          this.oobPingOutstanding = false;
          this.oobPingMisses++;
        }
        this.oobPingSentAt = Date.now();
        this.oobPingOutstanding = true;
        socket.send(buildGamePingRequest(), () => {
          /* errors handled by the error listener */
        });
      }, OOB_PING_INTERVAL_MS);
    });
  }

  private stopOobPing(): void {
    if (this.oobPingTimer) {
      clearInterval(this.oobPingTimer);
      this.oobPingTimer = null;
    }
    if (this.oobPingSocket) {
      try {
        this.oobPingSocket.close();
      } catch {
        // Already closed
      }
      this.oobPingSocket = null;
    }
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
    // Stop periodic work even on teardown paths that skip disconnect()
    // — a leaked interval would retain this connection forever.
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    this.stopOobPing();
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
    // A disconnect retransmit cycle is already in progress — a second
    // call must not restart it.
    if (this._status === "disconnected" && this.disconnectRetryTimer) return;

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
    this.stopOobPing();
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
