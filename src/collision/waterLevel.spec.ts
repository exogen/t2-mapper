import { afterEach, describe, expect, it } from "vitest";
import {
  isPointSubmerged,
  isWaterType,
  setWaterInfo,
  setWaterTime,
  getWaterLevel,
} from "./waterLevel";

afterEach(() => {
  setWaterInfo(null);
  setWaterTime(0);
});

// Damnation-like block: position (128, -168, 38.688), scale (352, 288, 50).
const damnation = {
  surfaceZ: 88.688,
  waveMagnitude: 0.5,
  liquidType: 3,
  minX: 1152,
  minY: 856,
  sizeX: 352,
  sizeY: 288,
};

describe("isPointSubmerged", () => {
  it("tests against the surface height, not the block bottom", () => {
    setWaterInfo({ ...damnation, waveMagnitude: 0 });
    expect(getWaterLevel()).toBe(88.688);
    expect(isPointSubmerged(200, -100, 80)).toBe(true);
    expect(isPointSubmerged(200, -100, 90)).toBe(false);
  });

  it("includes the wave displacement at the point", () => {
    // waveMagnitude 4 → factor 1; x = 10π puts sin(x·0.05) at +1,
    // so the local surface is surfaceZ + 1.
    setWaterInfo({ ...damnation, surfaceZ: 100, waveMagnitude: 4 });
    const x = 10 * Math.PI;
    expect(isPointSubmerged(x, 0, 100.5)).toBe(false); // outside region
    setWaterInfo({
      surfaceZ: 100,
      waveMagnitude: 4,
      liquidType: 0,
      minX: 0,
      minY: 0,
      sizeX: 2048,
      sizeY: 2048,
    });
    expect(isPointSubmerged(x, 0, 100.5)).toBe(true);
    expect(isPointSubmerged(x, 0, 101.5)).toBe(false);
    // Advancing time moves the wave crest away.
    setWaterTime(Math.PI);
    expect(isPointSubmerged(x, 0, 100.5)).toBe(false);
  });

  it("wraps every 2048 units like fluid::IsFluidAtXY", () => {
    setWaterInfo({ ...damnation, waveMagnitude: 0 });
    expect(isPointSubmerged(138, -158, 80)).toBe(true);
    expect(isPointSubmerged(138 + 2048, -158, 80)).toBe(true);
    expect(isPointSubmerged(138 - 2048, -158 - 2048, 80)).toBe(true);
    // Outside the fluid extent within the rep.
    expect(isPointSubmerged(600, -158, 80)).toBe(false);
    expect(isPointSubmerged(138, 200, 80)).toBe(false);
  });

  it("reports nothing when no water is registered", () => {
    expect(isPointSubmerged(0, 0, -1000)).toBe(false);
    expect(getWaterLevel()).toBe(null);
  });
});

describe("isWaterType", () => {
  it("covers water types 0-3, excludes lava and quicksand", () => {
    expect(isWaterType(0)).toBe(true);
    expect(isWaterType(3)).toBe(true);
    expect(isWaterType(4)).toBe(false);
    expect(isWaterType(7)).toBe(false);
  });
});
