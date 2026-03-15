import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import {
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  InstancedMesh as ThreeInstancedMesh,
  LinearFilter,
  Matrix4,
  NearestFilter,
  NoColorSpace,
  ClampToEdgeWrapping,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector3,
} from "three";
import type { SceneTerrainBlock } from "../scene/types";
import { createLogger } from "../logger";
import { torqueToThree } from "../scene/coordinates";

const log = createLogger("TerrainBlock");
import { useSceneSky, useSceneSun } from "../state/gameEntityStore";
import { loadTerrain } from "../loaders";
import { uint16ToFloat32 } from "../arrayUtils";
import { setupMask } from "../textureUtils";
import { TerrainTile, TerrainMaterial } from "./TerrainTile";
import {
  createTerrainHeightSampler,
  setTerrainHeightSampler,
} from "../terrainHeight";
const DEFAULT_SQUARE_SIZE = 8;
const DEFAULT_VISIBLE_DISTANCE = 600;
const TERRAIN_SIZE = 256;
const LIGHTMAP_SIZE = 512; // Match Tribes 2's 512x512 lightmap
const HEIGHT_SCALE = 2048; // Matches displacementScale for terrain
/**
 * Create terrain geometry with Torque-style alternating diagonal triangulation.
 *
 * Torque splits each grid square into two triangles, but alternates the diagonal
 * direction in a checkerboard pattern: ((x ^ y) & 1) == 0 determines Split45.
 *
 * - Split45 (/): diagonal from (x,y) to (x+1,y+1) - bottom-left to top-right
 * - Split135 (\): diagonal from (x+1,y) to (x,y+1) - bottom-right to top-left
 *
 * This creates more accurate terrain, especially on ridges and peaks where the
 * zigzag pattern of alternating triangles better represents the heightmap data.
 *
 * Geometry is created in X-Y plane (like PlaneGeometry) then rotated to match
 * terrain orientation.
 */
function createTerrainGeometry(size: number, segments: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const vertexCount = (segments + 1) * (segments + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  // Pre-allocate index buffer: segments² squares × 2 triangles × 3 indices
  // Use Uint32Array since vertex count (257² = 66049) exceeds Uint16 max (65535)
  const indexCount = segments * segments * 6;
  const indices = new Uint32Array(indexCount);
  let indexOffset = 0;
  const segmentSize = size / segments;
  // Create vertices in X-Y plane (same as PlaneGeometry)
  // PlaneGeometry goes from top-left to bottom-right with UVs 0→1
  // X: -size/2 to +size/2 (left to right)
  // Y: +size/2 to -size/2 (top to bottom in initial X-Y plane)
  for (let row = 0; row <= segments; row++) {
    for (let col = 0; col <= segments; col++) {
      const idx = row * (segments + 1) + col;
      // Position in X-Y plane (Z=0), centered at origin
      positions[idx * 3] = col * segmentSize - size / 2; // X: -size/2 to +size/2
      positions[idx * 3 + 1] = size / 2 - row * segmentSize; // Y: +size/2 to -size/2
      positions[idx * 3 + 2] = 0; // Z: 0 (will be displaced after rotation)
      // Default normal pointing +Z (out of plane, will become +Y after rotation)
      normals[idx * 3] = 0;
      normals[idx * 3 + 1] = 0;
      normals[idx * 3 + 2] = 1;
      // UV coordinates (0 to 1), matching PlaneGeometry
      uvs[idx * 2] = col / segments;
      uvs[idx * 2 + 1] = 1 - row / segments; // Flip V so row 0 is at V=1
    }
  }
  // Create triangle indices with Torque-style alternating diagonals
  // Using CCW winding for front face (Three.js default)
  for (let row = 0; row < segments; row++) {
    for (let col = 0; col < segments; col++) {
      // In this layout (Y decreasing with row):
      // a---b   (row)
      // |   |
      // c---d   (row+1)
      const a = row * (segments + 1) + col;
      const b = a + 1;
      const c = (row + 1) * (segments + 1) + col;
      const d = c + 1;
      // Torque's split decision: ((x ^ y) & 1) == 0 means Split45
      const split45 = ((col ^ row) & 1) === 0;
      if (split45) {
        // Split45: diagonal from a to d (top-left to bottom-right in screen space)
        // Triangle 1: a, c, d (CCW from front)
        // Triangle 2: a, d, b (CCW from front)
        indices[indexOffset++] = a;
        indices[indexOffset++] = c;
        indices[indexOffset++] = d;
        indices[indexOffset++] = a;
        indices[indexOffset++] = d;
        indices[indexOffset++] = b;
      } else {
        // Split135: diagonal from b to c (top-right to bottom-left in screen space)
        // Triangle 1: a, c, b (CCW from front)
        // Triangle 2: b, c, d (CCW from front)
        indices[indexOffset++] = a;
        indices[indexOffset++] = c;
        indices[indexOffset++] = b;
        indices[indexOffset++] = b;
        indices[indexOffset++] = c;
        indices[indexOffset++] = d;
      }
    }
  }
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  // Apply same rotations as the original PlaneGeometry approach:
  // rotateX(-90°) puts the X-Y plane into X-Z (horizontal), with +Y becoming up
  // rotateY(-90°) rotates around Y axis to match terrain coordinate system
  geometry.rotateX(-Math.PI / 2);
  geometry.rotateY(-Math.PI / 2);
  return geometry;
}
/**
 * Displace terrain vertices on CPU and compute smooth normals from heightmap gradients.
 *
 * Height sampling uses NEAREST filtering to match the GPU DataTexture default:
 * texel = floor(uv * textureWidth), clamped to valid range.
 *
 * Normals use bilinear interpolation for smooth gradients, preventing banding
 * that would occur with face normals from computeVertexNormals().
 */
function displaceTerrainAndComputeNormals(
  geometry: BufferGeometry,
  heightMap: Uint16Array,
  squareSize: number,
): void {
  const posAttr = geometry.attributes.position;
  const uvAttr = geometry.attributes.uv;
  const normalAttr = geometry.attributes.normal;
  const positions = posAttr.array as Float32Array;
  const uvs = uvAttr.array as Float32Array;
  const normals = normalAttr.array as Float32Array;
  const vertexCount = posAttr.count;
  // Helper to get height at heightmap coordinates with clamping (integer coords)
  const getHeightInt = (col: number, row: number): number => {
    col = Math.max(0, Math.min(TERRAIN_SIZE - 1, col));
    row = Math.max(0, Math.min(TERRAIN_SIZE - 1, row));
    return (heightMap[row * TERRAIN_SIZE + col] / 65535) * HEIGHT_SCALE;
  };
  // Helper to get bilinearly interpolated height (matches GPU texture sampling)
  const getHeight = (col: number, row: number): number => {
    col = Math.max(0, Math.min(TERRAIN_SIZE - 1, col));
    row = Math.max(0, Math.min(TERRAIN_SIZE - 1, row));
    const col0 = Math.floor(col);
    const row0 = Math.floor(row);
    const col1 = Math.min(col0 + 1, TERRAIN_SIZE - 1);
    const row1 = Math.min(row0 + 1, TERRAIN_SIZE - 1);
    const fx = col - col0;
    const fy = row - row0;
    const h00 = (heightMap[row0 * TERRAIN_SIZE + col0] / 65535) * HEIGHT_SCALE;
    const h10 = (heightMap[row0 * TERRAIN_SIZE + col1] / 65535) * HEIGHT_SCALE;
    const h01 = (heightMap[row1 * TERRAIN_SIZE + col0] / 65535) * HEIGHT_SCALE;
    const h11 = (heightMap[row1 * TERRAIN_SIZE + col1] / 65535) * HEIGHT_SCALE;
    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return h0 * (1 - fy) + h1 * fy;
  };
  // Process each vertex
  for (let i = 0; i < vertexCount; i++) {
    const u = uvs[i * 2];
    const v = uvs[i * 2 + 1];
    // Map UV to heightmap coordinates - must match Torque's terrain sampling.
    // Torque formula: floor(worldPos / squareSize) & BlockMask
    // UV 0→1 maps to world 0→2048, squareSize=8, so: floor(UV * 256) & 255
    // This wraps at edges for seamless terrain tiling.
    const col = Math.floor(u * TERRAIN_SIZE) & (TERRAIN_SIZE - 1);
    const row = Math.floor(v * TERRAIN_SIZE) & (TERRAIN_SIZE - 1);
    // Use direct integer sampling to match GPU nearest-neighbor filtering
    const height = getHeightInt(col, row);
    positions[i * 3 + 1] = height;
    // Compute normal using central differences on heightmap with smooth interpolation.
    // Use fractional coordinates for gradient sampling to get smooth normals.
    const colF = u * (TERRAIN_SIZE - 1);
    const rowF = v * (TERRAIN_SIZE - 1);
    const hL = getHeight(colF - 1, rowF); // left
    const hR = getHeight(colF + 1, rowF); // right
    const hD = getHeight(colF, rowF + 1); // down (increasing row)
    const hU = getHeight(colF, rowF - 1); // up (decreasing row)
    // Gradients in heightmap space (col increases = +U, row increases = +V)
    const dCol = (hR - hL) / 2; // height change per column
    const dRow = (hD - hU) / 2; // height change per row
    // Now map heightmap gradients to world-space normal
    // After rotateX(-PI/2) and rotateY(-PI/2):
    // - U direction (col) maps to world +Z
    // - V direction (row) maps to world +X
    //
    // For heightfield normal: n = normalize(-dh/dx, 1, -dh/dz) in world space
    // But we need the normal to face outward (toward the viewer), so use positive signs
    let nx = dRow;
    let ny = squareSize;
    let nz = dCol;
    // Normalize
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 1;
      nz = 0;
    }
    normals[i * 3] = nx;
    normals[i * 3 + 1] = ny;
    normals[i * 3 + 2] = nz;
  }
  posAttr.needsUpdate = true;
  normalAttr.needsUpdate = true;
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
 * @param getHeight - Function to sample terrain height at a position
 * @returns 1.0 if lit, 0.0 if in shadow
 */
function rayMarchShadow(
  startCol: number,
  startRow: number,
  startHeight: number,
  lightDir: Vector3,
  squareSize: number,
  getHeight: (col: number, row: number) => number,
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
    // Check if ray is above max terrain height
    if (height > HEIGHT_SCALE) {
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
 * @param heightMap - Uint16 heightmap data (256x256)
 * @param sunDirection - Normalized sun direction vector (points FROM sun TO scene)
 * @param squareSize - World units per heightmap cell
 * @returns DataTexture with lighting intensity values (NdotL * shadow)
 */
function generateTerrainLightmap(
  heightMap: Uint16Array,
  sunDirection: Vector3,
  squareSize: number,
): DataTexture {
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
    const h00 = heightMap[row0 * TERRAIN_SIZE + col0] / 65535;
    const h10 = heightMap[row0 * TERRAIN_SIZE + col1] / 65535;
    const h01 = heightMap[row1 * TERRAIN_SIZE + col0] / 65535;
    const h11 = heightMap[row1 * TERRAIN_SIZE + col1] / 65535;
    // Bilinear interpolation
    const h0 = h00 * (1 - fx) + h10 * fx;
    const h1 = h01 * (1 - fx) + h11 * fx;
    return (h0 * (1 - fy) + h1 * fy) * HEIGHT_SCALE;
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
  // Generate lightmap by computing normal and shadow at each pixel
  for (let lRow = 0; lRow < LIGHTMAP_SIZE; lRow++) {
    for (let lCol = 0; lCol < LIGHTMAP_SIZE; lCol++) {
      // Generate texel for terrain position matching Torque's relight():
      // Torque starts at halfStep (0.25) within each square, not at corner.
      // With 2 lightmap pixels per terrain square: pos = lCol/2 + 0.25
      const col = lCol / 2 + 0.25;
      const row = lRow / 2 + 0.25;
      // Get height at this position for shadow ray starting point
      const surfaceHeight = getInterpolatedHeight(col, row);
      // Compute gradient using central differences on interpolated heights
      const hL = getInterpolatedHeight(col - eps, row);
      const hR = getInterpolatedHeight(col + eps, row);
      const hU = getInterpolatedHeight(col, row - eps);
      const hD = getInterpolatedHeight(col, row + eps);
      // Gradient in heightmap units
      const dCol = (hR - hL) / (2 * eps);
      const dRow = (hD - hU) / (2 * eps);
      // Convert to world-space normal - must match displaceTerrainAndComputeNormals
      // After geometry rotations: U (col) → +Z, V (row) → +X
      const nx = -dRow;
      const ny = squareSize;
      const nz = -dCol;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      // Compute NdotL
      const NdotL = Math.max(
        0,
        (nx / len) * lightDir.x +
          (ny / len) * lightDir.y +
          (nz / len) * lightDir.z,
      );
      // Ray-march to determine shadow (only if surface faces the light)
      let shadow = 1.0;
      if (NdotL > 0) {
        shadow = rayMarchShadow(
          col,
          row,
          surfaceHeight,
          lightDir,
          squareSize,
          getInterpolatedHeight,
        );
      }
      // Store NdotL * shadow in lightmap
      lightmapData[lRow * LIGHTMAP_SIZE + lCol] = Math.floor(
        NdotL * shadow * 255,
      );
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
  texture.generateMipmaps = true;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
/**
 * Load a .ter file, used for terrain heightmap and texture info.
 */
function useTerrain(terrainFile: string) {
  const result = useQuery({
    queryKey: ["terrain", terrainFile],
    queryFn: () => {
      log.debug("Loading terrain: %s", terrainFile);
      return loadTerrain(terrainFile);
    },
  });

  useEffect(() => {
    log.debug(
      "Query status: %s%s%s file=%s",
      result.status,
      result.error ? ` error=${result.error.message}` : "",
      result.data ? " (data ready)" : " (no data)",
      terrainFile,
    );
  }, [result.status, result.error, result.data, terrainFile]);

  return result;
}
/**
 * Get visibleDistance from the Sky scene object, used to determine how far
 * terrain tiles should render. This matches Tribes 2's terrain tiling behavior.
 */
function useVisibleDistance(): number {
  const sky = useSceneSky();
  if (!sky) return DEFAULT_VISIBLE_DISTANCE;
  return sky.visibleDistance > 0
    ? sky.visibleDistance
    : DEFAULT_VISIBLE_DISTANCE;
}
/**
 * Create a visibility mask texture from emptySquares data.
 */
function createVisibilityMask(emptySquares: number[]): DataTexture {
  const maskData = new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE);
  maskData.fill(255); // Start with everything visible
  for (const squareId of emptySquares) {
    const x = squareId & 0xff;
    const y = (squareId >> 8) & 0xff;
    const count = squareId >> 16;
    const rowOffset = y * TERRAIN_SIZE;
    for (let i = 0; i < count; i++) {
      const index = rowOffset + x + i;
      if (index < maskData.length) {
        maskData[index] = 0;
      }
    }
  }
  const texture = new DataTexture(
    maskData,
    TERRAIN_SIZE,
    TERRAIN_SIZE,
    RedFormat,
    UnsignedByteType,
  );
  texture.colorSpace = NoColorSpace;
  texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.needsUpdate = true;
  return texture;
}
export const TerrainBlock = memo(function TerrainBlock({
  scene,
}: {
  scene: SceneTerrainBlock;
}) {
  const terrainFile = scene.terrFileName;
  const squareSize = scene.squareSize || DEFAULT_SQUARE_SIZE;
  const detailTexture = scene.detailTextureName || undefined;
  const blockSize = squareSize * 256;
  const visibleDistance = useVisibleDistance();
  const camera = useThree((state) => state.camera);
  // Torque ignores the mission's terrain position and always uses a fixed formula:
  // setPosition(Point3F(-squareSize * (BlockSize >> 1), -squareSize * (BlockSize >> 1), 0));
  // where BlockSize = 256. See tribes2-engine/terrain/terrData.cc:679
  const basePosition = useMemo(() => {
    const offset = -squareSize * (TERRAIN_SIZE / 2);
    return { x: offset, z: offset };
  }, [squareSize]);
  const emptySquares = useMemo(
    () => scene.emptySquareRuns ?? [],
    [scene.emptySquareRuns],
  );
  const { data: terrain } = useTerrain(terrainFile);
  // Shared geometry for all tiles - with smooth normals computed from heightmap
  // Uses Torque-style alternating diagonal triangulation for accurate terrain
  const sharedGeometry = useMemo(() => {
    if (!terrain) return null;
    const size = squareSize * 256;
    const geometry = createTerrainGeometry(size, TERRAIN_SIZE);
    // Displace vertices on CPU and compute smooth normals
    displaceTerrainAndComputeNormals(geometry, terrain.heightMap, squareSize);
    return geometry;
  }, [squareSize, terrain]);
  // Register terrain height sampler for item physics simulation.
  useEffect(() => {
    if (!terrain) return;
    setTerrainHeightSampler(
      createTerrainHeightSampler(terrain.heightMap, squareSize),
    );
    return () => setTerrainHeightSampler(null);
  }, [terrain, squareSize]);
  // Get sun direction for lightmap generation
  const sun = useSceneSun();
  const sunDirection = useMemo(() => {
    if (!sun) return new Vector3(0.57735, -0.57735, 0.57735); // Default diagonal
    const [x, y, z] = torqueToThree(sun.direction);
    const len = Math.sqrt(x * x + y * y + z * z);
    return new Vector3(x / len, y / len, z / len);
  }, [sun]);
  // Generate terrain lightmap for smooth per-pixel lighting
  const terrainLightmap = useMemo(() => {
    if (!terrain) return null;
    return generateTerrainLightmap(terrain.heightMap, sunDirection, squareSize);
  }, [terrain, sunDirection, squareSize]);
  // Shared displacement map from heightmap - created once for all tiles
  const sharedDisplacementMap = useMemo(() => {
    if (!terrain) return null;
    const f32HeightMap = uint16ToFloat32(terrain.heightMap);
    const texture = new DataTexture(
      f32HeightMap,
      TERRAIN_SIZE,
      TERRAIN_SIZE,
      RedFormat,
      FloatType,
    );
    texture.colorSpace = NoColorSpace;
    texture.generateMipmaps = false;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }, [terrain]);
  // Visibility mask for primary tile (0,0) - may have empty squares
  const primaryVisibilityMask = useMemo(
    () => createVisibilityMask(emptySquares),
    [emptySquares],
  );
  // Visibility mask for pooled tiles - all visible (no empty squares)
  // This is a stable reference shared by all pooled tiles
  const pooledVisibilityMask = useMemo(() => createVisibilityMask([]), []);
  // Shared alpha textures from terrain alphaMaps - created once for all tiles
  const sharedAlphaTextures = useMemo(() => {
    if (!terrain) return null;
    return terrain.alphaMaps.map((data) => setupMask(data));
  }, [terrain]);
  // Calculate the maximum number of tiles that can be visible at once.
  const poolSize = useMemo(() => {
    const extent = Math.ceil(visibleDistance / blockSize);
    const gridSize = 2 * extent + 1;
    return gridSize * gridSize - 1; // -1 because primary tile is separate
  }, [visibleDistance, blockSize]);
  // InstancedMesh ref and reusable matrix for pooled terrain tiles.
  const pooledMeshRef = useRef<ThreeInstancedMesh>(null);
  const _tileMatrix = useMemo(() => new Matrix4(), []);
  // Track previous tile bounds to avoid unnecessary instance matrix updates.
  const prevBoundsRef = useRef({
    xStart: Infinity,
    xEnd: -Infinity,
    zStart: Infinity,
    zEnd: -Infinity,
  });
  // Track which mesh instance we last updated — when r3f recreates the
  // InstancedMesh (e.g. poolSize changes), we must force a full update
  // even if the camera bounds haven't changed.
  const lastMeshRef = useRef<ThreeInstancedMesh | null>(null);
  useFrame(() => {
    const mesh = pooledMeshRef.current;
    if (!mesh) return;
    const relativeCamX = camera.position.x - basePosition.x;
    const relativeCamZ = camera.position.z - basePosition.z;
    const xStart = Math.floor((relativeCamX - visibleDistance) / blockSize);
    const xEnd = Math.ceil((relativeCamX + visibleDistance) / blockSize);
    const zStart = Math.floor((relativeCamZ - visibleDistance) / blockSize);
    const zEnd = Math.ceil((relativeCamZ + visibleDistance) / blockSize);
    // Early exit if bounds haven't changed AND we're still on the same mesh.
    const prev = prevBoundsRef.current;
    if (
      mesh === lastMeshRef.current &&
      xStart === prev.xStart &&
      xEnd === prev.xEnd &&
      zStart === prev.zStart &&
      zEnd === prev.zEnd
    ) {
      return;
    }
    lastMeshRef.current = mesh;
    prev.xStart = xStart;
    prev.xEnd = xEnd;
    prev.zStart = zStart;
    prev.zEnd = zEnd;
    const geometryOffset = blockSize / 2;
    let count = 0;
    for (let x = xStart; x < xEnd; x++) {
      for (let z = zStart; z < zEnd; z++) {
        if (x === 0 && z === 0) continue;
        _tileMatrix.makeTranslation(
          basePosition.x + x * blockSize + geometryOffset,
          0,
          basePosition.z + z * blockSize + geometryOffset,
        );
        mesh.setMatrixAt(count, _tileMatrix);
        count++;
      }
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = true;
  });
  if (
    !terrain ||
    !sharedGeometry ||
    !sharedDisplacementMap ||
    !sharedAlphaTextures
  ) {
    log.debug(
      "Not ready: terrain=%s geometry=%s displacement=%s alpha=%s",
      !!terrain,
      !!sharedGeometry,
      !!sharedDisplacementMap,
      !!sharedAlphaTextures,
    );
    return null;
  }
  return (
    <>
      {/* Primary tile at (0,0) with emptySquares applied */}
      <TerrainTile
        tileX={0}
        tileZ={0}
        blockSize={blockSize}
        basePosition={basePosition}
        textureNames={terrain.textureNames}
        geometry={sharedGeometry}
        displacementMap={sharedDisplacementMap}
        visibilityMask={primaryVisibilityMask}
        alphaTextures={sharedAlphaTextures}
        detailTextureName={detailTexture}
        lightmap={terrainLightmap}
      />
      {/* Pooled tiles — single InstancedMesh, matrices updated in useFrame.
          All pooled tiles share the same geometry, material, and visibility mask.
          Only position differs (set via instance matrices). */}
      <instancedMesh
        ref={pooledMeshRef}
        args={[sharedGeometry, undefined, poolSize]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <TerrainMaterial
          displacementMap={sharedDisplacementMap}
          visibilityMask={pooledVisibilityMask}
          textureNames={terrain.textureNames}
          alphaTextures={sharedAlphaTextures}
          detailTextureName={detailTexture}
          lightmap={terrainLightmap}
        />
      </instancedMesh>
    </>
  );
});
