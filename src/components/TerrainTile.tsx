import { memo, Suspense, useCallback, useMemo } from "react";
import { type BufferGeometry, DataTexture, FrontSide } from "three";
import { useTexture } from "@react-three/drei";
import {
  FALLBACK_TEXTURE_URL,
  terrainTextureToUrl,
  textureToUrl,
} from "../loaders";
import { setupColor } from "../textureUtils";
import { updateTerrainTextureShader } from "../terrainMaterial";
import { useDebug } from "./SettingsProvider";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";

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
  geometry: BufferGeometry;
  displacementMap: DataTexture;
  visibilityMask: DataTexture;
  alphaTextures: DataTexture[];
  detailTextureName?: string;
  lightmap?: DataTexture;
  visible?: boolean;
}

function BlendedTerrainTextures({
  displacementMap,
  visibilityMask,
  textureNames,
  alphaTextures,
  detailTextureName,
  lightmap,
}: {
  displacementMap: DataTexture;
  visibilityMask: DataTexture;
  textureNames: string[];
  alphaTextures: DataTexture[];
  detailTextureName?: string;
  lightmap?: DataTexture;
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
        lightmap,
      });

      // Inject volumetric fog using global uniforms
      injectCustomFog(shader, globalFogUniforms);
    },
    [
      baseTextures,
      alphaTextures,
      visibilityMask,
      debugMode,
      detailTexture,
      detailTextureUrl,
      lightmap,
    ],
  );

  // Key must include factors that change shader code structure (not just uniforms)
  // - debugMode: affects fragment shader branching
  // - detailTextureUrl: affects vertex shader (adds varying) and fragment shader
  // - lightmap: affects shader structure (uses lightmap for NdotL instead of vertex normals)
  const materialKey = `${debugMode ? "debug" : "normal"}-${detailTextureUrl ? "detail" : "nodetail"}-${lightmap ? "lightmap" : "nolightmap"}`;

  // Displacement is done on CPU, so no displacementMap needed
  // We keep 'map' to provide UV coordinates for shader (vMapUv)
  // Use MeshLambertMaterial for compatibility with shadow maps
  return (
    <meshLambertMaterial
      key={materialKey}
      map={displacementMap}
      depthWrite
      side={FrontSide}
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
  lightmap,
}: {
  displacementMap: DataTexture;
  visibilityMask: DataTexture;
  textureNames: string[];
  alphaTextures: DataTexture[];
  detailTextureName?: string;
  lightmap?: DataTexture;
}) {
  return (
    <Suspense
      fallback={
        // Geometry is already CPU-displaced, so no displacementMap needed
        <meshLambertMaterial color="rgb(0, 109, 56)" wireframe />
      }
    >
      <BlendedTerrainTextures
        displacementMap={displacementMap}
        visibilityMask={visibilityMask}
        textureNames={textureNames}
        alphaTextures={alphaTextures}
        detailTextureName={detailTextureName}
        lightmap={lightmap}
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
  lightmap,
  visible = true,
}: TerrainTileProps) {
  const position = useMemo(() => {
    // Terrain geometry is centered at origin, but Tribes 2 terrain origin is at
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
      castShadow
      receiveShadow
      visible={visible}
    >
      <TerrainMaterial
        displacementMap={displacementMap}
        visibilityMask={visibilityMask}
        textureNames={textureNames}
        alphaTextures={alphaTextures}
        detailTextureName={detailTextureName}
        lightmap={lightmap}
      />
    </mesh>
  );
});
