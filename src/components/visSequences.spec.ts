import { describe, expect, it } from "vitest";
import { visKeyframeValue, visThreadPosition } from "./visSequences";

describe("visKeyframeValue", () => {
  it("interpolates between keyframes", () => {
    const kf = [0, 1, 1, 0];
    expect(visKeyframeValue(kf, 0)).toBe(0);
    expect(visKeyframeValue(kf, 1 / 6)).toBeCloseTo(0.5);
    expect(visKeyframeValue(kf, 0.5)).toBe(1);
    expect(visKeyframeValue(kf, 1)).toBe(0);
  });

  it("clamps outside [0, 1]", () => {
    expect(visKeyframeValue([0.2, 0.8], -1)).toBe(0.2);
    expect(visKeyframeValue([0.2, 0.8], 2)).toBe(0.8);
  });
});

describe("visThreadPosition", () => {
  it("clamps a one-shot sequence at its end", () => {
    expect(visThreadPosition(0.05, 0.1, false)).toBeCloseTo(0.5);
    expect(visThreadPosition(0.3, 0.1, false)).toBe(1);
  });

  it("runs a backward one-shot from the end", () => {
    expect(visThreadPosition(0.025, 0.1, false, false)).toBeCloseTo(0.75);
    expect(visThreadPosition(0.5, 0.1, false, false)).toBe(0);
  });

  it("wraps a cyclic sequence", () => {
    expect(visThreadPosition(0.125, 0.1, true)).toBeCloseTo(0.25);
    expect(visThreadPosition(-0.025, 0.1, true)).toBeCloseTo(0.75);
  });
});
