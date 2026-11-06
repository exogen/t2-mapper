import { beforeEach, describe, expect, it } from "vitest";
import {
  clearShapeBounds,
  getShapeBounds,
  getShapeCenter,
  registerShapeBounds,
} from "./shapeBounds";

describe("shape bounds registry", () => {
  beforeEach(() => clearShapeBounds());

  it("keys by DTS name, first registration wins", () => {
    registerShapeBounds("shapes/Grenade.dts", {
      min: [0, 0, 0],
      max: [1, 1, 1],
    });
    registerShapeBounds("grenade.glb", { min: [9, 9, 9], max: [9, 9, 9] });
    expect(getShapeBounds("grenade.dts")?.max).toEqual([1, 1, 1]);
    expect(getShapeBounds(undefined)).toBeUndefined();
  });

  it("transforms the native box centre with the captured stream scale and rotation", () => {
    registerShapeBounds("target.dts", {
      min: [0, 0, 0],
      max: [2, 4, 6],
    });
    const transform = {
      position: [10, 20, 30] as [number, number, number],
      // Three Y rotation is native Torque Z rotation.
      rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] as [
        number,
        number,
        number,
        number,
      ],
      scale: [2, 3, 4] as [number, number, number],
    };
    const center = getShapeCenter("target.dts", transform)!;
    expect(center[0]).toBeCloseTo(6);
    expect(center[1]).toBeCloseTo(24);
    expect(center[2]).toBeCloseTo(39);
    expect(getShapeCenter("missing.dts", transform)).toBeUndefined();
  });
});
