import { monitorEventLoopDelay, performance } from "node:perf_hooks";

const RESOLUTION_MS = 20;
const WINDOW_MS = 60_000;

export interface EventLoopDelayStats {
  sampledAt: string;
  windowMs: number;
  resolutionMs: number;
  samples: number;
  meanMs: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  maxMs: number | null;
}

/** Fixed windows independent of health polling; Node's delays include resolution. */
export class EventLoopMonitor {
  private histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  private windowStartedAt = performance.now();
  private completedWindow: EventLoopDelayStats | null = null;
  private timer: ReturnType<typeof setInterval>;

  constructor() {
    this.histogram.enable();
    this.timer = setInterval(() => {
      const now = performance.now();
      this.completedWindow = this.sample(now);
      this.histogram.reset();
      this.windowStartedAt = now;
    }, WINDOW_MS);
    this.timer.unref();
  }

  /** Last completed minute, or the current partial window during startup. */
  getStats(): EventLoopDelayStats {
    return this.completedWindow ?? this.sample(performance.now());
  }

  stop(): void {
    clearInterval(this.timer);
    this.histogram.disable();
  }

  private sample(now: number): EventLoopDelayStats {
    const { histogram } = this;
    const milliseconds = (ns: number) => Math.round(ns / 1_000) / 1_000;
    return {
      sampledAt: new Date().toISOString(),
      windowMs: Math.round(now - this.windowStartedAt),
      resolutionMs: RESOLUTION_MS,
      samples: histogram.count,
      meanMs: histogram.count ? milliseconds(histogram.mean) : null,
      p95Ms: histogram.count ? milliseconds(histogram.percentile(95)) : null,
      p99Ms: histogram.count ? milliseconds(histogram.percentile(99)) : null,
      maxMs: histogram.count ? milliseconds(histogram.max) : null,
    };
  }
}
