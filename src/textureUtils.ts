/**
 * Generic texture setup utilities.
 */
import {
  DataTexture,
  ImageBitmapLoader,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RGBAFormat,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  UnsignedByteType,
} from "three";

const _bitmapLoader = new ImageBitmapLoader();
// Prevent the browser from premultiplying alpha, which destroys RGB data in
// transparent pixels. Tribes 2 uses the alpha channel for purposes other than
// transparency (e.g. environment map masking) on many non-Translucent textures.
_bitmapLoader.setOptions({ premultiplyAlpha: "none" });
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
  onError?: (url: string) => void,
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
  _bitmapLoader.load(
    url,
    (bitmap) => {
      texture.image = bitmap;
      texture.needsUpdate = true;
      onLoad?.(texture);
    },
    undefined,
    () => {
      // Remove failed URL from cache so fallback can be tried.
      _textureCache.delete(url);
      onError?.(url);
    },
  );
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

  // Only mark for upload if the texture actually has image data. Textures
  // from loadTexture() get needsUpdate set in the load callback instead.
  if (tex.image) {
    tex.needsUpdate = true;
  }

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
