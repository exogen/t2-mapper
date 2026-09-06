/**
 * Background prefetch of game assets the current session will certainly
 * render, scoped by the stream's own state instead of blanket-loading
 * shapes.vl2. Priority order comes from the provider: scene geometry
 * first (the terrain file and interior GLBs detected from scene ghosts —
 * the world's biggest visual chunks), then shape GLBs from static scene
 * ghosts and datablock categories certain to appear (player armors, held
 * weapon/pack images, items, static shapes). T2 servers send the mod's
 * ENTIRE datablock set at connect regardless of map, so category
 * membership is the useful signal; vehicles, turrets, and deployables
 * load on demand at first sight (measured ~1-4ms per GLB). Drip-fed so
 * the prefetch never competes with on-demand loads.
 */

import { useGLTF, useTexture } from "@react-three/drei";
import {
  shapeToUrl,
  interiorToUrl,
  textureToUrl,
  terrainTextureToUrl,
  loadTerrain,
} from "./loaders";
import { loadTexture } from "./textureUtils";
import { createLogger } from "./logger";
import type { PreloadAsset } from "./stream/types";
import { glbAnimationDurations, parseGlbJson } from "./glbJson";
import { registerShapeSequences } from "./stream/shapeSequences";
import {
  registerShapeBounds,
  shapeBoundsFromExtras,
} from "./stream/shapeBounds";

const log = createLogger("assetPrefetch");

/** Delay between preload batches (ms). */
const BATCH_DELAY = 100;
/** Number of assets to preload per batch. */
const BATCH_SIZE = 6;
/** Rescan interval once the current asset set is drained — datablocks
 *  and scene ghosts keep arriving during handshakes and mission changes. */
const RESCAN_DELAY = 2000;

let provider: (() => PreloadAsset[]) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** Assets ever prefetched, keyed kind:name (the caches are global). */
const preloaded = new Set<string>();

/**
 * Fetch a GLB (shared HTTP cache with the loader) and preload the
 * textures its materials reference, so models appear fully textured
 * instead of texture-popping. Interior materials are named after their
 * texture (InteriorTexture does textureToUrl(material.name)); shape
 * materials carry a resource_path in extras and load through the shared
 * loadTexture cache (IFL materials go through the atlas loader instead).
 * Shape sequence durations are registered from the same JSON chunk.
 */
async function prefetchGlbTextures(
  url: string,
  kind: "shape" | "interior",
  name: string,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) return;
  const json = parseGlbJson(await res.arrayBuffer());
  if (!json) return;
  if (kind === "shape") {
    registerShapeSequences(name, glbAnimationDurations(json));
    const bounds = shapeBoundsFromExtras(json.scenes?.[0]?.extras);
    if (bounds) registerShapeBounds(name, bounds);
  }
  let count = 0;
  for (const mat of json.materials ?? []) {
    if (kind === "interior") {
      if (mat.name) {
        useTexture.preload(textureToUrl(mat.name));
        count++;
      }
    } else {
      const path = mat.extras?.resource_path;
      if (path && !mat.extras?.flag_names?.includes("IflMaterial")) {
        loadTexture(textureToUrl(path));
        count++;
      }
    }
  }
  if (count > 0) {
    log.debug("prefetched %d texture(s) for %s", count, name);
  }
}

function prefetch(asset: PreloadAsset): void {
  switch (asset.kind) {
    case "texture":
      useTexture.preload(textureToUrl(asset.name));
      break;
    case "shape":
    case "interior": {
      const url =
        asset.kind === "shape"
          ? shapeToUrl(asset.name)
          : interiorToUrl(asset.name);
      useGLTF.preload(url);
      prefetchGlbTextures(url, asset.kind, asset.name).catch(() => {
        /* prefetch only — the component's own load reports errors */
      });
      break;
    }
    case "terrain":
      // Load AND parse the .ter (warms the HTTP cache for the terrain
      // component's own query), then preload every referenced terrain
      // texture — the largest visual win on join.
      void (async () => {
        const ter = await loadTerrain(asset.name);
        for (const name of ter.textureNames) {
          useTexture.preload(terrainTextureToUrl(name));
        }
        log.debug(
          "prefetched %d terrain texture(s) for %s",
          ter.textureNames.length,
          asset.name,
        );
      })().catch(() => {
        /* prefetch only — the component's own load reports errors */
      });
      break;
  }
}

/**
 * Start (or retarget) background prefetching for a stream. The provider
 * returns the session's known assets in priority order — re-polled
 * continuously so late-arriving state is picked up.
 */
export function startAssetPrefetch(getAssets: () => PreloadAsset[]): void {
  provider = getAssets;
  if (timer == null) {
    // Defer the first batch so we don't interfere with initial render.
    timer = setTimeout(tick, 1000);
  }
}

/** Detach the active provider (keeps the global preload caches). */
export function stopAssetPrefetch(): void {
  provider = null;
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
}

function tick(): void {
  timer = null;
  if (!provider) return;
  let assets: PreloadAsset[];
  try {
    assets = provider();
  } catch (e) {
    log.warn("preload asset provider failed: %o", e);
    assets = [];
  }
  let batched = 0;
  for (const asset of assets) {
    if (!asset.name) continue;
    const key = `${asset.kind}:${asset.name}`;
    if (preloaded.has(key)) continue;
    preloaded.add(key);
    prefetch(asset);
    if (++batched >= BATCH_SIZE) break;
  }
  if (batched > 0) {
    log.debug("prefetching %d asset(s) (%d total)", batched, preloaded.size);
  }
  timer = setTimeout(tick, batched > 0 ? BATCH_DELAY : RESCAN_DELAY);
}
