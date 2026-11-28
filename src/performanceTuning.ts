/** Resource policies shared by browsers and Node tools. Edit values here;
 * consumers select a device tier without changing the measured defaults.
 * This module must stay pure: no device detection, browser reads or imports.
 * Unless noted otherwise, counts/byte caps must be positive safe integers.
 * Imported checkpoint capacity must stay >= 1 to avoid decoding/pruning the
 * same anchor.
 */
const MiB = 1024 * 1024;

export const performanceTuning = {
  /** Optional browser hints. Browser and input signals take priority. */
  constrainedDevice: {
    /** Classify reported navigator.deviceMemory values below this many GiB. */
    memoryThresholdGiB: 16,
    /** Logical CPU thread count, not physical cores. */
    maximumLogicalCpuThreads: 4,
  },

  /** Pixels per shadow-map edge. Target bytes grow with the square of this
   * value; lower sizes trade shadow detail for a smaller allocation.
   * Existing explicit benchmark URL overrides take precedence. */
  worldShadowSize: { constrained: 1024, desktop: 4096 },

  /** Concurrent image fetch/decode jobs, with separate resource cutoffs for
   * the two-slot tier. The lower limit reduces simultaneous allocations. */
  imageWorkConcurrency: {
    constrained: 2,
    desktop: 4,
    maximumConstrainedMemoryGiB: 4,
    maximumConstrainedLogicalCpuThreads: 4,
  },

  assetPrefetch: {
    /** Concurrent asset jobs; provisional 2/4 policy, not an optimal cutoff.
     * Terrain subloads run serially inside their owning job. */
    concurrency: { constrained: 2, desktop: 4 },
    /** Positive integer milliseconds. Longer delays reduce background bursts
     * at the cost of slower initial/late asset readiness. */
    startDelayMs: 1000,
    refillDelayMs: 100,
    rescanDelayMs: 2000,
  },

  audioBufferCache: {
    /** Decoded PCM bytes owned by lookup-cache references only. Active sounds
     * may retain evicted buffers. Lower caps trade retention for more misses. */
    maximumBytes: { constrained: 32 * MiB, desktop: 64 * MiB },
    /** URL entries; aliases share byte accounting but each consumes an entry. */
    maximumEntries: { constrained: 256, desktop: 512 },
  },

  groundEffects: {
    /** Pending ticks between simulation and rendering, never checkpoint history.
     * 256 covers a 250 ms render frame at 16x plus interpolation lookahead.
     * Overflow discards missed effects and resets emission origins. */
    maximumPendingFrames: 256,
  },

  browserCheckpoints: {
    /** Entry counts, not graph-byte estimates. Lower limits can increase
     * replay/decode work on seeks. Offline readers retain their own policy. */
    sessionEntries: { constrained: 8, desktop: 24 },
    /** Must be >= 1: a selected lazy anchor must survive until restore. */
    importedEntries: { constrained: 2, desktop: 4 },
  },

  compressedDemoBuffer: {
    /** Maximum Content-Length reservation in bytes. Larger recordings fall
     * back to chunk ownership; this does not cap total recording size.
     * The standalone buffer defaults to the constrained cap. */
    maximumPreallocationBytes: { constrained: 64 * MiB, desktop: 128 * MiB },
  },

  postProcessing: {
    /** One canvas-owned last decoded LUT typed-array payload, not GPU memory.
     * 4 MiB fits 64³ float RGBA. Zero disables this warm re-enable CPU cache;
     * GPU targets/textures still release while the master is OFF. */
    maxCachedLutCpuBytes: 4 * MiB,
  },

  dtsInstancePages: {
    /** Engine frames, not wall time. Shorter retention releases idle pages
     * sooner but can recreate buffers/textures during repeated seeks.
     * Keep 1 <= sweepEveryFrames <= retireAfterFrames. */
    retireAfterFrames: 600,
    sweepEveryFrames: 60,
    /** Per skin-array page mip payload, not an app-wide VRAM budget. Lowering
     * it can increase page count/draw calls or make a source ineligible. */
    maximumSkinArrayPageBytes: 64 * MiB,
  },
} as const;

/** Select a pure policy pair using an already classified device. */
export function deviceTierValue<T>(
  values: { readonly constrained: T; readonly desktop: T },
  constrained: boolean,
): T {
  return constrained ? values.constrained : values.desktop;
}
