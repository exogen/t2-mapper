import { describe, expect, it } from "vitest";
import { buildDTS } from "../dts/dtsBuilder";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { holdDtsAction, applyDtsThreadState } from "../dts/dtsThread";
import { createDTSSequence, createDTSTestShape } from "../dts/dtsTestFixtures";
import { updateShapeThread, shapeThreadTime } from "./shapeThreads";
import type { ThreadState } from "./types";

const playing: ThreadState = {
  index: 0,
  sequence: 0,
  state: 0,
  forward: true,
  atEnd: false,
};
describe("recorded ShapeBase threads", () => {
  it("seats a late-loaded deploy at its completed pose without needing assets when packets arrive", () => {
    const state = updateShapeThread(undefined, playing, 10);
    const data = createDTSTestShape();
    data.objectStates.push(
      { visibility: 0, frame: 0, materialFrame: 0 },
      { visibility: 0.8, frame: 0, materialFrame: 0 },
    );
    data.sequences = [
      createDTSSequence({
        duration: 4,
        numKeyframes: 2,
        baseObjectState: 1,
        visibilityMatters: [0],
      }),
    ];
    const { scene, animations } = buildDTS(data);
    const mixer = new DTSAnimationMixer(scene),
      action = mixer.clipAction(animations[0]);
    for (const time of [100, 12, 100, 11]) {
      holdDtsAction(action, shapeThreadTime(state, time, 4, false) / 4);
      mixer.update(0);
      expect(scene.getShapeObject(0)!.opacity).toBeCloseTo(
        Math.min(1, (time - 10) / 4) * 0.8,
      );
    }
  });

  it("matches sequential native actions through pauses, reversals, stops and endpoints", () => {
    const events: [number, Partial<ThreadState>][] = [
      [0, {}],
      [0.4, { state: 2 }],
      [1, { state: 0, forward: false }],
      [1.2, { forward: true }],
      [3, { state: 2 }],
      [4, { state: 0, forward: false }],
      [4.3, { state: 1 }],
      [5, { state: 0, forward: true }],
      [5.2, { atEnd: true }],
      [6, { atEnd: false, forward: false }],
    ];
    const model = buildDTS({
      ...createDTSTestShape(),
      sequences: [createDTSSequence({ duration: 1 })],
    });
    const mixer = new DTSAnimationMixer(model.scene),
      action = mixer.clipAction(model.animations[0]);
    let state: ThreadState | undefined,
      at = 0;
    for (const [time, change] of events) {
      mixer.update(time - at);
      state = updateShapeThread(
        state,
        { ...(state ?? playing), ...change },
        time,
      );
      applyDtsThreadState(action, state, false);
      mixer.update(0);
      expect(shapeThreadTime(state, time, 1, false)).toBeCloseTo(action.time);
      at = time;
    }
    mixer.update(0.2);
    expect(shapeThreadTime(state!, 6.2, 1, false)).toBeCloseTo(action.time);
  });

  it("preserves cyclic phase across pauses, wraps backwards, and ignores repeated packets", () => {
    let s = updateShapeThread(undefined, playing, 1);
    expect(updateShapeThread(s, playing, 3)).toBe(s);
    s = updateShapeThread(s, { ...playing, state: 2 }, 3.25);
    expect(shapeThreadTime(s, 100, 1, true)).toBeCloseTo(0.25);
    s = updateShapeThread(s, { ...playing, forward: false }, 101);
    expect(shapeThreadTime(s, 101.5, 1, true)).toBeCloseTo(0.75);
    s = updateShapeThread(s, { ...playing, sequence: 1, forward: false }, 102);
    // setThreadSequence starts at zero regardless of direction.
    expect(shapeThreadTime(s, 102, 1, true)).toBe(0);
    expect(shapeThreadTime(s, 102.25, 1, true)).toBeCloseTo(0.75);
  });
});
