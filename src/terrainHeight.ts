/**
 * Module-level terrain height sampler that bridges React (TerrainBlock) and
 * non-React (streaming.ts) code. TerrainBlock registers a sampler once the
 * heightmap is loaded; item physics queries it during simulation.
 */

const TERRAIN_SIZE = 256;
const HALF_SIZE = TERRAIN_SIZE / 2; // 128
const HEIGHT_SCALE = 2048;

export type HeightFn = (torqueX: number, torqueY: number) => number;

let sampler: HeightFn | null = null;

/** Called by TerrainBlock when heightmap is loaded. Pass null on unmount. */
export function setTerrainHeightSampler(fn: HeightFn | null): void {
  sampler = fn;
}

/** Returns terrain Z at Torque (x, y) or null if no terrain is loaded. */
export function getTerrainHeightAt(
  torqueX: number,
  torqueY: number,
): number | null {
  return sampler ? sampler(torqueX, torqueY) : null;
}

/**
 * Build a height sampler closure from raw heightmap data and terrain params.
 * Uses bilinear interpolation and clamps to terrain bounds.
 *
 * Coordinate mapping (derived from terrain geometry rotations):
 * - Torque X → heightmap col
 * - Torque Y → heightmap row
 */
export function createTerrainHeightSampler(
  heightMap: Uint16Array,
  squareSize: number,
): HeightFn {
  return (torqueX: number, torqueY: number): number => {
    // Convert Torque world coords to fractional heightmap coords.
    // The terrain origin is at (-squareSize * 128, -squareSize * 128, 0),
    // so grid center (128, 128) corresponds to Torque (0, 0).
    // Row/col mapping must match the terrain geometry displacement:
    // after UV flip and geometry rotations, row corresponds to Torque Y
    // and col corresponds to Torque X.
    const col = torqueX / squareSize + HALF_SIZE;
    const row = torqueY / squareSize + HALF_SIZE;

    // Clamp to valid range
    const clampedCol = Math.max(0, Math.min(TERRAIN_SIZE - 1, col));
    const clampedRow = Math.max(0, Math.min(TERRAIN_SIZE - 1, row));

    const col0 = Math.floor(clampedCol);
    const row0 = Math.floor(clampedRow);
    const col1 = Math.min(col0 + 1, TERRAIN_SIZE - 1);
    const row1 = Math.min(row0 + 1, TERRAIN_SIZE - 1);

    const fx = clampedCol - col0;
    const fy = clampedRow - row0;

    // Bilinear interpolation
    const h00 = heightMap[row0 * TERRAIN_SIZE + col0];
    const h10 = heightMap[row0 * TERRAIN_SIZE + col1];
    const h01 = heightMap[row1 * TERRAIN_SIZE + col0];
    const h11 = heightMap[row1 * TERRAIN_SIZE + col1];

    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return ((h0 * (1 - fy) + h1 * fy) / 65535) * HEIGHT_SCALE;
  };
}
