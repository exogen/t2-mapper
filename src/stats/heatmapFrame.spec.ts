import { describe, expect, it } from "vitest";
import { computeHeatmapFrame } from "./heatmapFrame";
import { HEATMAP_RADIUS_WORLD, rasterizeDensity } from "./rasterize";
import type { PositionSamples } from "./types";

function samples(points: [number, number, number][]): PositionSamples {
  return {
    count: points.length,
    x: new Float32Array(points.map(([x]) => x)),
    z: new Float32Array(points.map(([, z]) => z)),
    playerId: new Float64Array(points.map(([, , id]) => id)),
    t: new Float32Array(points.length),
    team: new Uint8Array(points.length),
  };
}

describe("heatmap frame", () => {
  it("includes the entire OOB route with room for the outermost splats", () => {
    const positions = samples([
      [-4000, -5000, 0],
      [3500, 4500, 0],
    ]);
    const frame = computeHeatmapFrame(positions, 0)!;
    expect(frame.centerX - frame.width / 2).toBeLessThan(
      -4000 - HEATMAP_RADIUS_WORLD,
    );
    expect(frame.centerX + frame.width / 2).toBeGreaterThan(
      3500 + HEATMAP_RADIUS_WORLD,
    );
    expect(frame.centerZ - frame.depth / 2).toBeLessThan(
      -5000 - HEATMAP_RADIUS_WORLD,
    );
    expect(frame.centerZ + frame.depth / 2).toBeGreaterThan(
      4500 + HEATMAP_RADIUS_WORLD,
    );
    // Both extremes actually contribute pixels, beyond the old ±1228.8 frame.
    const density = rasterizeDensity(positions, frame, { playerId: 0 });
    const midpoint = density.length / 2;
    expect(density.subarray(0, midpoint).some((value) => value > 0)).toBe(true);
    expect(density.subarray(midpoint).some((value) => value > 0)).toBe(true);
  });

  it("does not let another player's route change the selected player's texture", () => {
    const positions = samples([
      [10, 20, 0],
      [100000, -100000, 1],
      [NaN, 0, 0],
      [0, Infinity, 0],
    ]);
    expect(computeHeatmapFrame(positions, 0)).toEqual(
      computeHeatmapFrame(samples([[10, 20, 0]]), 0),
    );
  });

  it("keeps samples visible even when an OOB route spans many terrain repeats", () => {
    const positions = samples([
      [-100000, -100000, 0],
      [100000, 100000, 0],
    ]);
    const frame = computeHeatmapFrame(positions, 0)!;
    const density = rasterizeDensity(positions, frame);
    const midpoint = density.length / 2;
    expect(density.subarray(0, midpoint).some((value) => value > 0)).toBe(true);
    expect(density.subarray(midpoint).some((value) => value > 0)).toBe(true);
  });

  it("renders a stationary player and keeps the texture border transparent", () => {
    const positions = samples([[7000, -8000, 0]]);
    const frame = computeHeatmapFrame(positions, 0)!;
    expect(frame.centerX).toBe(7000);
    expect(frame.centerZ).toBe(-8000);
    expect(frame.width).toBeGreaterThan(0);
    expect(frame.depth).toBeGreaterThan(0);
    const resolution = 32;
    const density = rasterizeDensity(positions, frame, { resolution });
    expect(density.some((value) => value > 0)).toBe(true);
    for (let i = 0; i < resolution; i++) {
      expect(density[i]).toBe(0);
      expect(density[density.length - 1 - i]).toBe(0);
      expect(density[i * resolution]).toBe(0);
      expect(density[(i + 1) * resolution - 1]).toBe(0);
    }
  });

  it("has no frame when there are no valid samples for the player", () => {
    expect(computeHeatmapFrame(samples([]), 0)).toBeNull();
    expect(computeHeatmapFrame(samples([[1, 2, 1]]), 0)).toBeNull();
    expect(computeHeatmapFrame(samples([[NaN, 0, 0]]), 0)).toBeNull();
  });
});
