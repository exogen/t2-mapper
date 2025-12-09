import { memo, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import {
  DataTexture,
  FloatType,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  ClampToEdgeWrapping,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
  Vector3,
} from "three";
import type { TorqueObject } from "../torqueScript";
import { getFloat, getInt, getPosition, getProperty } from "../mission";
import { loadTerrain } from "../loaders";
import { uint16ToFloat32 } from "../arrayUtils";
import { setupMask } from "../textureUtils";
import { TerrainTile } from "./TerrainTile";
import { useSceneObject } from "./useSceneObject";

const DEFAULT_SQUARE_SIZE = 8;
const DEFAULT_VISIBLE_DISTANCE = 600;
const TERRAIN_SIZE = 256;
const LIGHTMAP_SIZE = 512; // Match Tribes 2's 512x512 lightmap
const HEIGHT_SCALE = 2048; // Matches displacementScale for terrain

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
  geometry: PlaneGeometry,
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
 * Generate a terrain lightmap texture with smooth normals.
 *
 * The key insight: banding occurs because vertex normals are computed from
 * discrete heightmap samples, creating discontinuities at grid boundaries.
 *
 * Solution: Compute normals from BILINEARLY INTERPOLATED heights at each
 * lightmap pixel. This produces smooth gradients because the interpolated
 * height surface is C0 continuous (no discontinuities).
 *
 * @param heightMap - Uint16 heightmap data (256x256)
 * @param sunDirection - Normalized sun direction vector (points FROM sun TO scene)
 * @param squareSize - World units per heightmap cell
 * @returns DataTexture with lighting intensity values
 */
function generateTerrainLightmap(
  heightMap: Uint16Array,
  sunDirection: Vector3,
  squareSize: number,
): DataTexture {
  // Helper to get bilinearly interpolated height at any fractional position
  // Supports negative and out-of-range coordinates via wrapping
  const getInterpolatedHeight = (col: number, row: number): number => {
    // Wrap to valid range using modulo (handles negative values correctly)
    const wrappedCol = ((col % TERRAIN_SIZE) + TERRAIN_SIZE) % TERRAIN_SIZE;
    const wrappedRow = ((row % TERRAIN_SIZE) + TERRAIN_SIZE) % TERRAIN_SIZE;

    const col0 = Math.floor(wrappedCol);
    const row0 = Math.floor(wrappedRow);
    const col1 = (col0 + 1) & (TERRAIN_SIZE - 1); // Wrap at edge
    const row1 = (row0 + 1) & (TERRAIN_SIZE - 1);

    const fx = wrappedCol - col0;
    const fy = wrappedRow - row0;

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

  // Generate lightmap by computing normal from interpolated heights at each pixel
  for (let lRow = 0; lRow < LIGHTMAP_SIZE; lRow++) {
    for (let lCol = 0; lCol < LIGHTMAP_SIZE; lCol++) {
      // Generate texel for terrain position matching Torque's relight():
      // Torque starts at halfStep (0.25) within each square, not at corner.
      // With 2 lightmap pixels per terrain square: pos = lCol/2 + 0.25
      const col = lCol / 2 + 0.25;
      const row = lRow / 2 + 0.25;

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

      lightmapData[lRow * LIGHTMAP_SIZE + lCol] = Math.floor(NdotL * 255);
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
  return useQuery({
    queryKey: ["terrain", terrainFile],
    queryFn: () => loadTerrain(terrainFile),
  });
}

/**
 * Get visibleDistance from the Sky object, used to determine how far terrain
 * tiles should render. This matches Tribes 2's terrain tiling behavior.
 */
function useVisibleDistance(): number {
  const sky = useSceneObject("Sky");
  if (!sky) return DEFAULT_VISIBLE_DISTANCE;
  const highVisibleDistance = getFloat(sky, "high_visibleDistance");
  if (highVisibleDistance != null && highVisibleDistance > 0) {
    return highVisibleDistance;
  }
  return getFloat(sky, "visibleDistance") ?? DEFAULT_VISIBLE_DISTANCE;
}

interface TileAssignment {
  tileX: number;
  tileZ: number;
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
  object,
}: {
  object: TorqueObject;
}) {
  const terrainFile = getProperty(object, "terrainFile");
  const squareSize = getInt(object, "squareSize") ?? DEFAULT_SQUARE_SIZE;
  const detailTexture = getProperty(object, "detailTexture");
  const blockSize = squareSize * 256;
  const visibleDistance = useVisibleDistance();
  const camera = useThree((state) => state.camera);

  const basePosition = useMemo(() => {
    const [x, , z] = getPosition(object);
    return { x, z };
  }, [object]);

  const emptySquares = useMemo(() => {
    const value = getProperty(object, "emptySquares");
    return value ? value.split(" ").map((s: string) => parseInt(s, 10)) : [];
  }, [object]);

  const { data: terrain } = useTerrain(terrainFile);

  // Shared geometry for all tiles - with smooth normals computed from heightmap
  const sharedGeometry = useMemo(() => {
    if (!terrain) return null;

    const size = squareSize * 256;
    const geometry = new PlaneGeometry(size, size, 256, 256);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(-Math.PI / 2);

    // Displace vertices on CPU and compute smooth normals
    displaceTerrainAndComputeNormals(geometry, terrain.heightMap, squareSize);

    return geometry;
  }, [squareSize, terrain]);

  // Get sun direction for lightmap generation
  const sun = useSceneObject("Sun");
  const sunDirection = useMemo(() => {
    if (!sun) return new Vector3(0.57735, -0.57735, 0.57735); // Default diagonal
    const directionStr =
      getProperty(sun, "direction") ?? "0.57735 0.57735 -0.57735";
    const [tx, ty, tz] = directionStr
      .split(" ")
      .map((s: string) => parseFloat(s));
    // Convert Torque (X, Y, Z) to Three.js: swap Y/Z
    const x = tx;
    const y = tz;
    const z = ty;
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

  // Create stable pool indices for React keys
  const poolIndices = useMemo(
    () => Array.from({ length: poolSize }, (_, i) => i),
    [poolSize],
  );

  // Track which tile coordinate each pool slot is assigned to
  const [tileAssignments, setTileAssignments] = useState<
    (TileAssignment | null)[]
  >(() => Array(poolSize).fill(null));

  // Track previous tile bounds to avoid unnecessary state updates
  const prevBoundsRef = useRef({ xStart: 0, xEnd: 0, zStart: 0, zEnd: 0 });

  useFrame(() => {
    const relativeCamX = camera.position.x - basePosition.x;
    const relativeCamZ = camera.position.z - basePosition.z;

    const xStart = Math.floor((relativeCamX - visibleDistance) / blockSize);
    const xEnd = Math.ceil((relativeCamX + visibleDistance) / blockSize);
    const zStart = Math.floor((relativeCamZ - visibleDistance) / blockSize);
    const zEnd = Math.ceil((relativeCamZ + visibleDistance) / blockSize);

    // Early exit if bounds haven't changed
    const prev = prevBoundsRef.current;
    if (
      xStart === prev.xStart &&
      xEnd === prev.xEnd &&
      zStart === prev.zStart &&
      zEnd === prev.zEnd
    ) {
      return;
    }
    prev.xStart = xStart;
    prev.xEnd = xEnd;
    prev.zStart = zStart;
    prev.zEnd = zEnd;

    // Build new assignments array
    const newAssignments: (TileAssignment | null)[] = [];
    for (let x = xStart; x < xEnd; x++) {
      for (let z = zStart; z < zEnd; z++) {
        if (x === 0 && z === 0) continue;
        newAssignments.push({ tileX: x, tileZ: z });
      }
    }
    while (newAssignments.length < poolSize) {
      newAssignments.push(null);
    }

    setTileAssignments(newAssignments);
  });

  if (
    !terrain ||
    !sharedGeometry ||
    !sharedDisplacementMap ||
    !sharedAlphaTextures
  ) {
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
      {/* Pooled tiles - stable keys, always mounted */}
      {poolIndices.map((poolIndex) => {
        const assignment = tileAssignments[poolIndex];
        return (
          <TerrainTile
            key={poolIndex}
            tileX={assignment?.tileX ?? 0}
            tileZ={assignment?.tileZ ?? 0}
            blockSize={blockSize}
            basePosition={basePosition}
            textureNames={terrain.textureNames}
            geometry={sharedGeometry}
            displacementMap={sharedDisplacementMap}
            visibilityMask={pooledVisibilityMask}
            alphaTextures={sharedAlphaTextures}
            detailTextureName={detailTexture}
            lightmap={terrainLightmap}
            visible={assignment !== null}
          />
        );
      })}
    </>
  );
});
