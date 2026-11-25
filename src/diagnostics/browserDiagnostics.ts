import { Vector2, type WebGLRenderer } from "three";
import type { GameEngine } from "../engine/gameEngine";
import {
  PERFORMANCE_RECORDER_LIMITS,
  PerformanceRecorder,
} from "./performanceRecorder";
import {
  readResourceMetrics,
  registerMetricSource,
} from "./resourceMetricRegistry";
import { classifyDevice, readDeviceSignals } from "../deviceConstraints";
import { installDiagnosticEventSink } from "./events";

import type {
  DiagnosticDetails as Details,
  DiagnosticsAPI,
  DiagnosticsGlobals,
  DiagnosticsReport,
} from "./protocol";
export type { DiagnosticsAPI, DiagnosticsReport } from "./protocol";

declare global {
  // Merge the shared structural protocol into the browser's Window.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Window extends DiagnosticsGlobals {}
}

const BREADCRUMB_KEY = "t2-mapper:diagnostics:v1";
const BREADCRUMB_GAUGES = [
  "browser.jsHeapUsedBytes",
  "bitmapTextureCache.estimatedDecodedImageBytes",
  "audioBufferCache.decodedAudioBytes",
  "renderer.geometries",
  "renderer.textures",
  "sunShadow.estimatedTargetBytes",
  "playback.sessionCheckpointEntries",
  "playback.persistedCheckpointEntries",
  "dtsInstances.idleGpuTextureBytes",
] as const;
let recorder: PerformanceRecorder | null = null;
let timingEpoch = 0;
let rendererId = 0;
let contextCount = 0;
let longTasks = 0;
let longTaskMs = 0;
let longFrames = 0;
let longFrameMs = 0;
let longTasksSupported = false;
let longFramesSupported = false;
let lastAppPhase = "session-start";
let lastEvent = "session-start";
let observationStart = 0;
let visibleSince: number | null = null;
let sessionCleanup: Array<() => void> = [];
let breadcrumbMetrics: Record<string, number | null> = {};
const engineAttachments = new Set<{ start(): void; stop(): void }>();

function heapBytes(): number | null {
  const memory = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number };
    }
  ).memory;
  return memory?.usedJSHeapSize ?? null;
}

function saveBreadcrumb(state: "active" | "hidden" | "pagehide" | "stopped") {
  try {
    sessionStorage.setItem(
      BREADCRUMB_KEY,
      JSON.stringify({
        at: Date.now(),
        state,
        phase: lastAppPhase,
        event: lastEvent,
        metrics: breadcrumbMetrics,
      }),
    );
  } catch {
    // Storage may be disabled, particularly in private browsing.
  }
}

export function diagnosticsEnabled(): boolean {
  return recorder !== null;
}

export function sampleDiagnostics(): void {
  if (!recorder) return;
  const values: Record<string, number | null> = {
    ...readResourceMetrics(),
    "browser.jsHeapUsedBytes": heapBytes(),
    "browser.visible": document.hidden ? 0 : 1,
    "browser.activeContexts": contextCount,
    "browser.longTasksSupported": longTasksSupported ? 1 : 0,
    "browser.longFramesSupported": longFramesSupported ? 1 : 0,
    "browser.longTasks": longTasksSupported ? longTasks : null,
    "browser.longTaskMs": longTasksSupported ? longTaskMs : null,
    "browser.longFrames": longFramesSupported ? longFrames : null,
    "browser.longFrameMs": longFramesSupported ? longFrameMs : null,
  };
  for (const key of BREADCRUMB_GAUGES)
    breadcrumbMetrics[key] = values[key] ?? null;
  recorder.sample(values);
}

/** Phase boundaries sample immediately; ordinary frames never allocate samples. */
export function markDiagnosticEvent(name: string, details?: Details): void {
  recordEvent(name, details, true);
}

function recordEvent(name: string, details?: Details, appPhase = false): void {
  if (!recorder) return;
  name = name.slice(0, PERFORMANCE_RECORDER_LIMITS.keyLength);
  recorder.mark(name, details);
  lastEvent = name;
  if (appPhase) lastAppPhase = name;
  sampleDiagnostics();
  saveBreadcrumb(document.hidden ? "hidden" : "active");
}

export function setDiagnosticsContext(context: Details): void {
  recorder?.setContext(context);
}

/** Only automation bootstrapped before app startup can start a recorder. */
export function startBrowserDiagnostics(): DiagnosticsAPI {
  if (
    typeof window === "undefined" ||
    window.__t2DiagnosticsAutomation !== true
  )
    throw new Error("Diagnostics require the automation bootstrap");
  if (recorder) return window.__t2Diagnostics!;
  const current = new PerformanceRecorder();
  recorder = current;
  sessionCleanup.push(installDiagnosticEventSink(markDiagnosticEvent));
  timingEpoch++;
  longTasks = longFrames = longTaskMs = longFrameMs = 0;
  longTasksSupported = longFramesSupported = false;
  lastAppPhase = lastEvent = "session-start";
  breadcrumbMetrics = {};
  observationStart = performance.now();
  visibleSince = document.hidden ? null : observationStart;
  const deviceSignals = readDeviceSignals();
  const device = classifyDevice(deviceSignals);
  current.setContext({
    startedAt: new Date().toISOString(),
    build: import.meta.env.VITE_BUILD_SHA || "unknown",
    buildTime: import.meta.env.VITE_BUILD_TIME || "unknown",
    developmentBuild: import.meta.env.DEV,
    deviceProfile: device.constrained ? "constrained" : "desktop",
    deviceProfileReason: device.reason,
    deviceMemoryGB: deviceSignals.deviceMemoryGB ?? null,
    hardwareConcurrency: deviceSignals.hardwareConcurrency ?? null,
    mobileHint: deviceSignals.mobile ?? null,
    coarsePointer: deviceSignals.coarsePointer ?? null,
    maxTouchPoints: deviceSignals.maxTouchPoints ?? null,
    userAgent: navigator.userAgent,
    mode: new URLSearchParams(location.search).get("mode") || "map",
    nativeDpr: window.devicePixelRatio,
    wasDiscarded:
      (document as Document & { wasDiscarded?: boolean }).wasDiscarded ?? null,
    framePercentiles: "histogram estimates; CPU and interval are separate",
    memoryEstimates:
      "resource payload estimates; not process memory or total VRAM",
    rendererMetrics:
      "latest attached engine canvas; activeContexts counts engine canvases",
    longTaskScope:
      "foreground only; reset and visibility boundary entries excluded",
  });
  try {
    const previous = sessionStorage.getItem(BREADCRUMB_KEY);
    if (previous && previous.length < 2048) {
      const value = JSON.parse(previous);
      if (typeof value?.at === "number") {
        const details: Details = {
          at: value.at,
          state: typeof value.state === "string" ? value.state : null,
          phase: typeof value.phase === "string" ? value.phase : null,
          event: typeof value.event === "string" ? value.event : null,
          classification: "interruption evidence only; not proof of OOM",
        };
        for (const key of BREADCRUMB_GAUGES) {
          const reading = value.metrics?.[key];
          if (typeof reading === "number" && Number.isFinite(reading))
            details[`last.${key}`] = reading;
        }
        current.mark("previous-session-breadcrumb", details);
      }
    }
  } catch {
    // A malformed or inaccessible breadcrumb must not affect the app.
  }
  const api: DiagnosticsAPI = {
    observe() {
      return current.observe();
    },
    snapshot() {
      return current.snapshot();
    },
    reset() {
      if (recorder !== current) return;
      current.reset();
      timingEpoch++;
      observationStart = performance.now();
      visibleSince = document.hidden ? null : observationStart;
      longTasks = longFrames = longTaskMs = longFrameMs = 0;
      recordEvent("recording-reset");
    },
    mark(name, details) {
      if (recorder === current) markDiagnosticEvent(name, details);
    },
  };
  window.__t2Diagnostics = api;

  for (const type of ["longtask", "long-animation-frame"]) {
    if (
      typeof PerformanceObserver === "undefined" ||
      !PerformanceObserver.supportedEntryTypes?.includes(type)
    )
      continue;
    try {
      const observer = new PerformanceObserver((list) => {
        if (recorder !== current || document.hidden || visibleSince === null)
          return;
        for (const entry of list.getEntries()) {
          if (
            entry.startTime < Math.max(observationStart, visibleSince) ||
            !Number.isFinite(entry.duration) ||
            entry.duration < 0
          )
            continue;
          if (type === "longtask") {
            longTasks++;
            longTaskMs += entry.duration;
          } else {
            longFrames++;
            longFrameMs += entry.duration;
          }
        }
      });
      observer.observe({ type, buffered: false });
      if (type === "longtask") longTasksSupported = true;
      else longFramesSupported = true;
      sessionCleanup.push(() => observer.disconnect());
    } catch {
      // Supported entry types can still be unavailable in this context.
    }
  }
  const visibility = () => {
    timingEpoch++;
    visibleSince = document.hidden ? null : performance.now();
    recordEvent(document.hidden ? "page-hidden" : "page-visible");
  };
  const pagehide = (event: PageTransitionEvent) => {
    timingEpoch++;
    visibleSince = null;
    recordEvent("pagehide", { persisted: event.persisted });
    saveBreadcrumb("pagehide");
  };
  const pageshow = (event: PageTransitionEvent) => {
    timingEpoch++;
    visibleSince = document.hidden ? null : performance.now();
    recordEvent("pageshow", { persisted: event.persisted });
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", pagehide);
  window.addEventListener("pageshow", pageshow);
  sessionCleanup.push(() => {
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", pagehide);
    window.removeEventListener("pageshow", pageshow);
  });
  const timer = setInterval(() => {
    sampleDiagnostics();
    saveBreadcrumb(document.hidden ? "hidden" : "active");
  }, 1000);
  sessionCleanup.push(() => clearInterval(timer));
  recordEvent("session-start");
  for (const attachment of engineAttachments) attachment.start();
  return api;
}

/** Stop session work; mounted canvases can be observed again on a later start. */
export function stopBrowserDiagnostics(): DiagnosticsReport | null {
  if (!recorder) return null;
  recordEvent("diagnostics-stopped");
  saveBreadcrumb("stopped");
  const report = recorder.snapshot();
  recorder = null;
  timingEpoch++;
  for (const cleanup of sessionCleanup) cleanup();
  sessionCleanup = [];
  for (const attachment of engineAttachments) attachment.stop();
  delete window.__t2Diagnostics;
  return report;
}

export function initializeBrowserDiagnostics(): boolean {
  if (
    typeof window === "undefined" ||
    window.__t2DiagnosticsAutomation !== true
  )
    return false;
  startBrowserDiagnostics();
  return true;
}

/** No timings or samples are collected when diagnostics are disabled. */
export function attachEngineDiagnostics(
  engine: GameEngine,
  renderer: WebGLRenderer,
  measureIntervals: () => boolean,
): () => void {
  contextCount++;
  const id = ++rendererId;
  const size = new Vector2();
  let samples: number | null | undefined;
  // Fixed source keys survive remounts without exhausting lifetime gauge caps.
  // Replacement-safe registration also handles overlapping mount/dispose.
  const releaseSource = registerMetricSource("renderer", () => {
    // Query lazily, only after opting in. GL queries may synchronize the driver.
    if (samples === undefined && recorder) {
      try {
        const gl = renderer.getContext();
        samples = gl.getParameter(gl.SAMPLES) as number;
      } catch {
        samples = null;
      }
    }
    renderer.getSize(size);
    const info = renderer.info;
    return {
      cssWidth: size.x,
      cssHeight: size.y,
      drawingWidth: renderer.domElement.width,
      drawingHeight: renderer.domElement.height,
      dpr: renderer.getPixelRatio(),
      defaultFramebufferSamples: samples ?? null,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
    };
  });
  let stopSession: (() => void) | null = null;
  const attachment = {
    start() {
      if (stopSession || !recorder) return;
      const current = recorder;
      let start: number | null = null;
      let previous: number | null = null;
      let epoch = timingEpoch;
      let firstFrame = true;
      const stopStart = engine.onFrameStart(() => {
        start =
          recorder === current && !document.hidden ? performance.now() : null;
      });
      const stopEnd = engine.onFrameEnd(() => {
        if (recorder !== current || start === null || document.hidden) return;
        if (epoch !== timingEpoch) {
          previous = null;
          epoch = timingEpoch;
        }
        const intervals = measureIntervals();
        current.recordFrame(
          performance.now() - start,
          intervals && previous !== null ? start - previous : null,
        );
        previous = intervals ? start : null;
        start = null;
        if (firstFrame) {
          firstFrame = false;
          recordEvent("renderer-first-frame", { renderer: id });
        }
      });
      const lost = (event: Event) => {
        previous = null;
        recordEvent("webgl-context-lost", {
          renderer: id,
          status: (event as WebGLContextEvent).statusMessage || null,
        });
      };
      const restored = () => {
        previous = null;
        samples = undefined;
        recordEvent("webgl-context-restored", { renderer: id });
      };
      renderer.domElement.addEventListener("webglcontextlost", lost);
      renderer.domElement.addEventListener("webglcontextrestored", restored);
      stopSession = () => {
        stopStart();
        stopEnd();
        renderer.domElement.removeEventListener("webglcontextlost", lost);
        renderer.domElement.removeEventListener(
          "webglcontextrestored",
          restored,
        );
      };
      recordEvent("renderer-observed", { renderer: id });
    },
    stop() {
      stopSession?.();
      stopSession = null;
    },
  };
  engineAttachments.add(attachment);
  attachment.start();
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    attachment.stop();
    engineAttachments.delete(attachment);
    releaseSource();
    contextCount--;
    // Unsubscribe before forceContextLoss(), which is intentional teardown.
    recordEvent("renderer-disposed", { renderer: id });
  };
}
