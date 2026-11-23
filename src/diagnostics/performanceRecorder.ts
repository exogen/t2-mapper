/** A bounded recorder with no DOM, renderer, storage, or transport dependency. */
export type DiagnosticValue = string | number | boolean | null;

export interface PerformanceRecorderOptions {
  now?: () => number;
  sampleCapacity?: number;
  eventCapacity?: number;
}

export interface TimingSummary {
  mean: number | null;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

export interface PerformanceSnapshot {
  schemaVersion: 1;
  context: Record<string, DiagnosticValue>;
  retention: {
    samples: RetentionSummary;
    events: RetentionSummary;
  };
  samples: { timeMs: number; values: Record<string, number | null> }[];
  events: {
    timeMs: number;
    name: string;
    details: Record<string, DiagnosticValue>;
  }[];
  peaks: Record<string, number>;
  /** Times of the first sample reaching each lifetime maximum. */
  peakTimesMs: Record<string, number>;
  /** First occurrence of each event name, retained beyond the recent ring. */
  milestones: PerformanceSnapshot["events"];
  frames: {
    count: number;
    intervalCount: number;
    cpuMs: TimingSummary;
    intervalMs: TimingSummary;
    over33ms: number;
    over50ms: number;
    over100ms: number;
    over250ms: number;
  };
}

export interface RetentionSummary {
  capacity: number;
  totalWritten: number;
  overwritten: number;
}

/** Bounded metadata and the current sample, without copying history rings. */
export type PerformanceObservation = Omit<
  PerformanceSnapshot,
  "samples" | "events"
> & {
  latestSample: PerformanceSnapshot["samples"][number] | null;
};

export const PERFORMANCE_RECORDER_LIMITS = {
  samples: 3600,
  events: 1000,
  gauges: 256,
  milestones: 64,
  context: 64,
  details: 32,
  keyLength: 96,
  stringLength: 256,
} as const;

// Inclusive upper bounds in milliseconds; the last bin is overflow. Percentiles
// are approximate bin upper bounds, capped at the observed maximum. The mean
// and maximum are exact. Keeping fixed bins avoids retaining a value per frame.
const TIMING_BOUNDS = new Float64Array([
  0,
  0.25,
  0.5,
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  15,
  16,
  16.67,
  18,
  20,
  22,
  25,
  28,
  30,
  33.34,
  40,
  50,
  60,
  75,
  100,
  125,
  150,
  200,
  250,
  350,
  500,
  750,
  1000,
  1500,
  2000,
  3000,
  5000,
  10000,
  30000,
  60000,
  Infinity,
]);

class TimingHistogram {
  private bins = new Float64Array(TIMING_BOUNDS.length);
  count = 0;
  private mean = 0;
  private max = 0;

  add(value: number): boolean {
    if (!Number.isFinite(value) || value < 0) return false;
    this.count++;
    this.mean += (value - this.mean) / this.count;
    this.max = Math.max(this.max, value);
    let low = 0;
    let high = TIMING_BOUNDS.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (value <= TIMING_BOUNDS[middle]) high = middle;
      else low = middle + 1;
    }
    this.bins[low]++;
    return true;
  }

  private percentile(p: number): number | null {
    if (!this.count) return null;
    const target = Math.ceil(this.count * p);
    let count = 0;
    for (let i = 0; i < this.bins.length; i++) {
      count += this.bins[i];
      if (count >= target) return Math.min(TIMING_BOUNDS[i], this.max);
    }
    return this.max;
  }

  summary(): TimingSummary {
    return {
      mean: this.count ? this.mean : null,
      p50: this.percentile(0.5),
      p95: this.percentile(0.95),
      p99: this.percentile(0.99),
      max: this.count ? this.max : null,
    };
  }

  reset(): void {
    this.bins.fill(0);
    this.count = 0;
    this.mean = 0;
    this.max = 0;
  }
}

class Ring<T> {
  private entries: (T | undefined)[];
  private capacity: number;
  private next = 0;
  private count = 0;
  private totalWritten = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.entries = new Array<T | undefined>(capacity);
  }

  push(entry: T): void {
    this.totalWritten++;
    this.entries[this.next] = entry;
    this.next = (this.next + 1) % this.capacity;
    this.count = Math.min(this.count + 1, this.capacity);
  }

  retention(): RetentionSummary {
    return {
      capacity: this.capacity,
      totalWritten: this.totalWritten,
      overwritten: Math.max(0, this.totalWritten - this.capacity),
    };
  }

  latest(): T | undefined {
    return this.count
      ? this.entries[(this.next + this.capacity - 1) % this.capacity]
      : undefined;
  }

  snapshot(copy: (value: T) => T): T[] {
    const result: T[] = [];
    const start = (this.next - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      result.push(copy(this.entries[(start + i) % this.capacity]!));
    }
    return result;
  }

  reset(): void {
    this.entries.fill(undefined);
    this.next = 0;
    this.count = 0;
    this.totalWritten = 0;
  }
}

function capacity(value: number | undefined, fallback: number, max: number) {
  return value == null || !Number.isFinite(value)
    ? fallback
    : Math.max(1, Math.min(max, Math.floor(value)));
}

function record<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function validKey(key: string): boolean {
  return key.length > 0 && key.length <= PERFORMANCE_RECORDER_LIMITS.keyLength;
}

function safeValue(value: DiagnosticValue): DiagnosticValue {
  if (typeof value === "string")
    return value.slice(0, PERFORMANCE_RECORDER_LIMITS.stringLength);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return value === null || typeof value === "boolean" ? value : null;
}

export class PerformanceRecorder {
  private now: () => number;
  private origin: number;
  private lastTime = 0;
  private context = record<DiagnosticValue>();
  private contextCount = 0;
  private gaugeKeys = new Set<string>();
  private peaks = record<number>();
  private peakTimesMs = record<number>();
  private milestones = new Map<string, PerformanceSnapshot["events"][number]>();
  private samples: Ring<PerformanceSnapshot["samples"][number]>;
  private events: Ring<PerformanceSnapshot["events"][number]>;
  private cpu = new TimingHistogram();
  private intervals = new TimingHistogram();
  private over33ms = 0;
  private over50ms = 0;
  private over100ms = 0;
  private over250ms = 0;

  constructor(options: PerformanceRecorderOptions = {}) {
    this.now = options.now ?? (() => performance.now());
    const origin = this.now();
    this.origin = Number.isFinite(origin) ? origin : 0;
    this.samples = new Ring(
      capacity(
        options.sampleCapacity,
        300,
        PERFORMANCE_RECORDER_LIMITS.samples,
      ),
    );
    this.events = new Ring(
      capacity(options.eventCapacity, 100, PERFORMANCE_RECORDER_LIMITS.events),
    );
  }

  private time(): number {
    const elapsed = this.now() - this.origin;
    if (Number.isFinite(elapsed))
      this.lastTime = Math.max(this.lastTime, elapsed, 0);
    return this.lastTime;
  }

  /**
   * No per-frame allocation. Invalid values are ignored independently. The
   * count is valid CPU samples; interval statistics can have fewer samples.
   * The caller must exclude hidden/background intervals and intentional idle
   * gaps by passing null. Thresholds count intervals strictly above 33/50/100/
   * 250ms. These are threshold crossings whose interpretation depends on the
   * configured cadence (including FPS caps), not an attribution to GC pauses.
   */
  recordFrame(cpuMs: number, intervalMs: number | null): void {
    this.cpu.add(cpuMs);
    if (intervalMs === null || !this.intervals.add(intervalMs)) return;
    if (intervalMs > 33) this.over33ms++;
    if (intervalMs > 50) this.over50ms++;
    if (intervalMs > 100) this.over100ms++;
    if (intervalMs > 250) this.over250ms++;
  }

  /** Gauge names remain registered until reset, bounding peaks across eviction. */
  sample(gauges: Record<string, number | null>): void {
    const timeMs = this.time();
    const values = record<number | null>();
    for (const key in gauges) {
      if (!Object.hasOwn(gauges, key) || !validKey(key)) continue;
      if (!this.gaugeKeys.has(key)) {
        if (this.gaugeKeys.size >= PERFORMANCE_RECORDER_LIMITS.gauges) continue;
        this.gaugeKeys.add(key);
      }
      const value = gauges[key];
      values[key] =
        typeof value === "number" && Number.isFinite(value) ? value : null;
      if (
        values[key] !== null &&
        values[key] > (this.peaks[key] ?? -Infinity)
      ) {
        this.peaks[key] = values[key];
        this.peakTimesMs[key] = timeMs;
      }
    }
    this.samples.push({ timeMs, values });
  }

  mark(name: string, details: Record<string, DiagnosticValue> = {}): void {
    const values = record<DiagnosticValue>();
    let count = 0;
    for (const key in details) {
      if (!Object.hasOwn(details, key) || !validKey(key)) continue;
      values[key] = safeValue(details[key]);
      if (++count === PERFORMANCE_RECORDER_LIMITS.details) break;
    }
    const event = {
      timeMs: this.time(),
      name: name.slice(0, PERFORMANCE_RECORDER_LIMITS.keyLength),
      details: values,
    };
    this.events.push(event);
    if (
      !this.milestones.has(event.name) &&
      this.milestones.size < PERFORMANCE_RECORDER_LIMITS.milestones
    )
      this.milestones.set(event.name, event);
  }

  /** Merge a bounded context; already registered keys can always be updated. */
  setContext(context: Record<string, DiagnosticValue>): void {
    for (const key in context) {
      if (!Object.hasOwn(context, key) || !validKey(key)) continue;
      if (!Object.hasOwn(this.context, key)) {
        if (this.contextCount >= PERFORMANCE_RECORDER_LIMITS.context) continue;
        this.contextCount++;
      }
      this.context[key] = safeValue(context[key]);
    }
  }

  private summary(): Omit<PerformanceSnapshot, "samples" | "events"> {
    return {
      schemaVersion: 1,
      context: { ...this.context },
      retention: {
        samples: this.samples.retention(),
        events: this.events.retention(),
      },
      peaks: { ...this.peaks },
      peakTimesMs: { ...this.peakTimesMs },
      milestones: Array.from(this.milestones.values(), (event) => ({
        ...event,
        details: { ...event.details },
      })),
      frames: {
        count: this.cpu.count,
        intervalCount: this.intervals.count,
        cpuMs: this.cpu.summary(),
        intervalMs: this.intervals.summary(),
        over33ms: this.over33ms,
        over50ms: this.over50ms,
        over100ms: this.over100ms,
        over250ms: this.over250ms,
      },
    };
  }

  /** Polling cost is independent of retained sample/event history length. */
  observe(): PerformanceObservation {
    const latest = this.samples.latest();
    return {
      ...this.summary(),
      latestSample: latest
        ? { timeMs: latest.timeMs, values: { ...latest.values } }
        : null,
    };
  }

  /** Full history is copied only when an automation explicitly exports it. */
  snapshot(): PerformanceSnapshot {
    return {
      ...this.summary(),
      samples: this.samples.snapshot((entry) => ({
        timeMs: entry.timeMs,
        values: { ...entry.values },
      })),
      events: this.events.snapshot((entry) => ({
        ...entry,
        details: { ...entry.details },
      })),
    };
  }

  /** Clear recorded data and gauge registration while preserving context. */
  reset(): void {
    this.samples.reset();
    this.events.reset();
    this.gaugeKeys.clear();
    this.peaks = record<number>();
    this.peakTimesMs = record<number>();
    this.milestones.clear();
    this.cpu.reset();
    this.intervals.reset();
    this.over33ms = this.over50ms = this.over100ms = this.over250ms = 0;
    const origin = this.now();
    this.origin = Number.isFinite(origin) ? origin : 0;
    this.lastTime = 0;
  }
}
