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
 * Ordinary shape jobs include model data and dependent images/atlases.
 * Recorded playback can provide jobs that also warm renderer resources.
 */

import { loadInteriorDependencies } from "./assets/interiorAssets";
import { loadTerrainAsset } from "./engine/terrainCache";
import { DefaultLoadingManager, type LoadingManager } from "three";
import { sharedSceneAssets, type SceneAssets } from "./assets/sceneAssets";
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
type PrefetchOwner = { assets: SceneAssets; manager: LoadingManager };
interface PriorityAssetJob {
  key: string;
  load(): Promise<void>;
}
interface RecordedAssetBatch {
  jobs: readonly PriorityAssetJob[];
  scanning: boolean;
  /** Give the opening recording window slots ahead of background discovery. */
  blockBackground?: boolean;
}

const RECORDED_RESCAN_MS = 150;
const RECORDED_SCAN_SLICE_DELAY_MS = 50;
let getOwner: (() => PrefetchOwner) | undefined;
let getPriorityJobs: (() => RecordedAssetBatch | null) | undefined;
let previousTextures: SceneAssets | undefined;
let timer: ReturnType<typeof setTimeout> | null = null;
let scheduledAt = 0;
let genericStartAt = 0;
/** In-flight and settled jobs share the same keys across both providers. */
const jobs = new Map<string, boolean>();
let generation = 0;
let concurrency: number = performanceTuning.assetPrefetch.concurrency.desktop;
let activeJobs = 0;
let peakActiveJobs = 0;
let completedJobs = 0;
let failedJobs = 0;
let recordedWaitingJobs: number | null = null;
let recordedScanning = false;

export function readAssetPrefetchMetrics() {
  return {
    activeJobs,
    peakActiveJobs,
    concurrency,
    sessionEntries: jobs.size,
    completedJobs,
    failedJobs,
    recordedWaitingJobs,
    recordedScanning: Number(recordedScanning),
  };
}

registerMetricSource("assetPrefetch", readAssetPrefetchMetrics);

async function prefetch(
  asset: PreloadAsset,
  owner: number,
  { assets, manager }: PrefetchOwner,
  textures: SceneAssets,
): Promise<void> {
  switch (asset.kind) {
    case "texture":
      await loadHtmlTexture(textureToUrl(asset.name), textures, "speculative");
      break;
    case "shape":
      await loadShapeDependencies(asset.name, manager);
      break;
    case "interior": {
      await loadInteriorDependencies(interiorToUrl(asset.name), assets);
      break;
    }
    case "terrain": {
      // Load AND parse the .ter into the terrain view's cache, then
      // preload every referenced terrain texture — the largest visual
      // win on join.
      const ter = await loadTerrainAsset(asset.name, assets);
      for (const name of ter.textureNames) {
        if (owner !== generation || textures.disposed) return;
        await loadHtmlTexture(
          terrainTextureToUrl(name),
          textures,
          "speculative",
        );
      }
      break;
    }
  }
}

function schedule(delay: number): void {
  if (!provider) return;
  const at = performance.now() + delay;
  if (timer != null) {
    if (scheduledAt <= at) return;
    clearTimeout(timer);
  }
  scheduledAt = at;
  timer = setTimeout(tick, delay);
}

/**
 * Start (or retarget) background prefetching for a stream. The provider
 * returns the session's known assets in priority order — re-polled
 * continuously so late-arriving state is picked up.
 */
export function startAssetPrefetch(
  getAssets: () => PreloadAsset[],
  getSceneOwner: () => PrefetchOwner = () => ({
    assets: sharedSceneAssets,
    manager: DefaultLoadingManager,
  }),
  priority?: () => RecordedAssetBatch | null,
) {
  const owner = ++generation;
  jobs.clear();
  recordedWaitingJobs = null;
  recordedScanning = false;
  if (timer != null) clearTimeout(timer);
  timer = null;
  provider = getAssets;
  getOwner = getSceneOwner;
  getPriorityJobs = priority;
  concurrency = deviceTierValue(
    performanceTuning.assetPrefetch.concurrency,
    classifyDevice(readDeviceSignals()).constrained,
  );
  // In-flight shared loads from the previous owner still count against the
  // limit. They may serve active views, so do not cancel or forget them.
  const { startDelayMs } = performanceTuning.assetPrefetch;
  genericStartAt = performance.now() + startDelayMs;
  schedule(priority ? 0 : startDelayMs);
  return {
    refresh() {
      if (owner === generation) schedule(0);
    },
    stop() {
      if (owner === generation) stopAssetPrefetch();
    },
    prioritySettled(keys: readonly string[]) {
      if (owner !== generation) return false;
      const { assets } = getSceneOwner();
      return (
        !assets.disposed &&
        assets.textures === previousTextures &&
        keys.every((key) => jobs.get(key) === true)
      );
    },
  };
}

/** Detach the active provider. The scene owns the prefetched resources. */
export function stopAssetPrefetch(): void {
  generation++;
  jobs.clear();
  recordedWaitingJobs = null;
  recordedScanning = false;
  provider = null;
  getOwner = undefined;
  getPriorityJobs = undefined;
  previousTextures = undefined;
  if (timer != null) {
    clearTimeout(timer);
    timer = null;
  }
}

function tick(): void {
  timer = null;
  if (!provider) return;
  const currentProvider = provider;
  const owner = generation;
  const genericReady = performance.now() >= genericStartAt;
  const schedulePoll = (delay: number) => {
    if (owner !== generation) return;
    schedule(
      genericReady
        ? delay
        : Math.min(delay, Math.max(0, genericStartAt - performance.now())),
    );
  };
  let priority: RecordedAssetBatch | null = null;
  try {
    priority = getPriorityJobs?.() ?? null;
  } catch (e) {
    log.warn("recorded asset provider failed: %o", e);
  }
  // Providers and synchronous cache callbacks can stop/retarget this work.
  // Leave the replacement's timer and bookkeeping to its own generation.
  if (owner !== generation) return;
  let assets: PreloadAsset[] = [];
  // A recorded batch can start its leading terrain job during the attach delay.
  if (genericReady || priority) {
    try {
      assets = currentProvider();
    } catch (e) {
      log.warn("preload asset provider failed: %o", e);
    }
  }
  if (owner !== generation || !getOwner) return;
  const scene = getOwner();
  if (owner !== generation) return;
  if (scene.assets.disposed) {
    recordedWaitingJobs = null;
    recordedScanning = false;
    schedulePoll(performanceTuning.assetPrefetch.rescanDelayMs);
    return;
  }
  const textures = scene.assets.textures;
  if (textures !== previousTextures) {
    jobs.clear();
    previousTextures = textures;
  }
  const launch = (key: string, load: () => Promise<void>) => {
    if (owner !== generation || provider !== currentProvider) return false;
    if (activeJobs >= concurrency) return false;
    if (jobs.has(key)) return true;
    jobs.set(key, false);
    activeJobs++;
    peakActiveJobs = Math.max(peakActiveJobs, activeJobs);
    const work = (async () => load())();
    void work
      .catch((error: unknown) => {
        if (textures.disposed) return;
        failedJobs++;
        log.debug("%s prefetch failed: %o", key, error);
      })
      .finally(() => {
        if (owner === generation && textures === previousTextures)
          jobs.set(key, true);
        activeJobs--;
        completedJobs++;
        // Recorded work can fill a slot immediately after the old owner frees it.
        if (getPriorityJobs || performance.now() >= genericStartAt)
          schedule(performanceTuning.assetPrefetch.refillDelayMs);
      });
    return true;
  };
  const launchAsset = (asset: PreloadAsset) =>
    !asset.name ||
    launch(`${asset.kind}:${asset.name}`, () =>
      prefetch(asset, owner, scene, textures),
    );
  const launchTerrain = () => {
    for (const asset of assets) {
      if (asset.kind === "terrain" && !launchAsset(asset)) break;
    }
  };
  if (priority) {
    // Before a clip starts, put effects ahead of ordinary scene prefetch.
    if (!priority.blockBackground) launchTerrain();
    for (const job of priority.jobs) {
      if (!launch(job.key, job.load)) break;
    }
    if (priority.blockBackground) launchTerrain();
  }
  if (genericReady && !priority?.blockBackground) {
    for (const asset of assets) {
      if (!launchAsset(asset)) break;
    }
  }
  if (owner === generation) {
    recordedScanning = priority?.scanning ?? false;
    recordedWaitingJobs =
      priority?.jobs.reduce(
        (waiting, { key }) => waiting + Number(!jobs.has(key)),
        0,
      ) ?? null;
  }
  schedulePoll(
    !priority
      ? performanceTuning.assetPrefetch.rescanDelayMs
      : priority.scanning
        ? RECORDED_SCAN_SLICE_DELAY_MS
        : RECORDED_RESCAN_MS,
  );
}
