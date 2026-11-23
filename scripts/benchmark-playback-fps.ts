/**
 * Demo playback frame-rate benchmark, for A/B comparisons of rendering
 * changes: the same stretch of the same demo, followed by the same
 * camera, in a production build. Throughput mode runs with vsync off;
 * stability mode keeps normal frame pacing and records app diagnostics
 * from navigation through loading, seeking, warmup and measured playback.
 *
 * Build the tree you are measuring (run from its root), then run:
 *
 *   npx tsx scripts/benchmark-playback-fps.ts build <outDir>
 *   npx tsx scripts/benchmark-playback-fps.ts run <outDir> [--runs 3]
 *     [--demo <file.rec>] [--demo-dir <dir>] [--t 610] [--warmup 10]
 *     [--duration 60] [--hash '#f38'] [--width 1280] [--height 720]
 *     [--mode throughput|stability] [--dpr 1] [--world-shadow-size 2048] [--offline]
 *     [--seek-sequence 610,0,900,23] [--seek-cycles 3] [--mobile]
 *     [--gc-between-seek-cycles] (intrusive retained-heap profiling only)
 *     [--wall-duration 300] [--effects-cycle] [--process-memory] [--gc-trace]
 *     [--profile <out.cpuprofile>] [--screenshot <out.png>] [--json <out.json>]
 *
 * The build serves demos from this script's own server (`/demos`), so no
 * frame time depends on the network; a missing demo is downloaded into
 * `--demo-dir` first. `--hash` is a demo moment camera (see demoMoment.ts):
 * `#f<targetId>` follows a player. `--profile` adds one extra run with the
 * V8 sampling profiler over the measured window, kept out of the timings.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { parseArgs, promisify } from "node:util";
import express from "express";
import puppeteer, { type Browser, type CDPSession, type Page } from "puppeteer";
import { ASSET_BASE_DIR } from "../src/resourcePaths";
import { setBenchmarkEffects } from "./lib/memoryBenchmarkEffects";
import { startBrowserGcTrace } from "./lib/browserGcTrace";
import {
  bootstrapDiagnostics,
  diagnosticsAvailable,
  diagnosticsDownloadComplete,
  type BenchmarkPageGlobals,
} from "./lib/benchmarkDiagnosticsClient";
import {
  BenchmarkTelemetry,
  createBenchmarkTelemetryData,
  summarizeSeekReport,
  type BenchmarkTelemetryData,
  type RetainedHeapUsage,
  type SeekCycleSummary,
} from "./lib/benchmarkTelemetry";

const DEMOS_BUCKET_URL = "https://demos.tribes2.online/demos";
const BASE_PATH = "/t2-mapper/";
const execFileAsync = promisify(execFile);

const { values, positionals } = parseArgs({
  options: {
    runs: { type: "string", default: "3" },
    demo: {
      type: "string",
      default: "the-cut-back-to-ymir_20261025T0248_twl-harvester_7dac27.rec",
    },
    "demo-dir": {
      type: "string",
      default: path.join(os.tmpdir(), "t2-mapper-bench-demos"),
    },
    // Match start is 9:39.5; 10:20-11:20 is open combat before the first cap.
    t: { type: "string", default: "610" },
    warmup: { type: "string", default: "10" },
    duration: { type: "string", default: "60" },
    "wall-duration": { type: "string" },
    "process-memory": { type: "boolean", default: false },
    "effects-cycle": { type: "boolean", default: false },
    "gc-trace": { type: "boolean", default: false },
    // "sake", the busiest player in that window.
    hash: { type: "string", default: "#f38" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "720" },
    mode: { type: "string", default: "throughput" },
    dpr: { type: "string", default: "1" },
    mobile: { type: "boolean", default: false },
    "seek-sequence": { type: "string" },
    "seek-cycles": { type: "string", default: "1" },
    "gc-between-seek-cycles": { type: "boolean", default: false },
    "world-shadow-size": { type: "string" },
    offline: { type: "boolean", default: false },
    profile: { type: "string" },
    screenshot: { type: "string" },
    json: { type: "string" },
    headed: { type: "boolean", default: false },
  },
  allowPositionals: true,
});

const [command, outDirArg] = positionals;
if ((command !== "build" && command !== "run") || !outDirArg) {
  console.error(
    "Usage: npx tsx scripts/benchmark-playback-fps.ts <build|run> <outDir> [options]",
  );
  process.exit(1);
}
const outDir = path.resolve(outDirArg);
const requestedMode = values.mode;
if (requestedMode !== "throughput" && requestedMode !== "stability")
  throw new Error("--mode must be throughput or stability");
const mode: "throughput" | "stability" = requestedMode;
const dpr = Number(values.dpr);
if (!Number.isFinite(dpr) || dpr <= 0)
  throw new Error("--dpr must be a finite positive number");
const worldShadowSize = values["world-shadow-size"];
if (
  worldShadowSize !== undefined &&
  !["1024", "2048", "4096"].includes(worldShadowSize)
)
  throw new Error("--world-shadow-size must be 1024, 2048 or 4096");
for (const key of ["runs", "width", "height", "duration"] as const) {
  const value = Number(values[key]);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`--${key} must be a finite positive number`);
  if (key !== "duration" && !Number.isInteger(value))
    throw new Error(`--${key} must be an integer`);
}
for (const key of ["t", "warmup"] as const) {
  const value = Number(values[key]);
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`--${key} must be a finite nonnegative number`);
}
const seekSequence =
  values["seek-sequence"] === undefined
    ? null
    : values["seek-sequence"].split(",").map((value) => {
        if (
          !value.trim() ||
          !Number.isFinite(Number(value)) ||
          Number(value) < 0
        )
          throw new Error(
            "--seek-sequence must contain finite nonnegative seconds",
          );
        return Number(value);
      });
if (seekSequence && seekSequence.length > 16)
  throw new Error("--seek-sequence must contain at most 16 targets");
const seekCycles = Number(values["seek-cycles"]);
if (!Number.isInteger(seekCycles) || seekCycles < 1 || seekCycles > 32)
  throw new Error("--seek-cycles must be an integer from 1 through 32");
if (!seekSequence && seekCycles !== 1)
  throw new Error("--seek-cycles requires --seek-sequence");
const gcBetweenSeekCycles = values["gc-between-seek-cycles"];
if (gcBetweenSeekCycles && !seekSequence)
  throw new Error("--gc-between-seek-cycles requires --seek-sequence");
const wallDurationSec =
  values["wall-duration"] === undefined
    ? null
    : Number(values["wall-duration"]);
if (
  wallDurationSec !== null &&
  (!Number.isFinite(wallDurationSec) ||
    wallDurationSec <= 0 ||
    wallDurationSec > 43200)
)
  throw new Error(
    "--wall-duration must be positive seconds no greater than 43200",
  );
if (
  values["effects-cycle"] &&
  (wallDurationSec === null || wallDurationSec <= 180)
)
  throw new Error(
    "--effects-cycle requires --wall-duration greater than 180 seconds",
  );
if (values.profile && values["gc-trace"])
  throw new Error("--gc-trace and --profile require separate runs");
const collectDiagnostics =
  mode === "stability" || seekSequence !== null || wallDurationSec !== null;
type BrowserGcTrace = Awaited<ReturnType<typeof startBrowserGcTrace>>;
type BrowserGcTraceSummary = Awaited<ReturnType<BrowserGcTrace["stop"]>>;

async function build(outDir: string) {
  let buildSha = process.env.VITE_BUILD_SHA;
  if (!buildSha) {
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"]);
      let dirty = false;
      try {
        await execFileAsync("git", ["diff", "--quiet", "HEAD", "--"]);
      } catch (error) {
        if ((error as { code?: number }).code !== 1) throw error;
        dirty = true;
      }
      buildSha = `${stdout.trim()}${dirty ? "-dirty" : ""}`;
    } catch {
      buildSha = "unknown";
    }
  }
  const env = {
    ...process.env,
    VITE_BUILD_SHA: buildSha,
    VITE_BUILD_TIME: process.env.VITE_BUILD_TIME ?? new Date().toISOString(),
    BASE_PATH,
    GAME_ASSETS_BASE_URL: `${BASE_PATH}base/`,
    DEMOS_BASE_URL: "/demos",
    CAST_BASE_URL: "/demos",
  };
  const args = [
    "vite",
    "build",
    "--outDir",
    outDir,
    "--emptyOutDir",
    "--sourcemap",
  ];
  console.log(`npx ${args.join(" ")}`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`vite build exited ${code}`)),
    );
  });
}

async function ensureDemo(dir: string, name: string, offline: boolean) {
  await fs.mkdir(dir, { recursive: true });
  for (const file of [name, `${name}.checkpoints.json`]) {
    const target = path.join(dir, file);
    try {
      await fs.access(target);
      continue;
    } catch {
      // Not cached yet.
    }
    if (offline) {
      if (file === name) throw new Error(`Offline demo is missing: ${target}`);
      continue;
    }
    console.log(`Downloading ${file}`);
    const response = await fetch(
      `${DEMOS_BUCKET_URL}/${encodeURIComponent(file)}`,
    );
    if (!response.ok) {
      if (file !== name) continue;
      throw new Error(`${file}: HTTP ${response.status}`);
    }
    await fs.writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
}

async function serve(buildDir: string, demoDir: string) {
  const app = express();
  app.use(`${BASE_PATH}base`, express.static(ASSET_BASE_DIR));
  app.use(BASE_PATH, express.static(buildDir));
  app.use(BASE_PATH, express.static("public"));
  app.use("/demos", express.static(demoDir));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("listening", onListening);
    server.once("error", onError);
  });
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${port}` };
}

interface FrameSample {
  /** rAF timestamp. */
  t: number;
  /** Cumulative rAF callback time (ms) and draw calls at this frame. */
  js: number;
  draws: number;
}

/**
 * Throughput mode times application rAF callbacks and draw calls. Stability
 * leaves those methods untouched and records intervals into a fixed histogram,
 * avoiding allocation for every frame/draw in a memory-pressure experiment.
 */
function instrumentPage(mode: "throughput" | "stability") {
  const bench = {
    mode,
    js: 0,
    draws: 0,
    frames: [] as FrameSample[],
    rawFrameLimit: 100_000,
    rawFramesSeen: 0,
    rawFramesDropped: 0,
    recording: false,
    longTasks: [] as number[],
    longTaskLimit: 2_048,
    longTaskCount: 0,
    longTaskMs: 0,
    longTasksDropped: 0,
    longTasksSupported:
      typeof PerformanceObserver !== "undefined" &&
      PerformanceObserver.supportedEntryTypes?.includes("longtask") === true,
    gpu: null as string | null,
    histogramBinMs: 0.25,
    histogram: new Uint32Array(mode === "stability" ? 40_001 : 0),
    intervalCount: 0,
    intervalSum: 0,
    intervalMax: 0,
    over20ms: 0,
    over33ms: 0,
  };
  (window as unknown as { __bench: typeof bench }).__bench = bench;

  const raf = window.requestAnimationFrame.bind(window);
  if (mode === "throughput") {
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        const start = performance.now();
        try {
          callback(time);
        } finally {
          bench.js += performance.now() - start;
        }
      });
  }
  let previousTime: number | null = null;
  const sample = (time: number) => {
    if (bench.recording) {
      if (mode === "stability") {
        if (previousTime !== null) {
          const interval = time - previousTime;
          bench.intervalCount++;
          bench.intervalSum += interval;
          bench.intervalMax = Math.max(bench.intervalMax, interval);
          if (interval > 20) bench.over20ms++;
          if (interval > 33.4) bench.over33ms++;
          const bin = Math.min(
            bench.histogram.length - 1,
            Math.floor(interval / bench.histogramBinMs),
          );
          bench.histogram[bin]++;
        }
        previousTime = time;
      } else {
        bench.rawFramesSeen++;
        if (bench.frames.length < bench.rawFrameLimit)
          bench.frames.push({ t: time, js: bench.js, draws: bench.draws });
        else bench.rawFramesDropped++;
      }
    } else previousTime = null;
    raf(sample);
  };
  raf(sample);

  if (mode === "throughput") {
    for (const proto of [
      WebGLRenderingContext.prototype,
      WebGL2RenderingContext.prototype,
    ] as unknown as Record<string, (...args: unknown[]) => unknown>[]) {
      for (const name of [
        "drawArrays",
        "drawElements",
        "drawArraysInstanced",
        "drawElementsInstanced",
        "drawRangeElements",
      ]) {
        const original = proto[name];
        if (!original) continue;
        proto[name] = function (this: unknown, ...args: unknown[]) {
          // Inspect the context already drawing the app, without a probe context.
          if (bench.gpu === null) {
            const gl = this as WebGLRenderingContext;
            const info = gl.getExtension("WEBGL_debug_renderer_info");
            bench.gpu = info
              ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL))
              : "unavailable";
          }
          bench.draws++;
          return original.apply(this, args);
        };
      }
    }
  }

  if (bench.longTasksSupported) {
    new PerformanceObserver((list) => {
      if (!bench.recording) return;
      for (const entry of list.getEntries()) {
        bench.longTaskCount++;
        bench.longTaskMs += entry.duration;
        if (bench.longTasks.length < bench.longTaskLimit)
          bench.longTasks.push(entry.duration);
        else bench.longTasksDropped++;
      }
    }).observe({ type: "longtask", buffered: false });
  }
  return bench;
}

type PageBench = ReturnType<typeof instrumentPage>;

/** The demo time the seek bar shows, or null while it isn't mounted. */
function readPlayhead(): number | null {
  const thumb = document.querySelector('[role="slider"][aria-label="Seek"]');
  const value = thumb?.getAttribute("aria-valuenow");
  return value != null ? Number(value) : null;
}

async function waitForPlayhead(
  page: Page,
  atLeast: number,
  timeoutMs: number,
  assertHealthy: () => void,
) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    assertHealthy();
    const playhead = await page.evaluate(readPlayhead);
    if (playhead != null && playhead >= atLeast) return playhead;
    if (Date.now() > deadline)
      throw new Error(
        `Timed out waiting for playhead ${atLeast}s (at ${playhead ?? "?"})`,
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/** The seek bar may display the requested target before reconstruction ends. */
function readSeekState() {
  const thumb = document.querySelector('[role="slider"][aria-label="Seek"]');
  if (
    !thumb ||
    !thumb.getClientRects().length ||
    getComputedStyle(thumb).visibility !== "visible"
  )
    return null;
  const parent = thumb.closest("[data-playback-seek]");
  const now = thumb.getAttribute("aria-valuenow");
  const max = thumb.getAttribute("aria-valuemax");
  const playheadSec = now === null ? NaN : Number(now);
  const durationSec = max === null ? NaN : Number(max);
  if (
    !Number.isFinite(playheadSec) ||
    !Number.isFinite(durationSec) ||
    durationSec <= 0
  )
    return null;
  return {
    playheadSec,
    durationSec,
    busy: parent?.getAttribute("aria-busy") !== "false",
  };
}

async function waitForCompletedSeek(
  page: Page,
  targetSec: number | null,
  timeoutMs: number,
  assertHealthy: () => void,
  requireDownloadComplete = false,
) {
  const deadline = Date.now() + timeoutMs;
  let lastState: ReturnType<typeof readSeekState> = null;
  for (;;) {
    assertHealthy();
    lastState = await page.evaluate(readSeekState);
    if (
      lastState &&
      !lastState.busy &&
      (targetSec === null ||
        Math.abs(lastState.playheadSec - targetSec) <= 0.05)
    ) {
      // Progressive demos expose a growing duration before EOF. Only validate
      // target ranges after the whole download is installed, not that prefix.
      const downloadComplete =
        !requireDownloadComplete || (await diagnosticsDownloadComplete(page));
      if (downloadComplete) return lastState;
    }
    if (Date.now() > deadline)
      throw new Error(
        `Timed out waiting for completed seek${targetSec === null ? "" : ` to ${targetSec}s`} (at ${lastState?.playheadSec ?? "?"}, busy=${lastState?.busy ?? "?"})`,
      );
    await new Promise((resolve) =>
      setTimeout(resolve, requireDownloadComplete ? 500 : 100),
    );
  }
}

// Retain only fixed scalar summaries per cycle. The latest whole report still
// is exported only at completion; polling uses the cheap observation API.
function percentile(sorted: number[], p: number) {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) =>
  percentile(
    [...xs].sort((a, b) => a - b),
    0.5,
  );

interface RunMetrics {
  frames: number;
  fps: number;
  frameMs: { mean: number; p50: number; p95: number; p99: number; max: number };
  over20ms: number;
  over33ms: number;
  /** Deliberately uninstrumented in stability mode to reduce allocation. */
  rafJsMs: { mean: number; p95: number } | null;
  drawsPerFrame: number | null;
  frameRecording: {
    method: "raw" | "histogram";
    rawFramesSeen: number;
    rawFramesRetained: number;
    rawFramesDropped: number;
    rawFrameLimit: number;
    histogramBinMs: number | null;
    histogramOverflowAtMs: number | null;
    histogramOverflowCount: number;
    histogramPercentileBound: "upper" | null;
    histogramOverflowValue: "observed-maximum" | null;
  };
  /** Main-thread time as a share of wall time (CDP Performance metrics). */
  scriptUtil: number;
  taskUtil: number;
  layoutAndStyleMs: number;
  longTasks: {
    count: number;
    totalMs: number;
    retainedSamples: number;
    droppedSamples: number;
  };
  heapMB: number;
  /** Demo seconds advanced per wall second over the window (should be ~1). */
  playbackRate: number;
}

interface RunMetadata extends BenchmarkTelemetryData {
  mode: "throughput" | "stability";
  dpr: number;
  mobile: boolean;
  worldShadowSize: number | null;
  headed: boolean;
  browserVersion: string | null;
  userAgent: string | null;
  gpu: string | null;
  longTasksSupported: boolean | null;
  seekSequence: readonly number[] | null;
  seekCycles: number;
  gcBetweenSeekCycles: boolean;
  effectsCycle: boolean;
  processMemoryEnabled: boolean;
  gcTraceRequested: boolean;
  gcTrace: BrowserGcTraceSummary | null;
  gcTraceError: string | null;
  measurement: {
    durationMode: "wall" | "playhead";
    requestedWallSeconds: number | null;
    requestedPlayheadSeconds: number;
    requestedPlaybackRate: 1;
    actualWallSeconds: number | null;
    demoSecondsAdvanced: number | null;
    completed: boolean;
  };
  effectActions: {
    scheduledSeconds: number;
    actualSeconds: number;
    enabled: boolean;
    completed: boolean;
  }[];
  demoDurationSec: number | null;
  seekCycleSummaries: {
    cycle: number;
    before: SeekCycleSummary;
    after: SeekCycleSummary | null;
    retainedHeap: {
      before: RetainedHeapUsage;
      after: RetainedHeapUsage | null;
    } | null;
    steps: {
      targetSec: number;
      playheadSec: number;
      timeMs: number;
      elapsedMs: number;
    }[];
  }[];
  elapsedMs: number;
}

type RunResult = RunMetadata &
  (
    | (RunMetrics & { status: "passed"; profiled: boolean })
    | { status: "failed"; phase: string; error: string; profiled: boolean }
  );

const THROUGHPUT_FLAGS = [
  "--disable-gpu-vsync",
  "--disable-frame-rate-limit",
  "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding",
  "--disable-backgrounding-occluded-windows",
];

async function launch(width: number, height: number): Promise<Browser> {
  return puppeteer.launch({
    headless: !values.headed,
    defaultViewport: {
      width,
      height,
      deviceScaleFactor: dpr,
      isMobile: values.mobile,
      hasTouch: values.mobile,
    },
    // Puppeteer also supplies background-throttling overrides by default.
    ignoreDefaultArgs: mode === "stability" ? THROUGHPUT_FLAGS : undefined,
    args: [
      `--window-size=${width},${height}`,
      ...(mode === "throughput" ? THROUGHPUT_FLAGS : []),
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
    ],
  });
}

async function measure(
  origin: string,
  options: { profile?: string; screenshot?: string; gcTraceFile?: string },
): Promise<RunResult> {
  const width = Number(values.width);
  const height = Number(values.height);
  const startSec = Number(values.t);
  const warmup = Number(values.warmup);
  const duration = Number(values.duration);
  const startedAt = Date.now();
  const metadata: RunMetadata = {
    mode,
    dpr,
    mobile: values.mobile,
    worldShadowSize:
      worldShadowSize === undefined ? null : Number(worldShadowSize),
    headed: values.headed,
    browserVersion: null,
    userAgent: null,
    gpu: null,
    longTasksSupported: null,
    seekSequence,
    seekCycles,
    gcBetweenSeekCycles,
    effectsCycle: values["effects-cycle"],
    processMemoryEnabled: values["process-memory"],
    gcTraceRequested: values["gc-trace"],
    gcTrace: null,
    gcTraceError: null,
    measurement: {
      durationMode: wallDurationSec === null ? "playhead" : "wall",
      requestedWallSeconds: wallDurationSec,
      requestedPlayheadSeconds: duration,
      requestedPlaybackRate: 1,
      actualWallSeconds: null,
      demoSecondsAdvanced: null,
      completed: false,
    },
    effectActions: [],
    demoDurationSec: null,
    seekCycleSummaries: [],
    elapsedMs: 0,
    ...createBenchmarkTelemetryData(),
  };
  const telemetry = new BenchmarkTelemetry({
    state: metadata,
    startedAt,
    requestedWallSeconds: wallDurationSec,
    collectDiagnostics,
    processMemoryEnabled: values["process-memory"],
    progressFile: values.json
      ? `${path.resolve(values.json)}.progress.json`
      : undefined,
  });
  const assertHealthy = telemetry.assertHealthy;
  let browser: Browser | undefined;
  let page: Page | undefined;
  let cdp: CDPSession | undefined;
  let gcTrace: BrowserGcTrace | undefined;
  let gcTraceEnded = false;
  let result: RunResult | undefined;
  let measurementWallStart: number | undefined;
  let measurementPlayheadStart: number | null = null;
  const profiled = Boolean(options.profile);
  try {
    await telemetry.setPhase("launch");
    browser = await launch(width, height);
    telemetry.watchBrowser(browser);
    [metadata.browserVersion, metadata.userAgent] = await Promise.all([
      browser.version(),
      browser.userAgent(),
    ]);
    page = await browser.newPage();
    if (values.offline) {
      await telemetry.blockExternalRequests(page);
      await page.evaluateOnNewDocument(() => {
        const network = { blockedWebSockets: 0, hostnames: [] as string[] };
        (window as unknown as BenchmarkPageGlobals).__t2BenchmarkNetwork =
          network;
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = class extends NativeWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            const target = new URL(String(url), location.href);
            if (
              !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname)
            ) {
              network.blockedWebSockets++;
              if (
                network.hostnames.length < 16 &&
                !network.hostnames.includes(target.hostname)
              )
                network.hostnames.push(target.hostname.slice(0, 255));
              throw new DOMException(
                "External socket blocked by offline benchmark",
                "SecurityError",
              );
            }
            super(url, protocols);
          }
        };
      });
    }
    telemetry.watchPage(page);
    cdp = await page.createCDPSession();
    await cdp.send("Page.enable");
    // CDP distinguishes new documents from camera hash/history changes.
    telemetry.watchCdp(cdp);
    // tsx emits __name() wrappers into functions passed to the page.
    await page.evaluateOnNewDocument("globalThis.__name = (fn) => fn");
    await bootstrapDiagnostics(page, collectDiagnostics);
    await page.evaluateOnNewDocument(instrumentPage, mode);
    const url = new URL(BASE_PATH, origin);
    url.searchParams.set("mode", "demo");
    url.searchParams.set("demo", values.demo!);
    url.searchParams.set("t", String(startSec));
    if (worldShadowSize !== undefined)
      url.searchParams.set("worldShadowSize", worldShadowSize);
    url.hash = values.hash ?? "";
    await telemetry.setPhase("navigation");
    // Poll independently of loading/seeking so an eventual crash still has
    // a recent, bounded report on the controlling Node process.
    telemetry.startDiagnosticPolling();
    if (collectDiagnostics || values["process-memory"])
      await telemetry.startBrowserSampling();
    if (options.gcTraceFile)
      gcTrace = await startBrowserGcTrace(cdp, options.gcTraceFile);
    await page.goto(url.href, { waitUntil: "load" });
    await telemetry.setPhase("load-and-seek");
    if (collectDiagnostics || values["process-memory"])
      await telemetry.captureBrowserTelemetry();

    // The link seeks once the demo is ready and leaves it paused there.
    if (!seekSequence)
      await waitForPlayhead(page, startSec, 180_000, assertHealthy);
    if (collectDiagnostics && !(await diagnosticsAvailable(page)))
      throw new Error(
        "App diagnostics are unavailable; rebuild with diagnostics support",
      );
    if (wallDurationSec !== null && !seekSequence) {
      const ready = await waitForCompletedSeek(
        page,
        null,
        180_000,
        assertHealthy,
        collectDiagnostics,
      );
      metadata.demoDurationSec = ready.durationSec;
    }
    if (seekSequence) {
      await telemetry.setPhase("seek-scenario", {
        sequence: seekSequence.join(","),
        cycles: seekCycles,
      });
      const ready = await waitForCompletedSeek(
        page,
        null,
        180_000,
        assertHealthy,
        true,
      );
      metadata.demoDurationSec = ready.durationSec;
      for (const target of [startSec, ...seekSequence]) {
        if (target > ready.durationSec)
          throw new Error(
            `Seek target ${target}s exceeds demo duration ${ready.durationSec}s`,
          );
      }
      await waitForCompletedSeek(page, startSec, 180_000, assertHealthy);
      const seek = async (target: number) => {
        assertHealthy();
        await page!.evaluate((target) => {
          const url = new URL(location.href);
          url.searchParams.set("t", String(target));
          history.pushState(null, "", url.href);
          window.dispatchEvent(new PopStateEvent("popstate"));
        }, target);
        return waitForCompletedSeek(page!, target, 180_000, assertHealthy);
      };
      for (let cycle = 1; cycle <= seekCycles; cycle++) {
        const collectRetainedHeap = async (): Promise<RetainedHeapUsage> => {
          assertHealthy();
          await cdp!.send("HeapProfiler.collectGarbage");
          assertHealthy();
          const { usedSize, totalSize } = await cdp!.send(
            "Runtime.getHeapUsage",
          );
          return { usedSize, totalSize };
        };
        let retainedBefore: RetainedHeapUsage | null = null;
        if (gcBetweenSeekCycles) {
          await telemetry.setPhase("seek-cycle-gc-before", { cycle });
          retainedBefore = await collectRetainedHeap();
        }
        await telemetry.setPhase("seek-cycle-start", { cycle });
        const summary: RunMetadata["seekCycleSummaries"][number] = {
          cycle,
          before: summarizeSeekReport(
            metadata.observation,
            metadata.observationCapturedAtMs,
          ),
          after: null,
          retainedHeap: retainedBefore
            ? { before: retainedBefore, after: null }
            : null,
          steps: [],
        };
        metadata.seekCycleSummaries.push(summary);
        for (const [index, targetSec] of seekSequence.entries()) {
          const details = { cycle, step: index + 1, targetSec };
          await telemetry.setPhase("seek-step-start", details);
          const stepStarted = Date.now();
          const completed = await seek(targetSec);
          summary.steps.push({
            targetSec,
            playheadSec: completed.playheadSec,
            timeMs: Date.now() - startedAt,
            elapsedMs: Date.now() - stepStarted,
          });
          await telemetry.setPhase("seek-step-complete", details);
        }
        if (summary.retainedHeap) {
          await telemetry.setPhase("seek-cycle-gc-after", { cycle });
          summary.retainedHeap.after = await collectRetainedHeap();
        }
        await telemetry.setPhase("seek-cycle-complete", { cycle });
        summary.after = summarizeSeekReport(
          metadata.observation,
          metadata.observationCapturedAtMs,
        );
      }
      await telemetry.setPhase("seek-restore-start", { targetSec: startSec });
      await seek(startSec);
      await telemetry.setPhase("seek-restore-complete", {
        targetSec: startSec,
      });
    }
    if (
      wallDurationSec !== null &&
      metadata.demoDurationSec !== null &&
      startSec + warmup + wallDurationSec > metadata.demoDurationSec
    )
      throw new Error(
        "Demo duration is too short for the requested wall-clock playback window",
      );
    const capabilities = await page.evaluate(() => {
      const bench = (
        window as unknown as {
          __bench: { gpu: string | null; longTasksSupported: boolean };
        }
      ).__bench;
      return { gpu: bench.gpu, longTasksSupported: bench.longTasksSupported };
    });
    Object.assign(metadata, capabilities);
    console.log(`  GPU: ${metadata.gpu ?? "?"}`);
    const play = await page.waitForSelector(
      'button[aria-label="Play"], button[aria-label="Play after seeking"]',
    );
    await telemetry.setPhase("warmup");
    await play!.click();
    const measureFrom = startSec + warmup;
    await waitForPlayhead(
      page,
      measureFrom,
      (warmup + 60) * 1000,
      assertHealthy,
    );

    if (options.profile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
      await cdp.send("Profiler.start");
    }
    await telemetry.setPhase("measurement");
    const metricsBefore = await page.metrics();
    const playheadBefore = await page.evaluate(readPlayhead);
    if (wallDurationSec !== null) {
      const rate = await page.evaluate(() =>
        Number.parseFloat(
          (document.getElementById("playbackSpeed") as HTMLSelectElement | null)
            ?.value ||
            document.getElementById("playbackSpeed")?.textContent ||
            "",
        ),
      );
      if (rate !== 1)
        throw new Error(`Wall-clock playback requires 1x speed (got ${rate})`);
    }
    await gcTrace?.markMeasurementStart();
    const wallBefore = Date.now();
    measurementWallStart = wallBefore;
    telemetry.markMeasurementStart(wallBefore);
    measurementPlayheadStart = playheadBefore;
    await page.evaluate(() => {
      (
        window as unknown as { __bench: { recording: boolean } }
      ).__bench.recording = true;
    });
    if (options.screenshot) await page.screenshot({ path: options.screenshot });

    if (wallDurationSec === null)
      await waitForPlayhead(
        page,
        measureFrom + duration,
        duration * 3_000,
        assertHealthy,
      );
    else {
      const actions = values["effects-cycle"]
        ? [
            { at: 10, enabled: true },
            { at: 60, enabled: false },
            { at: 120, enabled: true },
            { at: 180, enabled: false },
          ]
        : [];
      let actionIndex = 0;
      let lastProgressAt = Date.now();
      let lastPlayhead = playheadBefore;
      for (;;) {
        assertHealthy();
        const elapsed = (Date.now() - wallBefore) / 1000;
        const action = actions[actionIndex];
        if (action && elapsed >= action.at) {
          const result = {
            scheduledSeconds: action.at,
            actualSeconds: elapsed,
            enabled: action.enabled,
            completed: false,
          };
          metadata.effectActions.push(result);
          await telemetry.setPhase(
            action.enabled ? "effects-enable" : "effects-disable",
            { scheduledSeconds: action.at, actualSeconds: elapsed },
          );
          await setBenchmarkEffects(page, action.enabled);
          result.completed = true;
          actionIndex++;
          await telemetry.setPhase("measurement", {
            effectsEnabled: action.enabled,
          });
        }
        if (Date.now() - wallBefore >= wallDurationSec * 1000) break;
        const state = await page.evaluate(() => ({
          playhead: Number(
            document
              .querySelector('[role="slider"][aria-label="Seek"]')
              ?.getAttribute("aria-valuenow"),
          ),
          playing:
            document.querySelector(
              'button[aria-label="Pause"],button[aria-label="Pause after seeking"]',
            ) !== null,
        }));
        if (!state.playing)
          throw new Error(
            "Playback stopped before the requested wall-clock duration completed",
          );
        if (
          Number.isFinite(state.playhead) &&
          state.playhead !== lastPlayhead
        ) {
          lastProgressAt = Date.now();
          lastPlayhead = state.playhead;
        }
        if (Date.now() - lastProgressAt > 30_000)
          throw new Error("Playback made no progress for 30 seconds");
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.min(
              250,
              Math.max(1, wallDurationSec * 1000 - (Date.now() - wallBefore)),
            ),
          ),
        );
      }
    }

    await gcTrace?.markMeasurementEnd();
    gcTraceEnded = true;
    await page.evaluate(() => {
      (
        window as unknown as { __bench: { recording: boolean } }
      ).__bench.recording = false;
    });
    const wallMs = Date.now() - wallBefore;
    const playheadAfter = await page.evaluate(readPlayhead);
    metadata.measurement.actualWallSeconds = wallMs / 1000;
    metadata.measurement.demoSecondsAdvanced =
      playheadAfter !== null && playheadBefore !== null
        ? playheadAfter - playheadBefore
        : null;
    metadata.measurement.completed = true;
    const metricsAfter = await page.metrics();
    if (options.profile) {
      const { profile } = await cdp.send("Profiler.stop");
      await fs.writeFile(options.profile, JSON.stringify(profile));
      console.log(`  CPU profile: ${options.profile}`);
    }

    const bench = await page.evaluate(() => {
      const bench = (window as unknown as { __bench: PageBench }).__bench;
      const histogramPercentile = (p: number) => {
        const rank = Math.floor(p * bench.intervalCount);
        let cumulative = 0;
        for (let i = 0; i < bench.histogram.length; i++) {
          cumulative += bench.histogram[i];
          if (cumulative > rank)
            return i === bench.histogram.length - 1
              ? bench.intervalMax
              : Math.min(bench.intervalMax, (i + 1) * bench.histogramBinMs);
        }
        return 0;
      };
      return {
        frames: bench.frames,
        summary:
          bench.mode === "stability"
            ? {
                frames: bench.intervalCount,
                fps: (1000 * bench.intervalCount) / bench.intervalSum,
                frameMs: {
                  mean: bench.intervalSum / bench.intervalCount,
                  p50: histogramPercentile(0.5),
                  p95: histogramPercentile(0.95),
                  p99: histogramPercentile(0.99),
                  max: bench.intervalMax,
                },
                over20ms: bench.over20ms,
                over33ms: bench.over33ms,
                rafJsMs: null,
                drawsPerFrame: null,
              }
            : null,
        frameRecording: {
          method:
            bench.mode === "stability"
              ? ("histogram" as const)
              : ("raw" as const),
          rawFramesSeen: bench.rawFramesSeen,
          rawFramesRetained: bench.frames.length,
          rawFramesDropped: bench.rawFramesDropped,
          rawFrameLimit: bench.rawFrameLimit,
          histogramBinMs:
            bench.mode === "stability" ? bench.histogramBinMs : null,
          histogramOverflowAtMs:
            bench.mode === "stability"
              ? (bench.histogram.length - 1) * bench.histogramBinMs
              : null,
          histogramOverflowCount:
            bench.histogram[bench.histogram.length - 1] ?? 0,
          histogramPercentileBound:
            bench.mode === "stability" ? ("upper" as const) : null,
          histogramOverflowValue:
            bench.mode === "stability" ? ("observed-maximum" as const) : null,
        },
        longTasks: {
          count: bench.longTaskCount,
          totalMs: bench.longTaskMs,
          retainedSamples: bench.longTasks.length,
          droppedSamples: bench.longTasksDropped,
        },
      };
    });
    const frames = bench.frames;
    const intervals: number[] = [];
    const js: number[] = [];
    const draws: number[] = [];
    for (let i = 1; i < frames.length; i++) {
      intervals.push(frames[i].t - frames[i - 1].t);
      js.push(frames[i].js - frames[i - 1].js);
      draws.push(frames[i].draws - frames[i - 1].draws);
    }
    if (!(bench.summary?.frames ?? intervals.length))
      throw new Error("No frame intervals were recorded");
    const sorted = [...intervals].sort((a, b) => a - b);
    const sortedJs = [...js].sort((a, b) => a - b);
    const delta = (key: keyof typeof metricsAfter) =>
      (metricsAfter[key] ?? 0) - (metricsBefore[key] ?? 0);
    const wallSec = wallMs / 1000;
    await telemetry.setPhase("complete");
    await telemetry.captureFreshDiagnostics(true);
    if (collectDiagnostics || values["process-memory"])
      await telemetry.captureBrowserTelemetry();
    metadata.elapsedMs = Date.now() - startedAt;
    return (result = {
      ...metadata,
      status: "passed",
      profiled,
      ...(bench.summary ?? {
        frames: intervals.length,
        fps: 1000 / mean(intervals),
        frameMs: {
          mean: mean(intervals),
          p50: percentile(sorted, 0.5),
          p95: percentile(sorted, 0.95),
          p99: percentile(sorted, 0.99),
          max: sorted[sorted.length - 1],
        },
        over20ms: intervals.filter((ms) => ms > 20).length,
        over33ms: intervals.filter((ms) => ms > 33.4).length,
        rafJsMs: { mean: mean(js), p95: percentile(sortedJs, 0.95) },
        drawsPerFrame: mean(draws),
      }),
      frameRecording: bench.frameRecording,
      scriptUtil: delta("ScriptDuration") / wallSec,
      taskUtil: delta("TaskDuration") / wallSec,
      layoutAndStyleMs:
        ((delta("LayoutDuration") + delta("RecalcStyleDuration")) * 1000) /
        wallSec,
      longTasks: bench.longTasks,
      heapMB: (metricsAfter.JSHeapUsedSize ?? 0) / 1048576,
      playbackRate:
        ((playheadAfter ?? NaN) - (playheadBefore ?? NaN)) / wallSec,
    });
  } catch (error) {
    if (measurementWallStart !== undefined)
      metadata.measurement.actualWallSeconds =
        (Date.now() - measurementWallStart) / 1000;
    const lastPlayhead =
      metadata.resourceSamples.at(-1)?.values["playback.playheadSec"];
    if (
      !metadata.measurement.completed &&
      typeof lastPlayhead === "number" &&
      measurementPlayheadStart !== null
    )
      metadata.measurement.demoSecondsAdvanced =
        lastPlayhead - measurementPlayheadStart;
    await telemetry.captureFreshDiagnostics(true);
    await telemetry.writeProgress().catch(() => {});
    metadata.elapsedMs = Date.now() - startedAt;
    return (result = {
      ...metadata,
      status: "failed",
      phase: telemetry.phase,
      error:
        telemetry.failure ??
        (error instanceof Error ? error.message : String(error)),
      profiled,
    });
  } finally {
    telemetry.stop();
    if (gcTrace) {
      try {
        if (measurementWallStart !== undefined && !gcTraceEnded)
          await gcTrace.markMeasurementEnd();
        metadata.gcTrace = await gcTrace.stop();
        if (result) result.gcTrace = metadata.gcTrace;
      } catch (error) {
        metadata.gcTraceError = String(error).slice(0, 500);
        if (result) result.gcTraceError = metadata.gcTraceError;
      }
    }
    await cdp?.detach().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

function formatRun(r: RunMetrics) {
  return [
    `fps ${r.fps.toFixed(1)}`,
    `frame ${r.frameMs.mean.toFixed(2)} ms (p50 ${r.frameMs.p50.toFixed(2)}, p95 ${r.frameMs.p95.toFixed(2)}, p99 ${r.frameMs.p99.toFixed(2)}, max ${r.frameMs.max.toFixed(0)})`,
    `>20ms ${r.over20ms}, >33ms ${r.over33ms}`,
    r.rafJsMs
      ? `rAF JS ${r.rafJsMs.mean.toFixed(2)} ms (p95 ${r.rafJsMs.p95.toFixed(2)})`
      : "rAF JS not instrumented in stability mode",
    `script ${(r.scriptUtil * 100).toFixed(1)}%, tasks ${(r.taskUtil * 100).toFixed(1)}%, layout+style ${r.layoutAndStyleMs.toFixed(1)} ms/s`,
    `long tasks ${r.longTasks.count} (${r.longTasks.totalMs.toFixed(0)} ms)`,
    r.drawsPerFrame === null
      ? "draw calls not instrumented in stability mode"
      : `draws/frame ${r.drawsPerFrame.toFixed(0)}`,
    `heap ${r.heapMB.toFixed(0)} MB`,
    `rate ${r.playbackRate.toFixed(2)}x`,
  ].join("\n    ");
}

async function run(buildDir: string) {
  const demoDir = path.resolve(values["demo-dir"]!);
  await ensureDemo(demoDir, values.demo!, values.offline);
  const { server, origin } = await serve(buildDir, demoDir);
  console.log(`Serving ${buildDir} at ${origin}${BASE_PATH}`);
  console.log(`Mode: ${mode}; DPR: ${dpr}; each run starts a fresh browser`);
  if (gcBetweenSeekCycles)
    console.log(
      "Retained-heap profiling: forced GC changes allocation and frame pacing; compare only matching profiling runs.",
    );
  const results: RunResult[] = [];
  const traceBase = values.json
    ? path.resolve(values.json)
    : path.join(os.tmpdir(), `t2-memory-gc-${Date.now()}`);
  try {
    const runs = Number(values.runs);
    for (let i = 0; i < runs; i++) {
      console.log(`Run ${i + 1}/${runs}`);
      const result = await measure(origin, {
        screenshot: i === 0 ? values.screenshot : undefined,
        gcTraceFile: values["gc-trace"]
          ? `${traceBase}.run-${i + 1}.gc.jsonl`
          : undefined,
      });
      results.push(result);
      if (result.status === "passed") {
        console.log(`    ${formatRun(result)}`);
      } else {
        console.warn(`    FAILED during ${result.phase}: ${result.error}`);
        process.exitCode = 1;
      }
    }
    if (values.profile) {
      console.log("Profile run");
      const result = await measure(origin, {
        profile: path.resolve(values.profile),
      });
      results.push(result);
      if (result.status === "failed") {
        console.warn(`    FAILED during ${result.phase}: ${result.error}`);
        process.exitCode = 1;
      }
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  const passed = results.filter(
    (r): r is Extract<RunResult, { status: "passed" }> =>
      r.status === "passed" && !r.profiled,
  );
  if (passed.length > 1) {
    const pick = (f: (r: RunMetrics) => number) => median(passed.map(f));
    console.log(
      `Median of ${passed.length} successful timing runs: fps ${pick((r) => r.fps).toFixed(1)}, ` +
        `frame ${pick((r) => r.frameMs.mean).toFixed(2)} ms, ` +
        `p95 ${pick((r) => r.frameMs.p95).toFixed(2)} ms, ` +
        (mode === "throughput"
          ? `rAF JS ${pick((r) => r.rafJsMs!.mean).toFixed(2)} ms, `
          : "") +
        `script ${(pick((r) => r.scriptUtil) * 100).toFixed(1)}%`,
    );
  }
  if (values.json) {
    await fs.writeFile(
      values.json,
      JSON.stringify(
        {
          schemaVersion: 2,
          recordedAt: new Date().toISOString(),
          buildDir,
          mode,
          modeDescription:
            mode === "stability"
              ? "Normal frame pacing and background throttling; whole-session diagnostics; no app rAF/draw wrapping"
              : "Uncapped rendering throughput; vsync and background throttling disabled",
          dpr,
          mobile: values.mobile,
          seekSequence,
          seekCycles,
          gcBetweenSeekCycles,
          wallDurationSec,
          effectsCycle: values["effects-cycle"],
          processMemoryEnabled: values["process-memory"],
          gcTraceRequested: values["gc-trace"],
          worldShadowSize:
            worldShadowSize === undefined ? null : Number(worldShadowSize),
          browserCache: "fresh-browser-per-run",
          offline: values.offline,
          headed: values.headed,
          demo: values.demo,
          t: Number(values.t),
          warmup: Number(values.warmup),
          duration: Number(values.duration),
          hash: values.hash,
          viewport: [Number(values.width), Number(values.height)],
          passedTimingRuns: passed.length,
          failedRuns: results.filter((r) => r.status === "failed").length,
          results,
        },
        null,
        2,
      ),
    );
  }
}

if (command === "build") {
  await build(outDir);
} else {
  await run(outDir);
}
