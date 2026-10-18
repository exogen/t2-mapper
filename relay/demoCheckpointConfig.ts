import {
  DEFAULT_CHECKPOINT_INTERVAL_TICKS,
  type DemoCheckpointPlan,
} from "../src/stream/demoCheckpoints";
import { TICK_DURATION_MS } from "../src/stream/streamHelpers";

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

/**
 * Minutes between a demo's checkpoints (default 12), as simulation ticks.
 */
export function loadDemoCheckpointInterval(
  raw = process.env.DEMO_CHECKPOINT_INTERVAL_MINUTES,
  name = "DEMO_CHECKPOINT_INTERVAL_MINUTES",
): number {
  if (raw === undefined) return DEFAULT_CHECKPOINT_INTERVAL_TICKS;
  const value = raw.trim();
  const ticks = Math.round((Number(value) * 60_000) / TICK_DURATION_MS);
  if (!/^\d+(\.\d+)?$/.test(value) || !Number.isSafeInteger(ticks) || ticks < 1)
    throw new Error(`${name} must be a positive number of minutes`);
  return ticks;
}

/**
 * The generator's plan: DEMO_CHECKPOINT_INTERVAL_MINUTES and
 * DEMO_CHECKPOINT_COUNT, or the --interval and --count a script was given.
 */
export function loadDemoCheckpointPlan(
  options: { interval?: string; count?: string } = {},
): DemoCheckpointPlan {
  return {
    intervalTicks:
      options.interval !== undefined
        ? loadDemoCheckpointInterval(options.interval, "--interval")
        : loadDemoCheckpointInterval(),
    maxCount:
      options.count !== undefined
        ? loadDemoCheckpointCount(options.count, "--count")
        : loadDemoCheckpointCount(),
  };
}

/**
 * A plan handed between processes, held to the same limits.
 */
export function checkDemoCheckpointPlan(
  plan: DemoCheckpointPlan,
): DemoCheckpointPlan {
  if (!Number.isSafeInteger(plan.intervalTicks) || plan.intervalTicks < 1)
    throw new Error("Checkpoint interval must be a positive number of ticks");
  return {
    intervalTicks: plan.intervalTicks,
    maxCount: loadDemoCheckpointCount(plan.maxCount, "Checkpoint count"),
  };
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
