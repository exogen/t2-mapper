/**
 * Math-only ray-vs-heightfield collision in Torque space, matching the
 * rendered terrain exactly: same corner heights (wrapped with & 255 for
 * infinite tiling), same alternating diagonal split per square
 * (Torque's Split45 rule), and the same empty-square holes.
 *
 * Registered by TerrainBlock (React side); queried by the stream engine
 * and world collision (non-React side) — the same bridge pattern as
 * terrainHeight.ts.
 */

const TERRAIN_SIZE = 256;
const HALF_SIZE = TERRAIN_SIZE / 2;
const HEIGHT_SCALE = 2048;
const MAX_DDA_STEPS = 4096;

export type Vec3 = [number, number, number];

export interface TerrainRayHit {
  /** Parametric position along the segment, 0..1. */
  t: number;
  point: Vec3;
  /** Unit surface normal (oriented against the ray). */
  normal: Vec3;
}

interface TerrainCollisionData {
  heightMap: Uint16Array;
  squareSize: number;
  /** Square indices (row * 256 + col) with no terrain (holes). */
  emptySquares: Set<number>;
}

let terrainData: TerrainCollisionData | null = null;

/** Decode Torque empty-square runs (x | y<<8 | count<<16) into a set. */
export function decodeEmptySquares(runs: number[]): Set<number> {
  const empty = new Set<number>();
  for (const run of runs) {
    const x = run & 0xff;
    const y = (run >> 8) & 0xff;
    const count = run >> 16;
    for (let i = 0; i < count; i++) {
      empty.add(y * TERRAIN_SIZE + ((x + i) & 0xff));
    }
  }
  return empty;
}

/** Called by TerrainBlock when terrain loads. Pass null on unmount. */
export function setTerrainCollisionData(
  data: {
    heightMap: Uint16Array;
    squareSize: number;
    emptySquareRuns?: number[];
  } | null,
): void {
  terrainData = data
    ? {
        heightMap: data.heightMap,
        squareSize: data.squareSize,
        emptySquares: decodeEmptySquares(data.emptySquareRuns ?? []),
      }
    : null;
}

/** Corner height at integer grid coords, wrapped for infinite tiling. */
function cornerHeight(data: TerrainCollisionData, col: number, row: number) {
  const index = (row & 0xff) * TERRAIN_SIZE + (col & 0xff);
  return (data.heightMap[index] / 65535) * HEIGHT_SCALE;
}

const EPS = 1e-9;

/**
 * Double-sided Möller–Trumbore. Returns t along the segment (0..1) or
 * null. Writes the (unnormalized) face normal into outNormal.
 */
function segmentTriangle(
  sx: number,
  sy: number,
  sz: number,
  dx: number,
  dy: number,
  dz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  outNormal: Vec3,
): number | null {
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  const px = dy * e2z - dz * e2y;
  const py = dz * e2x - dx * e2z;
  const pz = dx * e2y - dy * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (det > -EPS && det < EPS) return null;
  const invDet = 1 / det;
  const tx = sx - ax;
  const ty = sy - ay;
  const tz = sz - az;
  const u = (tx * px + ty * py + tz * pz) * invDet;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (dx * qx + dy * qy + dz * qz) * invDet;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
  if (t < 0 || t > 1) return null;
  outNormal[0] = e1y * e2z - e1z * e2y;
  outNormal[1] = e1z * e2x - e1x * e2z;
  outNormal[2] = e1x * e2y - e1y * e2x;
  return t;
}

const _triNormal: Vec3 = [0, 0, 0];

/** Test both triangles of grid square (col, row); returns nearest t. */
function testSquare(
  data: TerrainCollisionData,
  col: number,
  row: number,
  s: Vec3,
  d: Vec3,
  out: TerrainRayHit,
): boolean {
  if (data.emptySquares.has((row & 0xff) * TERRAIN_SIZE + (col & 0xff))) {
    return false;
  }
  const sq = data.squareSize;
  const x0 = (col - HALF_SIZE) * sq;
  const y0 = (row - HALF_SIZE) * sq;
  const x1 = x0 + sq;
  const y1 = y0 + sq;
  const hA = cornerHeight(data, col, row);
  const hB = cornerHeight(data, col + 1, row);
  const hC = cornerHeight(data, col, row + 1);
  const hD = cornerHeight(data, col + 1, row + 1);

  // Torque's alternating diagonal: ((col ^ row) & 1) === 0 → Split45,
  // diagonal A–D; otherwise diagonal B–C. Matches createTerrainGeometry.
  const split45 = ((col ^ row) & 1) === 0;
  let bestT: number | null = null;
  for (let i = 0; i < 2; i++) {
    const t = split45
      ? i === 0
        ? segmentTriangle(
            ...s,
            ...d,
            x0,
            y0,
            hA,
            x0,
            y1,
            hC,
            x1,
            y1,
            hD,
            _triNormal,
          )
        : segmentTriangle(
            ...s,
            ...d,
            x0,
            y0,
            hA,
            x1,
            y1,
            hD,
            x1,
            y0,
            hB,
            _triNormal,
          )
      : i === 0
        ? segmentTriangle(
            ...s,
            ...d,
            x0,
            y0,
            hA,
            x0,
            y1,
            hC,
            x1,
            y0,
            hB,
            _triNormal,
          )
        : segmentTriangle(
            ...s,
            ...d,
            x1,
            y0,
            hB,
            x0,
            y1,
            hC,
            x1,
            y1,
            hD,
            _triNormal,
          );
    if (t != null && (bestT == null || t < bestT)) {
      bestT = t;
      // Orient the normal against the ray and normalize.
      let [nx, ny, nz] = _triNormal;
      if (nx * d[0] + ny * d[1] + nz * d[2] > 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      out.normal[0] = nx / len;
      out.normal[1] = ny / len;
      out.normal[2] = nz / len;
    }
  }
  if (bestT == null) return false;
  out.t = bestT;
  out.point[0] = s[0] + d[0] * bestT;
  out.point[1] = s[1] + d[1] * bestT;
  out.point[2] = s[2] + d[2] * bestT;
  return true;
}

/**
 * Cast a segment (Torque space) against the terrain. Walks the grid
 * squares crossed by the XY projection in order (2D DDA), testing the two
 * triangles of each, so the first hit found is the nearest.
 */
export function castTerrainRay(start: Vec3, end: Vec3): TerrainRayHit | null {
  const data = terrainData;
  if (!data) return null;
  const sq = data.squareSize;
  const d: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]];
  const hit: TerrainRayHit = { t: 0, point: [0, 0, 0], normal: [0, 0, 0] };

  // Continuous grid coordinates.
  const gx0 = start[0] / sq + HALF_SIZE;
  const gy0 = start[1] / sq + HALF_SIZE;
  const gx1 = end[0] / sq + HALF_SIZE;
  const gy1 = end[1] / sq + HALF_SIZE;

  let col = Math.floor(gx0);
  let row = Math.floor(gy0);
  const colEnd = Math.floor(gx1);
  const rowEnd = Math.floor(gy1);

  const dgx = gx1 - gx0;
  const dgy = gy1 - gy0;
  const stepX = dgx > 0 ? 1 : -1;
  const stepY = dgy > 0 ? 1 : -1;
  // Parametric t per unit grid step, and t to the first boundary.
  const tDeltaX = dgx !== 0 ? Math.abs(1 / dgx) : Infinity;
  const tDeltaY = dgy !== 0 ? Math.abs(1 / dgy) : Infinity;
  let tMaxX =
    dgx !== 0
      ? (dgx > 0 ? Math.floor(gx0) + 1 - gx0 : gx0 - Math.floor(gx0)) * tDeltaX
      : Infinity;
  let tMaxY =
    dgy !== 0
      ? (dgy > 0 ? Math.floor(gy0) + 1 - gy0 : gy0 - Math.floor(gy0)) * tDeltaY
      : Infinity;

  for (let i = 0; i < MAX_DDA_STEPS; i++) {
    if (testSquare(data, col, row, start, d, hit)) {
      return hit;
    }
    if (col === colEnd && row === rowEnd) return null;
    if (tMaxX < tMaxY) {
      if (tMaxX > 1) return null;
      col += stepX;
      tMaxX += tDeltaX;
    } else {
      if (tMaxY > 1) return null;
      row += stepY;
      tMaxY += tDeltaY;
    }
  }
  return null;
}
