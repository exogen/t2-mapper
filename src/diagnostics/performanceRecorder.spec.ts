import { expect, it, vi } from "vitest";
import {
  PERFORMANCE_RECORDER_LIMITS as limits,
  PerformanceRecorder,
} from "./performanceRecorder";

it("observes immutable current readings without traversing or cloning history rings", () => {
  const recorder = new PerformanceRecorder({
    sampleCapacity: 3,
    eventCapacity: 3,
  });
  recorder.sample({ heap: 100 });
  recorder.mark("load", { entries: 2 });
  recorder.sample({ heap: 20, unsupported: null });
  const rings = recorder as unknown as {
    samples: { snapshot(): unknown };
    events: { snapshot(): unknown };
  };
  const samples = vi.spyOn(rings.samples, "snapshot").mockImplementation(() => {
    throw new Error("sample history cloned");
  });
  const events = vi.spyOn(rings.events, "snapshot").mockImplementation(() => {
    throw new Error("event history cloned");
  });
  const observed = recorder.observe();
  expect(observed).not.toHaveProperty("samples");
  expect(observed).not.toHaveProperty("events");
  expect(observed.latestSample?.values).toEqual({
    heap: 20,
    unsupported: null,
  });
  expect(observed.peaks).toEqual({ heap: 100 });
  observed.latestSample!.values.heap = 999;
  observed.peaks.heap = 999;
  observed.milestones[0].details.entries = 999;
  expect(recorder.observe().latestSample?.values.heap).toBe(20);
  expect(recorder.observe().peaks.heap).toBe(100);
  expect(recorder.observe().milestones[0].details.entries).toBe(2);
  expect(samples).not.toHaveBeenCalled();
  expect(events).not.toHaveBeenCalled();
  samples.mockRestore();
  events.mockRestore();
  recorder.reset();
  expect(recorder.observe().latestSample).toBeNull();
});

it("rotates samples and events independently while retaining lifetime peaks", () => {
  let now = 100;
  const recorder = new PerformanceRecorder({
    now: () => now,
    sampleCapacity: 2,
    eventCapacity: 1,
  });
  recorder.sample({ heap: 100, unsupported: null });
  recorder.mark("load", { cold: true });
  now += 10;
  recorder.sample({ heap: 50 });
  recorder.mark("ready");
  now += 10;
  recorder.sample({ heap: 25, unsupported: null });
  expect(recorder.snapshot()).toMatchObject({
    schemaVersion: 1,
    retention: {
      samples: { capacity: 2, totalWritten: 3, overwritten: 1 },
      events: { capacity: 1, totalWritten: 2, overwritten: 1 },
    },
    samples: [
      { timeMs: 10, values: { heap: 50 } },
      { timeMs: 20, values: { heap: 25, unsupported: null } },
    ],
    events: [{ timeMs: 10, name: "ready", details: {} }],
    peaks: { heap: 100 },
  });
});

it("keeps peak timestamps and first phase events after recent history is overwritten", () => {
  let now = 0;
  const recorder = new PerformanceRecorder({
    now: () => now,
    sampleCapacity: 1,
    eventCapacity: 1,
  });
  recorder.mark("checkpoint-import-start");
  now = 5;
  recorder.sample({ heap: 100 });
  recorder.mark("checkpoint-import-end", { entries: 3 });
  now = 10;
  recorder.sample({ heap: 100 }); // Ties preserve the first peak timestamp.
  recorder.mark("checkpoint-import-start", { retry: true });
  now = 20;
  recorder.sample({ heap: 20 });
  const report = recorder.snapshot();
  expect(report.samples).toHaveLength(1);
  expect(report.peakTimesMs).toEqual({ heap: 5 });
  expect(report.milestones).toEqual([
    { timeMs: 0, name: "checkpoint-import-start", details: {} },
    { timeMs: 5, name: "checkpoint-import-end", details: { entries: 3 } },
  ]);
  report.milestones[1].details.entries = 99;
  expect(recorder.snapshot().milestones[1].details.entries).toBe(3);
  for (let i = 0; i < limits.milestones * 2; i++) recorder.mark(`event${i}`);
  expect(recorder.snapshot().milestones).toHaveLength(limits.milestones);
  recorder.reset();
  expect(recorder.snapshot().milestones).toEqual([]);
  expect(recorder.snapshot().peakTimesMs).toEqual({});
});

it("reports exact means/maxima and bounded percentile tails without retaining frames", () => {
  const recorder = new PerformanceRecorder();
  for (let i = 0; i < 98; i++) recorder.recordFrame(4, 16.1);
  recorder.recordFrame(120, 120);
  recorder.recordFrame(70001, 70001);
  const { frames } = recorder.snapshot();
  expect(frames.count).toBe(100);
  expect(frames.cpuMs).toEqual({
    mean: (98 * 4 + 120 + 70001) / 100,
    p50: 4,
    p95: 4,
    p99: 125,
    max: 70001,
  });
  expect(frames.intervalMs.p50).toBe(16.67);
  expect(frames.intervalMs.p99).toBe(125);
  expect(frames.intervalMs.max).toBe(70001);
  const overflow = new PerformanceRecorder();
  overflow.recordFrame(70001, 70001);
  expect(overflow.snapshot().frames.cpuMs.p99).toBe(70001);
});

it("counts interval thresholds strictly and excludes intentional idle gaps", () => {
  const recorder = new PerformanceRecorder();
  recorder.recordFrame(2, null); // First frame/resume: no interval to classify.
  for (const interval of [33, 33.1, 50, 50.1, 100, 100.1, 250, 250.1])
    recorder.recordFrame(2, interval);
  recorder.recordFrame(2, null); // Caller excludes a hidden-tab gap.
  expect(recorder.snapshot().frames).toMatchObject({
    count: 10,
    intervalCount: 8,
    cpuMs: { mean: 2, max: 2 },
    intervalMs: {
      mean: (33 + 33.1 + 50 + 50.1 + 100 + 100.1 + 250 + 250.1) / 8,
    },
    over33ms: 7,
    over50ms: 5,
    over100ms: 3,
    over250ms: 1,
  });
});

it("keeps unsupported and invalid readings JSON-safe without inventing zeroes", () => {
  const recorder = new PerformanceRecorder();
  recorder.setContext({ unavailable: null, invalid: NaN });
  recorder.sample({ unavailable: null, nan: NaN, infinite: Infinity, zero: 0 });
  recorder.mark("phase", { duration: Infinity });
  recorder.recordFrame(NaN, Infinity);
  recorder.recordFrame(-1, -1);
  const snapshot = recorder.snapshot();
  expect(snapshot.samples[0].values).toEqual({
    unavailable: null,
    nan: null,
    infinite: null,
    zero: 0,
  });
  expect(snapshot.peaks).toEqual({ zero: 0 });
  expect(snapshot.frames).toMatchObject({
    count: 0,
    cpuMs: { mean: null, p50: null, p95: null, p99: null, max: null },
    intervalMs: { mean: null, max: null },
  });
  expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
});

it("bounds keys, text, and lifetime gauge cardinality, including after eviction", () => {
  const recorder = new PerformanceRecorder({ sampleCapacity: 1 });
  const gauges = Object.fromEntries(
    Array.from({ length: limits.gauges + 72 }, (_, i) => [`g${i}`, i]),
  );
  const context = Object.fromEntries(
    Array.from({ length: 100 }, (_, i) => [`c${i}`, "x".repeat(500)]),
  );
  recorder.sample(gauges);
  recorder.sample({ newGauge: 200, g0: 200 });
  recorder.setContext(context);
  recorder.setContext({ newContext: true, c0: "updated" });
  recorder.mark("event".repeat(100), context);
  const snapshot = recorder.snapshot();
  expect(Object.keys(snapshot.peaks)).toHaveLength(limits.gauges);
  expect(snapshot.samples[0].values).toEqual({ g0: 200 });
  expect(snapshot.peaks.g0).toBe(200);
  expect(Object.keys(snapshot.context)).toHaveLength(limits.context);
  expect(snapshot.context.c0).toBe("updated");
  expect(snapshot.context.c1).toHaveLength(limits.stringLength);
  expect(Object.keys(snapshot.events[0].details)).toHaveLength(limits.details);
  expect(snapshot.events[0].name).toHaveLength(limits.keyLength);
  expect(snapshot.events[0].details.c0).toHaveLength(limits.stringLength);
  recorder.sample({ ["k".repeat(limits.keyLength + 1)]: 1 });
  expect(recorder.snapshot().samples[0].values).toEqual({});
});

it("copies incoming records and snapshots, and handles prototype-like keys safely", () => {
  const recorder = new PerformanceRecorder();
  const gauges = JSON.parse('{"__proto__":1,"constructor":2}') as Record<
    string,
    number
  >;
  const details = { phase: "before" };
  recorder.sample(gauges);
  recorder.mark("phase", details);
  recorder.setContext(details);
  gauges["constructor" as string] = 9;
  details.phase = "after";
  const first = recorder.snapshot();
  first.samples[0].values["constructor" as string] = 8;
  first.events[0].details.phase = "mutated";
  first.context.phase = "mutated";
  first.peaks["constructor" as string] = 8;
  const second = recorder.snapshot();
  expect(Object.hasOwn(second.samples[0].values, "__proto__")).toBe(true);
  expect(second.samples[0].values.constructor).toBe(2);
  expect(second.peaks.constructor).toBe(2);
  expect(second.events[0].details.phase).toBe("before");
  expect(second.context.phase).toBe("before");
  expect(JSON.parse(JSON.stringify(second))).toEqual(second);
});

it("resets history, peaks, histograms, registrations, and origin but keeps context", () => {
  let now = 100;
  const recorder = new PerformanceRecorder({ now: () => now });
  recorder.setContext({ build: "test" });
  recorder.sample({ before: 100 });
  recorder.mark("load");
  recorder.recordFrame(10, 1000);
  now = 500;
  recorder.reset();
  expect(recorder.snapshot()).toMatchObject({
    context: { build: "test" },
    samples: [],
    events: [],
    peaks: {},
    retention: {
      samples: { totalWritten: 0, overwritten: 0 },
      events: { totalWritten: 0, overwritten: 0 },
    },
    frames: { count: 0, cpuMs: { mean: null }, over50ms: 0 },
  });
  now = 510;
  recorder.sample({ after: 1 });
  expect(recorder.snapshot().samples[0]).toEqual({
    timeMs: 10,
    values: { after: 1 },
  });
});

it("clamps clock regressions and invalid clock values to the last timestamp", () => {
  let now = 100;
  const recorder = new PerformanceRecorder({ now: () => now });
  now = 120;
  recorder.mark("first");
  now = 90;
  recorder.mark("regression");
  now = NaN;
  recorder.mark("invalid");
  expect(recorder.snapshot().events.map((event) => event.timeMs)).toEqual([
    20, 20, 20,
  ]);
});

it("clamps configured capacities so a caller cannot make retention unbounded", () => {
  const recorder = new PerformanceRecorder({
    sampleCapacity: 1e9,
    eventCapacity: 0,
  });
  for (let i = 0; i < limits.samples + 1; i++) recorder.sample({ value: i });
  recorder.mark("old");
  recorder.mark("new");
  expect(recorder.snapshot().samples).toHaveLength(limits.samples);
  expect(recorder.snapshot().events.map((event) => event.name)).toEqual([
    "new",
  ]);
});
