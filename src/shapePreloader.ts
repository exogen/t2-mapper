/**
 * Background preloader for shape GLBs. Drip-feeds useGLTF.preload() calls
 * via setTimeout so higher-priority rendering and network requests aren't
 * blocked. Covers all shapes from shapes.vl2 (~219 files).
 */

import { useGLTF } from "@react-three/drei";
import { getResourceList, getSourceAndPath } from "./manifest";
import { RESOURCE_ROOT_URL } from "./loaders";
import { createLogger } from "./logger";

const log = createLogger("shapePreloader");

/** Delay between preload batches (ms). */
const BATCH_DELAY = 200;
/** Number of shapes to preload per batch. */
const BATCH_SIZE = 2;

let started = false;

function shapePriority(name: string): number {
  const lower = name.toLowerCase();
  if (
    lower.startsWith("bioderm_") ||
    lower.endsWith("_male.dts") ||
    lower.endsWith("_female.dts")
  )
    return 0;
  if (lower.startsWith("weapon_")) return 1;
  if (lower.startsWith("pack_")) return 2;
  return 3;
}

/** All shape GLB URLs from shapes.vl2, sorted by priority. */
function getShapeUrls(): string[] {
  return getResourceList()
    .filter((key) => key.startsWith("shapes/") && key.endsWith(".dts"))
    .filter((key) => {
      const [sourcePath] = getSourceAndPath(key);
      return sourcePath === "shapes.vl2";
    })
    .sort((a, b) => shapePriority(a) - shapePriority(b))
    .map((key) => {
      const [sourcePath, actualPath] = getSourceAndPath(key);
      const glbPath = actualPath.replace(/\.dts$/i, ".glb");
      return `${RESOURCE_ROOT_URL}@vl2/${sourcePath}/${glbPath}`;
    });
}

/**
 * Start background preloading of all shapes.vl2 GLBs. Safe to call multiple
 * times — only the first call has any effect. Preloading is deferred and
 * throttled so it doesn't compete with on-demand loads.
 */
export function startShapePreload(): void {
  if (started) return;
  started = true;

  const urls = getShapeUrls();
  log.info("Preloading %d shapes from shapes.vl2", urls.length);

  let index = 0;

  function preloadBatch() {
    const end = Math.min(index + BATCH_SIZE, urls.length);
    for (let i = index; i < end; i++) {
      useGLTF.preload(urls[i]);
    }
    index = end;
    if (index < urls.length) {
      setTimeout(preloadBatch, BATCH_DELAY);
    } else {
      log.info("Shape preloading complete");
    }
  }

  // Defer the first batch so we don't interfere with initial render.
  setTimeout(preloadBatch, 1000);
}
