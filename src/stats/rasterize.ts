import type { CommandCircuitFrame } from "../components/commandCircuitFrame";
import type { PositionSamples, StatsTeamFilter } from "./types";

/**
 * Density grid resolution (cells per side).
 */
export const HEATMAP_RESOLUTION = 512;

/**
 * Splat radius in world units.
 */
export const HEATMAP_RADIUS_WORLD = 12;

export const HEATMAP_PERCENTILE = 0.99;
export const HEATMAP_GAMMA = 0.75;

export interface RasterizeOptions {
  resolution?: number;
  radiusWorld?: number;
  teamFilter?: StatsTeamFilter;
}

/**
 * Accumulates samples into a density grid covering the frame rect with a
 * smooth quartic falloff splat, (1 − (r/R)²)², per sample.
 *
 * Grid orientation matches how the overlay quad samples its texture:
 * column 0 is the world −X edge, and **row 0 is the world +Z edge**
 * (PlaneGeometry.rotateX(-π/2) maps texture V toward −Z, and textures use
 * flipY = false).
 */
export function rasterizeDensity(
  samples: PositionSamples,
  frame: CommandCircuitFrame,
  options: RasterizeOptions = {},
): Float32Array {
  const resolution = options.resolution ?? HEATMAP_RESOLUTION;
  const radiusWorld = options.radiusWorld ?? HEATMAP_RADIUS_WORLD;
  const teamFilter = options.teamFilter ?? "all";

  const density = new Float32Array(resolution * resolution);
  const minX = frame.centerX - frame.width / 2;
  const maxZ = frame.centerZ + frame.depth / 2;
  const cellsPerUnitX = resolution / frame.width;
  const cellsPerUnitZ = resolution / frame.depth;
  // Splat radius in cells, per axis (frame may be non-square).
  const radiusCellsX = radiusWorld * cellsPerUnitX;
  const radiusCellsZ = radiusWorld * cellsPerUnitZ;

  for (let i = 0; i < samples.count; i++) {
    if (teamFilter !== "all" && samples.team[i] !== teamFilter) continue;

    // Fractional cell center of the sample.
    const cx = (samples.x[i] - minX) * cellsPerUnitX;
    const cz = (maxZ - samples.z[i]) * cellsPerUnitZ;
    if (
      cx < -radiusCellsX ||
      cx > resolution + radiusCellsX ||
      cz < -radiusCellsZ ||
      cz > resolution + radiusCellsZ
    ) {
      continue;
    }

    const colMin = Math.max(0, Math.floor(cx - radiusCellsX));
    const colMax = Math.min(resolution - 1, Math.ceil(cx + radiusCellsX));
    const rowMin = Math.max(0, Math.floor(cz - radiusCellsZ));
    const rowMax = Math.min(resolution - 1, Math.ceil(cz + radiusCellsZ));

    for (let row = rowMin; row <= rowMax; row++) {
      const dz = (row + 0.5 - cz) / radiusCellsZ;
      for (let col = colMin; col <= colMax; col++) {
        const dx = (col + 0.5 - cx) / radiusCellsX;
        const r2 = dx * dx + dz * dz;
        if (r2 >= 1) continue;
        const falloff = 1 - r2;
        density[row * resolution + col] += falloff * falloff;
      }
    }
  }

  return density;
}

export interface NormalizeOptions {
  percentile?: number;
  gamma?: number;
}

/**
 * Maps raw densities to 0–255 levels. Values are clamped at the given
 * percentile of nonzero cells (so a few extreme hotspots don't wash out the
 * rest of the map), then gamma-lifted for mid-range visibility.
 */
export function normalizeDensity(
  density: Float32Array,
  options: NormalizeOptions = {},
): Uint8Array {
  const percentile = options.percentile ?? HEATMAP_PERCENTILE;
  const gamma = options.gamma ?? HEATMAP_GAMMA;

  const nonzero = new Float32Array(density.length);
  let n = 0;
  for (const d of density) {
    if (d > 0) nonzero[n++] = d;
  }
  const levels = new Uint8Array(density.length);
  if (n === 0) return levels;

  const sorted = nonzero.subarray(0, n).sort();
  const index = Math.min(n - 1, Math.floor(percentile * (n - 1)));
  const clamp = sorted[index] || sorted[n - 1];

  for (let i = 0; i < density.length; i++) {
    if (density[i] <= 0) continue;
    const level = Math.min(1, density[i] / clamp);
    levels[i] = Math.round(Math.pow(level, gamma) * 255);
  }
  return levels;
}
