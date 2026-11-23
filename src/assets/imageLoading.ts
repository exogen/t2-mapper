import { DefaultLoadingManager, LoadingManager } from "three";
import { createLogger } from "../logger";
import { imageWorkQueue } from "./imageWorkQueue";

const log = createLogger("imageLoading");

function notify(callback: () => void): void {
  try {
    callback();
  } catch (error) {
    log.error("Image loading observer error: %o", error);
  }
}

/** Internal Three loaders track their own fetch activity. The outer activity
 * below owns global progress, including queue wait and asynchronous decoding. */
export function createImageLoadingManager(): LoadingManager {
  const manager = new LoadingManager();
  manager.resolveURL = (url) => DefaultLoadingManager.resolveURL(url);
  return manager;
}

export function loadQueuedImage<T>(
  url: string,
  start: () => T | PromiseLike<T>,
  observers: {
    onLoad?: (value: T) => void;
    onError?: (error: unknown) => void;
  } = {},
): Promise<T> {
  notify(() => DefaultLoadingManager.itemStart(url));
  return imageWorkQueue
    .run(start)
    .then(
      (value) => {
        observers.onLoad?.(value);
        return value;
      },
      (error: unknown) => {
        observers.onError?.(error);
        notify(() => DefaultLoadingManager.itemError(url));
        throw error;
      },
    )
    .finally(() => notify(() => DefaultLoadingManager.itemEnd(url)));
}
