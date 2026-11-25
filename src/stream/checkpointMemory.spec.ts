import { describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { BlockTypeInfo } from "t2-demo-parser";
import {
  DemoStreamAdapter,
  type DemoSeekCheckpoint,
  type DemoStreamingOptions,
} from "./demoStreaming";
import type { DemoCheckpointRepository } from "./demoCheckpointRepository";
import { emptyGroundEffectState } from "./groundEffectCheckpoint";
import { fakeDemoParser, moveBlock } from "./streamTestFixtures";
import { streamTimeToTick } from "./streamHelpers";
import { PlaybackClock } from "./PlaybackClock";
import { bytesToBase64, encodeCheckpoint } from "./checkpointCodec";
import {
  DEMO_CHECKPOINT_VERSION,
  readDemoCheckpointIndex,
} from "./demoCheckpoints";
import {
  browserCheckpointMemoryPolicy,
  retainedSessionCheckpointTicks,
} from "./checkpointMemoryPolicy";
import { installDiagnosticEventSink } from "../diagnostics/events";

const blocks = Array.from({ length: 12_100 }, (_, i) => [
  ...(i % 500 === 0
    ? [
        {
          type: BlockTypeInfo,
          parsed: { firstPerson: true, cameraFov: 60 + (i % 30) },
        },
      ]
    : []),
  moveBlock(),
]).flat();
const atTick = (tick: number) => tick * 0.032 + 1e-9;
function stream(options: DemoStreamingOptions = {}, onRestore?: () => void) {
  const playback = new DemoStreamAdapter(
    fakeDemoParser({
      blocks,
      decompressedByteLength: blocks.length + 1,
      initialBlock: {
        controlObjectData: { cameraMode: 0, position: { x: 1, y: 2, z: 3 } },
      },
      onRestore,
    }),
    options,
  );
  playback.setPlayerPredictionEnabled(true);
  return playback;
}

function finishSeek(
  clock: PlaybackClock,
  playback: DemoStreamAdapter,
  transport: Parameters<PlaybackClock["step"]>[1],
) {
  // After the anchor is ready, even the smallest replay slice advances a tick.
  const targetTick = streamTimeToTick(transport.seekTime);
  for (let slice = 0; slice <= targetTick; slice++) {
    const frame = clock.step(playback, transport, 0);
    if (frame) return frame;
  }
  throw new Error("Seek did not reach its target");
}

async function index(ticks: number[], legacyGroundEffects = false) {
  const source = stream({ checkpoints: false });
  const buffer = new Uint8Array([1, 2, 3]).buffer;
  const checkpoints = ticks.map((tick) => {
    source.stepToTime(atTick(tick));
    const checkpoint = source.captureCheckpoint();
    if (legacyGroundEffects) {
      checkpoint.simulation.groundEffects = {
        retentionSec: 8,
        frames: [
          {
            timeSec: atTick(tick),
            gravity: -20,
            actors: [
              {
                key: "1:0",
                ghostIndex: 1,
                spawnTick: 0,
                type: "Player",
                className: "Player",
                dataBlockId: 10,
                mounted: false,
                position: [1, 2, 3],
                rotation: [0, 0, 0, 1],
                velocity: [4, 5, 6],
              },
            ],
          },
        ],
      };
    }
    return {
      tick,
      description: "Anchor",
      data: bytesToBase64(gzipSync(encodeCheckpoint(checkpoint))),
    };
  });
  return readDemoCheckpointIndex(
    JSON.stringify({
      format: "t2-mapper-seek-checkpoints",
      version: DEMO_CHECKPOINT_VERSION,
      demoBytes: buffer.byteLength,
      demoSha256: "a".repeat(64),
      checkpoints,
    }),
    { demoBytes: buffer.byteLength },
  );
}

describe("browser checkpoint retention", () => {
  it("seeks through a legacy v24 lazy anchor without retaining or restoring its ground history", async () => {
    const source = await index([2000], true);
    const originalLoad = source.load;
    let decoded: DemoSeekCheckpoint | undefined;
    const load = vi
      .spyOn(source, "load")
      .mockImplementation(async (...args) => {
        decoded = await originalLoad(...args);
        return decoded;
      });
    const playback = stream({ checkpoints: false });
    playback.installCheckpointIndex(source);
    playback.stepToTime(atTick(2500));
    await playback.checkpointWait;
    const repository = (
      playback as unknown as { checkpointRepository: DemoCheckpointRepository }
    ).checkpointRepository;
    const retained = repository.getImported(2000)!.checkpoint;
    expect(retained).toBe(repository.get(2000));
    expect(retained.simulation.groundEffects).toBe(emptyGroundEffectState);
    expect(retained.simulation.state).toBe(decoded!.simulation.state);
    expect(decoded!.simulation.groundEffects.frames[0].actors).toHaveLength(1);
    for (const tick of [2500, 100, 2500]) {
      const actual = playback.stepToTime(atTick(tick));
      const expected = stream({ checkpoints: false }).stepToTime(atTick(tick));
      expect(actual.timeSec).toBe(expected.timeSec);
      expect(actual.camera).toEqual(expected.camera);
      expect(playback.captureCheckpoint().simulation.groundEffects).toEqual({
        frames: [],
        retentionSec: 8,
      });
    }
    expect(load).toHaveBeenCalledOnce();
    expect(source.ticks).toEqual([2000]);
    expect(playback.getDiagnosticMetrics()).toMatchObject({
      groundEffectPendingFrames: 0,
      groundEffectPendingActors: 0,
      groundEffectQueueLimit: expect.any(Number),
    });
  });
  it.each([false, true])(
    "aborts discarded lazy work without stale events (decode started: %s)",
    async (started) => {
      const source = await index([2000]);
      let signal: AbortSignal | undefined;
      const load = vi
        .spyOn(source, "load")
        .mockImplementation((_tick, pendingSignal) => {
          signal = pendingSignal;
          return new Promise((_resolve, reject) => {
            pendingSignal!.addEventListener(
              "abort",
              () => reject(pendingSignal!.reason),
              { once: true },
            );
          });
        });
      const playback = stream({ checkpoints: false });
      playback.installCheckpointIndex(source);
      const event = vi.fn();
      const stopEvents = installDiagnosticEventSink(event);
      try {
        playback.stepToTime(atTick(2500));
        const wait = playback.checkpointWait;
        if (started) await Promise.resolve();
        event.mockClear();
        playback.disposeCheckpointIndex();
        await wait;
        expect(load).toHaveBeenCalledTimes(started ? 1 : 0);
        if (started) expect(signal?.aborted).toBe(true);
        expect(event).not.toHaveBeenCalled();
        expect(playback.checkpointWait).toBeUndefined();
        expect(playback.getDiagnosticMetrics()).toMatchObject({
          encodedCheckpointEntries: 0,
          uniqueCheckpointEntries: 0,
          checkpointDecodePending: 0,
        });
      } finally {
        stopEvents();
      }
    },
  );
  it("validates imports without cloning the current world and preserves the capture schema", () => {
    const source = stream({ checkpoints: false });
    source.stepToTime(atTick(2000));
    const checkpoint = source.captureCheckpoint();
    const playback = stream({ checkpoints: false });
    playback.stepToTime(atTick(500));
    const clone = vi.spyOn(globalThis, "structuredClone");
    try {
      playback.importCheckpoints([checkpoint]);
      // ConnectionState.save may detach its small load-info metadata. The
      // entity world must never be cloned solely to inspect checkpoint keys.
      expect(
        clone.mock.calls.some(
          ([value]) =>
            value !== null &&
            typeof value === "object" &&
            Object.hasOwn(value, "entities"),
        ),
      ).toBe(false);
      const extra = structuredClone(checkpoint);
      Object.assign(extra.simulation.state, { unknownStateField: true });
      expect(() => playback.importCheckpoints([extra])).toThrow(
        "unexpected state.unknownStateField",
      );
      const missing = structuredClone(checkpoint);
      delete (
        missing.simulation.state as Partial<typeof missing.simulation.state>
      ).tickCount;
      expect(() => playback.importCheckpoints([missing])).toThrow(
        "missing state.tickCount",
      );
    } finally {
      clone.mockRestore();
    }
    expect(checkpoint.simulation.state.tickCount).toBe(2000);
    expect(checkpoint.simulation.state.camera).not.toBe(
      playback.getSnapshot().camera,
    );
    playback.stepToTime(atTick(2500));
    expect(checkpoint.simulation.state.tickCount).toBe(2000);
  });
  it("uses bounded explicit browser budgets and keeps sparse anchors plus recent ticks", () => {
    expect(browserCheckpointMemoryPolicy({ userAgent: "iPhone" })).toEqual({
      sessionEntries: 8,
      importedEntries: 2,
    });
    expect(
      browserCheckpointMemoryPolicy({ mobile: false, hardwareConcurrency: 16 }),
    ).toEqual({ sessionEntries: 24, importedEntries: 4 });
    const keep = retainedSessionCheckpointTicks(
      [1000, 2000, 3000, 4000, 5000],
      4,
    );
    expect([...keep].sort((a, b) => a - b)).toEqual([1000, 3000, 4000, 5000]);
  });

  it("reconstructs both seek directions after session eviction, while offline readers retain all", () => {
    const bounded = stream({
      checkpointMemoryPolicy: { sessionEntries: 4, importedEntries: 1 },
    });
    const offline = stream();
    bounded.stepToTime(atTick(12_005));
    offline.stepToTime(atTick(12_005));
    expect(bounded.checkpointTicks).toHaveLength(4);
    expect(bounded.checkpointTicks).toContain(1000);
    expect(offline.checkpointTicks).toHaveLength(12);
    for (const tick of [2500, 100, 11_500, 4500]) {
      const actual = bounded.stepToTime(atTick(tick));
      const expected = stream({ checkpoints: false }).stepToTime(atTick(tick));
      expect(actual.timeSec).toBe(expected.timeSec);
      expect(actual.camera).toEqual(expected.camera);
      expect(actual.exhausted).toBe(expected.exhausted);
      expect(bounded.checkpointTicks.length).toBeLessThanOrEqual(4);
    }
    expect(bounded.getDiagnosticMetrics().checkpointEvictions).toBeGreaterThan(
      0,
    );
  });

  it("waits for lazy graphs before a clock can acknowledge a seek and evicts both decoded maps", async () => {
    const source = await index([1000, 2000, 3000]);
    const load = vi.spyOn(source, "load");
    const restores = vi.fn();
    const playback = stream(
      {
        checkpoints: false,
        checkpointMemoryPolicy: { sessionEntries: 0, importedEntries: 1 },
      },
      restores,
    );
    playback.installCheckpointIndex(source);
    expect(load).not.toHaveBeenCalled();
    const clock = new PlaybackClock();
    clock.reset(0, 0, playback.getSnapshot());
    let nonce = 0;
    for (const tick of [2500, 1500, 3500, 2500]) {
      const transport = {
        status: "seeking" as const,
        rate: 1,
        seekTime: atTick(tick),
        seekNonce: ++nonce,
      };
      expect(clock.step(playback, transport, 0)).toBeNull();
      expect(playback.canStartSeek).toBe(false);
      expect(playback.seekSceneSnapshot).not.toBeNull();
      const wait = playback.checkpointWait;
      expect(wait).toBeInstanceOf(Promise);
      await wait;
      const frame = finishSeek(clock, playback, transport);
      const expected = stream({ checkpoints: false }).stepToTime(
        atTick(tick + 1),
      );
      expect(frame.snapshot.camera).toEqual(expected.camera);
      expect(frame.snapshot.timeSec).toBe(expected.timeSec);
      const metrics = playback.getDiagnosticMetrics();
      expect(metrics.persistedCheckpointEntries).toBe(1);
      expect(metrics.uniqueCheckpointEntries).toBe(1);
      expect(playback.checkpointTicks).toHaveLength(1);
    }
    expect(load.mock.calls.map(([tick]) => tick)).toEqual([
      2000, 1000, 3000, 2000,
    ]);
    expect(restores).toHaveBeenCalledTimes(4);
    playback.setPlayerPredictionEnabled(false);
    expect(playback.checkpointTicks).toEqual([]);
    playback.setPlayerPredictionEnabled(true);
    expect(playback.checkpointTicks).toEqual([2000]);
  });

  it("does not apply a decoded old target after a seek is superseded", async () => {
    const source = await index([2000]);
    const playback = stream({ checkpoints: false });
    playback.installCheckpointIndex(source);
    const clock = new PlaybackClock();
    clock.reset(0, 0, playback.getSnapshot());
    expect(
      clock.step(
        playback,
        { status: "seeking", rate: 1, seekTime: atTick(2500), seekNonce: 1 },
        0,
      ),
    ).toBeNull();
    await playback.checkpointWait;
    const frame = finishSeek(clock, playback, {
      status: "seeking",
      rate: 1,
      seekTime: atTick(500),
      seekNonce: 2,
    });
    expect(frame.snapshot.timeSec).toBeCloseTo(atTick(501));
    expect(frame.snapshot.camera).toEqual(
      stream({ checkpoints: false }).stepToTime(atTick(501)).camera,
    );
  });

  it("discards a corrupt lazy graph and falls back to ordinary replay", async () => {
    const source = await index([2000]);
    vi.spyOn(source, "load").mockRejectedValue(new Error("Corrupt graph"));
    const playback = stream({ checkpoints: false });
    playback.installCheckpointIndex(source);
    playback.stepToTime(atTick(2500));
    await playback.checkpointWait;
    expect(source.ticks).toEqual([]);
    expect(playback.checkpointWait).toBeUndefined();
    const actual = playback.stepToTime(atTick(2500));
    const expected = stream({ checkpoints: false }).stepToTime(atTick(2500));
    expect(actual.timeSec).toBe(expected.timeSec);
    expect(actual.camera).toEqual(expected.camera);
  });

  it("removes a graph that decodes but fails restoration, so sliced seeks keep progressing", async () => {
    const source = await index([2000]);
    const restores = vi.fn(() => {
      throw new Error("Parser state is unusable");
    });
    const playback = stream({ checkpoints: false }, restores);
    playback.installCheckpointIndex(source);
    const target = atTick(2500);
    playback.stepToTime(target);
    await playback.checkpointWait;
    let actual = playback.stepToTime(target, 100);
    expect(source.ticks).toEqual([]);
    for (let i = 0; i < 30 && actual.timeSec < target - 1e-8; i++)
      actual = playback.stepToTime(target, 100);
    expect(restores).toHaveBeenCalledTimes(1);
    expect(playback.checkpointWait).toBeUndefined();
    expect(actual.timeSec).toBe(
      stream({ checkpoints: false }).stepToTime(target).timeSec,
    );
  });
});
