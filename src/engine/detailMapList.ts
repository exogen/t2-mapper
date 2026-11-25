import { loadDetailMapList } from "../loaders";
import { createLogger } from "../logger";
import type { SceneAssets } from "../assets/sceneAssets";

const log = createLogger("Sky");

export type DetailMapList = Awaited<ReturnType<typeof loadDetailMapList>>;

const listCacheKey = {};

/**
 * Load a .dml file once per name and share it between the sky box and its
 * cloud layers. Its entries name the sky box faces (0-5), the environment
 * map (6) and the cloud layer textures (7+).
 */
export function loadSharedDetailMapList(
  name: string,
  assets: SceneAssets,
): Promise<DetailMapList> {
  const lists = assets.cache<string, Promise<DetailMapList>>(listCacheKey);
  let promise = lists.get(name);
  if (!promise) {
    log.debug("Loading detail map list: %s", name);
    promise = loadDetailMapList(name, assets.signal);
    promise.then(
      (list) =>
        log.debug("DML loaded: (%d entries) file=%s", list.length, name),
      (error: unknown) => {
        if (!assets.disposed)
          log.debug("DML failed: error=%s file=%s", String(error), name);
        // A failed list can be retried later.
        lists.delete(name);
      },
    );
    lists.set(name, promise);
  }
  return promise;
}
