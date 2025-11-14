import { uint16ToFloat32 } from "@/src/arrayUtils";
import { loadTerrain, terrainTextureToUrl } from "@/src/loaders";
import {
  ConsoleObject,
  getPosition,
  getProperty,
  getRotation,
  getScale,
} from "@/src/mission";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useCallback, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import {
  DataTexture,
  RedFormat,
  FloatType,
  NoColorSpace,
  NearestFilter,
  ClampToEdgeWrapping,
  UnsignedByteType,
  PlaneGeometry,
} from "three";
import {
  setupColor,
  setupMask,
  updateTerrainTextureShader,
} from "@/src/textureUtils";

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

  const onBeforeCompile = useCallback(
    (shader) => {
      updateTerrainTextureShader({
        shader,
        baseTextures,
        alphaTextures,
        visibilityMask,
      });
    },
    [baseTextures, alphaTextures, visibilityMask]
  );

  return (
    <meshStandardMaterial
      displacementMap={displacementMap}
      map={displacementMap}
      displacementScale={2048}
      depthWrite
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

export function TerrainBlock({ object }: { object: ConsoleObject }) {
  const terrainFile: string = getProperty(object, "terrainFile").value;

  const emptySquares: number[] = useMemo(() => {
    const emptySquaresString: string | undefined = getProperty(
      object,
      "emptySquares"
    )?.value;

    return emptySquaresString
      ? emptySquaresString.split(" ").map((s) => parseInt(s, 10))
      : [];
  }, [object]);

  const position = useMemo(() => getPosition(object), [object]);
  const scale = useMemo(() => getScale(object), [object]);
  const q = useMemo(() => getRotation(object), [object]);

  const planeGeometry = useMemo(() => {
    const geometry = new PlaneGeometry(2048, 2048, 256, 256);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(-Math.PI / 2);
    return geometry;
  }, []);

  const { data: terrain } = useTerrain(terrainFile);

  return (
    <mesh
      quaternion={q}
      position={position}
      scale={scale}
      geometry={planeGeometry}
    >
      {terrain ? (
        <TerrainMaterial
          heightMap={terrain.heightMap}
          emptySquares={emptySquares}
          textureNames={terrain.textureNames}
          alphaMaps={terrain.alphaMaps}
        />
      ) : null}
    </mesh>
  );
}
