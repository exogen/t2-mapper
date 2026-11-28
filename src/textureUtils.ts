/**
 * Generic texture setup utilities.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from "three";

/** Keep an effect invisible while its authored texture is pending. */
export const transparentTexture = new DataTexture(new Uint8Array(4), 1, 1);
transparentTexture.needsUpdate = true;

/** Recheck the sampler's GPU cache key while preserving the shared pixels'
 * revision. Three uploads new sampler variants and reuses resident ones.
 * An upload hook, such as DTS zero-border mipmap generation, needs to run
 * even when a matching variant is already resident. */
export function markTextureSamplerUpdate(texture: Texture): void {
  if (texture.onUpdate) texture.needsUpdate = true;
  else texture.version++;
}

export interface TextureSetupOptions {
  /** Texture repeat values [x, y]. Default: [1, 1] */
  repeat?: [number, number];
  /** Disable mipmaps (for alpha-tested textures to prevent artifacts). Default: false */
  disableMipmaps?: boolean;
  /** Override anisotropy level. Default: max supported by the GPU. */
  anisotropy?: number;
  /** Skip sRGB colorspace assignment (for textures sampled in sRGB space). */
  noColorSpace?: boolean;
}

/**
 * Setup a color texture with standard settings for the viewer.
 *
 * @param tex - The texture to configure
 * @param options - Optional configuration
 * @returns The configured texture
 */
export function setupTexture<T extends Texture>(
  tex: T,
  options: TextureSetupOptions = {},
): T {
  const {
    repeat = [1, 1],
    disableMipmaps = false,
    anisotropy,
    noColorSpace = false,
  } = options;

  tex.wrapS = tex.wrapT = RepeatWrapping;
  if (!noColorSpace) {
    tex.colorSpace = SRGBColorSpace;
  }
  tex.repeat.set(...repeat);
  tex.flipY = false; // DDS/DIF textures are already flipped
  tex.anisotropy = anisotropy ?? 1;

  if (disableMipmaps) {
    // Disable mipmaps - prevents checkerboard artifacts on alpha-tested materials
    // because alpha values get averaged at lower mip levels
    tex.generateMipmaps = false;
    tex.minFilter = LinearFilter;
  } else {
    tex.generateMipmaps = true;
    tex.minFilter = LinearMipmapLinearFilter;
  }
  tex.magFilter = LinearFilter;

  // The bitmap loader marks pending samplers once the pixels arrive.
  if (tex.image) markTextureSamplerUpdate(tex);

  return tex;
}

/**
 * Pack single-channel alpha masks into RGB textures (3 masks per texture).
 * Reduces sampler count from N to ceil(N/3). Each mask goes into the R, G,
 * or B channel. All masks must be 256×256.
 */
export function packMasksRGB(masks: Uint8Array[], size = 256): DataTexture[] {
  const packed: DataTexture[] = [];
  for (let i = 0; i < masks.length; i += 3) {
    const r = masks[i];
    const g = masks[i + 1];
    const b = masks[i + 2];
    const pixels = size * size;
    const rgba = new Uint8Array(pixels * 4);
    for (let j = 0; j < pixels; j++) {
      rgba[j * 4] = r[j];
      rgba[j * 4 + 1] = g ? g[j] : 0;
      rgba[j * 4 + 2] = b ? b[j] : 0;
      rgba[j * 4 + 3] = 255;
    }
    const tex = new DataTexture(rgba, size, size, RGBAFormat, UnsignedByteType);
    tex.colorSpace = NoColorSpace;
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.generateMipmaps = false;
    tex.minFilter = LinearFilter;
    tex.magFilter = LinearFilter;
    tex.needsUpdate = true;
    packed.push(tex);
  }
  return packed;
}
