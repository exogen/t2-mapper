import { expect, it, vi } from "vitest";
import {
  GroundEffectQueue,
  type GroundEffectFrame,
} from "../stream/groundEffectQueue";
import { GroundEffectPlayback } from "./groundEffectPlayback";

function consumer() {
  const simulation = {
    timeSec: -Infinity,
    inputs: [] as Array<{ timeSec: number; delta: number }>,
    clear: vi.fn(),
    step: vi.fn<(frame: GroundEffectFrame) => void>(),
  };
  simulation.clear.mockImplementation((timeSec = -Infinity) => {
    simulation.timeSec = timeSec;
    simulation.inputs = [];
  });
  simulation.step.mockImplementation((frame) => {
    simulation.inputs.push({
      timeSec: frame.timeSec,
      delta: Number.isFinite(simulation.timeSec)
        ? frame.timeSec - simulation.timeSec
        : 0,
    });
    simulation.timeSec = frame.timeSec;
  });
  return simulation;
}

function fixture(capacity = 256) {
  const queue = new GroundEffectQueue(capacity);
  const simulation = consumer();
  const reset = vi.fn();
  const playback = new GroundEffectPlayback(queue, simulation, reset);
  const terrain = {};
  playback.update(0, 0, terrain);
  const append = (timeSec: number) => {
    // The simulation producer only allocates inputs for an attached consumer.
    if (queue.capturing) queue.append({ timeSec, gravity: -9.81, actors: [] });
  };
  return { queue, simulation, reset, playback, terrain, append };
}

it("releases live effects immediately when capture is suspended without another render frame", () => {
  const queue = new GroundEffectQueue();
  const simulation = consumer();
  const reset = vi.fn();
  const playback = new GroundEffectPlayback(queue, simulation, reset);
  // Initial transport synchronization must not pretend a renderer was reset.
  playback.setCaptureSuspended(false);
  expect(simulation.clear).not.toHaveBeenCalled();
  expect(reset).not.toHaveBeenCalled();
  const terrain = {};
  playback.update(0, 0, terrain);
  queue.append({ timeSec: 0.032, gravity: -9.81, actors: [] });
  playback.update(0.032, 0, terrain);
  queue.append({ timeSec: 0.064, gravity: -9.81, actors: [] });
  expect(simulation.inputs).toHaveLength(1);
  const clears = simulation.clear.mock.calls.length;
  const resets = reset.mock.calls.length;

  // A hidden tab may receive no more rAF callbacks, so update cannot own this.
  playback.setCaptureSuspended(true);
  expect(queue.capturing).toBe(false);
  expect(queue.getMetrics().groundEffectPendingFrames).toBe(0);
  expect(simulation.inputs).toEqual([]);
  expect(simulation.clear).toHaveBeenCalledTimes(clears + 1);
  expect(reset).toHaveBeenCalledTimes(resets + 1);
  playback.dispose();
});

it("consumes batched forward ticks identically to individual updates, including empty actor ticks", () => {
  const batched = fixture(),
    individual = fixture();
  for (let tick = 1; tick <= 125; tick++) {
    const timeSec = tick * 0.032;
    batched.append(timeSec);
    individual.append(timeSec);
    expect(individual.playback.update(timeSec, 0, individual.terrain)).toBe(
      false,
    );
  }
  expect(batched.playback.update(4, 0, batched.terrain)).toBe(false);
  expect(batched.simulation.inputs).toEqual(individual.simulation.inputs);
  expect(batched.simulation.inputs).toHaveLength(125);
  expect(batched.queue.getMetrics().groundEffectPendingFrames).toBe(0);
  batched.playback.dispose();
  individual.playback.dispose();
});

it("retains future interpolation ticks and never replays a paused drain", () => {
  const f = fixture();
  [0.032, 0.064, 0.096].forEach(f.append);
  f.playback.update(0.05, 0, f.terrain);
  expect(f.simulation.inputs.map((frame) => frame.timeSec)).toEqual([0.032]);
  expect(f.queue.getMetrics().groundEffectPendingFrames).toBe(2);
  f.playback.update(0.05, 0, f.terrain);
  expect(f.simulation.step).toHaveBeenCalledTimes(1);
  f.playback.update(0.096, 0, f.terrain);
  expect(f.simulation.inputs.map((frame) => frame.timeSec)).toEqual([
    0.032, 0.064, 0.096,
  ]);
  f.playback.dispose();
});

it("disables capture synchronously throughout sliced seeks and starts with fresh post-seek inputs", () => {
  const f = fixture();
  f.append(0.032);
  f.playback.setCaptureSuspended(true);
  expect(f.queue.capturing).toBe(false);
  for (let tick = 2; tick < 10000; tick++) f.append(tick * 0.032);
  expect(f.queue.getMetrics().groundEffectPendingFrames).toBe(0);
  expect(f.playback.update(200, 1, f.terrain)).toBe(true);
  expect(f.simulation.step).not.toHaveBeenCalled();
  f.playback.setCaptureSuspended(false);
  f.append(200.032);
  f.playback.update(200.02, 1, f.terrain);
  expect(f.queue.getMetrics().groundEffectPendingFrames).toBe(1);
  f.playback.update(200.032, 1, f.terrain);
  expect(f.simulation.inputs).toEqual([
    { timeSec: 200.032, delta: expect.closeTo(0.012) },
  ]);
  f.playback.dispose();
});

it("discards elapsed reconstruction on forward seek nonce changes while retaining the future endpoint", () => {
  const f = fixture();
  f.append(0.032);
  f.playback.update(0.032, 0, f.terrain);
  [2, 50, 50.032].forEach(f.append);
  expect(f.playback.update(50, 1, f.terrain)).toBe(true);
  expect(f.simulation.inputs).toEqual([]);
  expect(f.queue.getMetrics().groundEffectPendingFrames).toBe(1);
  f.playback.update(50.032, 1, f.terrain);
  expect(f.simulation.inputs).toEqual([
    { timeSec: 50.032, delta: expect.closeTo(0.032) },
  ]);
  expect(f.playback.update(10, 1, f.terrain)).toBe(true);
  expect(f.simulation.inputs).toEqual([]);
  f.playback.dispose();
});

it("resets emission origins after overflow instead of spanning discarded ticks", () => {
  const f = fixture(2);
  f.append(0.032);
  f.playback.update(0.032, 0, f.terrain);
  [0.064, 0.096, 0.128].forEach(f.append);
  expect(f.playback.update(0.096, 0, f.terrain)).toBe(true);
  expect(f.simulation.inputs).toEqual([]);
  expect(f.queue.getMetrics().groundEffectDroppedFrames).toBe(1);
  f.playback.update(0.128, 0, f.terrain);
  expect(f.simulation.inputs).toEqual([
    { timeSec: 0.128, delta: expect.closeTo(0.032) },
  ]);
  f.playback.dispose();
});

it("does not retain terrain-less ticks and resets on terrain replacement without late-asset inputs", () => {
  const f = fixture();
  f.playback.update(1, 0, null);
  for (let tick = 0; tick < 10000; tick++) f.append(tick * 0.032);
  expect(f.queue.capturing).toBe(false);
  expect(f.queue.getMetrics().groundEffectPendingFrames).toBe(0);
  f.playback.update(320, 0, f.terrain);
  expect(f.queue.capturing).toBe(true);
  f.append(320.032);
  expect(f.playback.update(320.032, 0, f.terrain)).toBe(false);
  expect(f.simulation.inputs).toHaveLength(1);
  const resets = f.reset.mock.calls.length;
  // DTS asset availability is not a reset input: live effects keep their tails.
  expect(f.playback.update(320.032, 0, f.terrain)).toBe(false);
  expect(f.reset).toHaveBeenCalledTimes(resets);
  expect(f.playback.update(320.032, 0, {})).toBe(true);
  expect(f.simulation.inputs).toEqual([]);
  f.playback.dispose();
});

it("prevents replaced or disposed owners from consuming or disabling their successor's queue", () => {
  const first = fixture();
  const nextSimulation = consumer();
  const next = new GroundEffectPlayback(first.queue, nextSimulation, vi.fn());
  next.update(0, 0, first.terrain);
  first.append(0.032);
  first.playback.setCaptureSuspended(true);
  expect(first.playback.update(1, 0, first.terrain)).toBe(false);
  first.playback.dispose();
  expect(first.queue.capturing).toBe(true);
  expect(first.queue.getMetrics().groundEffectPendingFrames).toBe(1);
  next.update(0.032, 0, first.terrain);
  expect(nextSimulation.inputs).toEqual([
    { timeSec: 0.032, delta: expect.closeTo(0.032) },
  ]);
  next.dispose();
  expect(first.queue.capturing).toBe(false);
  expect(first.queue.getMetrics().groundEffectPendingFrames).toBe(0);
  expect(next.update(1, 0, first.terrain)).toBe(false);
});

it("does not consume a successor installed synchronously by renderer reset cleanup", () => {
  const queue = new GroundEffectQueue();
  const simulation = consumer();
  const nextSimulation = consumer();
  const terrain = {};
  let replace = false;
  let next: GroundEffectPlayback | undefined;
  const first = new GroundEffectPlayback(queue, simulation, () => {
    if (!replace) return;
    next = new GroundEffectPlayback(queue, nextSimulation, vi.fn());
    next.update(1, 0, terrain);
    queue.append({ timeSec: 1.032, gravity: -9.81, actors: [] });
  });
  first.update(0, 0, terrain);
  replace = true;
  queue.clear();
  expect(first.update(2, 0, terrain)).toBe(true);
  expect(queue.getMetrics().groundEffectPendingFrames).toBe(1);
  expect(simulation.step).not.toHaveBeenCalled();
  first.dispose();
  next!.update(1.032, 0, terrain);
  expect(nextSimulation.inputs).toEqual([
    { timeSec: 1.032, delta: expect.closeTo(0.032) },
  ]);
  next!.dispose();
});
