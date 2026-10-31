import { createLogger } from "../logger";
import { loadTerrain } from "../loaders";
import type { TerrainFile } from "../terrain";

const log = createLogger("TerrainBlock");

/**
 * TanStack Query's defaults, which the terrain query used: up to three
 * retries with exponential backoff, and five minutes of caching once a
 * file has no users left.
 */
const RETRIES = 3;
const MAX_RETRY_DELAY_MS = 30_000;
const UNUSED_CACHE_MS = 5 * 60 * 1000;

interface Entry {
  promise: Promise<TerrainFile>;
  users: number;
  gcTimer: ReturnType<typeof setTimeout> | null;
}

const entries = new Map<string, Entry>();

async function fetchTerrain(fileName: string): Promise<TerrainFile> {
  for (let failures = 0; ; failures++) {
    try {
      log.debug("Loading terrain: %s", fileName);
      return await loadTerrain(fileName);
    } catch (error) {
      if (failures >= RETRIES) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(1000 * 2 ** failures, MAX_RETRY_DELAY_MS)),
      );
    }
  }
}

/**
 * A parsed .ter file, loaded once per file name and shared while in use.
 * Call `release` when done with it; it stays cached for a while after its
 * last user releases it. A failed load is forgotten, so the next caller
 * retries.
 */
export function acquireTerrain(fileName: string): {
  promise: Promise<TerrainFile>;
  release: () => void;
} {
  let entry = entries.get(fileName);
  if (!entry) {
    const created: Entry = {
      promise: fetchTerrain(fileName),
      users: 0,
      gcTimer: null,
    };
    created.promise.catch(() => {
      if (entries.get(fileName) === created) entries.delete(fileName);
    });
    entries.set(fileName, created);
    entry = created;
  }
  const acquired = entry;
  if (acquired.gcTimer != null) {
    clearTimeout(acquired.gcTimer);
    acquired.gcTimer = null;
  }
  acquired.users++;
  let released = false;
  return {
    promise: acquired.promise,
    release: () => {
      if (released) return;
      released = true;
      if (--acquired.users > 0) return;
      acquired.gcTimer = setTimeout(() => {
        acquired.gcTimer = null;
        if (acquired.users === 0 && entries.get(fileName) === acquired)
          entries.delete(fileName);
      }, UNUSED_CACHE_MS);
    },
  };
}
