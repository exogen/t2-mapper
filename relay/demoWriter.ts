/**
 * Tribes 2 demo (.rec) format writer: file header, from-connect initial
 * block, and the deflated block stream. Pure format code — recording
 * lifecycle lives in demoRecorder.ts.
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
} from "t2-demo-parser";
import { BitStreamWriter } from "./BitStreamWriter.js";
import { writeString } from "./HuffmanWriter.js";

export const DEMO_IDENT_STRING = "Tribes2 Recording";
export const DEMO_PROTOCOL_VERSION = 0x00330004;
/** Byte offset of the U32 demoLengthMs field in the header. */
export const DEMO_LENGTH_MS_OFFSET = 1 + DEMO_IDENT_STRING.length + 4;
/** Max payload bytes per block (12-bit size field). */
export const MAX_BLOCK_SIZE = 0xfff;

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
}

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

/**
 * The exact `$DemoValue` row interleaving the app's demo metadata
 * extraction expects (each data row preceded by a "readplayerinfo"
 * marker), matching retail auto-capture demos.
 */
export function buildDemoValues(info: DemoValuesInfo): string[] {
  return [
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

export interface InitialBlockOptions {
  /** Full 32-bit connect sequence — parity must match packets' connectSeqBit. */
  connectSequence: number;
  /** Mission file name (from MissionStartPhase1 arg 1). */
  missionName: string;
  demoValues: string[];
}

/**
 * The passive-observer lastSendSeq seed (t2-demo-parser LiveParser).
 * Guarantees the parser's `lastSendSeq < highestAck` rejection can
 * never fire regardless of SendPacket marker timing.
 */
const PASSIVE_LAST_SEND_SEQ = 0x1fffffff;

/**
 * Build a from-connect initial block: no tagged strings, datablocks,
 * scores, targets, events, ghosts, or control object — all of that
 * arrives in the recorded packet stream, exactly as the live parser
 * consumes it from a fresh connection.
 */
export function buildInitialBlock(opts: InitialBlockOptions): Uint8Array {
  const bs = new BitStreamWriter(4096, { growable: true });

  // Tagged string table: 1024 empty slots.
  for (let i = 0; i < 1024; i++) bs.writeFlag(false);

  // DataBlocks: count 0, then loop terminator.
  bs.writeU32(0);
  bs.writeFlag(false);

  // firstPerson + connection fields (cameraPos, cameraSpeed=10.0f,
  // lastMoveAck, lastClientMove, firstMoveIndex, moveListSize).
  bs.writeU8(1);
  bs.writeU32(0);
  bs.writeU32(0x41200000);
  bs.writeU32(0);
  bs.writeU32(0);
  bs.writeU32(0);
  bs.writeU32(0);

  // Target-visible mask (16 U32s) + score count.
  for (let i = 0; i < 16; i++) bs.writeU32(0);
  bs.writeU32(0);

  // DemoValues.
  for (const row of opts.demoValues) {
    bs.writeFlag(true);
    writeString(bs, row);
  }
  bs.writeFlag(false);

  // Complex TargetManager: 4 U8s, 32×32 IFF color grid, 512 targets.
  for (let i = 0; i < 4; i++) bs.writeU8(0);
  for (let i = 0; i < 32 * 32; i++) bs.writeFlag(false);
  for (let i = 0; i < 512; i++) bs.writeFlag(false);

  // ConnectionProtocol state: pre-first-packet, with the passive
  // lastSendSeq seed and the live connection's connect sequence.
  for (let i = 0; i < 32; i++) bs.writeU32(0);
  bs.writeU32(0); // lastSeqRecvd
  bs.writeU32(0); // highestAckedSeq
  bs.writeU32(PASSIVE_LAST_SEND_SEQ);
  bs.writeU32(0); // ackMask
  bs.writeU32(opts.connectSequence >>> 0);
  bs.writeU32(0); // lastRecvAckAck
  bs.writeU8(1); // connectionEstablished

  // rtt, packetLoss (F32 zeros), PathManager count, notify count.
  bs.writeU32(0);
  bs.writeU32(0);
  bs.writeU32(0);
  bs.writeU32(0);

  // Events: nextRecvEventSeq 0 + terminator; ghosts: sequence 0 + terminator.
  bs.writeU32(0);
  bs.writeFlag(false);
  bs.writeU32(0);
  bs.writeFlag(false);

  // No control object (skips control state + compression point).
  bs.writeU32(0xffffffff);

  writeString(bs, opts.missionName);
  bs.writeU32(0); // missionCRC (consumed by nothing)
  bs.alignToByte();

  // Two simple TargetManager blocks.
  for (let i = 0; i < 2; i++) {
    bs.writeU8(0);
    for (let j = 0; j < 4; j++) bs.writeU32(0);
  }

  // V12 writes size = getPosition() + 1: one trailing pad byte.
  const bytes = new Uint8Array(bs.getBytePosition() + 1);
  bytes.set(bs.getBuffer());
  return bytes;
}

/** Zero-input observer Move struct: packed pos fields are 16 ("centered"). */
export const ZERO_MOVE: Uint8Array = (() => {
  const bytes = new Uint8Array(64);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 16, true);
  view.setInt32(4, 16, true);
  view.setInt32(8, 16, true);
  return bytes;
})();

/** Info block written after each packet: firstPerson flag + camera FOV. */
export function buildInfoBlock(firstPerson = true, fov = 90): Uint8Array {
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, firstPerson ? 1 : 0, true);
  view.setFloat32(4, fov, true);
  return bytes;
}

const INFO_BLOCK = buildInfoBlock();

/**
 * Streams a .rec to `<finalPath>.partial`: header + initial block
 * uncompressed, then blocks through a raw-deflate stream. finalize()
 * finishes the deflate stream, backpatches demoLengthMs, and atomically
 * renames — a `.rec` on disk is always complete.
 */
export class DemoFileWriter {
  readonly finalPath: string;
  readonly partialPath: string;
  private fileStream: fs.WriteStream | null = null;
  private deflate: zlib.DeflateRaw | null = null;
  private error: Error | null = null;
  private done = false;

  constructor(finalPath: string) {
    this.finalPath = finalPath;
    this.partialPath = `${finalPath}.partial`;
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

  /** Tear down and remove the partial file. Safe to call in any state. */
  async abort(): Promise<void> {
    this.done = true;
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
    } catch {
      // Already gone or never created.
    }
  }
}
