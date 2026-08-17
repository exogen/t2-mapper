import { BitStreamWriter } from "./BitStreamWriter.js";
import { packNetString, writeString } from "./HuffmanWriter.js";
import { connLog } from "./logger.js";

const DataPacket = 0;
const PingPacket = 1;
const AckPacket = 2;

const NetEventClassFirst = 255;
const CRCChallengeResponseEventClassId = NetEventClassFirst + 1; // index 1
const GhostingMessageEventClassId = NetEventClassFirst + 4; // index 4
const NetStringEventClassId = NetEventClassFirst + 7; // index 7
const RemoteCommandEventClassId = NetEventClassFirst + 9; // index 9

/**
 * Manages the connection protocol state for the client side.
 * Mirrors ConnectionProtocol from dnet.cc, but for building outgoing packets.
 */
export class ConnectionProtocol {
  lastSeqRecvdAtSend: number[] = new Array(32).fill(0);
  lastSeqRecvd = 0;
  highestAckedSeq = 0;
  lastSendSeq = 0;
  ackMask = 0;
  connectSequence = 0;
  lastRecvAckAck = 0;

  /** Called for each outgoing packet when its delivery status is determined. */
  onNotify: ((packetSeq: number, acked: boolean) => void) | null = null;

  private _sendCount = 0;

  buildSendPacketHeader(packetType: number = DataPacket): BitStreamWriter {
    const bs = new BitStreamWriter(1500);

    // gameFlag — always true for data connection packets
    bs.writeFlag(true);

    // connectSeqBit — LSB of connectSequence
    bs.writeInt(this.connectSequence & 1, 1);

    // Increment send sequence
    this.lastSendSeq = (this.lastSendSeq + 1) >>> 0;
    this.lastSeqRecvdAtSend[this.lastSendSeq & 0x1f] = this.lastSeqRecvd >>> 0;

    // seqNumber (9 bits)
    bs.writeInt(this.lastSendSeq & 0x1ff, 9);

    // highestAck (9 bits) — the highest seq we've received from server
    bs.writeInt(this.lastSeqRecvd & 0x1ff, 9);

    // packetType (2 bits)
    bs.writeInt(packetType, 2);

    // ackByteCount (3 bits) + ackMask
    // We need to send back our ack mask for packets we've received
    const mask = this.ackMask >>> 0;
    let ackByteCount = 0;
    if (mask !== 0) {
      if (mask & 0xff000000) ackByteCount = 4;
      else if (mask & 0x00ff0000) ackByteCount = 3;
      else if (mask & 0x0000ff00) ackByteCount = 2;
      else ackByteCount = 1;
    }
    bs.writeInt(ackByteCount, 3);
    if (ackByteCount > 0) {
      bs.writeInt(mask, ackByteCount * 8);
    }

    this._sendCount++;
    if (this._sendCount <= 30 || this._sendCount % 50 === 0) {
      connLog.debug(
        {
          n: this._sendCount,
          seq: this.lastSendSeq,
          ack: this.lastSeqRecvd,
          type: packetType === 0 ? "data" : packetType === 1 ? "ping" : "ack",
          ackBytes: ackByteCount,
          mask: `0x${mask.toString(16).padStart(8, "0")}`,
        },
        "Sent packet #%d",
        this._sendCount,
      );
    }

    return bs;
  }

  /** Process a received packet header, updating our state. */
  processReceivedHeader(header: {
    seqNumber: number;
    highestAck: number;
    packetType: number;
    connectSeqBit: number;
    ackByteCount: number;
    ackMask: number;
  }): { accepted: boolean; dispatchData: boolean; highestAck: number } {
    if (header.connectSeqBit !== (this.connectSequence & 1)) {
      return { accepted: false, dispatchData: false, highestAck: 0 };
    }
    if (header.ackByteCount > 4 || header.packetType > 2) {
      return { accepted: false, dispatchData: false, highestAck: 0 };
    }

    let seqNumber =
      (header.seqNumber | (this.lastSeqRecvd & 0xffff_fe00)) >>> 0;
    if (seqNumber < this.lastSeqRecvd) {
      seqNumber = (seqNumber + 0x200) >>> 0;
    }
    if (this.lastSeqRecvd + 0x1f < seqNumber) {
      return { accepted: false, dispatchData: false, highestAck: 0 };
    }

    let highestAck =
      (header.highestAck | (this.highestAckedSeq & 0xffff_fe00)) >>> 0;
    if (highestAck < this.highestAckedSeq) {
      highestAck = (highestAck + 0x200) >>> 0;
    }
    if (this.lastSendSeq < highestAck) {
      return { accepted: false, dispatchData: false, highestAck: 0 };
    }

    const seqShift = (seqNumber - this.lastSeqRecvd) & 0x1f;
    this.ackMask = (this.ackMask << seqShift) >>> 0;
    if (header.packetType === DataPacket) {
      this.ackMask = (this.ackMask | 1) >>> 0;
    }

    for (
      let ackSeq = this.highestAckedSeq + 1;
      ackSeq <= highestAck;
      ackSeq++
    ) {
      const isAcked =
        (header.ackMask & (1 << ((highestAck - ackSeq) & 0x1f))) !== 0;
      if (isAcked) {
        this.lastRecvAckAck = this.lastSeqRecvdAtSend[ackSeq & 0x1f] >>> 0;
      }
      if (this.onNotify) {
        this.onNotify(ackSeq, isAcked);
      }
    }
    if (seqNumber - this.lastRecvAckAck > 0x20) {
      this.lastRecvAckAck = seqNumber - 0x20;
    }
    this.highestAckedSeq = highestAck;

    const dispatchData =
      this.lastSeqRecvd !== seqNumber && header.packetType === DataPacket;
    this.lastSeqRecvd = seqNumber;

    return { accepted: true, dispatchData, highestAck };
  }

  /** Build a ping response packet. */
  buildPingPacket(): Uint8Array {
    const bs = this.buildSendPacketHeader(PingPacket);
    return bs.getBuffer();
  }

  /** Build an ack-only packet (no game data). */
  buildAckPacket(): Uint8Array {
    const bs = this.buildSendPacketHeader(AckPacket);
    return bs.getBuffer();
  }

  /**
   * Build a data packet with game payload.
   * The caller provides a callback that writes game data to the stream
   * after the dnet header.
   */
  buildDataPacket(writePayload: (bs: BitStreamWriter) => void): Uint8Array {
    const bs = this.buildSendPacketHeader(DataPacket);
    writePayload(bs);
    return bs.getBuffer();
  }
}

/**
 * Build a GameConnection client data packet.
 * Client→Server format (from checkPacketSend + GameConnection::writePacket):
 *   1. Rate info (2 flag bits from checkPacketSend, before writePacket)
 *   2. GameConnection fields:
 *      a. Flag (firstPerson: cameraPos == 0)
 *      b. U32 (controlObjectChecksum)
 *      c. moveWritePacket (move count + packed moves)
 *      d. Flag (updateFirstPerson) — false for observer
 *      e. Flag (updateCameraFov) — false for observer
 *   3. NetConnection::writePacket:
 *      a. eventWritePacket (events)
 *      b. ghostWritePacket (ghosts — client doesn't write any)
 */
export function buildClientGamePacket(
  protocol: ConnectionProtocol,
  options: {
    moves?: ClientMoveData[];
    moveStartIndex?: number;
    events?: ClientEvent[];
    nextSendEventSeq?: number;
    /**
     * Advertise our max receive rate (NetConnection::mMaxRate). The server
     * clamps this against its own limits and adopts it as its send rate to
     * us (handlePacket, Tribes2.exe FUN_00587640) — without it, servers
     * ghost at their 102ms/200-byte per-client default.
     */
    maxRate?: { updateDelay: number; packetSize: number };
  } = {},
): Uint8Array {
  return protocol.buildDataPacket((bs) => {
    // NetConnection::checkPacketSend writes rate info BEFORE writePacket.
    // handlePacket on the server reads these before calling readPacket.
    bs.writeFlag(false); // mCurRate.changed — our send rate never changes
    if (options.maxRate) {
      bs.writeFlag(true); // mMaxRate.changed
      bs.writeInt(options.maxRate.updateDelay, 10);
      bs.writeInt(options.maxRate.packetSize, 10);
    } else {
      bs.writeFlag(false); // mMaxRate.changed
    }

    // GameConnection::writePacket (client→server path)
    // 1. First person flag (cameraPos == 0 → firstPerson)
    bs.writeFlag(false); // not first person

    // 2. 32-bit control object value
    bs.writeU32(0);

    // 3. moveWritePacket: writeInt(start, 32) + writeInt(count, 5) + moves
    const moves = options.moves ?? [];
    bs.writeU32(options.moveStartIndex ?? 0);
    bs.writeInt(moves.length, 5); // MoveCountBits = 5
    for (const move of moves) {
      writeMove(bs, move);
    }

    // 4. FOV change flag (Tribes 2 binary reads one flag here, not two
    // like TorqueSDK-1.2 — verified against decompiled Tribes2.exe)
    bs.writeFlag(false);

    // NetConnection::writePacket — events + ghosts
    // eventWritePacket:
    //   Unguaranteed events: none from observer
    bs.writeFlag(false); // end unguaranteed
    //   Guaranteed events
    if (options.events && options.events.length > 0) {
      let seq = options.nextSendEventSeq ?? 0;
      for (const event of options.events) {
        bs.writeFlag(true); // more guaranteed events
        bs.writeFlag(false); // not sequential shortcut
        bs.writeInt(seq & 0x7f, 7);
        seq++;
        bs.writeInt(event.classId - NetEventClassFirst, 6);
        event.write(bs);
      }
    }
    bs.writeFlag(false); // end guaranteed events

    // ghostWritePacket: client doesn't ghost, so nothing written
    // (doesGhostFrom() returns false for client)
  });
}

export interface ClientMoveData {
  /** Movement axes: float [-1, 1]. Encoded as 6-bit unsigned (0-32, center=16). */
  x: number;
  y: number;
  z: number;
  /** Rotation deltas: float (radians per tick). Encoded as 16-bit signed (×65536).
   * Server adds these directly to camera rotation each tick. */
  yaw: number;
  pitch: number;
  roll: number;
  freeLook: boolean;
  trigger: boolean[];
}

export interface ClientEvent {
  classId: number;
  write: (bs: BitStreamWriter) => void;
}

/**
 * Write a Move struct to the stream.
 *
 * Wire format (from Tribes2.exe FUN_00601800):
 *   flag(yaw?) + optional 16-bit yaw    (rotation, signed)
 *   flag(pitch?) + optional 16-bit pitch
 *   flag(roll?) + optional 16-bit roll
 *   6-bit x + 6-bit y + 6-bit z         (movement, unsigned 0-32, center=16)
 *   flag(freeLook) + 6×flag(trigger)
 */
function writeMove(bs: BitStreamWriter, move: ClientMoveData): void {
  // Rotation (flag + optional 16-bit signed).
  // Matches Torque's Move::clamp(): pyaw = (yaw / M_2PI) * 0x10000.
  // Server's Move::unclamp() reverses: yaw = (short)pyaw * M_2PI / 0x10000.
  // Input values are in radians; divide by 2π to get fractional turns for packing.
  const M_2PI = 2 * Math.PI;
  const pyaw = Math.round((move.yaw / M_2PI) * 65536) | 0;
  const ppitch = Math.round((move.pitch / M_2PI) * 65536) | 0;
  const proll = Math.round((move.roll / M_2PI) * 65536) | 0;

  if (pyaw !== 0) {
    bs.writeFlag(true);
    bs.writeInt(pyaw & 0xffff, 16);
  } else {
    bs.writeFlag(false);
  }
  if (ppitch !== 0) {
    bs.writeFlag(true);
    bs.writeInt(ppitch & 0xffff, 16);
  } else {
    bs.writeFlag(false);
  }
  if (proll !== 0) {
    bs.writeFlag(true);
    bs.writeInt(proll & 0xffff, 16);
  } else {
    bs.writeFlag(false);
  }

  // Movement (6-bit unsigned, 0-32, center=16).
  // Pack: uint6 = clamp(float * 16 + 16, 0, 32). Server unpacks: float = (val - 16) / 16.
  const px = Math.max(0, Math.min(32, Math.round(move.x * 16 + 16)));
  const py = Math.max(0, Math.min(32, Math.round(move.y * 16 + 16)));
  const pz = Math.max(0, Math.min(32, Math.round(move.z * 16 + 16)));
  bs.writeInt(px, 6);
  bs.writeInt(py, 6);
  bs.writeInt(pz, 6);

  // FreeLook flag
  bs.writeFlag(move.freeLook);

  // Trigger keys (6 triggers)
  for (let i = 0; i < 6; i++) {
    bs.writeFlag(move.trigger[i] ?? false);
  }
}

/**
 * Client-side net string table for tagged string synchronization.
 * Assigns 10-bit IDs to strings and generates NetStringEvents to
 * register them with the server before use in RemoteCommandEvents.
 */
export class ClientNetStringTable {
  private nextId = 1;
  private strings = new Map<string, number>();

  /** Get or assign a 10-bit string ID. Returns the ID and whether it's new. */
  getOrAdd(str: string): { id: number; isNew: boolean } {
    const existing = this.strings.get(str);
    if (existing !== undefined) return { id: existing, isNew: false };
    const id = this.nextId++;
    if (id > 1023) throw new Error("Net string table overflow (10-bit IDs)");
    this.strings.set(str, id);
    return { id, isNew: true };
  }
}

/** Build a NetStringEvent to register a string with the server. */
export function buildNetStringEvent(id: number, value: string): ClientEvent {
  return {
    classId: NetStringEventClassId,
    write(bs: BitStreamWriter) {
      // NetStringEvent::pack (FUN_00589b60 inverse):
      //   writeInt(id, 10) + writeFlag(hasValue) + writeString(value)
      bs.writeInt(id, 10);
      bs.writeFlag(true);
      writeString(bs, value, true);
    },
  };
}

/**
 * Build a RemoteCommandEvent for commandToServer.
 * The function name must be sent as a TagString (type=2, 10-bit ID)
 * with a corresponding NetStringEvent sent beforehand.
 * Returns the RemoteCommandEvent and any required NetStringEvents.
 */
export function buildRemoteCommandEvent(
  stringTable: ClientNetStringTable,
  command: string,
  ...args: string[]
): ClientEvent[] {
  const events: ClientEvent[] = [];

  // Register the function name in the string table
  const { id: cmdId, isNew } = stringTable.getOrAdd(command);
  if (isNew) {
    events.push(buildNetStringEvent(cmdId, command));
  }

  // Build the RemoteCommandEvent
  events.push({
    classId: RemoteCommandEventClassId,
    write(bs: BitStreamWriter) {
      // RemoteCommandEvent::pack (FUN_005bfd40):
      //   writeInt(argc, 5) then argc × conn->packString
      // argv[0] = function name (must be TagString for process() to work)
      const argc = Math.min(1 + args.length, 20);
      bs.writeInt(argc, 5);
      // Pack function name as TagString (type=2, 10-bit ID)
      bs.writeInt(2, 2); // TagString type
      bs.writeInt(cmdId, 10);
      // Pack remaining args as regular strings
      for (let i = 0; i < argc - 1; i++) {
        packNetString(bs, args[i], true);
      }
    },
  });

  return events;
}

/**
 * Build a CRCChallengeResponseEvent to reply to the server's CRC challenge.
 * Format: 3×U32 (crcValue, field1, field2).
 * The real client computes CRC over game files; we echo back dummy values.
 * The server always proceeds to the script callback regardless of CRC match
 * (but schedules a delayed kick if values are wrong).
 */
export function buildCRCChallengeResponseEvent(
  crcValue: number,
  field1: number,
  field2: number,
): ClientEvent {
  return {
    classId: CRCChallengeResponseEventClassId,
    write(bs: BitStreamWriter) {
      bs.writeU32(crcValue);
      bs.writeU32(field1);
      bs.writeU32(field2);
    },
  };
}

/**
 * Build a GhostingMessageEvent to acknowledge GhostAlwaysDone from the server.
 * When the server sends type 0 (GhostAlwaysDone), the client must respond
 * with type 1 to enable ghost writes (mGhosting=true on the server).
 */
export function buildGhostingMessageEvent(
  sequence: number,
  message: number,
  ghostCount: number,
): ClientEvent {
  return {
    classId: GhostingMessageEventClassId,
    write(bs: BitStreamWriter) {
      bs.writeU32(sequence);
      bs.writeInt(message, 3);
      bs.writeInt(ghostCount, 11);
    },
  };
}

// ── Out-of-band (OOB) packet types ──

/**
 * Build a ConnectChallengeRequest (type 26) OOB packet.
 * Format from Tribes2.exe: U8(26) + U32(proto) + U32(seq) + HuffString(password) + Flag(auth)
 */
export function buildConnectChallengeRequest(
  protocolVersion: number,
  clientConnectSequence: number,
  joinPassword: string = "",
): Uint8Array {
  const bs = new BitStreamWriter(512);
  bs.writeU8(26); // ConnectChallengeRequest type
  bs.writeU32(protocolVersion);
  bs.writeU32(clientConnectSequence);
  writeString(bs, joinPassword);
  // No auth data
  bs.writeFlag(false);
  return bs.getBuffer();
}

/** Build a ConnectRequest (type 32) OOB packet. */
export function buildConnectRequest(
  serverConnectSequence: number,
  clientConnectSequence: number,
  protocolVersion: number,
  authenticated: boolean,
  argv: string[] = [],
): Uint8Array {
  const bs = new BitStreamWriter(1024);
  bs.writeU8(32); // ConnectRequest type
  bs.writeU32(serverConnectSequence);
  bs.writeU32(clientConnectSequence);
  bs.writeU32(protocolVersion);
  bs.writeFlag(authenticated);

  // argc + argv (connection parameters: name, race, skin, voice, etc.)
  // Argv uses Huffman-encoded strings per Tribes2.exe binary.
  bs.writeU32(argv.length);
  for (const arg of argv) {
    writeString(bs, arg);
  }

  return bs.getBuffer();
}

/** Build a Disconnect (type 38) OOB packet. */
export function buildDisconnectPacket(
  serverConnectSequence: number,
  clientConnectSequence: number,
): Uint8Array {
  const bs = new BitStreamWriter(64);
  bs.writeU8(38); // Disconnect type
  bs.writeU32(serverConnectSequence);
  bs.writeU32(clientConnectSequence);
  writeString(bs, ""); // reason
  return bs.getBuffer();
}

// ── Master server query packets ──

/** Build a MasterServerListRequest (type 6). */
export function buildMasterServerListRequest(
  queryFlags: number = 0,
  key: number = 0,
): Uint8Array {
  const bs = new BitStreamWriter(256);
  bs.writeU8(6); // MasterServerListRequest
  bs.writeU8(queryFlags);
  bs.writeU32(key);
  // Game type / mission type filters (empty = all)
  bs.writeU8(0xff); // maxPlayers filter (0xff = any)
  bs.writeU32(0); // regionMask (0 = any)
  bs.writeU32(0); // version (0 = any)
  bs.writeU8(0); // filter flags
  bs.writeU8(0); // maxBots
  bs.writeU16(0); // minCPU
  bs.writeU8(0); // buddyCount
  return bs.getBuffer();
}

/** Build a GamePingRequest (type 14). */
export function buildGamePingRequest(
  flags: number = 0,
  key: number = 0,
): Uint8Array {
  const bs = new BitStreamWriter(64);
  bs.writeU8(14); // GamePingRequest
  bs.writeU8(flags);
  bs.writeU32(key);
  return bs.getBuffer();
}

/** Build a GameInfoRequest (type 18). */
export function buildGameInfoRequest(
  flags: number = 0,
  key: number = 0,
): Uint8Array {
  const bs = new BitStreamWriter(64);
  bs.writeU8(18); // GameInfoRequest
  bs.writeU8(flags);
  bs.writeU32(key);
  return bs.getBuffer();
}
