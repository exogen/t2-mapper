/** Numeric resource-source registry. No DOM, renderer or Three.js dependencies. */
export type ResourceGauges = Record<string, number | null>;
const MAX_SOURCES = 64;
const MAX_GAUGES_PER_SOURCE = 64;
// Leave room for browser-level gauges within the recorder's 256-key cap.
const MAX_TOTAL_GAUGES = 224;
const MAX_NAME_LENGTH = 80;
const MAX_PREFIXED_NAME_LENGTH = 96;
const sources = new Map<string, { read: () => ResourceGauges }>();

/** Register numeric gauges only. Disposing an old registration cannot remove
 * a newer source with the same name (also useful during hot module reloads). */
export function registerMetricSource(
  name: string,
  read: () => ResourceGauges,
): () => void {
  if (!name || name.length > MAX_NAME_LENGTH) return () => {};
  if (!sources.has(name) && sources.size >= MAX_SOURCES) return () => {};
  const source = { read };
  sources.set(name, source);
  return () => {
    if (sources.get(name) === source) sources.delete(name);
  };
}

/** A bounded snapshot. Sources must return counters, not retain scene objects
 * or build inventories. Unknown/non-finite values are represented as null. */
export function readResourceMetrics(): ResourceGauges {
  const metrics: ResourceGauges = Object.create(null);
  let gaugeCount = 0;
  for (const [name, source] of sources) {
    if (gaugeCount >= MAX_TOTAL_GAUGES) break;
    try {
      const values = source.read();
      let count = 0;
      for (const key in values) {
        if (!Object.hasOwn(values, key)) continue;
        if (++count > MAX_GAUGES_PER_SOURCE) break;
        if (!key || key.length > MAX_NAME_LENGTH) continue;
        const prefixed = `${name}.${key}`;
        if (prefixed.length > MAX_PREFIXED_NAME_LENGTH) continue;
        if (gaugeCount >= MAX_TOTAL_GAUGES) break;
        const value = values[key];
        metrics[prefixed] =
          typeof value === "number" && Number.isFinite(value) ? value : null;
        gaugeCount++;
      }
    } catch {
      if (gaugeCount >= MAX_TOTAL_GAUGES) break;
      metrics[`${name}.readError`] = 1;
      gaugeCount++;
    }
  }
  return metrics;
}
