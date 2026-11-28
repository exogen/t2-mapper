import { DefaultLoadingManager } from "three";
import { createLogger } from "../logger";
import type { AssetLoadPriority } from "./assetLoadQueue";
import { imageWorkQueue } from "./imageWorkQueue";

const log = createLogger("imageLoading");

function notify(callback: () => void): void {
  try {
    callback();
  } catch (error) {
    log.error("Image loading observer error: %o", error);
  }
}

/** Keep the HTML element's decode behavior and cancel its request with its owner. */
export function loadHtmlImage(
  url: string,
  signal: AbortSignal,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const source = DefaultLoadingManager.resolveURL(url);
    signal.throwIfAborted();
    const image = document.createElement("img");
    if (!source.startsWith("data:")) image.crossOrigin = "anonymous";

    function cleanup() {
      image.removeEventListener("load", loaded);
      image.removeEventListener("error", failed);
      signal.removeEventListener("abort", cancel);
    }
    function loaded() {
      cleanup();
      resolve(image);
    }
    function failed(error: Event) {
      cleanup();
      reject(error);
    }
    function cancel() {
      cleanup();
      image.removeAttribute("src");
      reject(signal.reason);
    }
    image.addEventListener("load", loaded);
    image.addEventListener("error", failed);
    signal.addEventListener("abort", cancel, { once: true });
    try {
      image.src = source;
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

/** Increase the priority of an existing cache miss that has yet to start. */
export function promoteQueuedImage(
  key: object,
  priority: AssetLoadPriority,
): void {
  imageWorkQueue.promote(key, priority);
}

/** Own global progress for queue wait, fetching and decoding. */
export function loadQueuedImage<T>(
  url: string,
  start: () => T | PromiseLike<T>,
  {
    signal,
    onLoad,
    onError,
    priority,
    key,
  }: {
    signal: AbortSignal;
    onLoad?: (value: T) => void;
    onError?: (error: unknown) => void;
    priority?: AssetLoadPriority;
    key?: object;
  },
): Promise<T> {
  notify(() => DefaultLoadingManager.itemStart(url));
  return imageWorkQueue
    .run(start, signal, { priority, key })
    .then(
      (value) => {
        onLoad?.(value);
        return value;
      },
      (error: unknown) => {
        onError?.(error);
        if (!signal.aborted) notify(() => DefaultLoadingManager.itemError(url));
        throw error;
      },
    )
    .finally(() => notify(() => DefaultLoadingManager.itemEnd(url)));
}
