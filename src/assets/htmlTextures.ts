import { Texture } from "three";
import { estimateDecodedImageBytes } from "../diagnostics/resourceEstimates";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import type { AssetLoadPriority } from "./assetLoadQueue";
import {
  loadHtmlImage,
  loadQueuedImage,
  promoteQueuedImage,
} from "./imageLoading";
import { sharedSceneAssets, type SceneAssets } from "./sceneAssets";

const cacheKey = {};
interface Entry {
  key?: object;
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

function htmlTextures(assets: SceneAssets): Map<string, Entry> {
  return assets.cache<string, Entry>(cacheKey, (entry) => {
    cacheEntries--;
    const { texture } = entry;
    if (!texture) return;
    decodedSources--;
    estimatedDecodedImageBytes -= estimateDecodedImageBytes(texture.image) ?? 0;
    texture.dispose();
    texture.image = null;
  });
}

function adoptHtmlTexture(url: string, assets: SceneAssets): Entry | undefined {
  return assets.adoptCached<string, Entry>(
    cacheKey,
    url,
    (entry) => !!entry.texture,
  );
}

/** Keep the installed texture resident when its resolved image URL matches. */
export function retainHtmlTexture(url: string, assets: SceneAssets): boolean {
  htmlTextures(assets);
  return !!adoptHtmlTexture(url, assets);
}

/** Share view textures per URL with the original HTML decoder defaults.
 * Bitmap textures have independent source ownership and decoder semantics. */
export function loadHtmlTexture(
  url: string,
  assets: SceneAssets = sharedSceneAssets,
  priority: AssetLoadPriority = "demand",
): Promise<Texture> {
  const cache = htmlTextures(assets);
  let entry = cache.get(url) ?? adoptHtmlTexture(url, assets);
  if (!entry) {
    pendingEntries++;
    const forget = () => {
      if (cache.get(url) !== created) return;
      cache.delete(url);
      cacheEntries--;
    };
    const { signal } = assets;
    const key = priority === "critical" ? undefined : {};
    const promise = loadQueuedImage(url, () => loadHtmlImage(url, signal), {
      signal,
      onError: forget,
      priority,
      key,
    })
      .then((image) => {
        signal.throwIfAborted();
        const texture = new Texture(image);
        texture.needsUpdate = true;
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
    const created: Entry = { key, promise };
    entry = created;
    cache.set(url, created);
    cacheEntries++;
  } else {
    cacheHits++;
    if (!entry.texture && entry.key && priority !== "speculative")
      promoteQueuedImage(entry.key, priority);
  }
  return entry.promise;
}
