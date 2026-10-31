import {
  FrontSide,
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
import { updateTerrainTextureShader } from "../terrainMaterial";
import { injectCustomFog } from "../fogShader";
import { globalFogUniforms } from "../globalFogUniforms";
import { loadTextures } from "./textures";

// Texture tiling factors for each terrain layer
const TILING: Record<number, number> = {
  0: 32,
  1: 32,
  2: 32,
  3: 32,
  4: 32,
  5: 32,
};

/**
 * A terrain block's layer textures and detail texture, loaded and set up.
 */
export interface TerrainTextures {
  textureNames: string[];
  baseTextures: Texture[];
  /**
   * Without a detail texture, the (unused) fallback texture.
   */
  detailTexture: Texture;
  detailTextureUrl: string | null;
}

/**
 * Load the layer textures and the detail texture (or, without one, the
 * fallback texture) and configure them before upload.
 */
export async function loadTerrainTextures(
  textureNames: string[],
  detailTextureName: string | undefined,
  renderer: WebGLRenderer,
): Promise<TerrainTextures> {
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  const detailTextureUrl = detailTextureName
    ? textureToUrl(detailTextureName)
    : null;
  const textures = await loadTextures(
    [
      ...textureNames.map((name) => terrainTextureToUrl(name)),
      detailTextureUrl ?? FALLBACK_TEXTURE_URL,
    ],
    renderer,
    (tex) => {
      tex.colorSpace = NoColorSpace;
      setupTexture(tex, { anisotropy, noColorSpace: true });
    },
  );
  const detailTexture = textures.pop()!;
  return {
    textureNames,
    baseTextures: textures,
    detailTexture,
    detailTextureUrl,
  };
}

/**
 * Shown until the terrain's textures load.
 */
export function createTerrainFallbackMaterial(): MeshLambertMaterial {
  // Geometry is already CPU-displaced, so no displacementMap needed
  return new MeshLambertMaterial({ color: "rgb(0, 109, 56)", wireframe: true });
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
  {
    textureNames,
    baseTextures,
    detailTexture,
    detailTextureUrl,
  }: TerrainTextures,
  {
    visibilityMask,
    alphaTextures,
    squareSize,
    detailViewportHeight,
    lightmap: initialLightmap,
    debugMode,
  }: {
    visibilityMask: DataTexture;
    alphaTextures: DataTexture[];
    squareSize: number;
    detailViewportHeight: { value: number };
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
      detailTexture: detailTextureUrl ? detailTexture : null,
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
    [
      textureNames.join(","),
      detailTextureUrl ?? "none",
      lightmap.id,
      textureIds,
    ].join("|");

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
