/**
 * Generic texture setup utilities.
 */
import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from "three";

export interface TextureSetupOptions {
  /** Texture repeat values [x, y]. Default: [1, 1] */
  repeat?: [number, number];
  /** Disable mipmaps (for alpha-tested textures to prevent artifacts). Default: false */
  disableMipmaps?: boolean;
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
  const { repeat = [1, 1], disableMipmaps = false } = options;

  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.repeat.set(...repeat);
  tex.flipY = false; // DDS/DIF textures are already flipped
  tex.anisotropy = 16;

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

  tex.needsUpdate = true;

  return tex;
}

/**
 * Setup a mask texture (single channel, linear color space).
 * Used for terrain blend masks and similar data textures.
 */
export function setupMask(data: Uint8Array): DataTexture {
  const tex = new DataTexture(
    data,
    256,
    256,
    RedFormat, // 1 channel
    UnsignedByteType, // 8-bit
  );

  // Masks should stay linear
  tex.colorSpace = NoColorSpace;

  // Set tiling / sampling. For NPOT sizes, disable mips or use power-of-two.
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = false; // if width/height are not powers of two
  tex.minFilter = LinearFilter; // avoid mips if generateMipmaps=false
  tex.magFilter = LinearFilter;

  tex.needsUpdate = true;

  return tex;
}
