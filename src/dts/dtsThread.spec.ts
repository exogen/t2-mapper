import { describe, expect, it } from "vitest";
import { buildDTS } from "./dtsBuilder";
import { DTSAnimationMixer } from "./dtsAnimationMixer";
import { createDTSSequence, createDTSTestShape } from "./dtsTestFixtures";
import { DTSSequenceFlags } from "./dtsTypes";
import {
  applyDtsThreadState,
  createDtsThread,
  destroyDtsThread,
  dtsThreadPosition,
  resetDtsThread,
  scrubDtsThread,
} from "./dtsThread";

function fixture(cyclic = false) {
  const data = createDTSTestShape();
  data.objectStates.push(
    { visibility: 0.2, frame: 0, materialFrame: 0 },
    { visibility: 0.8, frame: 2, materialFrame: 0 },
  );
  data.sequences = [
    createDTSSequence({
      numKeyframes: 2,
      baseObjectState: 1,
      visibilityMatters: [0],
      frameMatters: [0],
      flags: cyclic ? DTSSequenceFlags.Cyclic : 0,
    }),
  ];
  const model = buildDTS(data),
    mixer = new DTSAnimationMixer(model.scene);
  const action = mixer.clipAction(model.animations[0]);
  return {
    mixer,
    action,
    thread: createDtsThread(action, cyclic),
    object: model.scene.getShapeObject(0)!,
  };
}

describe("native DTS threads", () => {
  it("scrubs visibility and mesh frames together through native tracks", () => {
    const { mixer, action, thread, object } = fixture();
    scrubDtsThread(thread, 0.5);
    mixer.update(0);
    expect(action.paused).toBe(true);
    expect(action.time).toBeCloseTo(0.5);
    expect(object.opacity).toBeCloseTo(0.5);
    expect(object.frame).toBe(2);
    scrubDtsThread(thread, 1);
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.8);
  });
  it("wraps in either direction and clamps one-shots including negative elapsed time", () => {
    expect(dtsThreadPosition(fixture(true).thread, 1.25)).toBeCloseTo(0.25);
    expect(dtsThreadPosition(fixture(true).thread, 1.25, false)).toBeCloseTo(
      0.75,
    );
    expect(dtsThreadPosition(fixture(true).thread, -0.25)).toBeCloseTo(0.75);
    expect(dtsThreadPosition(fixture().thread, 1.25)).toBe(1);
    expect(dtsThreadPosition(fixture().thread, 1.25, false)).toBe(0);
    expect(dtsThreadPosition(fixture().thread, 0.25, false)).toBeCloseTo(0.75);
    expect(dtsThreadPosition(fixture().thread, -1)).toBe(0);
    expect(dtsThreadPosition(fixture().thread, -1, false)).toBe(1);
    const thread = fixture().thread;
    thread.duration = 0;
    expect(dtsThreadPosition(thread, 1)).toBe(0);
  });
  it("distinguishes a stopped thread's first key from a deleted thread's default state", () => {
    const { mixer, action, thread, object } = fixture();
    scrubDtsThread(thread, 0.5);
    mixer.update(0);
    resetDtsThread(thread);
    mixer.update(0);
    expect(action.isScheduled()).toBe(true);
    expect(object.opacity).toBeCloseTo(0.2);
    destroyDtsThread(thread);
    mixer.update(0);
    expect(action.isScheduled()).toBe(false);
    expect(object.opacity).toBe(1);
    scrubDtsThread(thread, 0);
    mixer.update(0);
    expect(object.opacity).toBeCloseTo(0.2);
  });
  it("pauses, reverses from the current position, and resumes from either endpoint", () => {
    const { mixer, action, object } = fixture();
    const play = { state: 0, forward: true, atEnd: false } as const;
    applyDtsThreadState(action, play, false);
    mixer.update(0.4);
    expect(action.time).toBeCloseTo(0.4);
    applyDtsThreadState(action, { ...play, state: 2 }, false);
    mixer.update(0.2);
    expect(action.time).toBeCloseTo(0.4);
    expect(object.opacity).toBeCloseTo(0.44);
    applyDtsThreadState(action, { ...play, forward: false }, false);
    mixer.update(0.1);
    expect(action.time).toBeCloseTo(0.3);
    applyDtsThreadState(action, { ...play, atEnd: true }, false);
    mixer.update(0.3);
    expect(action.time).toBe(1);
    expect(object.opacity).toBeCloseTo(0.8);
    applyDtsThreadState(action, { ...play, forward: false }, false);
    mixer.update(0.2);
    expect(action.time).toBeCloseTo(0.8);
    applyDtsThreadState(action, { ...play, state: 1 }, false);
    mixer.update(0.3);
    expect(action.time).toBe(0);
    expect(object.opacity).toBeCloseTo(0.2);
    applyDtsThreadState(action, play, false);
    mixer.update(0.2);
    expect(action.time).toBeCloseTo(0.2);
  });
});
