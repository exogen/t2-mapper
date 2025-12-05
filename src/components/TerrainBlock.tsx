import { memo, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useQuery } from "@tanstack/react-query";
import {
  DataTexture,
  FloatType,
  NearestFilter,
  NoColorSpace,
  ClampToEdgeWrapping,
  PlaneGeometry,
  RedFormat,
  RepeatWrapping,
  UnsignedByteType,
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

  // Shared geometry for all tiles
  const sharedGeometry = useMemo(() => {
    const size = squareSize * 256;
    const geometry = new PlaneGeometry(size, size, 256, 256);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(-Math.PI / 2);
    return geometry;
  }, [squareSize]);

  const { data: terrain } = useTerrain(terrainFile);

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

  if (!terrain || !sharedDisplacementMap || !sharedAlphaTextures) {
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
            visible={assignment !== null}
          />
        );
      })}
    </>
  );
});
