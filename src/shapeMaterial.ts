/**
 * Shape material utilities and shader modifications.
 */

import {
  DoubleSide,
  MeshStandardMaterial,
  Texture,
  RepeatWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from "three";
import { SHAPE_LIGHTING } from "./lightingConfig";

/**
 * Inject lighting multipliers into a MeshLambertMaterial or MeshBasicMaterial shader.
 * Call this from onBeforeCompile after other shader modifications (e.g., fog).
 */
export function injectShapeLighting(shader: any): void {
  // Add lighting multiplier uniforms
  shader.uniforms.shapeDirectionalFactor = {
    value: SHAPE_LIGHTING.directional,
  };
  shader.uniforms.shapeAmbientFactor = { value: SHAPE_LIGHTING.ambient };

  // Declare uniforms in fragment shader
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>
uniform float shapeDirectionalFactor;
uniform float shapeAmbientFactor;
`,
  );

  // Scale directional and ambient light contributions
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_fragment_end>",
    `#include <lights_fragment_end>
  // Apply shape-specific lighting multipliers
  reflectedLight.directDiffuse *= shapeDirectionalFactor;
  reflectedLight.indirectDiffuse *= shapeAmbientFactor;
`,
  );
}

// Shared shader modification function to avoid duplication
const alphaAsRoughnessShaderModifier = (shader: any) => {
  // Modify fragment shader to extract alpha channel as roughness after map is sampled
  // We need to intercept after diffuseColor is set from the map
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <roughness_fragment>",
    `
    #include <roughness_fragment>
    // Override roughness with map alpha channel if map exists
    #ifdef USE_MAP
      roughnessFactor = texture2D(map, vMapUv).a;
    #endif
    `,
  );
};

/**
 * Configures a texture for use with alpha-as-roughness materials
 * @param texture - The texture to configure
 */
export function setupAlphaAsRoughnessTexture(texture: Texture) {
  texture.wrapS = texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.flipY = false;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
}

/**
 * Creates a reusable shader-enhanced material that treats alpha as roughness
 * The same material instance can be used with different textures by setting the `map` property
 * @returns A pre-configured MeshStandardMaterial with the shader modifier attached
 */
export function createAlphaAsRoughnessMaterial() {
  const material = new MeshStandardMaterial({
    side: DoubleSide,
    metalness: 0.0,
    roughness: 1.0,
  });

  // Attach shader modifier (will be applied when shader is compiled)
  material.onBeforeCompile = alphaAsRoughnessShaderModifier;

  return material;
}
