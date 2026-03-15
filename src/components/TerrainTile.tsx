import { memo, Suspense, useCallback, useEffect, useMemo, useRef } from "react";
import {
  type BufferGeometry,
  DataTexture,
  FrontSide,
  type MeshLambertMaterial,
} from "three";
import { useTexture } from "@react-three/drei";
import {
  FALLBACK_TEXTURE_URL,
  terrainTextureToUrl,
  textureToUrl,
} from "../loaders";
import { setupTexture } from "../textureUtils";
import { updateTerrainTextureShader } from "../terrainMaterial";
import { useDebug } from "./SettingsProvider";
import { useAnisotropy } from "./useAnisotropy";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";

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

const BlendedTerrainTextures = memo(function BlendedTerrainTextures({
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
  const anisotropy = useAnisotropy();

  const baseTextures = useTexture(
    textureNames.map((name) => terrainTextureToUrl(name)),
    (textures) => {
      textures.forEach((tex) => setupTexture(tex, { anisotropy }));
    },
  );

  // Load detail texture if specified
  const detailTextureUrl = detailTextureName
    ? textureToUrl(detailTextureName)
    : null;

  const detailTexture = useTexture(
    detailTextureUrl ?? FALLBACK_TEXTURE_URL,
    (tex) => {
      setupTexture(tex, { anisotropy });
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
      detailTexture,
      detailTextureUrl,
      lightmap,
    ],
  );

  // Ref for forcing shader recompilation
  const materialRef = useRef<MeshLambertMaterial>(null);

  // Force shader recompilation when debugMode changes
  // r3f doesn't sync defines prop changes, so we update the material directly
  useEffect(() => {
    const mat = materialRef.current as MeshLambertMaterial & {
      defines?: Record<string, number>;
    };
    if (mat) {
      mat.defines ??= {};
      mat.defines.DEBUG_MODE = debugMode ? 1 : 0;
      mat.needsUpdate = true;
    }
  }, [debugMode]);

  // Key for shader structure changes (detail texture, lightmap)
  const materialKey = `${detailTextureUrl ? "detail" : "nodetail"}-${lightmap ? "lightmap" : "nolightmap"}`;

  // Displacement is done on CPU, so no displacementMap needed
  // We keep 'map' to provide UV coordinates for shader (vMapUv)
  // Use MeshLambertMaterial for compatibility with shadow maps
  return (
    <meshLambertMaterial
      ref={materialRef}
      key={materialKey}
      map={displacementMap}
      depthWrite
      side={FrontSide}
      defines={{ DEBUG_MODE: debugMode ? 1 : 0 }}
      onBeforeCompile={onBeforeCompile}
    />
  );
});

export const TerrainMaterial = memo(function TerrainMaterial({
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
});

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
    // Terrain geometry is centered at origin. Torque's terrain position formula
    // is -squareSize * 128, which equals -blockSize / 2. Since our geometry is
    // already centered, basePosition + geometryOffset cancels to 0 for single tiles.
    const geometryOffset = blockSize / 2;
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
