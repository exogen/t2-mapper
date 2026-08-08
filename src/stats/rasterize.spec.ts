import { describe, it, expect } from "vitest";
import { rasterizeDensity, normalizeDensity } from "./rasterize";
import type { PositionSamples } from "./types";
import type { CommandCircuitFrame } from "../components/commandCircuitFrame";

function makeSamples(
  points: Array<{ x: number; z: number; team?: 1 | 2 }>,
): PositionSamples {
  return {
    count: points.length,
    x: new Float32Array(points.map((p) => p.x)),
    z: new Float32Array(points.map((p) => p.z)),
    t: new Float32Array(points.length),
    team: new Uint8Array(points.map((p) => p.team ?? 1)),
    playerId: new Float64Array(points.length),
  };
}

// A 100×100 world frame centered at origin.
const frame: CommandCircuitFrame = {
  centerX: 0,
  centerZ: 0,
  width: 100,
  depth: 100,
};

function hottestCell(density: Float32Array, resolution: number) {
  let best = 0;
  let bestIndex = 0;
  for (let i = 0; i < density.length; i++) {
    if (density[i] > best) {
      best = density[i];
      bestIndex = i;
    }
  }
  return {
    row: Math.floor(bestIndex / resolution),
    col: bestIndex % resolution,
    value: best,
  };
}

describe("rasterizeDensity", () => {
  it("splats a sample at world +Z into row 0 (top of texture)", () => {
    // World (+40.5 x, +44.5 z) → right of center, near the +Z edge.
    // Mid-cell positions so the hottest cell is unambiguous.
    const density = rasterizeDensity(
      makeSamples([{ x: 40.5, z: 44.5 }]),
      frame,
      {
        resolution: 100,
        radiusWorld: 4,
      },
    );
    const { row, col, value } = hottestCell(density, 100);
    expect(value).toBeGreaterThan(0);
    expect(col).toBe(90); // (40.5 - (-50)) → cell 90
    expect(row).toBe(5); // (50 - 44.5) → cell 5
  });

  it("splats the frame center into the grid center", () => {
    const density = rasterizeDensity(makeSamples([{ x: 0, z: 0 }]), frame, {
      resolution: 100,
      radiusWorld: 4,
    });
    const { row, col } = hottestCell(density, 100);
    expect(col).toBeGreaterThanOrEqual(49);
    expect(col).toBeLessThanOrEqual(50);
    expect(row).toBeGreaterThanOrEqual(49);
    expect(row).toBeLessThanOrEqual(50);
  });

  it("ignores samples far outside the frame without errors", () => {
    const density = rasterizeDensity(
      makeSamples([{ x: 5000, z: -5000 }]),
      frame,
      { resolution: 64, radiusWorld: 4 },
    );
    expect(density.every((d) => d === 0)).toBe(true);
  });

  it("filters by team", () => {
    const samples = makeSamples([
      { x: -19.5, z: 0, team: 1 },
      { x: 20.5, z: 0, team: 2 },
    ]);
    const storm = rasterizeDensity(samples, frame, {
      resolution: 100,
      radiusWorld: 4,
      teamFilter: 1,
    });
    const { col } = hottestCell(storm, 100);
    expect(col).toBe(30); // only the x=-20 sample
    const all = rasterizeDensity(samples, frame, {
      resolution: 100,
      radiusWorld: 4,
      teamFilter: "all",
    });
    expect(all.filter((d) => d > 0).length).toBeGreaterThan(
      storm.filter((d) => d > 0).length,
    );
  });

  it("returns zeros for empty samples", () => {
    const density = rasterizeDensity(makeSamples([]), frame, {
      resolution: 32,
    });
    expect(density.every((d) => d === 0)).toBe(true);
  });
});

describe("normalizeDensity", () => {
  it("clamps outlier hotspots at the percentile", () => {
    // 99 cells of density 1 and one cell of density 1000.
    const density = new Float32Array(100).fill(1);
    density[0] = 1000;
    const levels = normalizeDensity(density, { percentile: 0.9, gamma: 1 });
    expect(levels[0]).toBe(255); // outlier clamps to full
    expect(levels[1]).toBe(255); // ordinary cells reach full too (clamp ≈ 1)
  });

  it("scales relative to the clamp value with gamma", () => {
    const density = new Float32Array([0, 2, 4]);
    const levels = normalizeDensity(density, { percentile: 1, gamma: 1 });
    expect(levels[0]).toBe(0);
    expect(levels[1]).toBe(128);
    expect(levels[2]).toBe(255);
  });

  it("handles all-zero input", () => {
    const levels = normalizeDensity(new Float32Array(16));
    expect(levels.every((v) => v === 0)).toBe(true);
  });
});
