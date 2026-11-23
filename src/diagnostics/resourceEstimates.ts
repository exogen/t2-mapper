import {
  AlphaFormat,
  ByteType,
  DepthFormat,
  DepthStencilFormat,
  FloatType,
  HalfFloatType,
  IntType,
  RedFormat,
  RedIntegerFormat,
  RGFormat,
  RGIntegerFormat,
  RGBFormat,
  RGBIntegerFormat,
  RGBAFormat,
  RGBAIntegerFormat,
  ShortType,
  UnsignedByteType,
  UnsignedInt248Type,
  UnsignedInt5999Type,
  UnsignedInt101111Type,
  UnsignedIntType,
  UnsignedShort4444Type,
  UnsignedShort5551Type,
  UnsignedShortType,
} from "three";

/** Structural types keep accounting independent of the DOM and renderer. */
export interface TextureMetricsInput {
  image?: unknown;
  mipmaps?: readonly unknown[];
  format?: number;
  type?: number;
  generateMipmaps?: boolean;
  isCubeTexture?: boolean;
  isCompressedTexture?: boolean;
  isCompressedArrayTexture?: boolean;
  isData3DTexture?: boolean;
}

export interface RenderTargetMetricsInput {
  width: number;
  height: number;
  depth?: number;
  texture: TextureMetricsInput;
  textures?: readonly TextureMetricsInput[];
  depthBuffer?: boolean;
  stencilBuffer?: boolean;
  depthTexture?: TextureMetricsInput | null;
  samples?: number;
  isWebGLCubeRenderTarget?: boolean;
}

function object(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function dimension(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : null;
}

function imageDimensions(image: unknown) {
  const info = object(image);
  if (!info) return null;
  const width = dimension(info.naturalWidth) ?? dimension(info.width);
  const height = dimension(info.naturalHeight) ?? dimension(info.height);
  if (width == null || height == null) return null;
  return { width, height, depth: dimension(info.depth) ?? 1 };
}

/** Estimate decoded RGBA image storage, or use the actual typed-array length.
 * Excludes browser decoder caches, canvas backing copies and driver overhead. */
export function estimateDecodedImageBytes(image: unknown): number | null {
  const data = object(image)?.data;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  const size = imageDimensions(image);
  return size ? size.width * size.height * size.depth * 4 : null;
}

function bytesPerPixel(texture: TextureMetricsInput): number | null {
  // Conservatively account depth24 as 32-bit storage. Depth/stencil is one
  // attachment, not separate depth and stencil allocations.
  if (texture.format === DepthFormat) return 4;
  if (texture.format === DepthStencilFormat)
    return texture.type === FloatType ? 8 : 4;
  if (
    texture.type === UnsignedShort4444Type ||
    texture.type === UnsignedShort5551Type
  )
    return 2;
  if (
    texture.type === UnsignedInt248Type ||
    texture.type === UnsignedInt5999Type ||
    texture.type === UnsignedInt101111Type
  )
    return 4;
  const channels =
    texture.format === RedFormat ||
    texture.format === RedIntegerFormat ||
    texture.format === AlphaFormat
      ? 1
      : texture.format === RGFormat || texture.format === RGIntegerFormat
        ? 2
        : texture.format === RGBFormat || texture.format === RGBIntegerFormat
          ? 3
          : texture.format == null ||
              texture.format === RGBAFormat ||
              texture.format === RGBAIntegerFormat
            ? 4
            : null;
  const componentBytes =
    texture.type == null ||
    texture.type === UnsignedByteType ||
    texture.type === ByteType
      ? 1
      : texture.type === HalfFloatType ||
          texture.type === UnsignedShortType ||
          texture.type === ShortType
        ? 2
        : texture.type === FloatType ||
            texture.type === UnsignedIntType ||
            texture.type === IntType
          ? 4
          : null;
  return channels != null && componentBytes != null
    ? channels * componentBytes
    : null;
}

function compressedMipBytes(mipmaps: readonly unknown[]): number | null {
  if (!mipmaps.length) return null;
  let bytes = 0;
  for (const mip of mipmaps) {
    const data = object(mip)?.data;
    if (!ArrayBuffer.isView(data)) return null;
    // Actual block data includes minimum-size blocks at tiny mip levels.
    bytes += data.byteLength;
  }
  return bytes;
}

/** Estimated texture allocation payload, NOT measured VRAM or JS heap.
 * Counts each supplied compressed mip's actual block bytes; generated mipmaps
 * are counted level by level (including non-square/3D textures). */
export function estimateTextureBytes(
  texture: TextureMetricsInput,
): number | null {
  const images = texture.isCubeTexture
    ? Array.isArray(texture.image)
      ? texture.image
      : null
    : [texture.image];
  if (!images?.length) return null;
  const compressed =
    texture.isCompressedTexture || texture.isCompressedArrayTexture;
  let total = 0;
  for (const image of images) {
    if (compressed) {
      const mips = texture.isCubeTexture
        ? object(image)?.mipmaps
        : texture.mipmaps;
      if (!Array.isArray(mips)) return null;
      const bytes = compressedMipBytes(mips);
      if (bytes == null) return null;
      total += bytes;
      continue;
    }
    const size = imageDimensions(image);
    const bpp = bytesPerPixel(texture);
    if (!size || bpp == null) return null;
    let { width, height, depth } = size;
    const levels =
      texture.mipmaps?.length ||
      (texture.generateMipmaps
        ? Math.floor(
            Math.log2(
              Math.max(width, height, texture.isData3DTexture ? depth : 1),
            ),
          ) + 1
        : 1);
    for (let level = 0; level < levels; level++) {
      total += width * height * depth * bpp;
      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));
      if (texture.isData3DTexture) depth = Math.max(1, Math.floor(depth / 2));
    }
  }
  return total;
}

/** Conservative target payload including color, one depth/stencil attachment,
 * and separate multisample renderbuffers where requested. A depth texture is
 * counted once; it does not imply an additional single-sample depth buffer.
 * Extension-based MSAA implementations and driver padding may differ. */
export function estimateRenderTargetBytes(
  target: RenderTargetMetricsInput,
): number | null {
  const textures = target.textures?.length ? target.textures : [target.texture];
  let colors = 0;
  let colorBase = 0;
  const faces = target.isWebGLCubeRenderTarget ? 6 : 1;
  for (const texture of new Set(textures)) {
    const bytes = estimateTextureBytes(texture);
    const bpp = bytesPerPixel(texture);
    if (bytes == null || bpp == null) return null;
    colors += bytes;
    colorBase +=
      target.width * target.height * (target.depth ?? 1) * faces * bpp;
  }
  let depth = 0;
  if (target.depthBuffer) {
    const bpp = target.depthTexture ? bytesPerPixel(target.depthTexture) : 4;
    if (bpp == null) return null;
    depth = target.width * target.height * (target.depth ?? 1) * faces * bpp;
  } else if (target.stencilBuffer) {
    depth = target.width * target.height * faces;
  }
  const samples = Math.max(0, Math.floor(target.samples ?? 0));
  return colors + depth + samples * (colorBase + depth);
}
