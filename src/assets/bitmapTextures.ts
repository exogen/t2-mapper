import { FileLoader, Texture } from "three";
import { estimateDecodedImageBytes } from "../diagnostics/resourceEstimates";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import { createLogger } from "../logger";
import { markTextureSamplerUpdate } from "../textureUtils";
import { createImageLoadingManager, loadQueuedImage } from "./imageLoading";
import { PendingRequests } from "./pendingRequests";
import { observeFailedBitmapTexture } from "./bitmapSourceRecovery";
import { sharedSceneAssets, type SceneAssets } from "./sceneAssets";

const log = createLogger("bitmapTextures");
const loader = new FileLoader(createImageLoadingManager()).setResponseType(
  "blob",
);
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
    () =>
      new Promise<ImageBitmap>((resolve, reject) => {
        loader.load(
          url,
          (blob) => {
            void Promise.resolve()
              .then(() => {
                signal.throwIfAborted();
                return createImageBitmap(blob as unknown as Blob, {
                  // Transparent RGB is also used as an environment mask.
                  premultiplyAlpha: "none",
                  colorSpaceConversion: "none",
                });
              })
              .then(resolve, reject);
          },
          undefined,
          reject,
        );
      }),
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

/** Independent sampler/UV state, sharing only the canonical bitmap Source. */
export function loadBitmapTextureInstance(
  url: string,
  onError?: (url: string) => void,
  fallbackUrls: readonly string[] = [],
  assets: SceneAssets = sharedSceneAssets,
): Texture {
  const texture = new Texture();
  texture.flipY = false;
  let disposed = false;
  const markDisposed = () => {
    disposed = true;
  };
  texture.addEventListener("dispose", markDisposed);
  let nextFallback = 0;
  function load(candidate: string) {
    const source = loadBitmapTexture(
      candidate,
      (loaded) => {
        texture.removeEventListener("dispose", markDisposed);
        if (disposed) return;
        texture.source = loaded.source;
        markTextureSamplerUpdate(texture);
      },
      (failedUrl) => {
        if (
          !disposed &&
          !assets.disposed &&
          nextFallback < fallbackUrls.length
        ) {
          load(fallbackUrls[nextFallback++]);
          return;
        }
        texture.removeEventListener("dispose", markDisposed);
        if (!disposed && !assets.disposed) observeFailedBitmapTexture(texture);
        if (!assets.disposed) onError?.(failedUrl);
      },
      assets,
    );
    texture.source = source.source;
  }
  load(url);
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
