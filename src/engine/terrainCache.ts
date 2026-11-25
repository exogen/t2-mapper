import type { SceneAssets } from "../assets/sceneAssets";
import { createLogger } from "../logger";
import { loadTerrain } from "../loaders";
import type { TerrainFile } from "../terrain";

const log = createLogger("TerrainBlock");
const cacheKey = {};
const RETRIES = 3;

async function fetchTerrain(
  fileName: string,
  signal: AbortSignal,
): Promise<TerrainFile> {
  for (let failures = 0; ; failures++) {
    signal.throwIfAborted();
    try {
      log.debug("Loading terrain: %s", fileName);
      return await loadTerrain(fileName, signal);
    } catch (error) {
      if (signal.aborted || failures >= RETRIES) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** failures));
    }
  }
}

/** Share parsed terrain between prefetch and all placements in this scene. */
export function loadTerrainAsset(
  fileName: string,
  assets: SceneAssets,
): Promise<TerrainFile> {
  const entries = assets.cache<string, Promise<TerrainFile>>(cacheKey);
  let promise = entries.get(fileName);
  if (!promise) {
    const created = fetchTerrain(fileName, assets.signal);
    void created.catch(() => {
      if (entries.get(fileName) === created) entries.delete(fileName);
    });
    entries.set(fileName, created);
    promise = created;
  }
  return promise;
}
