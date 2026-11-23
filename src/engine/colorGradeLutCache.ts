import { Data3DTexture } from "three";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import type { ColorGradePreset } from "../graphicsEffects";
import { performanceTuning } from "../performanceTuning";

type LutSettings = Pick<
  Data3DTexture,
  | "format"
  | "internalFormat"
  | "type"
  | "colorSpace"
  | "minFilter"
  | "magFilter"
  | "wrapS"
  | "wrapT"
  | "wrapR"
  | "anisotropy"
  | "flipY"
  | "generateMipmaps"
  | "premultiplyAlpha"
  | "unpackAlignment"
>;

interface CachedLut {
  selection: ColorGradePreset;
  data: NonNullable<Data3DTexture["image"]["data"]>;
  width: number;
  height: number;
  depth: number;
  settings: LutSettings;
}

/** One canvas's last decoded grade, with no Texture, Source or GPU ownership.
 * Warm re-enables can upload immediately. Cold/oversize grades still load
 * asynchronously; the cap covers typed-array payload bytes, not object overhead. */
export class ColorGradeLutCache {
  private entry: CachedLut | undefined;
  private disposed = false;
  private readonly limitBytes: number;
  private readonly unregisterMetrics: () => void;

  constructor(
    limitBytes = performanceTuning.postProcessing.maxCachedLutCpuBytes,
  ) {
    if (!Number.isSafeInteger(limitBytes) || limitBytes < 0)
      throw new Error("Invalid color-grade cache byte limit");
    this.limitBytes = limitBytes;
    this.unregisterMetrics = registerMetricSource(
      "postProcessingLutCache",
      () => ({
        ownedLutBytes: this.entry?.data.byteLength ?? 0,
        limitBytes: this.limitBytes,
        entries: this.entry ? 1 : 0,
      }),
    );
  }

  remember(selection: ColorGradePreset, texture: Data3DTexture): void {
    if (this.disposed) return;
    this.clear();
    const { data, width, height, depth } = texture.image;
    if (!data || !data.byteLength || data.byteLength > this.limitBytes) return;
    // Own a tight copy: a subarray must never retain a much larger source buffer.
    this.entry = {
      selection,
      data: data.slice(),
      width,
      height,
      depth,
      settings: {
        format: texture.format,
        internalFormat: texture.internalFormat,
        type: texture.type,
        colorSpace: texture.colorSpace,
        minFilter: texture.minFilter,
        magFilter: texture.magFilter,
        wrapS: texture.wrapS,
        wrapT: texture.wrapT,
        wrapR: texture.wrapR,
        anisotropy: texture.anisotropy,
        flipY: texture.flipY,
        generateMipmaps: texture.generateMipmaps,
        premultiplyAlpha: texture.premultiplyAlpha,
        unpackAlignment: texture.unpackAlignment,
      },
    };
  }

  restore(selection: ColorGradePreset): Data3DTexture | undefined {
    const entry = this.entry;
    if (this.disposed || !entry || entry.selection !== selection) return;
    const texture = new Data3DTexture(
      entry.data,
      entry.width,
      entry.height,
      entry.depth,
    );
    Object.assign(texture, entry.settings);
    texture.needsUpdate = true;
    return texture;
  }

  clear(): void {
    this.entry = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.unregisterMetrics();
  }
}
