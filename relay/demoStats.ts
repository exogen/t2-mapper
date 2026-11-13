/**
 * Private per-demo player stats sidecars (stored by `PrivateDemoStore`); the
 * stats themselves are computed by `demoPlayerStats.ts` in a worker.
 */
import {
  DEMO_STATS_VERSION,
  type DemoStatsSidecar,
} from "./demoPlayerStats.js";
import { runDemoWorker } from "./demoWorkerProcess.js";

export const DEMO_STATS_SUFFIX = ".stats.json";
/** Written only after a published demo's players have had profiles refreshed. */
export const DEMO_PROFILES_SUFFIX = ".profiles.json";
export const PROFILE_REFRESH_VERSION = 1;

/** Legacy markers remain usable; fingerprints reject replaced recordings. */
export function isCurrentProfileRefresh(
  value: unknown,
  sourceETag?: string,
): boolean {
  const marker = value as {
    version?: number;
    statsVersion?: number;
    updatedAt?: number;
    sourceETag?: string;
  } | null;
  return (
    marker?.version === PROFILE_REFRESH_VERSION &&
    marker.statsVersion === DEMO_STATS_VERSION &&
    typeof marker.updatedAt === "number" &&
    Number.isFinite(marker.updatedAt) &&
    (marker.sourceETag === undefined ||
      (typeof marker.sourceETag === "string" &&
        marker.sourceETag.length > 0)) &&
    !(sourceETag && marker.sourceETag && marker.sourceETag !== sourceETag)
  );
}

/** The stored version, or null when the value is not a stats sidecar. */
export function demoStatsVersion(value: unknown): number | null {
  const sidecar = value as Partial<DemoStatsSidecar> | null;
  return typeof sidecar?.version === "number" &&
    sidecar.statsByGuid &&
    typeof sidecar.statsByGuid === "object" &&
    !Array.isArray(sidecar.statsByGuid) &&
    (sidecar.sourceETag === undefined ||
      (typeof sidecar.sourceETag === "string" && sidecar.sourceETag.length > 0))
    ? sidecar.version
    : null;
}

/** Compute a local recording's player stats in a worker (see `runDemoWorker`). */
export function runDemoStatsProcess(
  input: string,
  assetRoot: string,
  manifestPath: string,
  signal?: AbortSignal,
): Promise<DemoStatsSidecar> {
  return runDemoWorker<{ stats: DemoStatsSidecar }>(
    new URL("./demoStatsWorker.ts", import.meta.url),
    [input, assetRoot, manifestPath],
    // No R2, OAuth, auth-cookie, or database credentials belong in this child.
    {
      signal,
      env: { PATH: process.env.PATH, NODE_ENV: "production", TZ: "UTC" },
    },
  ).then(({ message, code, signal, timedOut, stderr }) => {
    if (code === 0 && message?.stats) return message.stats;
    throw new Error(
      timedOut
        ? "Demo stats computation timed out"
        : stderr.trim() || `Demo stats worker exited (${code ?? signal})`,
    );
  });
}
