import { afterEach, describe, expect, it } from "vitest";
import {
  isPointSubmerged,
  isWaterType,
  setWaterInfo,
  setWaterBody,
  setWaterTime,
  waterLevelAt,
  submergedWaterAt,
  clearWaterBodies,
} from "./waterLevel";

afterEach(() => {
  clearWaterBodies();
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
    expect(waterLevelAt(200, -100)).toBe(88.688);
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
    expect(waterLevelAt(0, 0)).toBe(null);
  });
});

describe("multiple water bodies", () => {
  // Damnation really has TWO pools, same height, different places.
  // A single-slot registry kept one and left the other with no
  // collision at all.
  const poolA = { ...damnation, minX: 1152, minY: 856 }; // (128, -168)
  const poolB = { ...damnation, minX: 552, minY: 1256 }; // (-472, 232)

  it("keeps every registered pool, not just the last", () => {
    setWaterBody("a", { ...poolA, waveMagnitude: 0 });
    setWaterBody("b", { ...poolB, waveMagnitude: 0 });
    expect(waterLevelAt(200, -100)).toBe(88.688); // over pool A
    expect(waterLevelAt(-400, 300)).toBe(88.688); // over pool B
    expect(waterLevelAt(-900, -900)).toBe(null); // dry land
  });

  it("removing one pool leaves the other", () => {
    setWaterBody("a", { ...poolA, waveMagnitude: 0 });
    setWaterBody("b", { ...poolB, waveMagnitude: 0 });
    setWaterBody("a", null);
    expect(waterLevelAt(200, -100)).toBe(null);
    expect(waterLevelAt(-400, 300)).toBe(88.688);
  });

  it("picks the highest surface where bodies overlap", () => {
    // BeachBlitz: an ocean at z=148 over map-wide lava at z=-990.
    // Last-one-wins could register the lava and lose the ocean.
    const lava = {
      surfaceZ: -990,
      waveMagnitude: 0,
      liquidType: 6,
      minX: 0,
      minY: 0,
      sizeX: 2048,
      sizeY: 2048,
    };
    // Ocean over the western half only, so the two are separable.
    const ocean = {
      surfaceZ: 148,
      waveMagnitude: 0,
      liquidType: 1,
      minX: 0,
      minY: 0,
      sizeX: 1024,
      sizeY: 2048,
    };
    setWaterBody("lava", lava);
    setWaterBody("ocean", ocean);

    // Where they overlap the ocean is on top, so that is what you meet.
    expect(waterLevelAt(-512, 0)).toBe(148);
    expect(submergedWaterAt(-512, 0, 100)?.liquidType).toBe(1);

    // Outside the ocean's region only the lava covers the column —
    // the discrimination a single-slot registry could not make.
    expect(waterLevelAt(512, 0)).toBe(-990);
    expect(submergedWaterAt(512, 0, -995)?.liquidType).toBe(6);
    expect(submergedWaterAt(512, 0, 100)).toBe(null);
  });

  it("treats a body as unbounded below its surface", () => {
    // WaterInfo carries a surface but no floor, so a point under
    // several surfaces reports the topmost. Documenting the model, not
    // asserting it is physically ideal.
    setWaterBody("deep", {
      surfaceZ: -990,
      waveMagnitude: 0,
      liquidType: 6,
      minX: 0,
      minY: 0,
      sizeX: 2048,
      sizeY: 2048,
    });
    setWaterBody("shallow", {
      surfaceZ: 148,
      waveMagnitude: 0,
      liquidType: 1,
      minX: 0,
      minY: 0,
      sizeX: 2048,
      sizeY: 2048,
    });
    expect(submergedWaterAt(0, 0, -5000)?.liquidType).toBe(1);
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
