import { memo, Suspense, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DataTexture,
  RedFormat,
  FloatType,
  NoColorSpace,
  NearestFilter,
  ClampToEdgeWrapping,
  UnsignedByteType,
  PlaneGeometry,
  DoubleSide,
  FrontSide,
} from "three";
import { useTexture } from "@react-three/drei";
import { uint16ToFloat32 } from "../arrayUtils";
import { loadTerrain, terrainTextureToUrl } from "../loaders";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "../mission";
import {
  setupColor,
  setupMask,
  updateTerrainTextureShader,
} from "../textureUtils";
import { useSettings } from "./SettingsProvider";

const DEFAULT_SQUARE_SIZE = 8;

/**
 * Load a .ter file, used for terrain heightmap and texture info.
 */
function useTerrain(terrainFile: string) {
  return useQuery({
    queryKey: ["terrain", terrainFile],
    queryFn: () => loadTerrain(terrainFile),
  });
}

function BlendedTerrainTextures({
  displacementMap,
  visibilityMask,
  textureNames,
  alphaMaps,
}: {
  displacementMap: DataTexture;
  visibilityMask: DataTexture;
  textureNames: string[];
  alphaMaps: Uint8Array[];
}) {
  const { debugMode } = useSettings();

  const baseTextures = useTexture(
    textureNames.map((name) => terrainTextureToUrl(name)),
    (textures) => {
      textures.forEach((tex) => setupColor(tex));
    }
  );

  const alphaTextures = useMemo(
    () => alphaMaps.map((data) => setupMask(data)),
    [alphaMaps]
  );

  const tiling = useMemo(
    () => ({
      0: 32,
      1: 32,
      2: 32,
      3: 32,
      4: 32,
      5: 32,
    }),
    []
  );

  const onBeforeCompile = useCallback(
    (shader) => {
      updateTerrainTextureShader({
        shader,
        baseTextures,
        alphaTextures,
        visibilityMask,
        tiling,
        debugMode,
      });
    },
    [baseTextures, alphaTextures, visibilityMask, tiling, debugMode]
  );

  return (
    <meshStandardMaterial
      // For testing tiling values; forces recompile.
      key={`${JSON.stringify(tiling)}-${debugMode}`}
      displacementMap={displacementMap}
      map={displacementMap}
      displacementScale={2048}
      depthWrite
      // In debug mode, render both sides so we can see wireframe from below
      side={debugMode ? DoubleSide : FrontSide}
      onBeforeCompile={onBeforeCompile}
    />
  );
}

function TerrainMaterial({
  heightMap,
  textureNames,
  alphaMaps,
  emptySquares,
}: {
  heightMap: Uint16Array;
  emptySquares: number[];
  textureNames: string[];
  alphaMaps: Uint8Array[];
}) {
  const displacementMap = useMemo(() => {
    const f32HeightMap = uint16ToFloat32(heightMap);
    const displacementMap = new DataTexture(
      f32HeightMap,
      256,
      256,
      RedFormat,
      FloatType
    );
    displacementMap.colorSpace = NoColorSpace;
    displacementMap.generateMipmaps = false;
    displacementMap.needsUpdate = true;
    return displacementMap;
  }, [heightMap]);

  const visibilityMask: DataTexture | null = useMemo(() => {
    if (!emptySquares.length) {
      return null;
    }

    const terrainSize = 256;

    // Create a mask texture (1 = visible, 0 = invisible)
    const maskData = new Uint8Array(terrainSize * terrainSize);
    maskData.fill(255); // Start with everything visible

    for (const squareId of emptySquares) {
      // The squareId encodes position and count:
      // Bits 0-7: X position (starting position)
      // Bits 8-15: Y position
      // Bits 16+: Count (number of consecutive horizontal squares)
      const x = squareId & 0xff;
      const y = (squareId >> 8) & 0xff;
      const count = squareId >> 16;

      for (let i = 0; i < count; i++) {
        const px = x + i;
        const py = y;
        const index = py * terrainSize + px;
        if (index >= 0 && index < maskData.length) {
          maskData[index] = 0;
        }
      }
    }

    const visibilityMask = new DataTexture(
      maskData,
      terrainSize,
      terrainSize,
      RedFormat,
      UnsignedByteType
    );
    visibilityMask.colorSpace = NoColorSpace;
    visibilityMask.wrapS = visibilityMask.wrapT = ClampToEdgeWrapping;
    visibilityMask.magFilter = NearestFilter;
    visibilityMask.minFilter = NearestFilter;
    visibilityMask.needsUpdate = true;

    return visibilityMask;
  }, [emptySquares]);

  return (
    <Suspense
      fallback={
        // Render a wireframe while the terrain textures load.
        <meshStandardMaterial
          color="rgb(0, 109, 56)"
          displacementMap={displacementMap}
          displacementScale={2048}
          wireframe
        />
      }
    >
      <BlendedTerrainTextures
        displacementMap={displacementMap}
        visibilityMask={visibilityMask}
        textureNames={textureNames}
        alphaMaps={alphaMaps}
      />
    </Suspense>
  );
}

export const TerrainBlock = memo(function TerrainBlock({
  object,
}: {
  object: ConsoleObject;
}) {
  const terrainFile: string = getProperty(object, "terrainFile").value;

  const squareSize = useMemo(() => {
    const squareSizeString: string | undefined = getProperty(
      object,
      "squareSize"
    )?.value;
    return squareSizeString
      ? parseInt(squareSizeString, 10)
      : DEFAULT_SQUARE_SIZE;
  }, [object]);

  const emptySquares: number[] = useMemo(() => {
    const emptySquaresString: string | undefined = getProperty(
      object,
      "emptySquares"
    )?.value;

    return emptySquaresString
      ? emptySquaresString.split(" ").map((s) => parseInt(s, 10))
      : [];
  }, [object]);

  const position = useMemo(() => {
    // Terrain position.z is ignored in Torque - heightmap values are absolute
    const [x, y, z] = getPosition(object);
    return [x, 0, z] as [number, number, number];
  }, [object]);
  const q = useMemo(() => getRotation(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);

  const planeGeometry = useMemo(() => {
    const size = squareSize * 256;
    const geometry = new PlaneGeometry(size, size, 256, 256);
    // PlaneGeometry starts in XY plane. Rotate to XZ plane for Y-up world.
    geometry.rotateX(-Math.PI / 2);
    // Also need to rotate to swap X and Z.
    geometry.rotateY(-Math.PI / 2);
    // Shift origin from center to corner so position offset works correctly.
    // Tribes 2 terrain origin is at the corner, Three.js PlaneGeometry is centered.
    // But, T2 does this before the `squareSize` scales it up or down, so it's
    // essentially a fixed offset.
    const defaultSize = DEFAULT_SQUARE_SIZE * 256;
    geometry.translate(defaultSize / 2, 0, defaultSize / 2);
    return geometry;
  }, [squareSize]);

  const { data: terrain } = useTerrain(terrainFile);

  return (
    <group position={position} quaternion={q} scale={scale}>
      <mesh geometry={planeGeometry} receiveShadow castShadow>
        {terrain ? (
          <TerrainMaterial
            heightMap={terrain.heightMap}
            emptySquares={emptySquares}
            textureNames={terrain.textureNames}
            alphaMaps={terrain.alphaMaps}
          />
        ) : null}
      </mesh>
    </group>
  );
});
