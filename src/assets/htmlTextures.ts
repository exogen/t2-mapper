import { TextureLoader, type Texture } from "three";
import { estimateDecodedImageBytes } from "../diagnostics/resourceEstimates";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import { createImageLoadingManager, loadQueuedImage } from "./imageLoading";
import { sharedSceneAssets, type SceneAssets } from "./sceneAssets";

const loader = new TextureLoader(createImageLoadingManager());
const cacheKey = {};
interface Entry {
  promise: Promise<Texture>;
  texture?: Texture;
}
let cacheEntries = 0;
let pendingEntries = 0;
let cacheHits = 0;
let skippedUploads = 0;
let decodedSources = 0;
let estimatedDecodedImageBytes = 0;

registerMetricSource("imageTextureCache", () => ({
  cacheEntries,
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
export function loadHtmlTexture(
  url: string,
  assets: SceneAssets = sharedSceneAssets,
): Promise<Texture> {
  const cache = assets.cache<string, Entry>(cacheKey, (entry) => {
    cacheEntries--;
    const { texture } = entry;
    if (!texture) return;
    decodedSources--;
    estimatedDecodedImageBytes -= estimateDecodedImageBytes(texture.image) ?? 0;
    texture.dispose();
    texture.image = null;
  });
  let entry = cache.get(url);
  if (!entry) {
    pendingEntries++;
    const forget = () => {
      if (cache.get(url) !== created) return;
      cache.delete(url);
      cacheEntries--;
    };
    const promise = loadQueuedImage(url, () => loader.loadAsync(url), {
      signal: assets.signal,
      onError: forget,
    })
      .then((texture) => {
        if (assets.disposed) {
          texture.dispose();
          assets.signal.throwIfAborted();
        }
        created.texture = texture;
        decodedSources++;
        estimatedDecodedImageBytes +=
          estimateDecodedImageBytes(texture.image) ?? 0;
        return texture;
      })
      .catch((error: unknown) => {
        forget();
        throw error;
      })
      .finally(() => {
        pendingEntries--;
      });
    const created: Entry = { promise };
    entry = created;
    cache.set(url, created);
    cacheEntries++;
  } else cacheHits++;
  return entry.promise;
}
