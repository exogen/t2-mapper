import { expect, it } from "vitest";
import { FrameScheduler, type FrameContext } from "./frameScheduler";
import { FramePriority } from "./framePriority";

const frame = {} as FrameContext;

it("runs stages lowest first, and a stage's callbacks in the order added", () => {
  const scheduler = new FrameScheduler();
  const order: string[] = [];
  scheduler.add(FramePriority.PostCamera, () => order.push("labels"));
  scheduler.add(FramePriority.StreamPlayback, () => order.push("playback"));
  scheduler.add(FramePriority.CameraSelect, () => order.push("select 1"));
  scheduler.add(FramePriority.CameraSelect, () => order.push("select 2"));
  scheduler.runAll(frame);
  expect(order).toEqual(["playback", "select 1", "select 2", "labels"]);
});

it("skips a callback removed earlier in the same pass", () => {
  const scheduler = new FrameScheduler();
  const order: string[] = [];
  let removeSecond = () => {};
  scheduler.add(FramePriority.PostCamera, () => {
    order.push("first");
    removeSecond();
  });
  removeSecond = scheduler.add(FramePriority.PostCamera, () =>
    order.push("second"),
  );
  scheduler.runAll(frame);
  scheduler.runAll(frame);
  expect(order).toEqual(["first", "first"]);
});

it("starts a callback added during a stage with its next run", () => {
  const scheduler = new FrameScheduler();
  const order: string[] = [];
  let added = false;
  scheduler.add(FramePriority.PostCamera, () => {
    order.push("first");
    if (added) return;
    added = true;
    scheduler.add(FramePriority.PostCamera, () => order.push("added"));
  });
  scheduler.runAll(frame);
  scheduler.runAll(frame);
  expect(order).toEqual(["first", "first", "added"]);
});
