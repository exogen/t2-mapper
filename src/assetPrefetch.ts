/**
 * Background prefetch of game assets scoped by the stream's own state
 * instead of blanket-loading
 * shapes.vl2. Priority order comes from the provider: scene geometry
 * first (the terrain file and interior DIFs detected from scene ghosts —
 * the world's biggest visual chunks), then native shapes from static scene
 * ghosts and datablock categories needed for rendering or collision.
 * T2 servers send the mod's entire datablock set at connect regardless
 * of map, so only selected categories are prefetched. A bounded number of
 * jobs runs at once, with a small delay before starting their replacements.
 * Completion includes model data and dependent images/atlases, never renderer
 * uploads. Visible views can consume model data before those images are ready.
 */

import { loadInteriorDependencies } from "./assets/interiorAssets";
import { acquireTerrain } from "./engine/terrainCache";
import { loadHtmlTexture } from "./assets/htmlTextures";
import { loadShapeDependencies } from "./engine/shapeCache";
import { interiorToUrl, textureToUrl, terrainTextureToUrl } from "./loaders";
import { createLogger } from "./logger";
import type { PreloadAsset } from "./stream/types";
import { classifyDevice, readDeviceSignals } from "./deviceConstraints";
import { registerMetricSource } from "./diagnostics/resourceMetricRegistry";
import { deviceTierValue, performanceTuning } from "./performanceTuning";

const log = createLogger("assetPrefetch");

let provider: (() => PreloadAsset[]) | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let startDelayPending = false;
/** Session bookkeeping, keyed kind:name. The asset caches deduplicate loads. */
const preloaded = new Set<string>();
let generation = 0;
let concurrency: number = performanceTuning.assetPrefetch.concurrency.desktop;
let activeJobs = 0;
let peakActiveJobs = 0;
let completedJobs = 0;
let failedJobs = 0;

registerMetricSource("assetPrefetch", () => ({
  activeJobs,
  peakActiveJobs,
  concurrency,
  sessionEntries: preloaded.size,
  completedJobs,
  failedJobs,
}));

async function prefetch(asset: PreloadAsset, owner: number): Promise<void> {
  switch (asset.kind) {
    case "texture":
      await loadHtmlTexture(textureToUrl(asset.name));
      break;
    case "shape":
      await loadShapeDependencies(asset.name);
      break;
    case "interior": {
      await loadInteriorDependencies(interiorToUrl(asset.name));
      break;
    }
    case "terrain": {
      // Load AND parse the .ter into the terrain view's cache, then
      // preload every referenced terrain texture — the largest visual
      // win on join.
      const { promise, release } = acquireTerrain(asset.name);
      const ter = await promise.finally(release);
      // An abandoned map must not fan out into a new group of texture loads.
      if (owner !== generation || !provider) return;
      for (const name of ter.textureNames) {
        if (owner !== generation || !provider) return;
        await loadHtmlTexture(terrainTextureToUrl(name));
      }
      break;
    }
  }
}

function schedule(delay: number): void {
  if (!provider) return;
  if (timer != null) clearTimeout(timer);
  timer = setTimeout(tick, delay);
}

/**
 * Start (or retarget) background prefetching for a stream. The provider
 * returns the session's known assets in priority order — re-polled
 * continuously so late-arriving state is picked up.
 */
export function startAssetPrefetch(getAssets: () => PreloadAsset[]): void {
  generation++;
  preloaded.clear();
  provider = getAssets;
  concurrency = deviceTierValue(
    performanceTuning.assetPrefetch.concurrency,
    classifyDevice(readDeviceSignals()).constrained,
  );
  // In-flight shared loads from the previous owner still count against the
  // limit. They may serve active views, so do not cancel or forget them.
  startDelayPending = true;
  schedule(performanceTuning.assetPrefetch.startDelayMs);
}

/** Detach the active provider (keeps the global preload caches). */
export function stopAssetPrefetch(): void {
  generation++;
  preloaded.clear();
  provider = null;
  startDelayPending = false;
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
}

function tick(): void {
  timer = null;
  startDelayPending = false;
  if (!provider) return;
  const currentProvider = provider;
  const owner = generation;
  let assets: PreloadAsset[];
  try {
    assets = currentProvider();
  } catch (e) {
    log.warn("preload asset provider failed: %o", e);
    assets = [];
  }
  // Providers and synchronous cache callbacks can stop/retarget this work.
  // Leave the replacement's timer and bookkeeping to its own generation.
  if (owner !== generation || provider !== currentProvider) return;
  for (const asset of assets) {
    if (owner !== generation || provider !== currentProvider) return;
    if (activeJobs >= concurrency) break;
    if (!asset.name) continue;
    const key = `${asset.kind}:${asset.name}`;
    if (preloaded.has(key)) continue;
    preloaded.add(key);
    activeJobs++;
    peakActiveJobs = Math.max(peakActiveJobs, activeJobs);
    void prefetch(asset, owner)
      .catch((error: unknown) => {
        failedJobs++;
        log.debug("%s prefetch failed: %o", asset.kind, error);
      })
      .finally(() => {
        activeJobs--;
        completedJobs++;
        // Old work may finish during a new owner's initial render delay.
        if (provider && !startDelayPending)
          schedule(performanceTuning.assetPrefetch.refillDelayMs);
      });
  }
  if (timer == null) schedule(performanceTuning.assetPrefetch.rescanDelayMs);
}
