import { describe, expect, it } from "vitest";
import {
  PrecipitationSimulation,
  precipitationPercentage,
} from "./precipitation";
import type { PrecipitationConfig } from "./types";

function rain(
  overrides: Partial<PrecipitationConfig> = {},
): PrecipitationConfig {
  return {
    type: 0,
    materialList: "raindrops.dml",
    maxSize: 1,
    sizeX: 0.2,
    sizeY: 0.45,
    movingBoxPer: 0.35,
    divHeightVal: 1.5,
    sizeBigBox: 1,
    topBoxSpeed: 20,
    frontBoxSpeed: 30,
    topBoxDrawPer: 0.5,
    bottomDrawHeight: 40,
    skipIfPer: -0.3,
    bottomSpeedPer: 1,
    frontSpeedPer: 1.5,
    frontRadiusPer: 0.5,
    percentage: 1,
    enabled: true,
    colors: [[0.6, 0.6, 0.6, 1]],
    offsetSpeed: 0.25,
    minVelocity: 1.25,
    maxVelocity: 4,
    maxDrops: 10,
    maxRadius: 80,
    ...overrides,
  };
}

describe("retail precipitation simulation", () => {
  it("uses native per-draw speeds while playback scale controls motion", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    const config = rain();
    simulation.update(config, 0, 0, { camera: [0, 0, 0] });
    expect(simulation.drops[0].position).toEqual([40, 0, 0]);
    expect(simulation.drops[0].speed).toBe(-2.625);
    simulation.update(config, 1, 1, { camera: [0, 0, 0] });
    expect(simulation.drops[0].position).toEqual([40, 0, -2.625]);
    simulation.update(config, 1.016, 0.5, { camera: [0, 0, 0] });
    expect(simulation.drops[0].position[2]).toBe(-3.9375);
    simulation.update(config, 1.032, 2, { camera: [0, 0, 0] });
    expect(simulation.drops[0].position[2]).toBe(-9.1875);
    simulation.update(config, 2, 0, { camera: [0, 0, 0] });
    expect(simulation.drops[0].position[2]).toBe(-9.1875);
  });

  it("uses camera-centered bounds, wind offsets and teleport shifts", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    const config = rain();
    simulation.update(config, 0, 0, { camera: [0, 0, 0], wind: [1, 0, 0] });
    expect(simulation.min).toEqual([-80, -80, -80 / 1.5]);
    expect(simulation.max).toEqual([80, 80, 80 / 1.5]);
    expect(simulation.drops[0].position[0]).toBe(60);
    simulation.update(config, 0.016, 1, { camera: [0, 0, 0], wind: [1, 0, 0] });
    expect(simulation.drops[0].position[0]).toBe(60 - 2.625 * 0.25);
    const before = [...simulation.drops[0].position];
    simulation.update(config, 0.016, 0, {
      camera: [1000, 500, 10],
      wind: [1, 0, 0],
    });
    expect(simulation.drops[0].position).toEqual([
      before[0] + 1000,
      before[1] + 500,
      before[2] + 10,
    ]);
  });

  it("biases a player's box and uses the liquid surface as its lower edge", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    simulation.update(rain(), 0, 0, {
      camera: [0, 0, 100],
      playerVelocity: [40, 0, 0],
      liquidHeight: 80,
    });
    expect(simulation.min[0]).toBe(-52);
    expect(simulation.max[0]).toBe(108);
    expect(simulation.min[2]).toBe(80.45);
    expect(simulation.drops[0].dropType).toBe(2);
    expect(simulation.drops[0].speed).toBe(-2.625 * 1.5);
  });

  it("uses the native mean-speed wind correction for a Player control object", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    simulation.update(rain(), 0, 0, {
      camera: [0, 0, 0],
      playerVelocity: [0, 0, 0],
      wind: [1, 0, 0],
    });
    expect(simulation.center[0]).toBeCloseTo(
      (80 / ((1.25 + 4) * 0.5 * 0.65)) * 0.25,
    );
    expect(simulation.drops[0].position[0]).toBeCloseTo(
      40 + simulation.center[0],
    );
    simulation.update(
      rain({ minVelocity: 50, maxVelocity: 100, averageSpeed: 2 }),
      1,
      0,
      { camera: [0, 0, 0], playerVelocity: [0, 0, 0], wind: [1, 0, 0] },
    );
    expect(simulation.center[0]).toBe(10);
  });

  it("applies the native extra rain velocity when the player is falling", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    const config = rain();
    simulation.update(config, 0, 0, { camera: [0, 0, 0] });
    simulation.update(config, 0.1, 1, {
      camera: [0, 0, 0],
      playerVelocity: [0, 0, -50],
    });
    expect(simulation.drops[0].position[2]).toBe(-6.25);
    const snow = new PrecipitationSimulation(() => 0.5);
    snow.update(rain({ type: 1 }), 0, 0, { camera: [0, 0, 0] });
    snow.update(rain({ type: 1 }), 0.1, 1, {
      camera: [0, 0, 0],
      playerVelocity: [0, 0, -50],
    });
    expect(snow.drops[0].position[2]).toBe(-2.625);
    // stormShow returns before renderPrecip updates mLastRenderTime.
    simulation.update({ ...config, enabled: false }, 1, 1, {
      camera: [0, 0, 0],
    });
    simulation.update(config, 2, 1, {
      camera: [0, 0, 0],
      playerVelocity: [0, 0, -5],
    });
    expect(simulation.drops[0].position[2]).toBe(-6.25 - 10.75);
  });

  it("uses instance density, native 2000 drop capacity, colors and 4x4 atlas cells", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    const config = rain({
      maxDrops: 2500,
      percentage: 0.5,
      colors: [
        [1, 0, 0, 1],
        [0, 1, 0, 1],
        [0, 0, 1, 1],
      ],
    });
    simulation.update(config, 0, 0, { camera: [0, 0, 0] });
    expect(simulation.drops).toHaveLength(2000);
    expect(simulation.drawCount).toBe(1000);
    expect(simulation.drops[0].colorIndex).toBe(1);
    expect(simulation.drops[0].textureIndex).toBe(7);
    const rare = new PrecipitationSimulation(() => 0.99996);
    rare.update(rain({ maxDrops: 1 }), 0, 0, { camera: [0, 0, 0] });
    expect(rare.drops[0].textureIndex).toBe(15);
  });

  it("interpolates storms in source-clock seconds and lets fading drops finish", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    const config = rain({
      storm: {
        startTime: 10,
        duration: 10.24,
        startPercentage: 1,
        endPercentage: 0,
      },
    });
    expect(precipitationPercentage(config, 15.12)).toBeCloseTo(0.5);
    simulation.update(config, 10, 0, { camera: [0, 0, 0] });
    expect(simulation.drawCount).toBe(10);
    simulation.update(config, 21, 0, { camera: [0, 0, 0] });
    expect(simulation.drops.filter((drop) => drop.active)).toHaveLength(10);
    for (let i = 0; i < 30; i++)
      simulation.update(config, 21 + i * 0.016, 1, { camera: [0, 0, 0] });
    expect(simulation.drops.filter((drop) => drop.active)).toHaveLength(0);
    simulation.update(rain({ percentage: 0.2 }), 22, 0, { camera: [0, 0, 0] });
    expect(simulation.drawCount).toBe(2);
    simulation.update(rain({ enabled: false }), 23, 1, { camera: [0, 0, 0] });
    expect(simulation.drawCount).toBe(0);
  });

  it("retains independent draw and respawn counters across percentage and show updates", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    const config = rain({ drawCount: 10, spawnCount: 10 });
    simulation.update(config, 0, 0, { camera: [0, 0, 0] });
    simulation.update({ ...config, maxDrops: 2, percentage: 0 }, 1, 0, {
      camera: [0, 0, 0],
    });
    expect(simulation.drawCount).toBe(10);
    expect(simulation.drops).toHaveLength(10);
    simulation.update({ ...config, enabled: false, percentage: 0 }, 2, 1, {
      camera: [0, 0, 0],
    });
    expect(simulation.drawCount).toBe(0);
    simulation.update({ ...config, percentage: 0 }, 3, 0, {
      camera: [0, 0, 0],
    });
    expect(simulation.drawCount).toBe(10);
    expect(simulation.drops.filter((p) => p.active)).toHaveLength(10);
    const fewer = { ...config, percentage: 0.2, drawCount: 2 };
    simulation.update(fewer, 4, 1, { camera: [0, 0, 0] });
    expect(simulation.drawCount).toBe(2);
    expect(simulation.drops[1].position[2]).toBe(-2.625);
    // A direct density increase cannot respawn above the older threshold.
    simulation.reset();
    simulation.update({ ...config, drawCount: 10, spawnCount: 2 }, 0, 0, {
      camera: [0, 0, 0],
    });
    expect(simulation.drops.filter((p) => p.active)).toHaveLength(2);
  });

  it("preserves the retail zero-loop storm fade-in behavior", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    const config = rain({
      percentage: 0,
      drawCount: 0,
      spawnCount: 0,
      storm: {
        startTime: 0,
        duration: 10.24,
        startPercentage: 0,
        endPercentage: 1,
      },
    });
    simulation.update(config, 11, 1, { camera: [0, 0, 0] });
    expect(precipitationPercentage(config, 11)).toBe(1);
    expect(simulation.drawCount).toBe(0);
    expect(simulation.drops.some((p) => p.active)).toBe(false);
  });

  it("retains native catch-up percentage overshoot while bounding the particle array", () => {
    const config = rain({ percentage: 1.5, drawCount: 2500, spawnCount: 2500 });
    expect(precipitationPercentage(config, 0)).toBe(1.5);
    const simulation = new PrecipitationSimulation(() => 0.5);
    simulation.update(config, 0, 0, { camera: [0, 0, 0] });
    expect(simulation.drawCount).toBe(2000);
    expect(simulation.drops).toHaveLength(2000);
  });

  it("resets local history and supports the native untextured sand path", () => {
    const simulation = new PrecipitationSimulation(() => 0.5);
    const config = rain({
      type: 2,
      maxSize: 2,
      maxVelocity: 1,
      minVelocity: 0.25,
    });
    simulation.update(config, 0, 1, { camera: [0, 0, 0] });
    expect(simulation.drops[0].size).toBe(1);
    expect(simulation.drops[0].endTime).toBe(1.125);
    simulation.update(config, 0.5, 0, { camera: [0, 0, 0] });
    expect(simulation.drops[0].alpha).toBeCloseTo(0.5 / 1.125);
    simulation.reset();
    expect(simulation.drops).toHaveLength(0);
    simulation.update(rain({ maxDrops: 1 }), 100, 0, { camera: [0, 0, 0] });
    expect(simulation.drops[0].position).toEqual([40, 0, 0]);
  });
});
