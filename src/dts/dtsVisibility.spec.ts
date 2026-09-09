import { describe, expect, it } from "vitest";
import { DTSVisibilityTrack } from "./dtsVisibility";

describe("native DTS visibility interpolation", () => {
  it("switches binary visibility at the keyframe midpoint", () => {
    const sample = new DTSVisibilityTrack(
      ".opacity",
      [0, 2, 4, 6],
      [0, 1, 1, 0],
    ).InterpolantFactoryMethodLinear();
    expect(sample.evaluate(0)[0]).toBe(0);
    expect(sample.evaluate(0.999)[0]).toBe(0);
    expect(sample.evaluate(1)[0]).toBe(1);
    expect(sample.evaluate(3)[0]).toBe(1);
    expect(sample.evaluate(6)[0]).toBe(0);
  });
  it("interpolates gradual fades and clamps beyond the endpoint keys", () => {
    const sample = new DTSVisibilityTrack(
      ".opacity",
      [0, 1],
      [0.2, 0.8],
    ).InterpolantFactoryMethodLinear();
    expect(sample.evaluate(0.5)[0]).toBeCloseTo(0.5);
    expect(sample.evaluate(-1)[0]).toBeCloseTo(0.2);
    expect(sample.evaluate(2)[0]).toBeCloseTo(0.8);
  });
});
