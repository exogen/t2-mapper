/** Maximum checkpoints per demo; short recordings may produce fewer. */
export function loadDemoCheckpointCount(
  raw: string | number | undefined = process.env.DEMO_CHECKPOINT_COUNT,
  name = "DEMO_CHECKPOINT_COUNT",
): number {
  if (raw === undefined) return 1;
  const value = typeof raw === "string" ? raw.trim() : raw;
  const count = Number(value);
  if (
    (typeof value === "string" && !/^\d+$/.test(value)) ||
    !Number.isSafeInteger(count) ||
    count < 0
  )
    throw new Error(`${name} must be a non-negative integer`);
  return count;
}

/** Old-space heap cap per worker; raw demo/asset buffers use additional memory. */
export function loadDemoCheckpointHeapMB(
  raw = process.env.DEMO_CHECKPOINT_HEAP_MB,
): number {
  if (raw === undefined) return 256;
  const value = raw.trim();
  const heapMB = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(heapMB) || heapMB < 1)
    throw new Error("DEMO_CHECKPOINT_HEAP_MB must be a positive integer");
  return heapMB;
}
