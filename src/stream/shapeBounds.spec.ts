import { beforeEach, describe, expect, it } from "vitest";
import {
  clearShapeBounds,
  getShapeBounds,
  registerShapeBounds,
  shapeBoundsFromExtras,
} from "./shapeBounds";

describe("shapeBoundsFromExtras", () => {
  it("reads the converter's JSON string, min then max", () => {
    const b = shapeBoundsFromExtras({
      dts_bounds: "[-0.096, -0.088, 0.0, 0.096, 0.088, 0.381]",
    })!;
    expect(b.min).toEqual([-0.096, -0.088, 0]);
    expect(b.max).toEqual([0.096, 0.088, 0.381]);
  });

  it("accepts an array and rejects anything else", () => {
    expect(
      shapeBoundsFromExtras({ dts_bounds: [0, 0, 0, 1, 1, 1] })?.max,
    ).toEqual([1, 1, 1]);
    expect(shapeBoundsFromExtras(undefined)).toBeUndefined();
    expect(shapeBoundsFromExtras({})).toBeUndefined();
    expect(shapeBoundsFromExtras({ dts_bounds: "[1, 2]" })).toBeUndefined();
    expect(shapeBoundsFromExtras({ dts_bounds: "nope" })).toBeUndefined();
  });
});

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
});
