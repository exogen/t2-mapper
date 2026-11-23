import { afterEach, describe, expect, it, vi } from "vitest";
import { performanceTuning } from "./performanceTuning";

afterEach(() => vi.unstubAllGlobals());

function expectPositiveInteger(value: number) {
  expect(Number.isSafeInteger(value)).toBe(true);
  expect(value).toBeGreaterThanOrEqual(1);
}

describe("performance tuning invariants", () => {
  it("keeps all device-tier resource caps finite, positive and no larger for constrained devices", () => {
    const policies = [
      performanceTuning.worldShadowSize,
      performanceTuning.imageWorkConcurrency,
      performanceTuning.assetPrefetch.concurrency,
      performanceTuning.audioBufferCache.maximumBytes,
      performanceTuning.audioBufferCache.maximumEntries,
      performanceTuning.browserCheckpoints.sessionEntries,
      // Zero imported capacity can prune a lazy anchor before it is restored.
      performanceTuning.browserCheckpoints.importedEntries,
      performanceTuning.compressedDemoBuffer.maximumPreallocationBytes,
    ];
    for (const policy of policies) {
      expectPositiveInteger(policy.constrained);
      expectPositiveInteger(policy.desktop);
      expect(policy.constrained).toBeLessThanOrEqual(policy.desktop);
    }
  });

  it("keeps delays and idle-page sweeps bounded away from busy loops", () => {
    for (const delay of [
      performanceTuning.assetPrefetch.startDelayMs,
      performanceTuning.assetPrefetch.refillDelayMs,
      performanceTuning.assetPrefetch.rescanDelayMs,
    ])
      expectPositiveInteger(delay);
    const pages = performanceTuning.dtsInstancePages;
    expectPositiveInteger(pages.retireAfterFrames);
    expectPositiveInteger(pages.sweepEveryFrames);
    expect(pages.sweepEveryFrames).toBeLessThanOrEqual(pages.retireAfterFrames);
    expectPositiveInteger(pages.maximumSkinArrayPageBytes);
  });

  it("requires meaningful positive classification thresholds", () => {
    const thresholds = performanceTuning.constrainedDevice;
    expect(Number.isFinite(thresholds.maximumMemoryGB)).toBe(true);
    expect(thresholds.maximumMemoryGB).toBeGreaterThan(0);
    expectPositiveInteger(thresholds.maximumLogicalCpuThreads);
  });

  it("permits disabling the optional last-LUT CPU cache with a zero byte cap", () => {
    const bytes = performanceTuning.postProcessing.maxCachedLutCpuBytes;
    expect(Number.isSafeInteger(bytes)).toBe(true);
    expect(bytes).toBeGreaterThanOrEqual(0);
  });

  it("can initialize in a Node tool without reading browser hints", async () => {
    const unexpectedRead = () => {
      throw new Error("Tuning values must not read browser state");
    };
    vi.stubGlobal(
      "navigator",
      Object.defineProperty({}, "userAgent", { get: unexpectedRead }),
    );
    vi.stubGlobal(
      "window",
      Object.defineProperty({}, "matchMedia", { get: unexpectedRead }),
    );
    vi.resetModules();
    const module = await import("./performanceTuning");
    expect(module.performanceTuning).toEqual(performanceTuning);
  });
});
