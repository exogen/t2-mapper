import { constants, deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BlockTypeMove, BlockTypePacket, DemoParser } from "t2-demo-parser";
import { buildHeader, buildInitialBlock } from "../../relay/demoWriter";
import {
  command,
  CONNECT_SEQUENCE,
  netString,
  serverPacket,
} from "../../relay/serverPacketFixtures";
import { createDemoStreamingRecording } from "./demoStreaming";
import { scanDemoTimeline } from "./demoTimelineScanner";
import { loadDemoParser, shareDemoParser } from "./loadDemoParser";

function block(type: number, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(payload.length + 2);
  new DataView(bytes.buffer).setUint16(0, (type << 12) | payload.length, true);
  bytes.set(payload, 2);
  return bytes;
}

function demo(compressed: Uint8Array): ArrayBuffer {
  const initial = buildInitialBlock({
    connectSequence: CONNECT_SEQUENCE,
    missionName: "Katabatic",
    demoValues: [],
  });
  return Uint8Array.from(
    Buffer.concat([buildHeader(initial.length), initial, compressed]),
  ).buffer;
}

function recording(finalized: boolean, incompleteTail = false): ArrayBuffer {
  const move = block(BlockTypeMove, new Uint8Array(64));
  const packet = block(
    BlockTypePacket,
    serverPacket(1, {
      events: [
        netString(0, 10, "ServerMessage"),
        command(1, 10, "MsgMissionStart", "Match started!"),
      ],
    }),
  );
  return demo(
    deflateRawSync(
      Buffer.concat([
        ...Array<Uint8Array>(10).fill(move),
        packet,
        ...Array<Uint8Array>(10).fill(move),
        ...(incompleteTail ? [move.subarray(0, 20)] : []),
      ]),
      { finishFlush: finalized ? constants.Z_FINISH : constants.Z_SYNC_FLUSH },
    ),
  );
}

describe("unfinished demo loading", () => {
  it.each([true, false])(
    "uses recorded ticks and scans events with a zero duration header (finalized=%s)",
    async (finalized) => {
      const buffer = recording(finalized);
      if (!finalized) {
        await expect(
          new DemoParser(new Uint8Array(buffer)).load(),
        ).rejects.toMatchObject({ code: 0 });
      }
      const loaded = await createDemoStreamingRecording(buffer);
      expect(loaded.duration).toBe(0.64);
      expect(loaded.streamingPlayback.streamComplete).toBe(true);
      const timeline = await scanDemoTimeline(buffer, null);
      expect(timeline.events).toEqual([
        expect.objectContaining({ type: "match-start", timeSec: 0.32 }),
      ]);
    },
  );

  it("excludes an incomplete final block from recovered duration and timeline", async () => {
    const buffer = recording(false, true);
    const loaded = await createDemoStreamingRecording(buffer);
    expect(loaded.duration).toBe(0.64);
    expect((await scanDemoTimeline(buffer, null)).events).toHaveLength(1);
  });

  it("can require a finalized compressed stream", async () => {
    await expect(
      createDemoStreamingRecording(recording(false), { allowPartial: false }),
    ).rejects.toMatchObject({ code: 0 });
  });

  it("does not recover invalid compressed data", async () => {
    // The reserved DEFLATE block type is corruption, not an unfinished stream.
    await expect(
      loadDemoParser(new Uint8Array(demo(new Uint8Array([7])))),
    ).rejects.toMatchObject({ code: 1 });
  });

  it("does not recover a truncated initial block", async () => {
    const bytes = new Uint8Array(recording(false));
    const { byteLength } = DemoParser.peekHeader(bytes);
    await expect(
      loadDemoParser(bytes.subarray(0, byteLength + 1)),
    ).rejects.toThrow("truncated demo: initial block");
  });
});

function drainCount(parser: DemoParser): number {
  let count = 0;
  while (parser.nextBlock()) count++;
  return count;
}

describe("shared demo parsers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forks the first parser of a buffer instead of inflating it again", async () => {
    const buffer = recording(true);
    const load = vi.spyOn(DemoParser.prototype, "load");
    const first = await loadDemoParser(new Uint8Array(buffer));
    expect(drainCount(first)).toBe(21);
    const second = await loadDemoParser(new Uint8Array(buffer));
    expect(load).toHaveBeenCalledTimes(1);
    expect(second).not.toBe(first);
    expect(second.blockCursor).toBe(0);
    expect(drainCount(second)).toBe(21);
  });

  it("forks a progressive download's parser once it's shared", async () => {
    const buffer = recording(true);
    const bytes = new Uint8Array(buffer);
    const { byteLength, header } = DemoParser.peekHeader(bytes);
    const prefixEnd = byteLength + header.initialBlockSize;
    const progressive = new DemoParser(bytes.slice(0, prefixEnd), {
      incremental: true,
    });
    await progressive.load();
    progressive.push(bytes.slice(prefixEnd));
    progressive.finish();
    shareDemoParser(buffer, progressive);

    const load = vi.spyOn(DemoParser.prototype, "load");
    const parser = await loadDemoParser(bytes);
    expect(load).not.toHaveBeenCalled();
    expect(drainCount(parser)).toBe(21);
  });

  it("shares any whole view, but inflates again for part of a buffer or a strict load", async () => {
    const buffer = recording(true);
    await loadDemoParser(new Uint8Array(buffer));
    const load = vi.spyOn(DemoParser.prototype, "load");
    await loadDemoParser(new Uint8Array(buffer, 0, buffer.byteLength));
    expect(load).not.toHaveBeenCalled();
    await loadDemoParser(new Uint8Array(buffer), { allowPartial: false });
    expect(load).toHaveBeenCalledTimes(1);
    const copy = new Uint8Array(buffer.byteLength + 1);
    copy.set(new Uint8Array(buffer));
    await loadDemoParser(copy.subarray(0, buffer.byteLength));
    expect(load).toHaveBeenCalledTimes(2);
  });
});
