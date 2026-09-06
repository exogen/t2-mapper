/**
 * Sequence durations of shapes the app has loaded, keyed by DTS name. This is
 * the runtime stand-in for the engine's preloaded TSShape: ExplosionData
 * preloads explosionShape, so Explosion::explode can read the "ambient"
 * sequence's duration. Filled wherever a shape GLB is parsed — the asset
 * prefetcher (GLB JSON chunk) and useStaticShape (loaded GLTF clips).
 */

const sequencesByShape = new Map<string, ReadonlyMap<string, number>>();

/** Registry key: the lower-case DTS file name, whatever path or extension came in. */
export function shapeKey(shapeName: string): string {
  const base = shapeName.toLowerCase().replace(/\\/g, "/").split("/").pop()!;
  return base.replace(/\.glb$/, ".dts");
}

/** First registration wins; later calls for the same shape are no-ops. */
export function registerShapeSequences(
  shapeName: string,
  sequences: Iterable<{ name: string; duration: number }>,
): void {
  const key = shapeKey(shapeName);
  if (sequencesByShape.has(key)) return;
  const byName = new Map<string, number>();
  for (const { name, duration } of sequences) {
    byName.set(name.toLowerCase(), duration);
  }
  sequencesByShape.set(key, byName);
}

export function getShapeSequenceDurationSec(
  shapeName: string | undefined,
  sequenceName: string,
): number | undefined {
  if (!shapeName) return undefined;
  return sequencesByShape
    .get(shapeKey(shapeName))
    ?.get(sequenceName.toLowerCase());
}

/** Test-only: forget every registered shape. */
export function clearShapeSequences(): void {
  sequencesByShape.clear();
}
