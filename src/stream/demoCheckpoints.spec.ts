import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { encodeCheckpoint, bytesToBase64 } from "./checkpointCodec";
import {
  DEMO_CHECKPOINT_VERSION,
  demoSha256,
  demoCheckpointTargets,
  readDemoCheckpoints,
  validateDemoCheckpoints,
  type DemoCheckpointSidecar,
} from "./demoCheckpoints";
import type { TimelineEvent } from "../state/demoTimelineStore";

const event = (
  timeSec: number,
  type: TimelineEvent["type"] = "match-start",
): TimelineEvent => ({ timeSec, type, description: String(timeSec) });

describe("precomputed checkpoint targets", () => {
  it("anchors 12-minute intervals to the first kickoff, excluding countdowns and later starts", () => {
    const result = demoCheckpointTargets(
      [
        event(900),
        event(300, "match-countdown"),
        event(600),
        event(1200, "match-end"),
        event(2400),
      ],
      3,
      100_000,
    );
    expect(
      result.map((point) => [point.tick * 0.032, point.matchStartSec]),
    ).toEqual([
      [540, 600],
      [1260, 600],
      [1980, 600],
    ]);
  });
  it("handles recordings with no kickoff, short lead-ins and duplicate markers", () => {
    expect(demoCheckpointTargets([], 3, 100_000)).toEqual([]);
    expect(
      demoCheckpointTargets([event(300, "match-countdown")], 3, 100_000),
    ).toEqual([]);
    expect(
      demoCheckpointTargets(
        [event(10), event(30), event(90), event(90)],
        3,
        100_000,
      ).map((point) => point.tick),
    ).toEqual([0, 22_500, 45_000]);
  });
  it("rounds down to a complete simulation tick", () => {
    const result = demoCheckpointTargets([event(60.064)], 2, 100_000);
    expect(result.map((point) => point.tick)).toEqual([2, 22_502]);
    expect(demoCheckpointTargets([event(60.063)], 1, 100)[0].tick).toBe(1);
  });
  it.each([
    [0, []],
    [1, [1000]],
    [1000, [1000, 23_500, 46_000]],
  ])("caps the sequence at the requested count %i", (count, ticks) => {
    expect(
      demoCheckpointTargets([event(92)], count, 50_000).map(
        (point) => point.tick,
      ),
    ).toEqual(ticks);
  });
  it.each([
    [0, []],
    [999, []],
    [1000, []],
    [1001, [1000]],
    [23_499, [1000]],
    [23_500, [1000]],
    [23_501, [1000, 23_500]],
    [46_000, [1000, 23_500]],
  ])("skips targets at or beyond the last tick %i", (lastTick, ticks) => {
    expect(
      demoCheckpointTargets([event(92)], 3, lastTick).map(
        (point) => point.tick,
      ),
    ).toEqual(ticks);
  });
  it("ignores invalid kickoff times", () => {
    expect(
      demoCheckpointTargets([event(NaN), event(Infinity), event(-1)], 3, 100),
    ).toEqual([]);
  });
});

function checkpointData(tick: number): string {
  return bytesToBase64(
    gzipSync(
      encodeCheckpoint({
        cursor: { moveTicks: tick },
        simulation: { state: { entities: new Map() }, shared: new Map() },
        parser: { ghosts: new Map() },
      }),
    ),
  );
}

async function sidecar(buffer: ArrayBuffer): Promise<DemoCheckpointSidecar> {
  return {
    format: "t2-mapper-seek-checkpoints",
    version: DEMO_CHECKPOINT_VERSION,
    demoBytes: buffer.byteLength,
    demoSha256: await demoSha256(buffer),
    requestedCount: 1,
    checkpoints: [
      {
        tick: 1000,
        matchStartSec: 92,
        description: "Match started",
        data: checkpointData(1000),
      },
    ],
  };
}

describe("checkpoint sidecar loading", () => {
  it("decodes compressed checkpoints only for their original recording", async () => {
    const buffer = new Uint8Array([1, 2, 3]).buffer;
    const text = JSON.stringify(await sidecar(buffer));
    expect((await readDemoCheckpoints(text, buffer))[0].cursor.moveTicks).toBe(
      1000,
    );
    await expect(
      readDemoCheckpoints(text, new Uint8Array([3, 2, 1]).buffer),
    ).rejects.toThrow("do not match");
  });
  it("rejects outdated formats, changed timestamps and corrupt payloads", async () => {
    const buffer = new ArrayBuffer(3);
    const original = await sidecar(buffer);
    await expect(
      readDemoCheckpoints(
        JSON.stringify({ ...original, version: DEMO_CHECKPOINT_VERSION - 1 }),
        buffer,
      ),
    ).rejects.toThrow("version");
    original.checkpoints[0].tick = 1001;
    await expect(
      readDemoCheckpoints(JSON.stringify(original), buffer),
    ).rejects.toThrow("timing");
    original.checkpoints[0].tick = 1000;
    original.checkpoints[0].data = "corrupt";
    await expect(
      readDemoCheckpoints(JSON.stringify(original), buffer),
    ).rejects.toThrow();
  });
  it("accepts no checkpoints without inventing a match start", async () => {
    const buffer = new ArrayBuffer(0);
    const original = await sidecar(buffer);
    original.checkpoints = [];
    expect(await readDemoCheckpoints(JSON.stringify(original), buffer)).toEqual(
      [],
    );
  });
  it("loads successive checkpoints on the 12-minute schedule", async () => {
    const buffer = new ArrayBuffer(3);
    const original = await sidecar(buffer);
    original.requestedCount = 3;
    for (const tick of [23_500, 46_000])
      original.checkpoints.push({
        ...original.checkpoints[0],
        tick,
        data: checkpointData(tick),
      });
    expect(
      (await readDemoCheckpoints(JSON.stringify(original), buffer)).map(
        (checkpoint) => checkpoint.cursor.moveTicks,
      ),
    ).toEqual([1000, 23_500, 46_000]);
    await expect(
      validateDemoCheckpoints(JSON.stringify(original), buffer),
    ).resolves.toBeUndefined();
    original.checkpoints[2].data = "corrupt";
    await expect(
      validateDemoCheckpoints(JSON.stringify(original), buffer),
    ).rejects.toThrow();
    original.checkpoints[2].data = checkpointData(46_000);
    original.checkpoints[1].matchStartSec = 93;
    await expect(
      readDemoCheckpoints(JSON.stringify(original), buffer),
    ).rejects.toThrow("timing");
  });
  it("rejects payloads whose captured tick disagrees with their target", async () => {
    const buffer = new ArrayBuffer(3);
    const original = await sidecar(buffer);
    original.checkpoints[0].data = checkpointData(1001);
    await expect(
      readDemoCheckpoints(JSON.stringify(original), buffer),
    ).rejects.toThrow("state");
  });
});
