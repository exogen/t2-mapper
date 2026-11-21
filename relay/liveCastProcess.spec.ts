import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLiveCastFeedFactory } from "./liveCastProcess";
import type { LiveCastPlanBatch } from "./liveCastTypes";
import {
  command,
  netString,
  serverPacket,
  watchRelaySource,
} from "./serverPacketFixtures";

vi.mock("node:child_process", { spy: true });

beforeEach(() => {
  vi.spyOn(process, "availableMemory").mockReturnValue(4 * 1024 ** 3);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("reserves free memory for the relay and for workers that are starting", async () => {
  vi.mocked(process.availableMemory).mockReturnValue(600 * 1024 ** 2);
  const create = createLiveCastFeedFactory(process.cwd(), 0);
  const publish = vi.fn();
  const failure = vi.fn();
  expect(create(publish, failure)).toBeUndefined();
  expect(create.getMetrics().activeWorkers).toBe(0);
  expect(failure).not.toHaveBeenCalled();

  vi.mocked(process.availableMemory).mockReturnValue(1024 ** 3);
  const feed = create(publish, failure)!;
  try {
    expect(create.getMetrics().activeWorkers).toBe(1);
    expect(create(publish, failure)).toBeUndefined();
  } finally {
    await feed.close();
  }
  await create(publish, failure)!.close();
  expect(create.getMetrics().activeWorkers).toBe(0);
});

it("reports live worker resource usage and tick progress across gaps", async () => {
  const create = createLiveCastFeedFactory(process.cwd(), 0);
  const feed = create(
    () => {},
    () => {},
  )!;
  try {
    expect(create.getMetrics()).toEqual({
      activeWorkers: 1,
      workers: [],
    });
    const payload = watchRelaySource().payload();
    payload.ghostingComplete = true;
    payload.hudState.gameClassName = "CTFGame";
    const identity = { gameId: "test-game", epoch: payload.epoch };
    feed.hydrate(payload, 10, identity.gameId);
    feed.tick({ ...identity, tick: 42, packets: [] });
    expect(create.getMetrics().workers).toEqual([
      {
        ...identity,
        cpuPercent: null,
        rssBytes: null,
        sampledAtMs: null,
        sourceTick: 42,
        processedThroughTick: null,
        plannedThroughTick: null,
        pendingTicks: 1,
      },
    ]);

    await vi.waitFor(
      () =>
        expect(create.getMetrics().workers[0]?.processedThroughTick).toBe(42),
      { timeout: 5_000 },
    );
    const sample = create.getMetrics().workers[0];
    expect(sample).toMatchObject({
      ...identity,
      cpuPercent: expect.any(Number),
      rssBytes: expect.any(Number),
      sampledAtMs: expect.any(Number),
      sourceTick: 42,
      processedThroughTick: 42,
      pendingTicks: 0,
    });
    expect(sample.rssBytes).toBeGreaterThan(0);
    expect(sample.cpuPercent).toBeGreaterThanOrEqual(0);
    expect(sample.plannedThroughTick).toBeGreaterThanOrEqual(10);
    expect(sample.plannedThroughTick).toBeLessThanOrEqual(42);

    feed.tick({ ...identity, tick: 43, packets: [] });
    await vi.waitFor(
      () =>
        expect(create.getMetrics().workers[0]?.processedThroughTick).toBe(43),
      { timeout: 5_000 },
    );
    expect(create.getMetrics().workers[0].sampledAtMs).toBe(sample.sampledAtMs);

    // Tick 43 does not need a snapshot until the next input skips over the
    // planner's tick 56 decision. The worker then needs the old picture.
    feed.tick({ ...identity, tick: 60, packets: [] });
    await vi.waitFor(
      () =>
        expect(create.getMetrics().workers[0]).toMatchObject({
          processedThroughTick: 60,
          plannedThroughTick: 56,
        }),
      { timeout: 5_000 },
    );
  } finally {
    await feed.close();
  }
  expect(create.getMetrics()).toEqual({
    activeWorkers: 0,
    workers: [],
  });
}, 15_000);

it("starts concurrent workers and drains actual IPC under node --watch", async () => {
  vi.stubEnv("WATCH_REPORT_DEPENDENCIES", "1");
  const create = createLiveCastFeedFactory(process.cwd(), 0);
  const plans: LiveCastPlanBatch[] = [];
  const failure = vi.fn();
  const feed = create((plan) => plans.push(plan), failure)!;
  const others = [create(() => {}, failure)!, create(() => {}, failure)!];
  try {
    expect(create.getMetrics().activeWorkers).toBe(3);
  } finally {
    await Promise.all(others.map((other) => other.close()));
  }
  expect(create.getMetrics().activeWorkers).toBe(1);
  const source = watchRelaySource();
  const missionEndTag = 1;
  source.send((seq) => netString(seq, missionEndTag, "MissionEnd"));
  const payload = source.payload();
  payload.ghostingComplete = true;
  payload.hudState.gameClassName = "CTFGame";
  payload.hudState.matchStarted = true;
  const gameId = "test-game";
  payload.hudState.matchPhase = { kind: "running", startSec: -120 };
  feed.hydrate(payload, 10, gameId);
  expect(() => feed.hydrate(payload, 10, gameId)).toThrow("already hydrated");
  const endPacket = source.send((seq) => command(seq, missionEndTag));
  feed.tick({
    gameId: "previous-game",
    epoch: payload.epoch,
    tick: 15,
    packets: [endPacket],
  });
  feed.tick({ gameId, epoch: payload.epoch, tick: 20, packets: [endPacket] });
  feed.tick({ gameId, epoch: payload.epoch, tick: 25, packets: [] });
  await feed.close();
  expect(plans.at(-1)).toMatchObject({
    gameId,
    epoch: payload.epoch,
    plannedThroughTick: 20,
    ended: true,
  });
  expect(failure).not.toHaveBeenCalled();
  expect(create.getMetrics().activeWorkers).toBe(0);
}, 15_000);

it("reports a worker failure out of band and stops tracking the worker", async () => {
  const create = createLiveCastFeedFactory(process.cwd(), 0);
  const publish = vi.fn();
  const failure = vi.fn();
  const feed = create(publish, failure)!;
  const payload = watchRelaySource().payload();
  const gameId = "test-game";
  feed.hydrate(payload, 10, gameId);
  feed.tick({
    gameId,
    epoch: payload.epoch,
    tick: 11,
    packets: [serverPacket(1, { camera: true })],
  });
  await feed.close();
  expect(failure).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
  expect(publish.mock.calls.flat().some((plan) => plan.ended)).toBe(false);
  expect(create.getMetrics().activeWorkers).toBe(0);
}, 15_000);

it("terminates a stalled worker and stops tracking it", async () => {
  vi.useFakeTimers();
  const child = Object.assign(new EventEmitter(), {
    pid: 1,
    connected: true,
    send: vi.fn(),
    disconnect: vi.fn(),
    kill: vi.fn(),
  });
  vi.mocked(fork).mockReturnValueOnce(
    child as unknown as ReturnType<typeof fork>,
  );
  const create = createLiveCastFeedFactory(process.cwd(), 0);
  const failure = vi.fn();
  const feed = create(vi.fn(), failure)!;
  feed.hydrate(watchRelaySource().payload(), 10, "test-game");
  expect(child.send).toHaveBeenCalledOnce();
  vi.advanceTimersByTime(29_999);
  expect(failure).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(failure).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      message: expect.stringContaining("acknowledge hydrate"),
    }),
  );
  expect(child.kill).toHaveBeenCalledOnce();
  child.emit("exit", null, "SIGTERM");
  await feed.close();
  expect(create.getMetrics().activeWorkers).toBe(0);
});
