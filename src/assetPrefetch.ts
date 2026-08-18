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

interface GlbMaterial {
  name?: string;
  extras?: { resource_path?: string; flag_names?: string[] };
}

/**
 * Materials from a binary glTF's JSON chunk, read without three.js:
 * 12-byte header (magic "glTF") then chunks of [length, type, data]; the
 * first chunk is JSON.
 */
function glbMaterials(buffer: ArrayBuffer): GlbMaterial[] {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67) {
    return [];
  }
  const chunkLength = view.getUint32(12, true);
  const chunkType = view.getUint32(16, true);
  if (chunkType !== 0x4e4f534a || 20 + chunkLength > buffer.byteLength) {
    return [];
  }
  try {
    const json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(buffer, 20, chunkLength)),
    ) as { materials?: GlbMaterial[] };
    return json.materials ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch a GLB (shared HTTP cache with the loader) and preload the
 * textures its materials reference, so models appear fully textured
 * instead of texture-popping. Interior materials are named after their
 * texture (InteriorTexture does textureToUrl(material.name)); shape
 * materials carry a resource_path in extras and load through the shared
 * loadTexture cache (IFL materials go through the atlas loader instead).
 */
async function prefetchGlbTextures(
  url: string,
  kind: "shape" | "interior",
  name: string,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) return;
  let count = 0;
  for (const mat of glbMaterials(await res.arrayBuffer())) {
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
