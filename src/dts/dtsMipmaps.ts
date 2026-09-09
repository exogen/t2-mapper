import type { Texture } from "three";

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
interface Canvas2D {
  drawImage(
    image: unknown,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void;
  getImageData(x: number, y: number, width: number, height: number): Pixels;
}
interface Canvas {
  getContext(type: "2d"): Canvas2D | null;
}

/** MipMapZeroBorder keeps the outermost texels transparent at every mip
 * level. Install lazily: the source image is available at first upload. */
export function installDTSZeroBorderMipmaps(texture: Texture): void {
  const previous = texture.onUpdate;
  texture.onUpdate = (current) => {
    previous?.(current);
    const image = texture.image as
      { width?: number; height?: number } | undefined;
    const Canvas = (
      globalThis as unknown as {
        OffscreenCanvas?: new (width: number, height: number) => Canvas;
      }
    ).OffscreenCanvas;
    if (!Canvas || !image?.width || !image.height) return;
    texture.onUpdate = previous;
    const mipmaps: unknown[] = [image];
    let width = image.width,
      height = image.height;
    while (width > 1 || height > 1) {
      width = Math.max(1, width >> 1);
      height = Math.max(1, height >> 1);
      const context = new Canvas(width, height).getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (!x || !y || x === width - 1 || y === height - 1)
            pixels.data.fill(0, (y * width + x) * 4, (y * width + x + 1) * 4);
      mipmaps.push(pixels);
    }
    texture.mipmaps = mipmaps as Texture["mipmaps"];
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
  };
}
