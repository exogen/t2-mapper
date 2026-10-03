import type { Texture } from "three";

export interface TexturePixels {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

const pixelCache = new WeakMap<Texture, TexturePixels | null>();

export function texturePixels(texture: Texture): TexturePixels | null {
  const cached = pixelCache.get(texture);
  if (cached !== undefined) return cached;
  const image = texture.image as
    | { width: number; height: number; data?: Uint8Array | Uint8ClampedArray }
    | undefined;
  let pixels: TexturePixels | null = null;
  if (image && image.width > 0 && image.height > 0) {
    if (image.data) {
      pixels = { data: image.data, width: image.width, height: image.height };
    } else if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(image as unknown as CanvasImageSource, 0, 0);
        const { data } = ctx.getImageData(0, 0, image.width, image.height);
        pixels = { data, width: image.width, height: image.height };
      }
    }
  }
  // An image that has not arrived yet is retried; a failed readback is not.
  if (image && image.width > 0) pixelCache.set(texture, pixels);
  return pixels;
}
