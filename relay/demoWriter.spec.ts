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
import {
  extractMissionInfo,
  parseDemoValues,
} from "../src/stream/demoStreaming";
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
  it("cuts each demo value to the 255 characters the engine writes", async () => {
    const long = "x".repeat(300);
    const initialBlock = buildInitialBlock({
      connectSequence: CONNECT_SEQUENCE,
      missionName: "Katabatic",
      demoValues: [long, "next"],
    });
    const parser = new DemoParser(
      buildDemoFile(
        buildHeader(initialBlock.length),
        initialBlock,
        zlib.deflateRawSync(new Uint8Array(0)),
      ),
    );
    const { initialBlock: parsed } = await parser.load();
    expect(parsed.demoValues).toEqual([long.slice(0, 255), "next"]);
  });

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
    // A fresh GameConnection's fields.
    expect(parsed).toMatchObject({
      firstPerson: true,
      cameraPos: 0,
      cameraSpeed: 10,
      lastMoveAck: 0,
      lastClientMove: 0,
      firstMoveIndex: 0,
      sensorGroup: 0,
    });
    expect(parsed.targetVisibleMask).toEqual(Array(16).fill(0));
    expect(parsed.moves).toEqual([]);
    expect(parsed.demoValues).toEqual(demoValues);
    // Tribes2.exe adopts this as its process-wide default IFF color.
    expect(parsed.defaultIffColor).toEqual({ r: 255, g: 0, b: 0, a: 255 });
    expect(parsed.sensorGroupColors).toEqual([]);
    expect(parsed.targetEntries).toEqual([]);
    expect(parsed.connectionState.lastSeqRecvd).toBe(0);
    expect(parsed.connectionState.highestAckedSeq).toBe(0);
    // Fresh-connection seed: the engine requires notifyCount to equal
    // lastSendSeq - highestAckedSeq, and treats a larger difference as a
    // full send window (no notify queued per marker → crash on first ack).
    expect(parsed.connectionState.lastSendSeq).toBe(0);
    expect(parsed.notifyCount).toBe(0);
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
    // The GameConnection constructor's value until SetMissionCRCEvent.
    expect(parsed.missionCRC).toBe(0xffffffff);
    const freshProcessList = {
      dirty: false,
      currentTag: 0,
      lastTick: 0,
      lastTime: 0,
      lastDelta: 0,
    };
    expect(parsed.clientProcessList).toEqual(freshProcessList);
    expect(parsed.serverProcessList).toEqual(freshProcessList);
    expect(parsed.phase2Valid).toBe(true);
    // Bit padding plus the trailing pad byte: neither the engine nor the
    // parser byte-aligns before the ProcessList states.
    expect(parsed.phase2TrailingBits).toBeGreaterThanOrEqual(8);
    expect(parsed.phase2TrailingBits).toBeLessThan(16);
    expect(parsed.warnings).toEqual([]);
    expect(parser.blockCount).toBe(0);
  });

  it("writes the connection's state where a later stream starts", async () => {
    const lastSeqRecvdAtSend = Array.from({ length: 32 }, (_, i) =>
      i < 26 ? Math.min(i, 4) : 0,
    );
    const initialBlock = buildInitialBlock({
      connectSequence: CONNECT_SEQUENCE,
      missionName: "Slapdash_RV",
      demoValues,
      start: {
        taggedStrings: new Map([
          [0, "t2csri_pokeClient"],
          [8, "\u0003%1 joined the game."],
        ]),
        lastMoveAck: 21,
        lastClientMove: 21,
        firstMoveIndex: 21,
        sensorGroup: 3,
        queuedMoves: 3,
        protocol: {
          lastSeqRecvdAtSend,
          lastSeqRecvd: 5,
          highestAckedSeq: 22,
          lastSendSeq: 25,
          ackMask: 0x1f,
          lastRecvAckAck: 4,
          connectionEstablished: true,
        },
        nextRecvEventSeq: 7,
      },
    });
    const parser = new DemoParser(
      buildDemoFile(
        buildHeader(initialBlock.length),
        initialBlock,
        zlib.deflateRawSync(new Uint8Array(0)),
      ),
    );
    const { initialBlock: parsed } = await parser.load();
    expect(parsed.warnings).toEqual([]);
    expect(parsed.phase2Valid).toBe(true);
    expect(parsed.taggedStrings).toEqual(
      new Map([
        [0, "t2csri_pokeClient"],
        [8, "\u0003%1 joined the game."],
      ]),
    );
    expect(parsed).toMatchObject({
      lastMoveAck: 21,
      lastClientMove: 21,
      firstMoveIndex: 21,
      sensorGroup: 3,
      nextRecvEventSeq: 7,
      // One PacketNotify per packet still in flight.
      notifyCount: 3,
      connectionState: {
        lastSeqRecvdAtSend,
        lastSeqRecvd: 5,
        highestAckedSeq: 22,
        lastSendSeq: 25,
        ackMask: 0x1f,
        connectSequence: CONNECT_SEQUENCE,
        lastRecvAckAck: 4,
      },
    });
    // The unacked moves, neutral as the relay sent them.
    expect(parsed.moves).toEqual(
      Array(3).fill({
        px: 16,
        py: 16,
        pz: 16,
        pyaw: 0,
        ppitch: 0,
        proll: 0,
        freeLook: false,
        trigger: Array(6).fill(false),
      }),
    );
    expect(parsed.demoValues).toEqual(demoValues);
    expect(parsed.missionCRC).toBe(0xffffffff);
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

  it("saves script state where loadDemoSettings and the app read it", () => {
    const name = "\x10\x0bTDD|\x08Guardzilla\x11";
    const values = buildDemoValues({
      recorderName: "Observer",
      serverName: "tournament-server-1",
      serverAddress: "1.2.3.4:28000",
      date: new Date(0),
      missionDisplayName: "BeachBlitz",
      mod: "classic",
      gameType: "Capture the Flag",
      script: {
        voting: true,
        players: [
          [name, "4514538", "26497", "", "0", "0", "0", "0"].concat([
            "0",
            "0",
            "0",
            "1",
            "0",
            "",
            "",
            "0",
          ]),
        ],
        clockMinutes: 599904 / 60000,
        chat: [...Array(10).fill("older"), "", "\x03Guardzilla joined."],
      },
    });
    expect(values[0]).toBe("Standard\t\t\t1\t0\t");
    expect(values[8]).toBe("0\t9.9984");
    expect(values.slice(17, 19)).toEqual(["<BLANK>", "\x03Guardzilla joined."]);
    const parsed = parseDemoValues(values);
    expect([...parsed.playerRoster]).toEqual([
      [26497, expect.objectContaining({ name: "TDD|Guardzilla", teamId: 0 })],
    ]);
    expect(parsed.clockTimeMin).toBe(9.9984);
    // The last ten lines, less the blank one.
    expect(parsed.chatMessages).toHaveLength(9);
    expect(parsed.chatMessages.at(-1)).toBe("\x03Guardzilla joined.");
    expect(parsed.gravity).toBe(-20);
    expect(extractMissionInfo(values).missionDisplayName).toBe("BeachBlitz");
  });

  it.each([
    [undefined, "-20"],
    [Math.fround(-26.9), "-26.9"],
    [Math.fround(-9.81), "-9.81"],
  ])("saves gravity %s the way getGravity() prints it", (gravity, row) => {
    const values = buildDemoValues({
      recorderName: "Observer",
      serverName: "biergarten",
      serverAddress: "1.2.3.4:28000",
      date: new Date(0),
      missionDisplayName: "Slapdash",
      mod: "classic",
      gameType: "Capture the Flag",
      gravity,
    });
    // GRAVITY ends the standard sections, just before the PJ tail.
    expect(values[values.indexOf("NewDemoData") - 1]).toBe(row);
    expect(parseDemoValues(values).gravity).toBe(Number(row));
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

  it("strand keeps the partial file with a complete deflate stream", async () => {
    const finalPath = await makeTempPath();
    const initialBlock = buildInitialBlock({
      connectSequence: CONNECT_SEQUENCE,
      missionName: "Katabatic",
      demoValues,
    });
    const writer = new DemoFileWriter(finalPath, { flushIntervalMs: 0 });
    writer.begin(initialBlock);
    const packet = buildPingPacket(1);
    writer.writeMove();
    writer.writePacket(packet);
    await writer.strand();
    await writer.strand();

    await expect(fsp.access(finalPath)).rejects.toThrow();
    const spool = new Uint8Array(await fsp.readFile(`${finalPath}.partial`));
    const prefix =
      buildHeader(initialBlock.length).length + initialBlock.length;
    // Everything buffered reached the file: the stream inflates without
    // needing the salvage's lenient flush mode.
    const stream = zlib.inflateRawSync(spool.subarray(prefix));
    expect(stream.length).toBe(2 + 64 + 2 + packet.length);
    expect(stream.subarray(2 + 64 + 2)).toEqual(Buffer.from(packet));
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
