import { DefaultLoadingManager, Source, Texture } from "three";
import { estimateDecodedImageBytes } from "../diagnostics/resourceEstimates";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import { createLogger } from "../logger";
import { markTextureSamplerUpdate } from "../textureUtils";
import { loadQueuedImage } from "./imageLoading";
import { PendingRequests } from "./pendingRequests";
import { observeFailedBitmapTexture } from "./bitmapSourceRecovery";
import { sharedSceneAssets, type SceneAssets } from "./sceneAssets";

const log = createLogger("bitmapTextures");
const cacheKey = {};
const pending = new PendingRequests<Texture, Texture>((error) =>
  log.error("Texture callback error: %o", error),
);
let cacheEntries = 0;
let decodedSources = 0;
let estimatedDecodedImageBytes = 0;
let requests = 0;
let cacheHits = 0;
const largestSources: Array<{ width: number; height: number; bytes: number }> =
  [];

registerMetricSource("bitmapTextureCache", () => ({
  cacheEntries,
  pendingEntries: pending.size,
  decodedSources,
  estimatedDecodedImageBytes,
}));
registerMetricSource("textureSourceLoads", () => {
  const values: Record<string, number> = { requests, cacheHits };
  largestSources.forEach((source, index) => {
    values[`largest${index + 1}Width`] = source.width;
    values[`largest${index + 1}Height`] = source.height;
    values[`largest${index + 1}DecodedBytes`] = source.bytes;
  });
  return values;
});

function loadBitmap(
  url: string,
  signal: AbortSignal,
  onLoad: (bitmap: ImageBitmap) => void,
  onError: () => void,
): Promise<ImageBitmap> {
  return loadQueuedImage(
    url,
    async () => {
      // Scene-owned requests can be canceled independently, including when
      // the next scene immediately asks for the same URL.
      const response = await fetch(DefaultLoadingManager.resolveURL(url), {
        signal,
      });
      if (!response.ok)
        throw new Error(`Texture request failed (${response.status}): ${url}`);
      const blob = await response.blob();
      signal.throwIfAborted();
      // Keep the queue slot until decoding settles. A late bitmap is closed
      // by the cache owner below instead of publishing it to a retired scene.
      return createImageBitmap(blob, {
        // Transparent RGB is also used as an environment mask.
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
    },
    { signal, onLoad, onError },
  );
}

function disposeBitmapTexture(texture: Texture): void {
  cacheEntries--;
  const image = texture.image as ImageBitmap | null;
  if (image) {
    decodedSources--;
    estimatedDecodedImageBytes -= estimateDecodedImageBytes(image) ?? 0;
    image.close();
    texture.image = null;
  }
  texture.dispose();
}

/** A cached immediate placeholder; ready cache hits notify synchronously.
 * Shape and particle bitmap decoding deliberately differs from HTML images. */
export function loadBitmapTexture(
  url: string,
  onLoad?: (texture: Texture) => void,
  onError?: (url: string) => void,
  assets: SceneAssets = sharedSceneAssets,
): Texture {
  const cache = assets.cache<string, Texture>(cacheKey, disposeBitmapTexture);
  requests++;
  let texture = cache.get(url);
  if (texture) {
    cacheHits++;
    if (texture.image) {
      onLoad?.(texture);
      return texture;
    }
  } else {
    texture = new Texture();
    // ImageBitmap ignores UNPACK_FLIP_Y_WEBGL.
    texture.flipY = false;
    cache.set(url, texture);
    cacheEntries++;
  }
  const target = texture;
  pending.request(
    target,
    (resolve, reject) => {
      void loadBitmap(
        url,
        assets.signal,
        (bitmap) => {
          if (assets.disposed) {
            bitmap.close();
            reject(url);
            return;
          }
          decodedSources++;
          const bytes = estimateDecodedImageBytes(bitmap) ?? 0;
          estimatedDecodedImageBytes += bytes;
          largestSources.push({
            width: bitmap.width,
            height: bitmap.height,
            bytes,
          });
          largestSources.sort((a, b) => b.bytes - a.bytes);
          largestSources.length = Math.min(largestSources.length, 5);
          target.image = bitmap;
          target.needsUpdate = true;
          resolve(target);
        },
        () => {
          if (cache.get(url) === target) {
            cache.delete(url);
            cacheEntries--;
          }
          reject(url);
        },
      ).catch(() => {});
    },
    onLoad,
    onError && (() => onError(url)),
  );
  return texture;
}

/** Independent sampler/UV state, sharing only the canonical bitmap Source.
 * A resolver reselects its candidates when the scene's image scope changes. */
export function loadBitmapTextureInstance(
  url: string | (() => readonly string[]),
  onError?: (url: string) => void,
  fallbackUrls: readonly string[] = [],
  assets: SceneAssets = sharedSceneAssets,
): Texture {
  const texture = new Texture();
  texture.flipY = false;
  const resolveUrls = typeof url === "function" ? url : undefined;
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  const markDisposed = () => {
    disposed = true;
    texture.removeEventListener("dispose", markDisposed);
    unsubscribe?.();
    unsubscribe = undefined;
  };
  texture.addEventListener("dispose", markDisposed);
  function start(
    first: string,
    fallbacks: readonly string[],
    owner: SceneAssets,
  ) {
    let nextFallback = 0;
    const isCurrent = () =>
      !owner.disposed &&
      (!resolveUrls || (!assets.disposed && owner === assets.textures));
    function load(candidate: string) {
      const source = loadBitmapTexture(
        candidate,
        (loaded) => {
          if (!resolveUrls)
            texture.removeEventListener("dispose", markDisposed);
          if (disposed || !isCurrent()) return;
          texture.source = loaded.source;
          markTextureSamplerUpdate(texture);
        },
        (failedUrl) => {
          if (!isCurrent()) return;
          if (!disposed && nextFallback < fallbacks.length) {
            load(fallbacks[nextFallback++]);
            return;
          }
          if (!resolveUrls)
            texture.removeEventListener("dispose", markDisposed);
          if (!disposed) observeFailedBitmapTexture(texture);
          onError?.(failedUrl);
        },
        owner,
      );
      if (!disposed && isCurrent()) texture.source = source.source;
    }
    load(first);
  }

  if (typeof url === "string") {
    start(url, fallbackUrls, assets);
  } else {
    const reload = () => {
      const [first, ...fallbacks] = url();
      if (first !== undefined) start(first, fallbacks, assets.textures);
    };
    unsubscribe = assets.onTexturesChanged(() => {
      if (disposed) return;
      // Three keys GPU storage by the attached Source. Evict it before
      // replacing the Source while keeping this sampler bound to the scene.
      texture.removeEventListener("dispose", markDisposed);
      try {
        texture.dispose();
      } finally {
        texture.addEventListener("dispose", markDisposed);
        texture.version = 0;
        texture.source = new Source(null);
      }
      reload();
    });
    try {
      reload();
    } catch (error) {
      markDisposed();
      throw error;
    }
  }
  return texture;
}

export function loadBitmapTextureAsync(
  url: string,
  assets: SceneAssets = sharedSceneAssets,
): Promise<Texture> {
  return new Promise((resolve, reject) => {
    loadBitmapTexture(
      url,
      resolve,
      (failedUrl) =>
        reject(
          new Error(`Failed to load texture: ${failedUrl}`, {
            cause: assets.signal.reason,
          }),
        ),
      assets,
    );
  });
}
