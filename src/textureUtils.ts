/**
 * Generic texture setup utilities.
 */
import {
  DataTexture,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from "three";

const _bitmapLoader = new ImageBitmapLoader();
const _textureCache = new Map<string, Texture>();

/**
 * Load a texture using ImageBitmapLoader, which decodes images off the main
 * thread to avoid jank from synchronous image decodes during texSubImage2D.
 * Returns a cached Texture if the same URL was loaded before, otherwise creates
 * an initially-empty Texture that gets populated when the image loads.
 */
export function loadTexture(
  url: string,
  onLoad?: (texture: Texture) => void,
): Texture {
  const cached = _textureCache.get(url);
  if (cached) {
    // Already loaded (or in flight) — fire callback if image is ready.
    if (onLoad && cached.image) onLoad(cached);
    return cached;
  }
  const texture = new Texture();
  // ImageBitmap doesn't support UNPACK_FLIP_Y_WEBGL, so flipY must be false.
  // This matches our codebase where all textures use flipY = false.
  texture.flipY = false;
  _textureCache.set(url, texture);
  _bitmapLoader.load(url, (bitmap) => {
    texture.image = bitmap;
    texture.needsUpdate = true;
    onLoad?.(texture);
  });
  return texture;
}

/** Promise-based variant of loadTexture. */
export function loadTextureAsync(url: string): Promise<Texture> {
  const cached = _textureCache.get(url);
  if (cached) {
    return cached.image
      ? Promise.resolve(cached)
      : new Promise((resolve) => {
          // In flight — poll until populated (bitmapLoader doesn't expose
          // a way to attach multiple callbacks to the same request).
          const check = () => {
            if (cached.image) resolve(cached);
            else setTimeout(check, 16);
          };
          check();
        });
  }
  return new Promise((resolve, reject) => {
    const texture = new Texture();
    texture.flipY = false;
    _textureCache.set(url, texture);
    _bitmapLoader.load(
      url,
      (bitmap) => {
        texture.image = bitmap;
        texture.needsUpdate = true;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
}

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
