import { expect, it } from "vitest";
import { TickClock } from "./tickClock";
import { GameEngine } from "./gameEngine";
import { FramePriority } from "./framePriority";
import type { FrameContext } from "./frameScheduler";
import { STREAM_TICK_SEC } from "../stream/streamHelpers";

it("fires one callback per whole tick and carries the remainder", () => {
  const clock = new TickClock();
  const ticks: number[] = [];
  clock.subscribe((tick) => ticks.push(tick));
  clock.advance(STREAM_TICK_SEC * 0.5);
  expect(ticks).toEqual([]);
  expect(clock.fraction).toBeCloseTo(0.5);
  clock.advance(STREAM_TICK_SEC * 2);
  expect(ticks).toEqual([1, 2]);
  expect(clock.current).toBe(2);
  expect(clock.fraction).toBeCloseTo(0.5);
});

it("stops calling a callback once unsubscribed", () => {
  const clock = new TickClock();
  const ticks: number[] = [];
  const unsubscribe = clock.subscribe((tick) => ticks.push(tick));
  clock.advance(STREAM_TICK_SEC);
  unsubscribe();
  clock.advance(STREAM_TICK_SEC);
  expect(ticks).toEqual([1]);
});

it("ticks in the Tick stage, after the input drain and before the live pose", () => {
  const engine = new GameEngine();
  const order: string[] = [];
  engine.ticks.subscribe(() => order.push("tick"));
  engine.scheduler.add(FramePriority.CameraLive, () => order.push("live"));
  engine.scheduler.add(FramePriority.CameraInput, () => order.push("drain"));
  const frame = engine.beginFrame({
    delta: STREAM_TICK_SEC,
    elapsed: 0,
  } as Omit<FrameContext, "frame">);
  engine.scheduler.runAll(frame);
  expect(order).toEqual(["drain", "tick", "live"]);
});
