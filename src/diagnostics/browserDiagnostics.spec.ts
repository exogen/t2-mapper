import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WebGLRenderer } from "three";
import type { GameEngine } from "../engine/gameEngine";
import {
  attachEngineDiagnostics,
  diagnosticsEnabled,
  initializeBrowserDiagnostics,
  markDiagnosticEvent,
  sampleDiagnostics,
  startBrowserDiagnostics,
  stopBrowserDiagnostics,
} from "./browserDiagnostics";

class FakeDocument extends EventTarget {
  hidden = false;
  wasDiscarded = false;
}

class FakeWindow extends EventTarget {
  __t2DiagnosticsAutomation: boolean | undefined = true;
  devicePixelRatio = 2;
  __t2Diagnostics?: ReturnType<typeof startBrowserDiagnostics>;
}

class FakeObserver {
  static supportedEntryTypes = ["longtask", "long-animation-frame"];
  static instances: FakeObserver[] = [];
  type = "";
  disconnected = false;
  callback: PerformanceObserverCallback;

  constructor(callback: PerformanceObserverCallback) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }

  observe(options: PerformanceObserverInit) {
    this.type = options.type!;
  }

  disconnect() {
    this.disconnected = true;
  }

  // Deliberately permit delivery after disconnect to model an already queued
  // callback. The session identity guard must keep it out of a new recording.
  emit(entries: { startTime: number; duration: number }[]) {
    this.callback(
      { getEntries: () => entries } as PerformanceObserverEntryList,
      this as unknown as PerformanceObserver,
    );
  }
}

let now: number;
let doc: FakeDocument;
let win: FakeWindow;
let search: { search: string };
let storage: Map<string, string>;
let storageWrite: ReturnType<typeof vi.fn>;
let clock: ReturnType<typeof vi.fn>;
const dispose: Array<() => void> = [];

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"],
  });
  now = 100;
  doc = new FakeDocument();
  win = new FakeWindow();
  search = { search: "" };
  storage = new Map();
  storageWrite = vi.fn((key: string, value: string) => storage.set(key, value));
  clock = vi.fn(() => now);
  FakeObserver.instances = [];
  FakeObserver.supportedEntryTypes = ["longtask", "long-animation-frame"];
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", win);
  vi.stubGlobal("location", search);
  vi.stubGlobal("navigator", { userAgent: "test-browser" });
  vi.stubGlobal("performance", { now: clock });
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key),
    setItem: storageWrite,
  });
  vi.stubGlobal("PerformanceObserver", FakeObserver);
});

afterEach(() => {
  stopBrowserDiagnostics();
  for (const cleanup of dispose.splice(0)) cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fakeCanvas() {
  const starts = new Set<() => void>();
  const ends = new Set<() => void>();
  const engine = {
    onFrameStart(callback: () => void) {
      starts.add(callback);
      return () => starts.delete(callback);
    },
    onFrameEnd(callback: () => void) {
      ends.add(callback);
      return () => ends.delete(callback);
    },
  };
  const canvas = Object.assign(new EventTarget(), { width: 400, height: 200 });
  const gl = { SAMPLES: 32937, getParameter: vi.fn(() => 4) };
  const renderer = {
    getContext: vi.fn(() => gl),
    getSize: (size: { set: (width: number, height: number) => unknown }) =>
      size.set(200, 100),
    getPixelRatio: () => 2,
    domElement: canvas,
    info: {
      render: { calls: 1, triangles: 6 },
      memory: { geometries: 2, textures: 3 },
      programs: [],
    },
  };
  let intervals = true;
  const cleanup = attachEngineDiagnostics(
    engine as unknown as GameEngine,
    renderer as unknown as WebGLRenderer,
    () => intervals,
  );
  dispose.push(cleanup);
  return {
    starts,
    ends,
    canvas,
    gl,
    renderer,
    cleanup,
    setIntervals(value: boolean) {
      intervals = value;
    },
    frame(at: number, cpu = 2) {
      now = at;
      for (const callback of starts) callback();
      now = at + cpu;
      for (const callback of ends) callback();
    },
  };
}

function visibility(hidden: boolean, at: number) {
  now = at;
  doc.hidden = hidden;
  doc.dispatchEvent(new Event("visibilitychange"));
}

it("ignores URL activation and does no recorder work without the automation bootstrap", () => {
  win.__t2DiagnosticsAutomation = undefined;
  const canvas = fakeCanvas();
  initializeBrowserDiagnostics();
  markDiagnosticEvent("disabled");
  sampleDiagnostics();
  canvas.frame(100);
  expect(diagnosticsEnabled()).toBe(false);
  expect(win.__t2Diagnostics).toBeUndefined();
  expect(canvas.starts.size).toBe(0);
  expect(canvas.renderer.getContext).not.toHaveBeenCalled();
  expect(clock).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);

  search.search = "?diagnostics=1";
  expect(initializeBrowserDiagnostics()).toBe(false);
  expect(diagnosticsEnabled()).toBe(false);
  expect(win.__t2Diagnostics).toBeUndefined();
  expect(storageWrite).not.toHaveBeenCalled();
  expect(() => startBrowserDiagnostics()).toThrow("automation bootstrap");
  win.__t2DiagnosticsAutomation = true;
  expect(initializeBrowserDiagnostics()).toBe(true);
  expect(diagnosticsEnabled()).toBe(true);
  expect(canvas.starts.size).toBe(1);
  expect(canvas.gl.getParameter).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(1);
  sampleDiagnostics();
  expect(canvas.gl.getParameter).toHaveBeenCalledTimes(1);
  expect(startBrowserDiagnostics()).toBe(win.__t2Diagnostics);
});

it("does not initialize diagnostics outside a browser", () => {
  vi.stubGlobal("window", undefined);
  expect(initializeBrowserDiagnostics()).toBe(false);
});

it("excludes hidden and on-demand gaps while keeping CPU and wall intervals separate", () => {
  const canvas = fakeCanvas();
  const api = startBrowserDiagnostics();
  canvas.frame(100, 3);
  canvas.frame(116, 4);
  visibility(true, 1000);
  canvas.frame(2000, 5);
  visibility(false, 10000);
  canvas.frame(10000, 3);
  canvas.frame(10016, 4);
  expect(api.snapshot().frames).toMatchObject({
    count: 4,
    cpuMs: { mean: 3.5, max: 4 },
    intervalMs: { mean: 16, max: 16 },
    over33ms: 0,
  });
  canvas.setIntervals(false);
  canvas.frame(20000);
  canvas.setIntervals(true);
  canvas.frame(30000);
  canvas.frame(30016);
  expect(api.snapshot().frames.intervalMs).toMatchObject({ mean: 16, max: 16 });
  expect(api.snapshot().frames.over250ms).toBe(0);
});

it("resets frame intervals and filters delayed observer entries across reset and resume", () => {
  const canvas = fakeCanvas();
  const api = startBrowserDiagnostics();
  const tasks = FakeObserver.instances.find(
    (observer) => observer.type === "longtask",
  )!;
  const frames = FakeObserver.instances.find(
    (observer) => observer.type === "long-animation-frame",
  )!;
  canvas.frame(100);
  canvas.frame(116);
  tasks.emit([{ startTime: 101, duration: 60 }]);
  now = 200;
  api.reset();
  tasks.emit([
    { startTime: 150, duration: 900 },
    { startTime: 201, duration: 70 },
  ]);
  canvas.frame(250);
  canvas.frame(266);
  visibility(true, 300);
  tasks.emit([{ startTime: 301, duration: 900 }]);
  visibility(false, 500);
  tasks.emit([
    { startTime: 400, duration: 900 },
    { startTime: 501, duration: 80 },
  ]);
  frames.emit([{ startTime: 502, duration: 90 }]);
  sampleDiagnostics();
  const report = api.snapshot();
  expect(report.frames).toMatchObject({
    count: 2,
    intervalMs: { mean: 16 },
    over100ms: 0,
  });
  expect(report.samples.at(-1)?.values).toMatchObject({
    "browser.longTasks": 2,
    "browser.longTaskMs": 150,
    "browser.longFrames": 1,
    "browser.longFrameMs": 90,
  });
});

it("keeps snapshots read-only and prevents stale API handles changing a later session", () => {
  const api = startBrowserDiagnostics();
  const snapshot = vi.spyOn(api, "snapshot");
  const observed = api.observe();
  observed.latestSample!.values["browser.visible"] = 999;
  expect(api.observe().latestSample!.values["browser.visible"]).toBe(1);
  expect(snapshot).not.toHaveBeenCalled();
  snapshot.mockRestore();
  const before = api.snapshot();
  for (let i = 0; i < 20; i++) expect(api.snapshot()).toEqual(before);
  const stopped = stopBrowserDiagnostics()!;
  expect(stopped.events.at(-1)?.name).toBe("diagnostics-stopped");
  expect(api.snapshot()).toEqual(stopped);
  const next = startBrowserDiagnostics();
  api.reset();
  api.mark("stale");
  expect(next.snapshot().events.some((event) => event.name === "stale")).toBe(
    false,
  );
  expect(api.snapshot()).toEqual(stopped);
});

it("removes observers, timers, lifecycle listeners, and engine hooks on stop and restarts once", () => {
  const canvas = fakeCanvas();
  startBrowserDiagnostics();
  const oldObservers = [...FakeObserver.instances];
  expect(canvas.starts.size).toBe(1);
  stopBrowserDiagnostics();
  expect(diagnosticsEnabled()).toBe(false);
  expect(win.__t2Diagnostics).toBeUndefined();
  expect(canvas.starts.size).toBe(0);
  expect(canvas.ends.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(oldObservers.every((observer) => observer.disconnected)).toBe(true);
  const writes = storageWrite.mock.calls.length;
  visibility(true, 200);
  win.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: false }));
  canvas.canvas.dispatchEvent(new Event("webglcontextlost"));
  expect(storageWrite).toHaveBeenCalledTimes(writes);

  const api = startBrowserDiagnostics();
  visibility(false, 300);
  expect(canvas.starts.size).toBe(1);
  expect(canvas.ends.size).toBe(1);
  expect(vi.getTimerCount()).toBe(1);
  for (const observer of oldObservers)
    observer.emit([{ startTime: 301, duration: 900 }]);
  sampleDiagnostics();
  expect(api.snapshot().samples.at(-1)?.values["browser.longTasks"]).toBe(0);
  expect(
    api.snapshot().events.filter((event) => event.name === "page-visible"),
  ).toHaveLength(1);
});

it("ignores intentional post-disposal context loss and makes cleanup idempotent", () => {
  const api = startBrowserDiagnostics();
  const canvas = fakeCanvas();
  canvas.canvas.dispatchEvent(new Event("webglcontextlost"));
  canvas.cleanup();
  canvas.cleanup();
  canvas.canvas.dispatchEvent(new Event("webglcontextlost"));
  const report = api.snapshot();
  expect(
    report.events.filter((event) => event.name === "webgl-context-lost"),
  ).toHaveLength(1);
  expect(
    report.events.filter((event) => event.name === "renderer-disposed"),
  ).toHaveLength(1);
  expect(report.samples.at(-1)?.values["browser.activeContexts"]).toBe(0);
  expect(canvas.starts.size).toBe(0);
});

it("uses stable renderer gauge keys across remounts and overlapping disposal", () => {
  const api = startBrowserDiagnostics();
  for (let i = 0; i < 20; i++) {
    const canvas = fakeCanvas();
    sampleDiagnostics();
    expect(api.snapshot().samples.at(-1)?.values["renderer.geometries"]).toBe(
      2,
    );
    canvas.cleanup();
  }
  const old = fakeCanvas();
  const current = fakeCanvas();
  old.cleanup();
  sampleDiagnostics();
  expect(api.snapshot().samples.at(-1)?.values["renderer.geometries"]).toBe(2);
  expect(
    Object.keys(api.snapshot().peaks).some((key) => /^renderer\d/.test(key)),
  ).toBe(false);
  current.cleanup();
});

it("preserves the last application phase when lifecycle events update the breadcrumb", () => {
  const canvas = fakeCanvas();
  startBrowserDiagnostics();
  markDiagnosticEvent("demo-load-parse");
  visibility(true, 200);
  canvas.canvas.dispatchEvent(new Event("webglcontextlost"));
  const crumb = JSON.parse([...storage.values()][0]);
  expect(crumb.phase).toBe("demo-load-parse");
  expect(crumb.event).toBe("webgl-context-lost");
  expect(crumb.state).toBe("hidden");
});

it("keeps a small last-metrics breadcrumb across recording restarts without retaining reports", () => {
  vi.stubGlobal("performance", {
    now: clock,
    memory: { usedJSHeapSize: 12345 },
  });
  fakeCanvas();
  startBrowserDiagnostics();
  markDiagnosticEvent("checkpoint-decode-start");
  stopBrowserDiagnostics();
  expect([...storage.values()][0].length).toBeLessThan(2048);
  const next = startBrowserDiagnostics().snapshot();
  expect(
    next.events.find((event) => event.name === "previous-session-breadcrumb")
      ?.details,
  ).toMatchObject({
    phase: "checkpoint-decode-start",
    "last.browser.jsHeapUsedBytes": 12345,
    "last.renderer.geometries": 2,
    "last.renderer.textures": 3,
  });
});

it("works without PerformanceObserver and represents unavailable heap memory as null", () => {
  vi.stubGlobal("PerformanceObserver", undefined);
  const api = startBrowserDiagnostics();
  expect(
    api.snapshot().samples[0].values["browser.jsHeapUsedBytes"],
  ).toBeNull();
  expect(FakeObserver.instances).toHaveLength(0);
  expect(api.snapshot().samples[0].values).toMatchObject({
    "browser.longTasksSupported": 0,
    "browser.longFramesSupported": 0,
    "browser.longTasks": null,
    "browser.longTaskMs": null,
    "browser.longFrames": null,
    "browser.longFrameMs": null,
  });
});

it("reports unknown observer counters when entry types are unsupported or observation fails", () => {
  FakeObserver.supportedEntryTypes = [];
  const unsupported = startBrowserDiagnostics();
  expect(
    unsupported.snapshot().samples[0].values["browser.longTasks"],
  ).toBeNull();
  expect(
    unsupported.snapshot().samples[0].values["browser.longFrames"],
  ).toBeNull();
  stopBrowserDiagnostics();
  FakeObserver.supportedEntryTypes = ["longtask", "long-animation-frame"];
  const observe = vi
    .spyOn(FakeObserver.prototype, "observe")
    .mockImplementation(() => {
      throw new Error("observation unavailable");
    });
  try {
    const unavailable = startBrowserDiagnostics();
    expect(unavailable.snapshot().samples[0].values).toMatchObject({
      "browser.longTasksSupported": 0,
      "browser.longFramesSupported": 0,
      "browser.longTasks": null,
      "browser.longFrames": null,
    });
  } finally {
    observe.mockRestore();
  }
});
