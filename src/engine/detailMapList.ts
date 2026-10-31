import { loadDetailMapList } from "../loaders";
import { createLogger } from "../logger";

const log = createLogger("Sky");

export type DetailMapList = Awaited<ReturnType<typeof loadDetailMapList>>;

const lists = new Map<string, Promise<DetailMapList>>();

/**
 * Load a .dml file once per name and share it between the sky box and its
 * cloud layers. Its entries name the sky box faces (0-5), the environment
 * map (6) and the cloud layer textures (7+).
 */
export function loadSharedDetailMapList(name: string): Promise<DetailMapList> {
  let promise = lists.get(name);
  if (!promise) {
    log.debug("Loading detail map list: %s", name);
    promise = loadDetailMapList(name);
    promise.then(
      (list) =>
        log.debug("DML loaded: (%d entries) file=%s", list.length, name),
      (error: unknown) => {
        log.debug("DML failed: error=%s file=%s", String(error), name);
        // A failed list can be retried later.
        lists.delete(name);
      },
    );
    lists.set(name, promise);
  }
  return promise;
}
