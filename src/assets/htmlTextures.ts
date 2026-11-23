import { TextureLoader, type Texture } from "three";
import { estimateDecodedImageBytes } from "../diagnostics/resourceEstimates";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import { createImageLoadingManager, loadQueuedImage } from "./imageLoading";

const loader = new TextureLoader(createImageLoadingManager());
const cache = new Map<string, Promise<Texture>>();
const measuredImages = new WeakSet<object>();
let pendingEntries = 0;
let cacheHits = 0;
let skippedUploads = 0;
let decodedSources = 0;
let estimatedDecodedImageBytes = 0;

registerMetricSource("imageTextureCache", () => ({
  cacheEntries: cache.size,
  pendingEntries,
  cacheHits,
  skippedUploads,
  decodedSources,
  estimatedDecodedImageBytes,
}));

/** Scalar bridge for the view preparation stage; never retains a renderer. */
export function recordSkippedHtmlTextureUpload(): void {
  skippedUploads++;
}

/** Share view textures per URL with the original HTML decoder defaults.
 * Bitmap textures have independent source ownership and decoder semantics. */
export function loadHtmlTexture(url: string): Promise<Texture> {
  let promise = cache.get(url);
  if (!promise) {
    pendingEntries++;
    promise = loadQueuedImage(url, () => loader.loadAsync(url), {
      onError: () => cache.delete(url),
    })
      .then((texture) => {
        const image: unknown = texture.image;
        if (image && typeof image === "object" && !measuredImages.has(image)) {
          measuredImages.add(image);
          decodedSources++;
          estimatedDecodedImageBytes += estimateDecodedImageBytes(image) ?? 0;
        }
        return texture;
      })
      .finally(() => {
        pendingEntries--;
      });
    cache.set(url, promise);
  } else cacheHits++;
  return promise;
}
