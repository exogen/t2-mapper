import { describe, expect, it, vi } from "vitest";
import { DTSShape } from "../dts/dtsModel";
import { createDeferredPose } from "./deferredPose";

describe("createDeferredPose", () => {
  it("evaluates every frame in view and about once a tick while dormant", () => {
    const shape = new DTSShape();
    const evaluate = vi.fn();
    const pose = createDeferredPose(shape, evaluate);
    pose.update(0.01, 0.01);
    pose.update(0.01, 0.02);
    expect(evaluate.mock.calls).toEqual([[0.01], [0.02]]);

    evaluate.mockClear();
    shape.dormant = true;
    for (let i = 0; i < 10; i++) pose.update(0.008, 0.008);
    // Two or three evaluations depending on this shape's phase, and no
    // animation time lost or counted twice.
    expect(evaluate.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(evaluate.mock.calls.length).toBeLessThanOrEqual(3);
    shape.catchUpPose!();
    const total = evaluate.mock.calls.reduce((sum, [d]) => sum + d, 0);
    expect(total).toBeCloseTo(0.08);
  });

  it("catches up once when the shape needs its current pose", () => {
    const shape = new DTSShape();
    const evaluate = vi.fn();
    createDeferredPose(shape, evaluate);
    shape.dormant = true;
    shape.catchUpPose!();
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("hands the hook back on dispose", () => {
    const shape = new DTSShape();
    const pose = createDeferredPose(shape, vi.fn());
    expect(shape.catchUpPose).toBeTypeOf("function");
    pose.dispose();
    expect(shape.catchUpPose).toBeUndefined();
  });
});
