import { performance } from "node:perf_hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventLoopMonitor } from "./eventLoopMonitor";

const histogram = vi.hoisted(() => ({
  count: 0,
  mean: NaN,
  max: 0,
  percentile: vi.fn(),
  enable: vi.fn(),
  disable: vi.fn(),
  reset: vi.fn(),
}));

vi.mock("node:perf_hooks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:perf_hooks")>()),
  monitorEventLoopDelay: () => histogram,
}));

describe("event loop health metrics", () => {
  let monitor: EventLoopMonitor;
  let elapsed: number;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    elapsed = 0;
    vi.spyOn(performance, "now").mockImplementation(() => elapsed);
    histogram.count = 0;
    histogram.mean = NaN;
    histogram.max = 0;
    histogram.reset.mockImplementation(() => {
      histogram.count = 0;
      histogram.mean = NaN;
      histogram.max = 0;
    });
    histogram.percentile.mockImplementation((p) =>
      p === 95 ? 30_123_456 : 100_000_000,
    );
    monitor = new EventLoopMonitor();
  });

  afterEach(() => {
    monitor.stop();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function recordSamples() {
    histogram.count = 2_900;
    histogram.mean = 20_123_456;
    histogram.max = 2_800_000_000;
  }

  it("reports no samples as null instead of zero or NaN", () => {
    expect(histogram.enable).toHaveBeenCalledOnce();
    expect(monitor.getStats()).toEqual({
      sampledAt: new Date().toISOString(),
      windowMs: 0,
      resolutionMs: 20,
      samples: 0,
      meanMs: null,
      p95Ms: null,
      p99Ms: null,
      maxMs: null,
    });
    expect(histogram.percentile).not.toHaveBeenCalled();
  });

  it("converts nanoseconds to milliseconds without resetting on reads", () => {
    recordSamples();
    elapsed = 5_000;
    const stats = monitor.getStats();
    expect(stats).toMatchObject({
      windowMs: 5_000,
      samples: 2_900,
      meanMs: 20.123,
      p95Ms: 30.123,
      p99Ms: 100,
      maxMs: 2_800,
    });
    expect(monitor.getStats()).toEqual(stats);
    expect(histogram.reset).not.toHaveBeenCalled();
  });

  it("retains the completed window until the next minute, even without polling", () => {
    recordSamples();
    elapsed = 60_000;
    vi.advanceTimersByTime(60_000);
    const firstWindow = monitor.getStats();
    expect(firstWindow.maxMs).toBe(2_800);
    expect(histogram.reset).toHaveBeenCalledOnce();

    elapsed = 90_000;
    vi.advanceTimersByTime(30_000);
    histogram.count = 1_500;
    histogram.mean = histogram.max = 20_000_000;
    expect(monitor.getStats()).toEqual(firstWindow);

    elapsed = 120_000;
    vi.advanceTimersByTime(30_000);
    expect(monitor.getStats()).toMatchObject({
      sampledAt: new Date().toISOString(),
      windowMs: 60_000,
      samples: 1_500,
      maxMs: 20,
    });
    expect(histogram.reset).toHaveBeenCalledTimes(2);
  });

  it("reports actual elapsed time when a stall delays the sampling window", () => {
    recordSamples();
    elapsed = 63_000;
    vi.advanceTimersByTime(60_000);
    expect(monitor.getStats().windowMs).toBe(63_000);
    elapsed = 123_000;
    vi.advanceTimersByTime(60_000);
    expect(monitor.getStats().windowMs).toBe(60_000);
  });

  it("stops both the native monitor and the window timer", () => {
    monitor.stop();
    expect(histogram.disable).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(120_000);
    expect(histogram.reset).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
