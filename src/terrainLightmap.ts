/**
 * The terrain lightmap bake: one texel of `NdotL x sunVisibility` per
 * lightmap pixel, written once per mission rather than sampled per frame.
 *
 * This stands in for Tribes2.exe's SceneLighting pass, which bakes terrain
 * self-shadowing AND building shadows into the terrain lightmap at mission
 * load and caches it to `lighting/<mission>_<hash>.ml`. Because it is a
 * geometric visibility test rather than a depth-buffer comparison, it has
 * no shadow acne and needs no bias, so shadows stay attached to the ground.
 */
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NoColorSpace,
  RedFormat,
  UnsignedByteType,
  Vector3,
} from "three";
import { createLogger } from "./logger";
import {
  LIGHTMAP_SIZE,
  LIGHTMAP_TEXELS_PER_SQUARE,
  TERRAIN_SIZE,
  terrainHeightToWorld,
} from "./terrain";

const log = createLogger("terrainLightmap");

/** The highest point of the heightfield, in world units. */
function maxWorldHeight(heightMap: Uint16Array): number {
  let max = 0;
  for (let i = 0; i < heightMap.length; i++) {
    if (heightMap[i] > max) max = heightMap[i];
  }
  return terrainHeightToWorld(max);
}

/**
 * Ray-march through heightmap to determine if a point is in shadow.
 * Uses the same coordinate system as the terrain geometry.
 *
 * @param startCol - Starting column in heightmap coordinates
 * @param startRow - Starting row in heightmap coordinates
 * @param startHeight - Starting height in world units
 * @param lightDir - Direction TOWARD the light (normalized)
 * @param squareSize - World units per heightmap cell
 * @param getHeight - Height sampler along the ray
 * @param ceiling - World height above which no terrain can occlude
 * @returns 1.0 if lit, 0.0 if in shadow
 */
function rayMarchShadow(
  startCol: number,
  startRow: number,
  startHeight: number,
  lightDir: Vector3,
  squareSize: number,
  getHeight: (col: number, row: number) => number,
  ceiling: number,
): number {
  // Convert light direction to heightmap coordinate steps
  // World coordinate mapping (after geometry rotations):
  // - col (U) → world +Z, so lightDir.z affects col
  // - row (V) → world +X, so lightDir.x affects row
  // - height → world +Y, so lightDir.y affects height
  const stepCol = lightDir.z / squareSize;
  const stepRow = lightDir.x / squareSize;
  const stepHeight = lightDir.y;
  // Normalize to step ~0.5 heightmap units per iteration for good sampling
  const horizontalLen = Math.sqrt(stepCol * stepCol + stepRow * stepRow);
  if (horizontalLen < 0.0001) {
    // Light is nearly vertical - no self-shadowing possible
    return 1.0;
  }
  const stepScale = 0.5 / horizontalLen;
  const dCol = stepCol * stepScale;
  const dRow = stepRow * stepScale;
  const dHeight = stepHeight * stepScale;
  let col = startCol;
  let row = startRow;
  let height = startHeight + 0.1; // Small offset to avoid self-intersection
  // March until we exit terrain bounds or confirm we're lit
  const maxSteps = TERRAIN_SIZE * 3; // Enough to cross terrain diagonally
  for (let i = 0; i < maxSteps; i++) {
    col += dCol;
    row += dRow;
    height += dHeight;
    // Check if ray exited terrain bounds horizontally
    if (col < 0 || col >= TERRAIN_SIZE || row < 0 || row >= TERRAIN_SIZE) {
      return 1.0; // Exited terrain, not in shadow
    }
    // Above the highest ground there is nothing left to occlude. Using the
    // heightfield's real maximum rather than a fixed ceiling is what keeps
    // the march short enough to bake at more than one texel per square.
    if (height > ceiling) {
      return 1.0; // Above all terrain, not in shadow
    }
    // Sample terrain height at current position
    const terrainHeight = getHeight(col, row);
    // If ray is below terrain surface, we're in shadow
    if (height < terrainHeight) {
      return 0.0;
    }
  }
  return 1.0; // Reached max steps, assume not in shadow
}
/**
 * Generate a terrain lightmap texture with smooth normals and ray-traced shadows.
 *
 * The key insight: banding occurs because vertex normals are computed from
 * discrete heightmap samples, creating discontinuities at grid boundaries.
 *
 * Solution: Compute normals from BILINEARLY INTERPOLATED heights at each
 * lightmap pixel. This produces smooth gradients because the interpolated
 * height surface is C0 continuous (no discontinuities).
 *
 * Shadows are computed by ray-marching through the heightmap toward the sun,
 * checking if the terrain blocks the light path. This avoids shadow acne
 * because it's a geometric intersection test, not a depth buffer comparison.
 *
 * Buildings are baked in too, via `occludedByInterior` — the engine does
 * the same thing at mission load (see terrainInteriorShadow.ts), and it is
 * why the ground needs no runtime shadow map.
 *
 * @param heightMap - Uint16 heightmap data (256x256)
 * @param sunDirection - Normalized sun direction vector (points FROM sun TO scene)
 * @param squareSize - World units per heightmap cell
 * @param origin - Three-space (x, z) of terrain cell (0, 0)
 * @param occludedByInterior - Building occlusion test in Three space, if any
 * @returns DataTexture with lighting intensity values (NdotL * shadow)
 */
export interface TerrainLightmapBake {
  /** Lit immediately; shadows fill in as `step` is called. */
  texture: DataTexture;
  /** Refine for up to `budgetMs`. Returns true once the bake is complete. */
  step(budgetMs: number): boolean;
}

export function bakeTerrainLightmap(
  heightMap: Uint16Array,
  sunDirection: Vector3,
  squareSize: number,
  origin: { x: number; z: number },
  occludedByInterior?: ((x: number, y: number, z: number) => boolean) | null,
): TerrainLightmapBake {
  const ceiling = maxWorldHeight(heightMap);
  const started = performance.now();
  // Helper to get bilinearly interpolated height at any fractional position
  // Supports negative and out-of-range coordinates via clamping for shadow rays
  const getInterpolatedHeight = (col: number, row: number): number => {
    // Clamp to valid range (don't wrap for shadow rays)
    const clampedCol = Math.max(0, Math.min(TERRAIN_SIZE - 1, col));
    const clampedRow = Math.max(0, Math.min(TERRAIN_SIZE - 1, row));
    const col0 = Math.floor(clampedCol);
    const row0 = Math.floor(clampedRow);
    const col1 = Math.min(col0 + 1, TERRAIN_SIZE - 1);
    const row1 = Math.min(row0 + 1, TERRAIN_SIZE - 1);
    const fx = clampedCol - col0;
    const fy = clampedRow - row0;
    const h00 = heightMap[row0 * TERRAIN_SIZE + col0];
    const h10 = heightMap[row0 * TERRAIN_SIZE + col1];
    const h01 = heightMap[row1 * TERRAIN_SIZE + col0];
    const h11 = heightMap[row1 * TERRAIN_SIZE + col1];
    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return terrainHeightToWorld(h0 * (1 - fy) + h1 * fy);
  };
  // Light direction (negate sun direction since it points FROM sun)
  const lightDir = new Vector3(
    -sunDirection.x,
    -sunDirection.y,
    -sunDirection.z,
  ).normalize();
  const lightmapData = new Uint8Array(LIGHTMAP_SIZE * LIGHTMAP_SIZE);
  // Epsilon for gradient sampling (in heightmap units)
  // Use 0.5 to sample across a reasonable distance for smooth gradients
  const eps = 0.5;
  /** Terrain-square coordinates and NdotL for one lightmap texel. */
  function texel(lCol: number, lRow: number) {
    // Texel centre in terrain-square units, matching Torque's relight():
    // it starts half a texel into each square, not at the corner. With
    // the stock 2 texels per square this is lCol / 2 + 0.25.
    const col = (lCol + 0.5) / LIGHTMAP_TEXELS_PER_SQUARE;
    const row = (lRow + 0.5) / LIGHTMAP_TEXELS_PER_SQUARE;
    const surfaceHeight = getInterpolatedHeight(col, row);
    // Gradient by central differences on the interpolated heights, which
    // is what keeps the shading free of the banding that discrete vertex
    // normals produce.
    const hL = getInterpolatedHeight(col - eps, row);
    const hR = getInterpolatedHeight(col + eps, row);
    const hU = getInterpolatedHeight(col, row - eps);
    const hD = getInterpolatedHeight(col, row + eps);
    const dCol = (hR - hL) / (2 * eps);
    const dRow = (hD - hU) / (2 * eps);
    // World-space normal, matching displaceTerrainAndComputeNormals:
    // after the geometry rotations U (col) is +Z and V (row) is +X.
    const nx = -dRow;
    const ny = squareSize;
    const nz = -dCol;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const NdotL = Math.max(
      0,
      (nx / len) * lightDir.x +
        (ny / len) * lightDir.y +
        (nz / len) * lightDir.z,
    );
    return { col, row, surfaceHeight, NdotL };
  }

  // Pass one, immediately: unshadowed NdotL, so the ground is lit correctly
  // from the first frame. Shadows are the expensive part and are refined in
  // `step` rather than blocking the load. Surface heights are kept so the
  // second pass does not have to sample the gradient all over again.
  const surfaceHeights = new Float32Array(LIGHTMAP_SIZE * LIGHTMAP_SIZE);
  for (let lRow = 0; lRow < LIGHTMAP_SIZE; lRow++) {
    for (let lCol = 0; lCol < LIGHTMAP_SIZE; lCol++) {
      const index = lRow * LIGHTMAP_SIZE + lCol;
      const { surfaceHeight, NdotL } = texel(lCol, lRow);
      surfaceHeights[index] = surfaceHeight;
      lightmapData[index] = NdotL * 255;
    }
  }

  const texture = new DataTexture(
    lightmapData,
    LIGHTMAP_SIZE,
    LIGHTMAP_SIZE,
    RedFormat,
    UnsignedByteType,
  );
  texture.colorSpace = NoColorSpace;
  // No mipmaps: minFilter is LinearFilter, so they would never be sampled,
  // and the refinement pass re-uploads this texture every frame while it
  // runs — regenerating an unused chain each time.
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;

  /** Lit (1) or shadowed (0) at a point, terrain first then buildings. */
  function sampleShadow(
    col: number,
    row: number,
    surfaceHeight: number,
  ): number {
    const shadow = rayMarchShadow(
      col,
      row,
      surfaceHeight,
      lightDir,
      squareSize,
      getInterpolatedHeight,
      ceiling,
    );
    if (shadow === 0) return 0;
    if (!occludedByInterior) return 1;
    // col indexes world +Z and row world +X (see rayMarchShadow).
    const worldX = origin.x + row * squareSize;
    const worldZ = origin.z + col * squareSize;
    return occludedByInterior(worldX, surfaceHeight, worldZ) ? 0 : 1;
  }

  // Pass two, time-sliced so a big map never stalls the frame. Phase one
  // takes a single visibility sample per texel; phase two goes back over
  // the texels that straddle a shadow edge and supersamples just those, so
  // edges are averaged rather than stair-stepped. That is the engine's own
  // arrangement: it supersamples the sweep (terrainGenerateLevel) and
  // splits a lexel at an edge ($pref::sceneLighting::terrainAllowLexelSplits).
  // Both phases are geometric visibility tests, so neither can produce the
  // acne or the bias-driven separation a shadow map does.
  const unshadowed = Uint8Array.from(lightmapData);
  const lit = new Uint8Array(LIGHTMAP_SIZE * LIGHTMAP_SIZE);
  /** Subsamples per axis for a texel on a shadow edge. */
  const EDGE_SAMPLES = 4;

  function samplePhaseRow(lRow: number): void {
    for (let lCol = 0; lCol < LIGHTMAP_SIZE; lCol++) {
      const index = lRow * LIGHTMAP_SIZE + lCol;
      if (unshadowed[index] === 0) continue; // faces away from the sun
      const col = (lCol + 0.5) / LIGHTMAP_TEXELS_PER_SQUARE;
      const row = (lRow + 0.5) / LIGHTMAP_TEXELS_PER_SQUARE;
      const shadow = sampleShadow(col, row, surfaceHeights[index]);
      lit[index] = shadow;
      if (shadow === 0) lightmapData[index] = 0;
    }
  }

  /** True when a neighbour disagrees, i.e. the texel is on a shadow edge. */
  function onEdge(lCol: number, lRow: number): boolean {
    const index = lRow * LIGHTMAP_SIZE + lCol;
    const here = lit[index];
    for (let dRow = -1; dRow <= 1; dRow++) {
      const r = lRow + dRow;
      if (r < 0 || r >= LIGHTMAP_SIZE) continue;
      for (let dCol = -1; dCol <= 1; dCol++) {
        const c = lCol + dCol;
        if (c < 0 || c >= LIGHTMAP_SIZE) continue;
        const other = r * LIGHTMAP_SIZE + c;
        if (unshadowed[other] !== 0 && lit[other] !== here) return true;
      }
    }
    return false;
  }

  function edgePhaseRow(lRow: number): void {
    for (let lCol = 0; lCol < LIGHTMAP_SIZE; lCol++) {
      const index = lRow * LIGHTMAP_SIZE + lCol;
      if (unshadowed[index] === 0) continue;
      if (!onEdge(lCol, lRow)) continue;
      let visible = 0;
      for (let sRow = 0; sRow < EDGE_SAMPLES; sRow++) {
        for (let sCol = 0; sCol < EDGE_SAMPLES; sCol++) {
          const col =
            (lCol + (sCol + 0.5) / EDGE_SAMPLES) / LIGHTMAP_TEXELS_PER_SQUARE;
          const row =
            (lRow + (sRow + 0.5) / EDGE_SAMPLES) / LIGHTMAP_TEXELS_PER_SQUARE;
          visible += sampleShadow(col, row, getInterpolatedHeight(col, row));
        }
      }
      lightmapData[index] =
        (unshadowed[index] * visible) / (EDGE_SAMPLES * EDGE_SAMPLES);
    }
  }

  let phase: 0 | 1 | 2 = 0;
  let nextRow = 0;

  function step(budgetMs: number): boolean {
    if (phase === 2) return true;
    const deadline = performance.now() + budgetMs;
    do {
      if (phase === 0) samplePhaseRow(nextRow);
      else edgePhaseRow(nextRow);
      nextRow++;
      if (nextRow === LIGHTMAP_SIZE) {
        nextRow = 0;
        phase = phase === 0 ? 1 : 2;
      }
    } while (phase !== 2 && performance.now() < deadline);
    texture.needsUpdate = true;
    if (phase !== 2) return false;
    log.debug(
      "baked %dx%d in %d ms (%s)",
      LIGHTMAP_SIZE,
      LIGHTMAP_SIZE,
      Math.round(performance.now() - started),
      occludedByInterior ? "with buildings" : "terrain only",
    );
    return true;
  }

  return { texture, step };
}
