/**
 * Re-bake scheduling for the terrain lightmap.
 *
 * Buildings are baked into the lightmap (see terrainInteriorShadow.ts), so
 * the bake is only correct once the interiors have loaded. They stream in
 * over many frames, so invalidations are coalesced and the bake runs once
 * the burst settles rather than once per building.
 */
const listeners = new Set<() => void>();

/** Milliseconds of quiet before a coalesced re-bake runs. */
const SETTLE_MS = 250;

let timer: ReturnType<typeof setTimeout> | null = null;

/** Request a re-bake. Call when an interior mounts or unmounts. */
export function invalidateTerrainLightmap(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    for (const listener of listeners) listener();
  }, SETTLE_MS);
}

export function onTerrainLightmapInvalidated(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
