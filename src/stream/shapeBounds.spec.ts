import { beforeEach, describe, expect, it } from "vitest";
import {
  clearShapeBounds,
  getShapeBounds,
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
});
