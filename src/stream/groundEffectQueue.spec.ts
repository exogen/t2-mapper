import { expect, it } from "vitest";
import { GroundEffectQueue } from "./groundEffectQueue";

const frame = (timeSec: number) => ({ timeSec, gravity: -9.81, actors: [] });

it.each(["clear", "replace"] as const)(
  "stops an old consumption pass when its callback synchronously performs %s",
  (change) => {
    const queue = new GroundEffectQueue();
    const old = queue.connect();
    [1, 2].forEach((timeSec) => queue.append(frame(timeSec)));
    const consumed: number[] = [];
    queue.consumeThrough(-Infinity, 10, (value) => {
      consumed.push(value.timeSec);
      if (value.timeSec !== 1) return;
      if (change === "replace") queue.connect();
      else queue.clear();
      queue.append(frame(3));
    });
    expect(consumed).toEqual([1]);
    expect(queue.oldestTimeSec).toBe(3);
    expect(queue.getMetrics().groundEffectPendingFrames).toBe(1);
    if (change === "replace") {
      old.dispose();
      expect(queue.capturing).toBe(true);
    }
    const next: number[] = [];
    queue.consumeThrough(-Infinity, 10, (value) => next.push(value.timeSec));
    expect(next).toEqual([3]);
  },
);

it("consumes elapsed ticks once and preserves the future interpolation endpoint", () => {
  const queue = new GroundEffectQueue();
  [1, 2, 3].forEach((t) => queue.append(frame(t)));
  const times: number[] = [];
  queue.consumeThrough(-Infinity, 2, (f) => times.push(f.timeSec));
  queue.consumeThrough(-Infinity, 2, (f) => times.push(f.timeSec));
  expect(times).toEqual([1, 2]);
  expect(queue.oldestTimeSec).toBe(3);
  expect(queue.getMetrics().groundEffectPendingFrames).toBe(1);
  queue.consumeThrough(2, 3, (f) => times.push(f.timeSec));
  expect(times).toEqual([1, 2, 3]);
  expect(queue.oldestTimeSec).toBe(Infinity);
  expect(queue.getMetrics().groundEffectPendingFrames).toBe(0);
});

it("bounds pending ticks and signals an overflow discontinuity", () => {
  const queue = new GroundEffectQueue(3);
  for (let t = 1; t <= 20; t++) queue.append(frame(t));
  expect(queue.getMetrics()).toMatchObject({
    groundEffectPendingFrames: 3,
    groundEffectDroppedFrames: 17,
  });
  expect(queue.generation).toBe(17);
  const times: number[] = [];
  queue.consumeThrough(-Infinity, Infinity, (f) => times.push(f.timeSec));
  expect(times).toEqual([18, 19, 20]);
  expect(queue.getMetrics().groundEffectPendingActors).toBe(0);
});

it("clears queued inputs without retaining them for replay", () => {
  const queue = new GroundEffectQueue();
  queue.append(frame(1));
  queue.clear();
  expect(queue.oldestTimeSec).toBe(Infinity);
  queue.append(frame(2));
  queue.discardThrough(2);
  expect(queue.getMetrics().groundEffectPendingFrames).toBe(0);
});

it("lets the current view capture ticks without stale view cleanup stealing ownership", () => {
  const queue = new GroundEffectQueue();
  expect(queue.capturing).toBe(false);
  const old = queue.connect();
  expect(queue.capturing).toBe(true);
  const current = queue.connect();
  expect(old.isCurrent()).toBe(false);
  queue.append(frame(1));
  old.setCapturing(false);
  old.dispose();
  expect(queue.capturing).toBe(true);
  expect(queue.oldestTimeSec).toBe(1);
  current.setCapturing(false);
  expect(queue.capturing).toBe(false);
  expect(queue.oldestTimeSec).toBe(Infinity);
  current.setCapturing(true);
  queue.append(frame(2));
  current.dispose();
  expect(queue.capturing).toBe(false);
  expect(queue.oldestTimeSec).toBe(Infinity);
});
