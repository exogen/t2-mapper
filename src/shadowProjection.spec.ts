import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import {
  projectedRadiusPx,
  shadowDistanceFade,
  shadowLightDir,
  shadowLightToWorld,
  shadowTileSpec,
  shadowVisibility,
} from "./shadowProjection";

describe("shadowVisibility", () => {
  it("drops shadows under six projected pixels and fades in above", () => {
    expect(shadowVisibility(5).visible).toBe(false);
    expect(shadowVisibility(6)).toEqual({ visible: false, fade: 1 });
    // min/px = 0.75 → fade (0.75 - 0.5) x 2.
    expect(shadowVisibility(8).fade).toBeCloseTo(0.5);
    expect(shadowVisibility(8).visible).toBe(true);
    expect(shadowVisibility(40).fade).toBe(0);
  });

  it("honours a larger smallest-visible size and the detail level", () => {
    expect(shadowVisibility(9, 10).visible).toBe(false);
    // level 0.5 scales the projected size by 0.75: 8 px lands exactly on
    // the minimum, fully faded.
    expect(shadowVisibility(8, 0, 0.5)).toEqual({ visible: false, fade: 1 });
    expect(shadowVisibility(16, 0, 0.5).fade).toBe(0);
  });
});

describe("projectedRadiusPx", () => {
  it("is radius over distance times the pixel scale", () => {
    // 90° fov, 1000 px tall: pixel scale 500.
    expect(projectedRadiusPx(1.3, 100, 1000, 90)).toBeCloseTo(6.5);
  });
});

describe("shadowTileSpec", () => {
  it("picks the bitmap row by projected radius", () => {
    expect(shadowTileSpec(200)).toMatchObject({ size: 64, intervalMs: 25 });
    expect(shadowTileSpec(50)).toMatchObject({ size: 64, intervalMs: 100 });
    expect(shadowTileSpec(12)).toMatchObject({ size: 32, blur: false });
    expect(shadowTileSpec(8)).toMatchObject({ size: 0 });
  });
});

describe("shadowDistanceFade", () => {
  it("interpolates the tilt and reach loss", () => {
    expect(shadowDistanceFade(50)).toEqual({ tilt: 0, reachLoss: 0 });
    expect(shadowDistanceFade(300)).toEqual({ tilt: 0.5, reachLoss: 0.25 });
    expect(shadowDistanceFade(2000)).toEqual({ tilt: 1, reachLoss: 0.7 });
  });
});

describe("shadowLightDir", () => {
  it("is the fixed direction near the camera and steeper far away", () => {
    const near = shadowLightDir(10, new Vector3());
    expect(near.x).toBeCloseTo(0.577, 2);
    expect(near.y).toBeCloseTo(-0.577, 2);
    // Full tilt replaces the vertical component with -1 before
    // normalising, so the lateral components survive, shortened.
    const far = shadowLightDir(600, new Vector3());
    expect(far.y).toBeCloseTo(-0.775, 2);
    expect(far.x).toBeCloseTo(0.447, 2);
    expect(far.z).toBeCloseTo(0.447, 2);
  });
});

describe("shadowLightToWorld", () => {
  it("puts the light along +Y of an orthonormal frame at the centre", () => {
    const dir = shadowLightDir(10, new Vector3());
    const m = shadowLightToWorld(dir, new Vector3(1, 2, 3), new Matrix4());
    const along = new Vector3(0, 1, 0).transformDirection(m);
    expect(along.distanceTo(dir)).toBeLessThan(1e-6);
    const x = new Vector3(1, 0, 0).transformDirection(m);
    const z = new Vector3(0, 0, 1).transformDirection(m);
    expect(Math.abs(x.dot(dir))).toBeLessThan(1e-6);
    expect(Math.abs(z.dot(dir))).toBeLessThan(1e-6);
    expect(Math.abs(x.dot(z))).toBeLessThan(1e-6);
    expect(new Vector3().setFromMatrixPosition(m).toArray()).toEqual([1, 2, 3]);
    // Straight-down light takes the degenerate branch and stays orthonormal.
    const down = shadowLightToWorld(
      new Vector3(0, -1, 0),
      new Vector3(),
      new Matrix4(),
    );
    const dx = new Vector3(1, 0, 0).transformDirection(down);
    const dz = new Vector3(0, 0, 1).transformDirection(down);
    expect(Math.abs(dx.dot(dz))).toBeLessThan(1e-6);
    expect(dx.length()).toBeCloseTo(1);
  });
});
