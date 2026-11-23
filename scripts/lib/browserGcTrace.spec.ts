import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CDPSession } from "puppeteer";
import { GcTraceIntervals, startBrowserGcTrace } from "./browserGcTrace";

it("unions nested and overlapping main-thread GC intervals, excluding workers", () => {
  const trace = new GcTraceIntervals();
  trace.accept({
    ph: "M",
    pid: 1,
    tid: 2,
    name: "thread_name",
    args: { name: "CrRendererMain" },
  });
  trace.accept({
    ph: "M",
    pid: 1,
    tid: 3,
    name: "thread_name",
    args: { name: "WorkerThread" },
  });
  for (const [tid, name, ts, dur] of [
    [2, "V8.GCScavenger", 1000, 4000],
    [2, "V8.GC_SCAVENGER_SCAVENGE", 2000, 2000],
    [2, "V8.GCFinalizeMC", 4000, 3000],
    [2, "V8.GCScavenger", 9000, 1000],
    [3, "V8.GC_BACKGROUND_MARKING", 1000, 15000],
  ] as const)
    trace.accept({ ph: "X", pid: 1, tid, name, ts, dur });
  expect(trace.summarize()).toMatchObject({
    mainThreadGcMs: 7,
    mainThreadGcIntervals: 2,
    longestMainThreadGcMs: 6,
  });
  expect(trace.summarize(3000, 6000)).toMatchObject({
    mainThreadGcMs: 3,
    mainThreadGcIntervals: 1,
  });
});

it("handles begin/end nesting and bounds retained intervals", () => {
  const trace = new GcTraceIntervals(1);
  trace.accept({
    ph: "M",
    pid: 1,
    tid: 2,
    name: "thread_name",
    args: { name: "CrRendererMain" },
  });
  trace.accept({ ph: "B", pid: 1, tid: 2, name: "V8.Execute", ts: 100 });
  trace.accept({ ph: "B", pid: 1, tid: 2, name: "V8.GCScavenger", ts: 200 });
  trace.accept({ ph: "E", pid: 1, tid: 2, ts: 1200 });
  trace.accept({ ph: "E", pid: 1, tid: 2, ts: 2000 });
  trace.accept({
    ph: "X",
    pid: 1,
    tid: 2,
    name: "V8.GCScavenger",
    ts: 3000,
    dur: 1000,
  });
  expect(trace.summarize()).toMatchObject({
    mainThreadGcMs: 1,
    mainThreadGcIntervals: 1,
    retainedIntervals: 1,
    droppedIntervals: 1,
  });
});

it("releases trace listeners when Chrome rejects trace startup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "t2-gc-startup-"));
  const file = join(dir, "trace.jsonl");
  const cdp = Object.assign(new EventEmitter(), {
    send: vi.fn(async (method: string) => {
      if (method === "Tracing.start") throw new Error("trace already active");
      return {};
    }),
  });
  try {
    await expect(
      startBrowserGcTrace(cdp as unknown as CDPSession, file),
    ).rejects.toThrow("trace already active");
    // The old helper starts opening the file without awaiting it. Let that
    // native operation finish before removing the temporary directory.
    await vi.waitFor(() => access(file));
    expect(cdp.listenerCount("Tracing.dataCollected")).toBe(0);
    expect(cdp.listenerCount("Tracing.bufferUsage")).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("rejects an unavailable trace output before starting Chrome tracing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "t2-gc-output-"));
  const cdp = Object.assign(new EventEmitter(), {
    send: vi.fn(async () => ({})),
  });
  try {
    await expect(
      startBrowserGcTrace(
        cdp as unknown as CDPSession,
        join(dir, "missing-parent", "trace.jsonl"),
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(cdp.send).not.toHaveBeenCalled();
    expect(cdp.listenerCount("Tracing.dataCollected")).toBe(0);
    expect(cdp.listenerCount("Tracing.bufferUsage")).toBe(0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
