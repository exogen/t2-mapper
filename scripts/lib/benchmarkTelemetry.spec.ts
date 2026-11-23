import { EventEmitter } from "node:events";
import { afterEach, expect, it, vi } from "vitest";
import type { Browser, CDPSession, Page } from "puppeteer";
import { PerformanceRecorder } from "../../src/diagnostics/performanceRecorder";
import {
  BenchmarkTelemetry,
  createBenchmarkTelemetryData,
  processMemoryFromPs,
} from "./benchmarkTelemetry";

const stop: Array<() => void> = [];
afterEach(() => {
  stop.splice(0).forEach((close) => close());
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function fixture(
  options: Partial<ConstructorParameters<typeof BenchmarkTelemetry>[0]> = {},
) {
  let now = 1000;
  const recorder = new PerformanceRecorder({ now: () => now });
  recorder.sample({ "playback.downloadComplete": 1, sequence: 0 });
  const api = {
    observe: vi.fn(() => recorder.observe()),
    snapshot: vi.fn(() => recorder.snapshot()),
    mark: vi.fn((name, details) => {
      recorder.mark(name, details);
      recorder.sample({ "playback.downloadComplete": 1, sequence: now });
    }),
    reset: vi.fn(),
  };
  vi.stubGlobal("__t2Diagnostics", api);
  const page = Object.assign(new EventEmitter(), {
    evaluate: vi.fn(async (fn: (...args: any[]) => unknown, ...args: any[]) =>
      fn(...args),
    ),
    setRequestInterception: vi.fn(async () => {}),
  });
  const cdp = Object.assign(new EventEmitter(), {
    send: vi.fn(async (method: string) => {
      if (method === "Performance.getMetrics")
        return { metrics: [{ name: "JSHeapUsedSize", value: 123 }] };
      if (method === "Memory.getDOMCounters")
        return { documents: 1, nodes: 2, jsEventListeners: 3 };
      return {};
    }),
  });
  const browser = Object.assign(new EventEmitter(), {
    process: () => ({ pid: 10 }),
  });
  const state = createBenchmarkTelemetryData();
  const telemetry = new BenchmarkTelemetry({
    state,
    startedAt: 1000,
    now: () => now,
    requestedWallSeconds: 300,
    collectDiagnostics: true,
    processMemoryEnabled: false,
    ...options,
  });
  telemetry.watchBrowser(browser as unknown as Browser);
  telemetry.watchPage(page as unknown as Page);
  telemetry.watchCdp(cdp as unknown as CDPSession);
  stop.push(() => telemetry.stop());
  return {
    telemetry,
    state,
    page,
    cdp,
    browser,
    api,
    recorder,
    setNow: (value: number) => (now = value),
  };
}

it("keeps phase clocks, marks and observation order without cloning full history", async () => {
  const { telemetry, state, api, setNow } = fixture();
  setNow(1750);
  await telemetry.setPhase("measurement", { targetSec: 1200 });
  expect(state.phases).toEqual([
    { timeMs: 750, name: "measurement", details: { targetSec: 1200 } },
  ]);
  expect(api.mark).toHaveBeenCalledWith("benchmark.measurement", {
    targetSec: 1200,
  });
  expect(state.resourceSamples[0]).toMatchObject({
    capturedAtMs: 750,
    phase: "measurement",
    values: { sequence: 1750 },
  });
  expect(api.snapshot).not.toHaveBeenCalled();
  expect(state.fullHistoryPolling).toBe(false);
  await telemetry.captureFreshDiagnostics(true);
  expect(api.snapshot).toHaveBeenCalledOnce();
  expect(state.fullSnapshotCaptures).toBe(1);
  expect(state.diagnostics?.schemaVersion).toBe(1);
  expect(state.observation).not.toHaveProperty("samples");
});

it("pins startup rows and bounds both histories with the existing drop counters", async () => {
  const { telemetry, state, recorder, setNow } = fixture();
  for (let i = 0; i < 520; i++) {
    setNow(1000 + i);
    recorder.sample({ sequence: i });
    await telemetry.captureDiagnostics();
  }
  expect(state.resourceSamples).toHaveLength(512);
  expect(state.resourceSamplesDropped).toBe(8);
  expect(state.resourceSamples[31].values.sequence).toBe(31);
  expect(state.resourceSamples[32].values.sequence).toBe(40);
  expect(state.resourceSamples.at(-1)?.values.sequence).toBe(519);
  for (let i = 0; i < 260; i++) {
    setNow(2000 + i);
    await telemetry.captureBrowserTelemetry();
  }
  expect(state.browserTelemetry.samples).toHaveLength(256);
  expect(state.browserTelemetry.dropped).toBe(4);
  expect(state.browserTelemetry.samples[15].timeMs).toBe(1015);
  expect(state.browserTelemetry.samples[16].timeMs).toBe(1020);
  expect(state.browserTelemetry.samples.at(-1)?.timeMs).toBe(1259);
});

it("retains 5s/10s cadence and centrally removes timers and health listeners", async () => {
  vi.useFakeTimers();
  const { telemetry, state, api, page, browser, cdp } = fixture();
  telemetry.startDiagnosticPolling();
  await telemetry.startBrowserSampling();
  expect(state.browserTelemetry.samples).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(api.observe).toHaveBeenCalledTimes(2);
  expect(state.browserTelemetry.samples).toHaveLength(2);
  expect(api.snapshot).not.toHaveBeenCalled();
  telemetry.stop();
  telemetry.stop();
  expect(vi.getTimerCount()).toBe(0);
  expect(page.listenerCount("close")).toBe(0);
  expect(page.listenerCount("pageerror")).toBe(0);
  expect(browser.listenerCount("disconnected")).toBe(0);
  expect(cdp.listenerCount("Page.frameNavigated")).toBe(0);
  await vi.advanceTimersByTimeAsync(20_000);
  page.emit("close");
  browser.emit("disconnected");
  expect(telemetry.failure).toBeNull();
  expect(api.observe).toHaveBeenCalledTimes(2);
});

it("does not let late async responses mutate a stopped report", async () => {
  let release!: () => void;
  const pending = new Promise<null>((resolve) => {
    release = () => resolve(null);
  });
  const { telemetry, state } = fixture({
    processMemoryEnabled: true,
    sampleProcessMemory: () => pending,
  });
  const capture = telemetry.captureBrowserTelemetry();
  telemetry.stop();
  release();
  await capture;
  expect(state.browserTelemetry.samples).toEqual([]);
  expect(state.browserTelemetry.errors).toBe(0);
});

it("detects a reload, preserves last evidence and permits a final explicit export", async () => {
  const { telemetry, state, cdp, api } = fixture();
  cdp.emit("Page.frameNavigated", { frame: {} });
  cdp.emit("Page.frameNavigated", { frame: { parentId: "top" } });
  expect(telemetry.failure).toBeNull();
  cdp.emit("Page.frameNavigated", { frame: {} });
  expect(() => telemetry.assertHealthy()).toThrow(
    "Unexpected page navigation or reload",
  );
  await telemetry.captureDiagnostics();
  expect(api.observe).not.toHaveBeenCalled();
  await telemetry.captureFreshDiagnostics(true);
  expect(state.diagnostics?.schemaVersion).toBe(1);
  expect(state.fullSnapshotCaptures).toBe(1);
});

it("preserves compact progress shape and bounds error/hostname details", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const persist = vi.fn(async () => {});
  const { telemetry, state, page, setNow } = fixture({
    progressFile: "/tmp/benchmark.json.progress.json",
    persistProgress: persist,
  });
  for (let i = 0; i < 22; i++) page.emit("pageerror", "x".repeat(600));
  expect(state.pageErrors).toMatchObject({ count: 22, dropped: 2 });
  expect(state.pageErrors.messages.every((s) => s.length === 500)).toBe(true);
  await telemetry.blockExternalRequests(page as unknown as Page);
  for (let i = 0; i < 18; i++)
    page.emit("request", {
      url: () => `https://host${i}.example/private?token=secret`,
      abort: vi.fn(async () => {}),
    });
  expect(state.externalNetwork.blockedRequests).toBe(18);
  expect(state.externalNetwork.hostnames).toHaveLength(16);
  expect(JSON.stringify(state.externalNetwork)).not.toContain("secret");
  telemetry.markMeasurementStart(1200);
  setNow(3200);
  await telemetry.writeProgress();
  const progress = persist.mock.calls.at(-1) as unknown as [
    string,
    Record<string, unknown>,
  ];
  expect(progress[0]).toBe("/tmp/benchmark.json.progress.json");
  expect(Object.keys(progress[1]).sort()).toEqual([
    "browser",
    "elapsedMs",
    "externalNetwork",
    "failure",
    "measurementElapsedSeconds",
    "observation",
    "pageErrors",
    "phase",
    "requestedWallSeconds",
    "resource",
  ]);
  expect(progress[1].measurementElapsedSeconds).toBe(2);
  expect(progress[1].observation).toBeNull();
});

it("returns only descendant numeric RSS totals, never process command lines", () => {
  const memory = processMemoryFromPs(
    "10 1 100 /private/browser --secret=a\n11 10 200 gpu --type=gpu-process\n12 10 300 render --type=renderer\n13 12 50 render --type=renderer\n99 1 900 unrelated --token=b",
    10,
  );
  expect(memory.aggregateRssBytes).toBe(650 * 1024);
  expect(memory.roles.renderer).toEqual({ rssBytes: 350 * 1024, processes: 2 });
  expect(memory.processCount).toBe(4);
  expect(JSON.stringify(memory)).not.toMatch(/secret|token|private|command/);
});

it("serializes and coalesces progress writes when failure races a pending sample", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let active = 0,
    maximumActive = 0;
  const stored: Array<{
    phase: string;
    hosts: string[];
    failure: string | null;
  }> = [];
  const persist = vi.fn(
    async (
      _file: string,
      progress: import("./benchmarkTelemetry").BenchmarkProgress,
    ) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      if (progress.phase === "measurement") await gate;
      stored.push({
        phase: progress.phase,
        hosts: [...progress.externalNetwork.hostnames],
        failure: progress.failure,
      });
      active--;
    },
  );
  const { telemetry, state, page } = fixture({
    progressFile: "/tmp/benchmark.json.progress.json",
    persistProgress: persist,
  });
  telemetry.phase = "measurement";
  const old = telemetry.writeProgress();
  await Promise.resolve();
  // The failure listener and the runner's catch both persist to the same
  // temporary file while a normal sample may still be writing it.
  telemetry.phase = "failed";
  state.externalNetwork.hostnames.push("latest.example");
  page.emit("close");
  const latest = telemetry.writeProgress();
  release();
  await Promise.all([old, latest]);
  expect(maximumActive).toBe(1);
  expect(persist).toHaveBeenCalledTimes(2);
  expect(stored).toEqual([
    { phase: "measurement", hosts: [], failure: null },
    {
      phase: "failed",
      hosts: ["latest.example"],
      failure: "Page closed unexpectedly",
    },
  ]);
});

it("allows progress persistence to recover after a synchronous storage failure", async () => {
  const persist = vi
    .fn()
    .mockImplementationOnce(() => {
      throw new Error("storage unavailable");
    })
    .mockResolvedValueOnce(undefined);
  const { telemetry } = fixture({
    progressFile: "/tmp/benchmark.json.progress.json",
    persistProgress: persist,
  });
  await expect(telemetry.writeProgress()).rejects.toThrow(
    "storage unavailable",
  );
  telemetry.phase = "recovered";
  await telemetry.writeProgress();
  expect(persist).toHaveBeenCalledTimes(2);
  expect(persist.mock.calls[1][1].phase).toBe("recovered");
});
