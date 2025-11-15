import {
  MeshStandardMaterial,
  Texture,
  RepeatWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from "three";

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
      roughnessFactor = texture2D(map, vMapUv).a * 1;
    #endif
    `
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
    side: 2, // DoubleSide
    metalness: 0.0,
    roughness: 1.0,
  });

  // Attach shader modifier (will be applied when shader is compiled)
  material.onBeforeCompile = alphaAsRoughnessShaderModifier;

  return material;
}
