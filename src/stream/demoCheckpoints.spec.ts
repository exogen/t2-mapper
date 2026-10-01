import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { encodeCheckpoint, bytesToBase64 } from "./checkpointCodec";
import {
  DEMO_CHECKPOINT_VERSION,
  demoSha256,
  matchStartCheckpointTargets,
  readDemoCheckpoints,
  type DemoCheckpointSidecar,
} from "./demoCheckpoints";
import type { TimelineEvent } from "../state/demoTimelineStore";

const event = (
  timeSec: number,
  type: TimelineEvent["type"] = "match-start",
): TimelineEvent => ({ timeSec, type, description: String(timeSec) });

describe("confirmed match-start checkpoints", () => {
  it("selects 60 seconds before every map's kickoff, excluding countdowns", () => {
    const result = matchStartCheckpointTargets([
      event(900),
      event(300, "match-countdown"),
      event(600),
      event(1200, "match-end"),
    ]);
    expect(
      result.map((point) => [point.tick * 0.032, point.matchStartSec]),
    ).toEqual([
      [540, 600],
      [840, 900],
    ]);
  });
  it("handles recordings with no kickoff, short lead-ins and duplicate markers", () => {
    expect(matchStartCheckpointTargets([])).toEqual([]);
    expect(
      matchStartCheckpointTargets([event(300, "match-countdown")]),
    ).toEqual([]);
    expect(
      matchStartCheckpointTargets([
        event(10),
        event(30),
        event(90),
        event(90),
      ]).map((point) => point.tick),
    ).toEqual([0, 937]);
  });
  it("rounds down to a complete simulation tick", () => {
    const [point] = matchStartCheckpointTargets([event(60.064)]);
    expect(point.tick).toBe(2);
  });
});

async function sidecar(buffer: ArrayBuffer): Promise<DemoCheckpointSidecar> {
  const checkpoint = {
    cursor: { moveTicks: 1000 },
    simulation: { state: { entities: new Map() }, shared: new Map() },
    parser: { ghosts: new Map() },
  };
  return {
    format: "t2-mapper-seek-checkpoints",
    version: DEMO_CHECKPOINT_VERSION,
    demoBytes: buffer.byteLength,
    demoSha256: await demoSha256(buffer),
    checkpoints: [
      {
        tick: 1000,
        matchStartSec: 92,
        description: "Match started",
        data: bytesToBase64(gzipSync(encodeCheckpoint(checkpoint))),
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
      readDemoCheckpoints(JSON.stringify({ ...original, version: 0 }), buffer),
    ).rejects.toThrow("version");
    original.checkpoints[0].tick = 1001;
    await expect(
      readDemoCheckpoints(JSON.stringify(original), buffer),
    ).rejects.toThrow("match-start");
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
});
