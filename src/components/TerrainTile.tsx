import { memo, Suspense, useCallback, useMemo } from "react";
import { DataTexture, DoubleSide, FrontSide, type PlaneGeometry } from "three";
import { useTexture } from "@react-three/drei";
import { terrainTextureToUrl } from "../loaders";
import { setupColor, updateTerrainTextureShader } from "../textureUtils";
import { useDebug } from "./SettingsProvider";

const DEFAULT_SQUARE_SIZE = 8;

// Texture tiling factors for each terrain layer
const TILING: Record<number, number> = {
  0: 32,
  1: 32,
  2: 32,
  3: 32,
  4: 32,
  5: 32,
};

interface TerrainTileProps {
  tileX: number;
  tileZ: number;
  blockSize: number;
  basePosition: { x: number; z: number };
  textureNames: string[];
  geometry: PlaneGeometry;
  displacementMap: DataTexture;
  visibilityMask: DataTexture;
  alphaTextures: DataTexture[];
  visible?: boolean;
}

function BlendedTerrainTextures({
  displacementMap,
  visibilityMask,
  textureNames,
  alphaTextures,
}: {
  displacementMap: DataTexture;
  visibilityMask: DataTexture;
  textureNames: string[];
  alphaTextures: DataTexture[];
}) {
  const { debugMode } = useDebug();

  const baseTextures = useTexture(
    textureNames.map((name) => terrainTextureToUrl(name)),
    (textures) => {
      textures.forEach((tex) => setupColor(tex));
    },
  );

  const onBeforeCompile = useCallback(
    (shader) => {
      updateTerrainTextureShader({
        shader,
        baseTextures,
        alphaTextures,
        visibilityMask,
        tiling: TILING,
        debugMode,
      });
    },
    [baseTextures, alphaTextures, visibilityMask, debugMode],
  );

  return (
    <meshStandardMaterial
      key={debugMode ? "debug" : "normal"}
      displacementMap={displacementMap}
      map={displacementMap}
      displacementScale={2048}
      depthWrite
      side={debugMode ? DoubleSide : FrontSide}
      onBeforeCompile={onBeforeCompile}
    />
  );
}

function TerrainMaterial({
  displacementMap,
  visibilityMask,
  textureNames,
  alphaTextures,
}: {
  displacementMap: DataTexture;
  visibilityMask: DataTexture;
  textureNames: string[];
  alphaTextures: DataTexture[];
}) {
  return (
    <Suspense
      fallback={
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
        alphaTextures={alphaTextures}
      />
    </Suspense>
  );
}

export const TerrainTile = memo(function TerrainTile({
  tileX,
  tileZ,
  blockSize,
  basePosition,
  textureNames,
  geometry,
  displacementMap,
  visibilityMask,
  alphaTextures,
  visible = true,
}: TerrainTileProps) {
  const position = useMemo(() => {
    // PlaneGeometry is centered at origin, but Tribes 2 terrain origin is at
    // corner. The engine always uses the default square size (8) for positioning.
    const geometryOffset = (DEFAULT_SQUARE_SIZE * 256) / 2;
    return [
      basePosition.x + tileX * blockSize + geometryOffset,
      0,
      basePosition.z + tileZ * blockSize + geometryOffset,
    ] as [number, number, number];
  }, [tileX, tileZ, blockSize, basePosition]);

  return (
    <mesh
      position={position}
      geometry={geometry}
      receiveShadow
      castShadow
      visible={visible}
    >
      <TerrainMaterial
        displacementMap={displacementMap}
        visibilityMask={visibilityMask}
        textureNames={textureNames}
        alphaTextures={alphaTextures}
      />
    </mesh>
  );
});
