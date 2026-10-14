/**
 * Tribes 2 demo (.rec) format writer: file header, initial block, and the
 * deflated block stream. Pure format code — recording lifecycle lives in
 * demoRecorder.ts.
 *
 * Layout (verified against retail demos and t2-demo-parser):
 *   U8 0x11 + "Tribes2 Recording"
 *   U32 protocolVersion (0x00330004)
 *   U32 demoLengthMs            ← backpatched at finalize
 *   U32 initialBlockSize
 *   <initial block>              raw bit-packed, uncompressed
 *   <raw DEFLATE stream>         U16 LE (type<<12 | size) framed blocks
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import { finished } from "node:stream/promises";
import zlib from "node:zlib";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  freshConnectionProtocolState,
  type ConnectionProtocolState,
} from "t2-demo-parser";
import { BitStreamWriter } from "./BitStreamWriter.js";
import { writeString } from "./HuffmanWriter.js";
import { MOVE_TICK_MS, NEUTRAL_MOVE } from "./moveList.js";
import { writeMove } from "./protocol.js";

export const DEMO_IDENT_STRING = "Tribes2 Recording";
export const DEMO_PROTOCOL_VERSION = 0x00330004;
/** Byte offset of the U32 demoLengthMs field in the header. */
export const DEMO_LENGTH_MS_OFFSET = 1 + DEMO_IDENT_STRING.length + 4;
/** Max payload bytes per block (12-bit size field). */
export const MAX_BLOCK_SIZE = 0xfff;
/**
 * Playback advances this much per Move block — the demo's clock.
 */
export const DEMO_TICK_MS = MOVE_TICK_MS;

const HEADER_SIZE = DEMO_LENGTH_MS_OFFSET + 8;

export function buildHeader(initialBlockSize: number): Uint8Array {
  const bytes = new Uint8Array(HEADER_SIZE);
  const view = new DataView(bytes.buffer);
  bytes[0] = DEMO_IDENT_STRING.length;
  for (let i = 0; i < DEMO_IDENT_STRING.length; i++) {
    bytes[1 + i] = DEMO_IDENT_STRING.charCodeAt(i);
  }
  view.setUint32(1 + DEMO_IDENT_STRING.length, DEMO_PROTOCOL_VERSION, true);
  view.setUint32(DEMO_LENGTH_MS_OFFSET, 0, true);
  view.setUint32(DEMO_LENGTH_MS_OFFSET + 4, initialBlockSize, true);
  return bytes;
}

export interface DemoValuesInfo {
  /** Plain recorder name, no tagged-string markup. */
  recorderName: string;
  clientId?: number;
  serverName: string;
  /** Session key, e.g. "45.76.24.91:28000". */
  serverAddress: string;
  date: Date;
  missionDisplayName: string;
  /** e.g. "classic"; empty string ok. */
  mod: string;
  /** e.g. "Capture the Flag"; empty string ok. */
  gameType: string;
  /** World gravity where the recording starts; the T2 default if omitted. */
  gravity?: number;
  /** Script state where the recording starts; a new client's if omitted. */
  script?: DemoScriptState;
}

/**
 * What saveDemoSettings (recordings.cs) saves of the client script state
 * the server's remote commands change before the mission loads.
 */
export interface DemoScriptState {
  /** voteHud.voting */
  voting: boolean;
  /** PlayerListGroup's reps, each its PLAYERLIST fields. */
  players: readonly (readonly string[])[];
  /** clockHud.getTime() */
  clockMinutes: number;
  /** HudMessageVector's lines, oldest first. */
  chat: readonly string[];
}

const NEW_CLIENT_SCRIPT_STATE: DemoScriptState = {
  voting: false,
  players: [],
  clockMinutes: 0,
  chat: [],
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Retail demo date style, e.g. "May-16-2025 5:04AM" — always UTC. */
export function formatDemoDate(date: Date): string {
  const hours24 = date.getUTCHours();
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const meridiem = hours24 < 12 ? "AM" : "PM";
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[date.getUTCMonth()]}-${date.getUTCDate()}-${date.getUTCFullYear()} ${hours12}:${minutes}${meridiem}`;
}

/** A float as the console returns it (%g, six significant digits). */
function formatConsoleFloat(value: number): string {
  return String(Number(Math.fround(value).toPrecision(6)));
}

/** recordings.cs addDemoValue: the engine stops saving at an empty value. */
function demoValue(value: string): string {
  return value === "" ? "<BLANK>" : value;
}

/**
 * The standard saveDemoSettings sections (recordings.cs — MISC,
 * PLAYERLIST, RETICLE, BACKPACK, WEAPON, INVENTORY, SCORE, CLOCK,
 * CHAT×10, GRAVITY) for an observer connection that has not loaded a
 * mission yet: hidden HUDs, plus the roster, chat, clock and vote flag
 * its script state holds. Empty values are written as "<BLANK>" — PJ's
 * reader treats a truly empty value as end-of-array.
 */
export function buildStandardDemoSections(
  gravity = -20,
  script = NEW_CLIENT_SCRIPT_STATE,
): string[] {
  const chat = script.chat.slice(-10);
  return [
    // MISC: hudMode/type/node, voting, passengerKeys, musicTrack.
    `Standard\t\t\t${script.voting ? 1 : 0}\t0\t`,
    // PLAYERLIST: the count, then each rep. The server sends its whole
    // roster again once the handshake ends.
    String(script.players.length),
    ...script.players.map((fields) => demoValue(fields.join("\t"))),
    // RETICLE: bitmap + visibility flags, all hidden.
    "\t0\t0\t0\t\t0\t0",
    // BACKPACK: bitmap, frame/text visibility, pack.
    "\t0\t\t0\t0",
    // WEAPON: visible/bitmaps(3)/count/slotCount/active — no items.
    "0\t\t\t\t0\t0\t-1",
    // INVENTORY: same header shape, no items.
    "0\t\t\t\t0\t0\t-1",
    // SCORE: visible/gameType/objCount — no objectives yet.
    "0\t\t0",
    // CLOCK: hidden, then getTime() in minutes.
    `0\t${formatConsoleFloat(script.clockMinutes)}`,
    // CHAT: the last 10 HUD lines, blank-padded in front.
    ...Array<string>(10 - chat.length).fill("<BLANK>"),
    ...chat.map(demoValue),
    // GRAVITY: getGravity(), which playback restores with setGravity.
    formatConsoleFloat(gravity),
  ];
}

/**
 * The full `$DemoValue` array: the standard sections followed by the
 * PJEnhancedRecording tail ("NewDemoData" + "readplayerinfo" rows) the
 * app's metadata extraction reads. The standard sections must be
 * present and well-formed — loadDemoSettings (real client) and the
 * app's parseDemoValues both walk them positionally, and without them
 * the PJ tail is misread as section data (its last row lands in the
 * CHAT slots and shows up as a bogus chat line).
 */
export function buildDemoValues(info: DemoValuesInfo): string[] {
  return [
    ...buildStandardDemoSections(info.gravity, info.script),
    "NewDemoData",
    "1",
    "readplayerinfo",
    `1\t${info.clientId ?? 0}\t${info.recorderName}\t\t0`,
    "1",
    "readplayerinfo",
    `2\t${info.serverName}\t${info.serverAddress}\t${formatDemoDate(info.date)}\t${info.missionDisplayName}`,
    "1",
    "readplayerinfo",
    `3\t${info.mod}\t${info.gameType}\t0\t<BLANK>`,
  ];
}

/**
 * A client connection's state where its recording starts, as
 * writeDemoStartBlock (FUN_005fb2b0) saves it, for a start before the
 * server has sent any datablock, target, ghost or control object.
 */
export interface DemoStartState {
  /** The connection string table (NetStringEvents), id → string. */
  taggedStrings: ReadonlyMap<number, string>;
  lastMoveAck: number;
  lastClientMove: number;
  firstMoveIndex: number;
  sensorGroup: number;
  /** Moves queued and not yet acknowledged, all neutral (as recorded). */
  queuedMoves: number;
  /** The connect sequence always comes from the connection itself. */
  protocol: Omit<ConnectionProtocolState, "connectSequence">;
  nextRecvEventSeq: number;
}

/**
 * A connection that has not exchanged a sequenced packet yet: what the
 * GameConnection constructor and a fresh ConnectionProtocol hold. Its
 * first move gets index 0.
 */
const CONNECT_STATE: DemoStartState = {
  taggedStrings: new Map(),
  lastMoveAck: 0,
  lastClientMove: 0,
  firstMoveIndex: 0,
  sensorGroup: 0,
  queuedMoves: 0,
  protocol: freshConnectionProtocolState(0),
  nextRecvEventSeq: 0,
};

export interface InitialBlockOptions {
  /** Full 32-bit connect sequence — parity must match packets' connectSeqBit. */
  connectSequence: number;
  /** Mission file name (from MissionStartPhase1 arg 1). */
  missionName: string;
  demoValues: string[];
  /**
   * The connection's state where the recorded stream begins; omitted for
   * a stream that begins with the connection's first packet.
   */
  start?: DemoStartState;
}

/**
 * Build an initial block for a stream that begins before the mission
 * loads: no datablocks, scores, targets, pending events, ghosts, or
 * control object — all of that arrives in the recorded packet stream,
 * exactly as the live parser consumes it.
 *
 * The recorder must write one SendPacket marker per packet actually sent
 * and one Move block per move queued, in order with the received packets:
 * the engine's playback replays those markers to keep its notify queue in
 * step with the server's acks, and admits the moves the recorded
 * lastMoveAcks pop.
 */
export function buildInitialBlock(opts: InitialBlockOptions): Uint8Array {
  const start = opts.start ?? CONNECT_STATE;
  const bs = new BitStreamWriter(4096, { growable: true });

  // Tagged string table (FUN_005899a0): a flag per slot, then its string.
  // The start block's stream has no string-prefix buffer.
  for (let id = 0; id < 1024; id++) {
    const value = start.taggedStrings.get(id);
    bs.writeFlag(value !== undefined);
    if (value !== undefined) writeString(bs, value);
  }

  // DataBlocks: count 0, then loop terminator.
  bs.writeU32(0);
  bs.writeFlag(false);

  // firstPerson + the six connection fields readDemoStartBlock
  // (FUN_005fb5c0) restores: cameraPos, cameraSpeed=10.0f, lastMoveAck,
  // lastClientMove, firstMoveIndex and the sensor group (later changes
  // arrive as SetSensorGroupEvents).
  bs.writeU8(1);
  bs.writeU32(0);
  bs.writeU32(0x41200000);
  bs.writeU32(start.lastMoveAck >>> 0);
  bs.writeU32(start.lastClientMove >>> 0);
  bs.writeU32(start.firstMoveIndex >>> 0);
  bs.writeU32(start.sensorGroup >>> 0);

  // mTargetVisibleMask (16 U32s): the server's record of the visibility
  // bits it last sent, which a client never fills in. Then the queued
  // moves, which playback numbers from firstMoveIndex; the server's next
  // lastMoveAcks pop them.
  for (let i = 0; i < 16; i++) bs.writeU32(0);
  bs.writeU32(start.queuedMoves);
  for (let i = 0; i < start.queuedMoves; i++) writeMove(bs, NEUTRAL_MOVE);

  // DemoValues, each cut to the 255 characters FUN_005fb2b0 writes.
  for (const row of opts.demoValues) {
    bs.writeFlag(true);
    writeString(bs, row.slice(0, 0xff));
  }
  bs.writeFlag(false);

  // TargetManager: the default IFF color, the 32×32 IFF color grid, 512
  // targets. Playback (FUN_00670660) loads the default into Tribes2.exe's
  // process-wide one (static 255, 0, 0, 255), which SensorGroupColorEvent
  // entries sent as "default" decode to (enemy red among them) and which
  // outlives the demo, so it must stay red.
  for (const channel of [255, 0, 0, 255]) bs.writeU8(channel);
  for (let i = 0; i < 32 * 32; i++) bs.writeFlag(false);
  for (let i = 0; i < 512; i++) bs.writeFlag(false);

  // ConnectionProtocol state, with the live connection's connect sequence.
  //
  // This must be the real state, not a parser convenience. Tribes2.exe
  // playback rebuilds the client side from it: each SendPacket marker
  // runs checkPacketSend (FUN_005877e0), which queues a PacketNotify
  // only while the send window is open (FUN_0043d720: lastSendSeq -
  // highestAckedSeq <= 0x1d), and every newly acked sequence pops one
  // notify in handleNotify (FUN_005874d0) with no empty-queue check. A
  // lastSendSeq of 0x1fffffff (the parser's passive-observer seed) kept
  // the window permanently full, so no notify was ever queued and the
  // game crashed on the first acked packet.
  const { protocol } = start;
  for (let i = 0; i < 32; i++)
    bs.writeU32(protocol.lastSeqRecvdAtSend[i] >>> 0);
  bs.writeU32(protocol.lastSeqRecvd >>> 0);
  bs.writeU32(protocol.highestAckedSeq >>> 0);
  bs.writeU32(protocol.lastSendSeq >>> 0);
  bs.writeU32(protocol.ackMask >>> 0);
  bs.writeU32(opts.connectSequence >>> 0);
  bs.writeU32(protocol.lastRecvAckAck >>> 0);
  bs.writeU8(protocol.connectionEstablished ? 1 : 0);

  // rtt, packetLoss (F32 zeros), PathManager count.
  bs.writeU32(0);
  bs.writeU32(0);
  bs.writeU32(0);
  // Notify count: one PacketNotify per in-flight packet, i.e. exactly
  // lastSendSeq - highestAckedSeq.
  bs.writeU32((protocol.lastSendSeq - protocol.highestAckedSeq) >>> 0);

  // Events: nextRecvEventSeq + terminator (none waiting: the engine saves
  // waiting events without their sequence numbers); ghosts: sequence 0 +
  // terminator.
  bs.writeU32(start.nextRecvEventSeq >>> 0);
  bs.writeFlag(false);
  bs.writeU32(0);
  bs.writeFlag(false);

  // No control object (skips control state + compression point).
  bs.writeU32(0xffffffff);

  writeString(bs, opts.missionName);
  // mMissionCRC as the GameConnection constructor leaves it; the recorded
  // SetMissionCRCEvent delivers the real one. Tribes2.exe names and
  // validates its lighting caches by it.
  bs.writeU32(0xffffffff);

  // Client then server ProcessList state (U8 dirty, U32 currentTag,
  // lastTick, lastTime, lastDelta), read by FUN_006021b0 at the current
  // bit position (the engine does not byte-align here). All zero is a
  // consistent state; a nonzero lastTick must stay a multiple of 32, or
  // advanceServerTime's tick loop never ends.
  for (let i = 0; i < 2; i++) {
    bs.writeU8(0);
    for (let j = 0; j < 4; j++) bs.writeU32(0);
  }

  // V12 writes size = getPosition() + 1: one trailing pad byte.
  const bytes = new Uint8Array(bs.getBytePosition() + 1);
  bytes.set(bs.getBuffer());
  return bytes;
}

/**
 * The Move struct of a neutral move (moveList's NEUTRAL_MOVE, which the
 * relay generates): packed pos fields are 16 ("centered").
 */
export const ZERO_MOVE: Uint8Array = (() => {
  const bytes = new Uint8Array(64);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 16, true);
  view.setInt32(4, 16, true);
  view.setInt32(8, 16, true);
  return bytes;
})();

/**
 * Info block (firstPerson flag + camera FOV), written after each received
 * packet the connection dispatches.
 */
export function buildInfoBlock(firstPerson = true, fov = 90): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, firstPerson ? 1 : 0, true);
  view.setFloat32(4, fov, true);
  return bytes;
}

const INFO_BLOCK = buildInfoBlock();
/** Sync-flush cadence for live spools (see DemoFileWriter). Bounds what
 *  a crash can lose: the spool is salvageable up to its last flush. */
const DEFAULT_FLUSH_INTERVAL_MS = 5_000;
/** How long strand() waits for the streams to drain before destroying. */
const STRAND_DRAIN_MS = 10_000;

/**
 * Streams a .rec to `<finalPath>.partial`: header + initial block
 * uncompressed, then blocks through a raw-deflate stream. finalize()
 * finishes the deflate stream, backpatches demoLengthMs, and atomically
 * renames — a `.rec` on disk is always complete.
 *
 * Deflate only emits output once its symbol buffer fills (~16K symbols),
 * so a quiet stretch (debrief, intermission, sparse ghost traffic) can
 * leave the spool untouched for minutes; a periodic Z_SYNC_FLUSH keeps
 * bytes (and the file's mtime) moving. Each flush costs a few bytes and
 * an early block boundary — still one valid raw-deflate stream.
 */
export class DemoFileWriter {
  readonly finalPath: string;
  readonly partialPath: string;
  private fileStream: fs.WriteStream | null = null;
  private deflate: zlib.DeflateRaw | null = null;
  private error: Error | null = null;
  private done = false;
  private flushIntervalMs: number;
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(finalPath: string, options: { flushIntervalMs?: number } = {}) {
    this.finalPath = finalPath;
    this.partialPath = `${finalPath}.partial`;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  }

  begin(initialBlock: Uint8Array): void {
    if (this.fileStream) throw new Error("DemoFileWriter already begun");
    this.fileStream = fs.createWriteStream(this.partialPath);
    this.fileStream.on("error", (err) => {
      this.error ??= err;
    });
    this.fileStream.write(buildHeader(initialBlock.length));
    this.fileStream.write(initialBlock);
    this.deflate = zlib.createDeflateRaw();
    this.deflate.on("error", (err) => {
      this.error ??= err;
    });
    this.deflate.pipe(this.fileStream);
    if (this.flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => this.flush(), this.flushIntervalMs);
      this.flushTimer.unref();
    }
  }

  /** Push pending deflate output through to the file (Z_SYNC_FLUSH). */
  flush(): void {
    if (!this.deflate || this.done) return;
    this.deflate.flush(zlib.constants.Z_SYNC_FLUSH);
  }

  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Compressed bytes flushed to the filesystem so far. */
  get bytesWritten(): number {
    return this.fileStream?.bytesWritten ?? 0;
  }

  /** Backlog buffered in the deflate + file streams (backpressure gauge). */
  get bufferedBytes(): number {
    return (
      (this.deflate?.writableLength ?? 0) +
      (this.fileStream?.writableLength ?? 0)
    );
  }

  get failed(): Error | null {
    return this.error;
  }

  writeBlock(type: number, payload?: Uint8Array): void {
    if (!this.deflate || this.done) {
      throw new Error("DemoFileWriter not writable");
    }
    const size = payload?.length ?? 0;
    if (size > MAX_BLOCK_SIZE) {
      throw new RangeError(`Demo block too large: ${size} bytes`);
    }
    const frame = new Uint8Array(2 + size);
    const typeSize = ((type & 0xf) << 12) | size;
    frame[0] = typeSize & 0xff;
    frame[1] = (typeSize >> 8) & 0xff;
    if (payload) frame.set(payload, 2);
    this.deflate.write(frame);
  }

  writePacket(data: Uint8Array): void {
    this.writeBlock(BlockTypePacket, data);
  }

  writeMove(): void {
    this.writeBlock(BlockTypeMove, ZERO_MOVE);
  }

  writeInfo(): void {
    this.writeBlock(BlockTypeInfo, INFO_BLOCK);
  }

  writeSendMarker(): void {
    this.writeBlock(BlockTypeSendPacket);
  }

  async finalize(demoLengthMs: number): Promise<void> {
    if (!this.deflate || !this.fileStream || this.done) {
      throw new Error("DemoFileWriter not writable");
    }
    this.done = true;
    this.stopFlushTimer();
    this.deflate.end();
    await finished(this.fileStream);
    if (this.error) throw this.error;

    const handle = await fsp.open(this.partialPath, "r+");
    try {
      const lengthBytes = new Uint8Array(4);
      new DataView(lengthBytes.buffer).setUint32(0, demoLengthMs >>> 0, true);
      await handle.write(lengthBytes, 0, 4, DEMO_LENGTH_MS_OFFSET);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fsp.rename(this.partialPath, this.finalPath);
  }

  /**
   * Stop writing but keep the spool. The deflate stream is ended so
   * everything buffered reaches the file if the disk still accepts it,
   * and the `.partial` is left for the next boot's salvage to turn into
   * a `.rec`. For failures where the data is worth more than the
   * file's tidiness; abort() is for recordings nobody wants.
   */
  async strand(): Promise<void> {
    this.stopFlushTimer();
    const fileStream = this.fileStream;
    if (!this.done) {
      this.done = true;
      // A failed deflate has already unpiped; end the file directly.
      if (this.deflate && !this.deflate.destroyed) this.deflate.end();
      else fileStream?.end();
    }
    if (!fileStream || fileStream.closed) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        // The disk isn't draining — give up on the buffered tail.
        fileStream.destroy();
      }, STRAND_DRAIN_MS);
      timer.unref();
      fileStream.once("close", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  /** Tear down and remove the partial file. Safe to call in any state. */
  async abort(): Promise<void> {
    this.done = true;
    this.stopFlushTimer();
    this.deflate?.destroy();
    const fileStream = this.fileStream;
    if (fileStream) {
      fileStream.destroy();
      // The stream opens (and creates the file) asynchronously — wait
      // for it to fully close so the unlink can't race the creation.
      if (!fileStream.closed) {
        await new Promise<void>((resolve) => {
          fileStream.once("close", resolve);
        });
      }
    }
    try {
      await fsp.unlink(this.partialPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}
