import { memo, Suspense, useCallback, useMemo } from "react";
import {
  DataTexture,
  DoubleSide,
  FrontSide,
  MeshLambertMaterial,
  type PlaneGeometry,
} from "three";
import { useTexture } from "@react-three/drei";
import {
  FALLBACK_TEXTURE_URL,
  terrainTextureToUrl,
  textureToUrl,
} from "../loaders";
import { setupColor } from "../textureUtils";
import { updateTerrainTextureShader } from "../terrainMaterial";
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
  detailTextureName?: string;
  visible?: boolean;
}

function BlendedTerrainTextures({
  displacementMap,
  visibilityMask,
  textureNames,
  alphaTextures,
  detailTextureName,
}: {
  displacementMap: DataTexture;
  visibilityMask: DataTexture;
  textureNames: string[];
  alphaTextures: DataTexture[];
  detailTextureName?: string;
}) {
  const { debugMode } = useDebug();

  const baseTextures = useTexture(
    textureNames.map((name) => terrainTextureToUrl(name)),
    (textures) => {
      textures.forEach((tex) => setupColor(tex));
    },
  );

  // Load detail texture if specified
  const detailTextureUrl = detailTextureName
    ? textureToUrl(detailTextureName)
    : null;

  const detailTexture = useTexture(
    detailTextureUrl ?? FALLBACK_TEXTURE_URL,
    (tex) => {
      setupColor(tex);
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
        detailTexture: detailTextureUrl ? detailTexture : null,
      });
    },
    [
      baseTextures,
      alphaTextures,
      visibilityMask,
      debugMode,
      detailTexture,
      detailTextureUrl,
    ],
  );

  // Key must include factors that change shader code structure (not just uniforms)
  // - debugMode: affects fragment shader branching
  // - detailTextureUrl: affects vertex shader (adds varying) and fragment shader
  const materialKey = `${debugMode ? "debug" : "normal"}-${detailTextureUrl ? "detail" : "nodetail"}`;

  return (
    <meshLambertMaterial
      key={materialKey}
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
  detailTextureName,
}: {
  displacementMap: DataTexture;
  visibilityMask: DataTexture;
  textureNames: string[];
  alphaTextures: DataTexture[];
  detailTextureName?: string;
}) {
  return (
    <Suspense
      fallback={
        <meshLambertMaterial
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
        detailTextureName={detailTextureName}
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
  detailTextureName,
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
        detailTextureName={detailTextureName}
      />
    </mesh>
  );
});
