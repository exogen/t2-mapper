import {
  FrontSide,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NoColorSpace,
  type DataTexture,
  type Texture,
  type WebGLRenderer,
} from "three";
import {
  FALLBACK_TEXTURE_URL,
  terrainTextureToUrl,
  textureToUrl,
} from "../loaders";
import { setupTexture } from "../textureUtils";
import {
  updateTerrainTextureShader,
  type TerrainDetailUniforms,
} from "../terrainMaterial";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";
import { loadTextures } from "./textures";
import type { SceneAssets } from "../assets/sceneAssets";

// Texture tiling factors for each terrain layer
const TILING: Record<number, number> = {
  0: 32,
  1: 32,
  2: 32,
  3: 32,
  4: 32,
  5: 32,
};

export function terrainBaseTextureUrls(textureNames: string[]): string[] {
  return textureNames.map((name) => terrainTextureToUrl(name));
}

export function terrainDetailTextureUrls(name: string): string[] {
  const url = textureToUrl(name);
  return url === FALLBACK_TEXTURE_URL ? [] : [url];
}

/** Load and configure a terrain's color-byte textures before upload. */
export function loadTerrainTextures(
  urls: readonly string[],
  renderer: WebGLRenderer,
  signal?: AbortSignal,
  assets?: SceneAssets,
): Promise<Texture[]> {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  return loadTextures(
    urls,
    renderer,
    (tex) => {
      tex.colorSpace = NoColorSpace;
      setupTexture(tex, { anisotropy, noColorSpace: true });
    },
    signal,
    assets,
  );
}

/**
 * Shown until the terrain's textures load.
 */
export function createTerrainFallbackMaterial(): MeshBasicMaterial {
  // Geometry is already CPU-displaced, so no displacementMap needed
  return new MeshBasicMaterial({ color: "rgb(0, 109, 56)", wireframe: true });
}

export interface BlendedTerrainMaterial {
  readonly material: MeshLambertMaterial;
  /**
   * A re-bake replaced the lightmap texture: recompile with the new one.
   */
  setLightmap(lightmap: DataTexture): void;
  setDebugMode(debugMode: boolean): void;
}

/**
 * The terrain's layer blend, detail texture, baked lightmap and fog as
 * patches on a MeshLambertMaterial.
 *
 * Displacement is done on CPU — no displacementMap or map needed. UVs are
 * provided by vTerrainUv (injected in the vertex shader), avoiding an
 * unused `map` sampler that would waste a texture unit.
 */
export function createBlendedTerrainMaterial(
  baseTextures: Texture[],
  {
    visibilityMask,
    alphaTextures,
    squareSize,
    detailViewportHeight,
    detail,
    lightmap: initialLightmap,
    debugMode,
  }: {
    visibilityMask: DataTexture;
    alphaTextures: DataTexture[];
    squareSize: number;
    detailViewportHeight: { value: number };
    detail?: TerrainDetailUniforms;
    lightmap: DataTexture;
    debugMode: boolean;
  },
): BlendedTerrainMaterial {
  let lightmap = initialLightmap;
  const material = new MeshLambertMaterial({
    depthWrite: true,
    side: FrontSide,
  });
  material.defines = { DEBUG_MODE: debugMode ? 1 : 0 };
  material.onBeforeCompile = (shader) => {
    updateTerrainTextureShader({
      shader,
      baseTextures,
      alphaTextures,
      visibilityMask,
      tiling: TILING,
      squareSize,
      detailViewportHeight,
      detail,
      lightmap,
    });

    // Inject volumetric fog using global uniforms
    injectCustomFog(shader, globalFogUniforms);
  };
  // A unique program cache key so Three.js recompiles the shader when
  // textures change between maps. Without this, onBeforeCompile may not be
  // called because the program cache hash is identical.
  const textureIds = baseTextures.map((t) => t.id).join(",");
  material.customProgramCacheKey = () =>
    [textureIds, lightmap.id, detail ? "detail" : "none"].join("|");

  return {
    material,
    setLightmap(next) {
      if (next === lightmap) return;
      lightmap = next;
      material.needsUpdate = true;
    },
    setDebugMode(next) {
      // A define only takes effect through a recompile.
      material.defines ??= {};
      material.defines.DEBUG_MODE = next ? 1 : 0;
      material.needsUpdate = true;
    },
  };
}
