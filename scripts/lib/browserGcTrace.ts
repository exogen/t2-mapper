import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { finished } from "node:stream/promises";
import type { CDPSession } from "puppeteer";

interface TraceEvent {
  name?: string;
  cat?: string;
  ph?: string;
  pid?: number;
  tid?: number;
  ts?: number;
  dur?: number;
  args?: { name?: string };
}

interface Interval {
  thread: string;
  name: string;
  start: number;
  end: number;
}

/** Trace event wall times, not a measurement of all user-visible GC pauses.
 * Nested GC events on a renderer main thread are unioned, never summed twice. */
export class GcTraceIntervals {
  private names = new Map<string, string>();
  private stacks = new Map<string, Array<{ name: string; start: number }>>();
  private intervals: Interval[] = [];
  droppedIntervals = 0;
  private limit: number;

  constructor(limit = 50_000) {
    this.limit = limit;
  }

  accept(event: TraceEvent): void {
    const thread = `${event.pid}:${event.tid}`;
    if (event.ph === "M" && event.name === "thread_name" && event.args?.name)
      this.names.set(thread, event.args.name);
    if (!Number.isFinite(event.ts)) return;
    if (event.ph === "B") {
      let stack = this.stacks.get(thread);
      if (!stack) this.stacks.set(thread, (stack = []));
      if (stack.length < 256)
        stack.push({ name: event.name ?? "", start: event.ts! });
    } else if (event.ph === "E") {
      const begin = this.stacks.get(thread)?.pop();
      if (begin) this.add(thread, begin.name, begin.start, event.ts!);
    } else if (event.ph === "X" && Number.isFinite(event.dur)) {
      this.add(thread, event.name ?? "", event.ts!, event.ts! + event.dur!);
    }
  }

  private add(thread: string, name: string, start: number, end: number): void {
    if (!/^(?:MinorGC|MajorGC|V8\.GC)/.test(name) || end < start) return;
    if (this.intervals.length >= this.limit) {
      this.droppedIntervals++;
      return;
    }
    this.intervals.push({ thread, name, start, end });
  }

  summarize(startUs = -Infinity, endUs = Infinity) {
    const byName: Record<string, { count: number; durationMs: number }> = {};
    const threads = new Map<string, Array<[number, number]>>();
    let unknownThreadEvents = 0;
    for (const interval of this.intervals) {
      if (interval.end < startUs || interval.start > endUs) continue;
      const duration = Math.max(
        0,
        Math.min(interval.end, endUs) - Math.max(interval.start, startUs),
      );
      const value = (byName[interval.name] ??= { count: 0, durationMs: 0 });
      value.count++;
      value.durationMs += duration / 1000;
      const threadName = this.names.get(interval.thread);
      if (!threadName) unknownThreadEvents++;
      if (threadName !== "CrRendererMain") continue;
      let values = threads.get(interval.thread);
      if (!values) threads.set(interval.thread, (values = []));
      values.push([
        Math.max(interval.start, startUs),
        Math.min(interval.end, endUs),
      ]);
    }
    let mainThreadGcMs = 0;
    let mainThreadGcIntervals = 0;
    let longestMainThreadGcMs = 0;
    for (const intervals of threads.values()) {
      intervals.sort((a, b) => a[0] - b[0]);
      let start = -Infinity;
      let end = -Infinity;
      const finish = () => {
        if (start === -Infinity) return;
        const durationMs = (end - start) / 1000;
        mainThreadGcMs += durationMs;
        mainThreadGcIntervals++;
        longestMainThreadGcMs = Math.max(longestMainThreadGcMs, durationMs);
      };
      for (const interval of intervals) {
        if (interval[0] > end) {
          finish();
          [start, end] = interval;
        } else end = Math.max(end, interval[1]);
      }
      finish();
    }
    return {
      mainThreadGcMs,
      mainThreadGcIntervals,
      longestMainThreadGcMs,
      byName,
      unknownThreadEvents,
      retainedIntervals: this.intervals.length,
      droppedIntervals: this.droppedIntervals,
    };
  }
}

/** V8-only trace windows are drained every 30 seconds to bound Chrome's
 * tracing storage. No heap snapshots or forced collections are requested. */
export async function startBrowserGcTrace(cdp: CDPSession, file: string) {
  const failures: string[] = [];
  const raw = createWriteStream(file);
  // File I/O can fail outside a CDP call. Contain the stream error until setup
  // or stop() can report it, instead of terminating the benchmark process.
  raw.on("error", (error) => {
    if (failures.length < 8) failures.push(String(error));
  });
  const intervals = new GcTraceIntervals();
  let rawBytes = 0;
  let droppedRawEvents = 0;
  let dataLoss = false;
  let maximumBufferUsage = 0;
  let windows = 0;
  let tracing = false;
  let stopped = false;
  let pending = Promise.resolve();
  let measurementStartUs: number | undefined;
  let measurementEndUs: number | undefined;
  const onBufferUsage = (event: { percentFull?: number; value?: number }) => {
    maximumBufferUsage = Math.max(
      maximumBufferUsage,
      event.percentFull ?? event.value ?? 0,
    );
  };
  const onData = ({ value }: { value: object[] }) => {
    for (const item of value) {
      const event = item as TraceEvent;
      intervals.accept(event);
      if (
        event.ph !== "M" &&
        !/GC|Scavenger|Marking|Compactor/.test(event.name ?? "")
      )
        continue;
      const line = `${JSON.stringify(event)}\n`;
      if (
        rawBytes + line.length > 20 * 1024 * 1024 ||
        raw.writableLength > 1024 * 1024
      ) {
        droppedRawEvents++;
        continue;
      }
      rawBytes += Buffer.byteLength(line);
      raw.write(line);
    }
  };
  cdp.on("Tracing.dataCollected", onData);
  cdp.on("Tracing.bufferUsage", onBufferUsage);
  const begin = async () => {
    await cdp.send("Tracing.start", {
      traceConfig: {
        recordMode: "recordUntilFull",
        traceBufferSizeInKb: 4096,
        includedCategories: ["v8"],
      },
      transferMode: "ReportEvents",
      bufferUsageReportingInterval: 1000,
    });
    windows++;
    tracing = true;
  };
  const end = async () => {
    if (!tracing) return;
    let done: (event: { dataLossOccurred?: boolean }) => void;
    let timeout: ReturnType<typeof setTimeout>;
    const complete = new Promise<void>((resolve, reject) => {
      done = (event) => {
        dataLoss ||= event.dataLossOccurred ?? false;
        resolve();
      };
      cdp.once("Tracing.tracingComplete", done);
      timeout = setTimeout(
        () => reject(new Error("Timed out draining Chrome GC trace")),
        5000,
      );
    });
    try {
      await Promise.all([cdp.send("Tracing.end"), complete]);
    } finally {
      clearTimeout(timeout!);
      cdp.off("Tracing.tracingComplete", done!);
      tracing = false;
    }
  };
  const timestamp = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    const value = metrics.find((metric) => metric.name === "Timestamp")?.value;
    if (value === undefined) throw new Error("CDP trace clock unavailable");
    return value * 1e6;
  };
  try {
    await once(raw, "open");
    await cdp.send("Performance.enable");
    await begin();
  } catch (error) {
    cdp.off("Tracing.dataCollected", onData);
    cdp.off("Tracing.bufferUsage", onBufferUsage);
    raw.destroy();
    await finished(raw).catch(() => {});
    throw error;
  }
  const timer = setInterval(() => {
    pending = pending
      .then(async () => {
        if (stopped) return;
        await end();
        await begin();
      })
      .catch((error: unknown) => {
        if (failures.length < 8) failures.push(String(error));
      });
  }, 30_000);
  return {
    async markMeasurementStart() {
      measurementStartUs = await timestamp();
    },
    async markMeasurementEnd() {
      measurementEndUs = await timestamp();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await pending;
      try {
        await end();
      } catch (error) {
        if (failures.length < 8) failures.push(String(error));
      }
      cdp.off("Tracing.dataCollected", onData);
      cdp.off("Tracing.bufferUsage", onBufferUsage);
      raw.end();
      await finished(raw);
      return {
        method:
          "V8 trace event wall time; renderer main-thread intervals unioned",
        categories: ["v8"],
        windowSeconds: 30,
        bufferSizeKiB: 4096,
        maximumBufferUsage,
        bufferFullSeen: maximumBufferUsage >= 0.99,
        windows,
        rawGcEventsPath: file,
        rawBytes,
        droppedRawEvents,
        dataLoss,
        failures,
        wholeSession: intervals.summarize(),
        measurement:
          measurementStartUs === undefined
            ? null
            : intervals.summarize(measurementStartUs, measurementEndUs),
      };
    },
  };
}
