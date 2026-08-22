import { describe, expect, it, vi } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import {
  BlockTypeInfo,
  BlockTypeMove,
  BlockTypePacket,
  BlockTypeSendPacket,
  DemoParser,
  type DemoBlock,
} from "t2-demo-parser";
import { extractMissionInfo } from "../src/stream/demoStreaming";
import { BitStreamWriter } from "./BitStreamWriter.js";
import {
  DEMO_PROTOCOL_VERSION,
  DemoFileWriter,
  ZERO_MOVE,
  buildDemoValues,
  buildHeader,
  buildInfoBlock,
  buildInitialBlock,
  formatDemoDate,
} from "./demoWriter.js";

const CONNECT_SEQUENCE = 0x0badf00d;

const demoValues = buildDemoValues({
  recorderName: "Observer",
  clientId: 42,
  serverName: "| the cut |",
  serverAddress: "45.76.24.91:28000",
  date: new Date(Date.UTC(2026, 4, 16, 5, 4)),
  missionDisplayName: "Katabatic",
  mod: "classic",
  gameType: "Capture the Flag",
});

function buildDemoFile(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

/** Minimal valid data-protocol ping packet for the seeded parser state. */
function buildPingPacket(seq: number): Uint8Array {
  const bs = new BitStreamWriter(16);
  bs.writeFlag(true); // game packet bit
  bs.writeInt(CONNECT_SEQUENCE & 1, 1);
  bs.writeInt(seq, 9);
  bs.writeInt(0, 9); // highestAck
  bs.writeInt(1, 2); // PingPacket
  bs.writeInt(0, 3); // ackByteCount
  return bs.getBuffer();
}

describe("buildInitialBlock", () => {
  it("round-trips a from-connect initial block through DemoParser", async () => {
    const initialBlock = buildInitialBlock({
      connectSequence: CONNECT_SEQUENCE,
      missionName: "Katabatic",
      demoValues,
    });
    const file = buildDemoFile(
      buildHeader(initialBlock.length),
      initialBlock,
      zlib.deflateRawSync(new Uint8Array(0)),
    );

    const parser = new DemoParser(file);
    const { header, initialBlock: parsed } = await parser.load();

    expect(header.identString).toBe("Tribes2 Recording");
    expect(header.protocolVersion).toBe(DEMO_PROTOCOL_VERSION);
    expect(header.demoLengthMs).toBe(0);
    expect(header.initialBlockSize).toBe(initialBlock.length);

    expect(parsed.taggedStrings.size).toBe(0);
    expect(parsed.dataBlockCount).toBe(0);
    expect(parsed.dataBlocks.size).toBe(0);
    expect(parsed.firstPerson).toBe(true);
    expect(parsed.connectionFields[1]).toBe(0x41200000);
    expect(parsed.scoreEntries).toEqual([]);
    expect(parsed.demoValues).toEqual(demoValues);
    expect(parsed.connectionState.lastSeqRecvd).toBe(0);
    expect(parsed.connectionState.highestAckedSeq).toBe(0);
    expect(parsed.connectionState.lastSendSeq).toBe(0x1fffffff);
    expect(parsed.connectionState.connectSequence).toBe(CONNECT_SEQUENCE);
    expect(parsed.connectionState.connectionEstablished).toBe(true);
    expect(parsed.roundTripTime).toBe(0);
    expect(parsed.packetLoss).toBe(0);
    expect(parsed.pathManager).toEqual([]);
    expect(parsed.nextRecvEventSeq).toBe(0);
    expect(parsed.ghostingSequence).toBe(0);
    expect(parsed.initialGhosts).toEqual([]);
    expect(parsed.controlObjectGhostIndex).toBe(-1);
    expect(parsed.missionName).toBe("Katabatic");
    expect(parsed.missionCRC).toBe(0);
    expect(parsed.phase2Valid).toBe(true);
    expect(parsed.phase2TrailingBits).toBe(8);
    expect(parser.blockCount).toBe(0);
  });
});

describe("buildDemoValues", () => {
  it("survives the app's demo metadata extraction", () => {
    const info = extractMissionInfo(demoValues);
    expect(info.recorderName).toBe("Observer");
    expect(info.recorderClientId).toBe(42);
    expect(info.serverDisplayName).toBe("| the cut |");
    expect(info.recordingDate).toBe("May-16-2026 5:04AM");
    expect(info.missionDisplayName).toBe("Katabatic");
    expect(info.mod).toBe("classic");
    expect(info.missionType).toBe("Capture the Flag");
  });
});

describe("formatDemoDate", () => {
  it("matches the retail demo date style, in UTC", () => {
    expect(formatDemoDate(new Date(Date.UTC(2025, 4, 16, 5, 4)))).toBe(
      "May-16-2025 5:04AM",
    );
    expect(formatDemoDate(new Date(Date.UTC(2026, 0, 2, 0, 5)))).toBe(
      "Jan-2-2026 12:05AM",
    );
    expect(formatDemoDate(new Date(Date.UTC(2026, 11, 31, 12, 30)))).toBe(
      "Dec-31-2026 12:30PM",
    );
  });
});

describe("DemoFileWriter", () => {
  async function makeTempPath(): Promise<string> {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "demo-writer-"));
    return path.join(dir, "test.rec");
  }

  it("streams blocks and finalizes a parseable .rec", async () => {
    const finalPath = await makeTempPath();
    const initialBlock = buildInitialBlock({
      connectSequence: CONNECT_SEQUENCE,
      missionName: "Katabatic",
      demoValues,
    });
    const packet1 = buildPingPacket(1);
    const packet2 = buildPingPacket(2);

    const writer = new DemoFileWriter(finalPath);
    writer.begin(initialBlock);
    writer.writeMove();
    writer.writeSendMarker();
    writer.writePacket(packet1);
    writer.writeInfo();
    writer.writeMove();
    writer.writePacket(packet2);
    writer.writeInfo();
    await writer.finalize(6400);

    await expect(fsp.access(`${finalPath}.partial`)).rejects.toThrow();
    const file = new Uint8Array(await fsp.readFile(finalPath));
    const parser = new DemoParser(file);
    const { header } = await parser.load();
    expect(header.demoLengthMs).toBe(6400);

    const blocks: DemoBlock[] = [];
    for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
      blocks.push(block);
    }
    expect(blocks.map((b) => [b.type, b.size])).toEqual([
      [BlockTypeMove, 64],
      [BlockTypeSendPacket, 0],
      [BlockTypePacket, packet1.length],
      [BlockTypeInfo, 8],
      [BlockTypeMove, 64],
      [BlockTypePacket, packet2.length],
      [BlockTypeInfo, 8],
    ]);
    expect(blocks[0].data).toEqual(ZERO_MOVE);
    expect(blocks[2].data).toEqual(packet1);
    expect(blocks[3].data).toEqual(buildInfoBlock());
    expect(blocks[5].data).toEqual(packet2);
  });

  it("sync-flushes quiet spools to disk and still finalizes a valid stream", async () => {
    const finalPath = await makeTempPath();
    const initialBlock = buildInitialBlock({
      connectSequence: CONNECT_SEQUENCE,
      missionName: "Katabatic",
      demoValues,
    });
    const writer = new DemoFileWriter(finalPath, { flushIntervalMs: 10 });
    writer.begin(initialBlock);
    const headerBytes =
      buildHeader(initialBlock.length).length + initialBlock.length;
    // A handful of blocks is nowhere near deflate's emit threshold — only
    // the periodic flush can move compressed bytes into the file.
    const packet = buildPingPacket(1);
    writer.writeMove();
    writer.writePacket(packet);
    writer.writeInfo();
    await vi.waitFor(() => {
      expect(writer.bytesWritten).toBeGreaterThan(headerBytes);
    });
    const flushedOnce = writer.bytesWritten;
    writer.writeMove();
    writer.writePacket(packet);
    await vi.waitFor(() => {
      expect(writer.bytesWritten).toBeGreaterThan(flushedOnce);
    });
    await writer.finalize(128);

    const parser = new DemoParser(
      new Uint8Array(await fsp.readFile(finalPath)),
    );
    const { header } = await parser.load();
    expect(header.demoLengthMs).toBe(128);
    const blocks: DemoBlock[] = [];
    for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
      blocks.push(block);
    }
    expect(blocks.map((b) => b.type)).toEqual([
      BlockTypeMove,
      BlockTypePacket,
      BlockTypeInfo,
      BlockTypeMove,
      BlockTypePacket,
    ]);
    expect(blocks[4].data).toEqual(packet);
  });

  it("rejects oversized blocks", async () => {
    const finalPath = await makeTempPath();
    const writer = new DemoFileWriter(finalPath);
    writer.begin(new Uint8Array(4));
    expect(() => writer.writePacket(new Uint8Array(0x1000))).toThrow(
      RangeError,
    );
    await writer.abort();
  });

  it("abort removes the partial file and is idempotent", async () => {
    const finalPath = await makeTempPath();
    const writer = new DemoFileWriter(finalPath);
    writer.begin(new Uint8Array(4));
    writer.writeMove();
    await writer.abort();
    await writer.abort();
    await expect(fsp.access(`${finalPath}.partial`)).rejects.toThrow();
    await expect(fsp.access(finalPath)).rejects.toThrow();
  });
});
