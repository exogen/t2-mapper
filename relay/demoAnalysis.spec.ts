import zlib from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockTypeMove, DemoParser } from "t2-demo-parser";
import {
  DEMO_LENGTH_MS_OFFSET,
  buildDemoValues,
  buildHeader,
  buildInitialBlock,
  ZERO_MOVE,
} from "./demoWriter";
import { analyzeDemo, validateDemoUploadBytes } from "./demoAnalysis";

function demo(
  stream = frame(BlockTypeMove, ZERO_MOVE),
  date = "Nov-1-2026 12:00AM",
  mission = "Test",
  initialMission = mission,
) {
  const rows = buildDemoValues({
    recorderName: "Recorder",
    serverName: "Server",
    serverAddress: "localhost",
    date: new Date("2026-11-01T00:00:00Z"),
    missionDisplayName: mission,
    mod: "classic",
    gameType: "CTF",
  });
  const index = rows.findIndex((row) => row.startsWith("2\t"));
  const fields = rows[index].split("\t");
  fields[3] = date;
  rows[index] = fields.join("\t");
  const initial = buildInitialBlock({
    connectSequence: 0,
    missionName: initialMission,
    demoValues: rows,
  });
  return Buffer.concat([
    buildHeader(initial.length),
    initial,
    zlib.deflateRawSync(stream),
  ]);
}

function frame(type: number, body: Uint8Array) {
  const header = Buffer.alloc(2);
  header.writeUInt16LE((type << 12) | body.byteLength);
  return Buffer.concat([header, body]);
}

afterEach(() => vi.restoreAllMocks());

describe("strict user recording validation", () => {
  it("uses measured move time for uploads without changing backfill header timing", async () => {
    const bytes = demo();
    bytes.writeUInt32LE(0xffffffff, DEMO_LENGTH_MS_OFFSET);
    expect(
      (await analyzeDemo(bytes, "hash.rec", { strict: true })).durationMs,
    ).toBe(32);
    expect((await analyzeDemo(bytes, "hash.rec")).durationMs).toBe(0xffffffff);
  });
  it("accepts complete blocks at the exact expanded-byte limit", () => {
    const bytes = demo();
    const { header, byteLength } = DemoParser.peekHeader(bytes);
    const limit = byteLength + header.initialBlockSize + 66;
    expect(() => validateDemoUploadBytes(bytes, limit)).not.toThrow();
    expect(() => validateDemoUploadBytes(bytes, limit - 1)).toThrow("128 MB");
  });

  it("rejects compressed expansion before loading the parser", () => {
    const bytes = demo(Buffer.alloc(200_000));
    expect(() => validateDemoUploadBytes(bytes, 10_000)).toThrow("128 MB");
  });

  it.each([
    Buffer.from([0]),
    Buffer.from([10, 0, 0]),
    frame(15, new Uint8Array()),
    frame(BlockTypeMove, new Uint8Array(63)),
  ])("rejects truncated or unsupported block framing (%j)", (stream) => {
    expect(() => validateDemoUploadBytes(demo(stream))).toThrow(/block/);
  });

  it("rejects incomplete or trailing compressed bytes", () => {
    const bytes = demo();
    expect(() => validateDemoUploadBytes(bytes.subarray(0, -2))).toThrow(
      "compressed data",
    );
    expect(() =>
      validateDemoUploadBytes(Buffer.concat([bytes, Buffer.from([1, 2])])),
    ).toThrow("trailing compressed data");
  });

  it("keeps the header recording date and accepts a legitimate pre-mission initial state", async () => {
    const bytes = demo(undefined, undefined, "Test", "");
    validateDemoUploadBytes(bytes);
    expect(
      await analyzeDemo(bytes, "hash.rec", { strict: true }),
    ).toMatchObject({
      recordedAt: "2026-11-01T00:00:00.000Z",
      recorder: "Recorder",
      games: [{ mission: "Test", startMs: 0 }],
      recordedAtRaw: "Nov-1-2026 12:00AM",
      recordedAtTimezone: "unknown",
    });
  });

  it("rejects a recording that never shows which map it was on", async () => {
    const bytes = demo(undefined, undefined, "");
    validateDemoUploadBytes(bytes);
    await expect(
      analyzeDemo(bytes, "hash.rec", { strict: true }),
    ).rejects.toThrow("does not show which map");
    expect((await analyzeDemo(bytes, "hash.rec")).games).toEqual([]);
  });

  it.each([
    "",
    "Feb-31-2026 1:00AM",
    "Nov-1-2026 13:00AM",
    "Nov-1-2026 1:99AM",
    "Jan-1-2099 12:00AM",
  ])("rejects missing, invalid, or future header dates (%s)", async (date) => {
    await expect(
      analyzeDemo(demo(undefined, date), "20200101T0000.rec", { strict: true }),
    ).rejects.toThrow(/date/);
  });

  it("rejects decoder errors even on non-packet blocks", async () => {
    vi.spyOn(DemoParser.prototype, "nextBlock").mockReturnValueOnce({
      index: 0,
      type: BlockTypeMove,
      size: 64,
      data: ZERO_MOVE,
      parseError: "private decoder details",
    });
    await expect(
      analyzeDemo(demo(), "hash.rec", { strict: true }),
    ).rejects.toThrow("decoding error at block 0");
  });

  it("rejects initial-state decoding faults without exposing parser details", async () => {
    const load = DemoParser.prototype.load;
    vi.spyOn(DemoParser.prototype, "load").mockImplementation(async function (
      this: DemoParser,
    ) {
      const result = await load.call(this);
      return {
        ...result,
        initialBlock: {
          ...result.initialBlock,
          phase2Error: "private parser diagnostics",
        },
      };
    });
    await expect(
      analyzeDemo(demo(), "hash.rec", { strict: true }),
    ).rejects.toThrow("initial state is corrupt or unsupported");
  });

  it("rejects a forged initial move count before allocating its declared entries", async () => {
    const bytes = demo();
    const { byteLength } = DemoParser.peekHeader(bytes);
    // No tagged strings/datablocks: queued moves follow the fixed connection fields.
    const moveCountBit = byteLength * 8 + 1024 + 32 + 1 + 8 + 6 * 32 + 16 * 32;
    for (let bit = 0; bit < 32; bit++)
      bytes[(moveCountBit + bit) >> 3] |= 1 << ((moveCountBit + bit) & 7);
    validateDemoUploadBytes(bytes);
    await expect(
      analyzeDemo(bytes, "hash.rec", { strict: true }),
    ).rejects.toThrow("Invalid move count");
  });

  it("rejects truncated zero-filled initial tails even when the parser reports them valid", async () => {
    const original = demo();
    const { header, byteLength } = DemoParser.peekHeader(original);
    const end = byteLength + header.initialBlockSize;
    const initial = original.subarray(byteLength, end);
    const compressed = original.subarray(end);
    for (let cut = 1; cut <= 42; cut++) {
      const shorter = initial.subarray(0, initial.length - cut);
      const bytes = Buffer.concat([
        buildHeader(shorter.length),
        shorter,
        compressed,
      ]);
      validateDemoUploadBytes(bytes);
      if (cut === 1) {
        // Dropping the engine's spare padding byte leaves every field complete.
        await expect(
          analyzeDemo(bytes, "hash.rec", { strict: true }),
        ).resolves.toBeDefined();
      } else {
        await expect(
          analyzeDemo(bytes, "hash.rec", { strict: true }),
        ).rejects.toThrow("initial state is corrupt or unsupported");
      }
    }
  });

  it("rejects unexpected bytes after the initial state", async () => {
    const original = demo();
    const { header, byteLength } = DemoParser.peekHeader(original);
    const end = byteLength + header.initialBlockSize;
    const initial = Buffer.concat([
      original.subarray(byteLength, end),
      Buffer.alloc(20),
    ]);
    const bytes = Buffer.concat([
      buildHeader(initial.length),
      initial,
      original.subarray(end),
    ]);
    validateDemoUploadBytes(bytes);
    await expect(
      analyzeDemo(bytes, "hash.rec", { strict: true }),
    ).rejects.toThrow("initial state is corrupt or unsupported");
  });

  it("rejects an initial event fault even when later initial fields decode", async () => {
    const load = DemoParser.prototype.load;
    vi.spyOn(DemoParser.prototype, "load").mockImplementation(async function (
      this: DemoParser,
    ) {
      const result = await load.call(this);
      return {
        ...result,
        initialBlock: {
          ...result.initialBlock,
          initialEvents: [
            {
              classId: 255,
              guaranteed: true,
              dataBitsStart: 0,
              dataBitsEnd: 0,
              failed: true,
            },
          ],
        },
      };
    });
    await expect(
      analyzeDemo(demo(), "hash.rec", { strict: true }),
    ).rejects.toThrow("initial state is corrupt or unsupported");
  });
});
