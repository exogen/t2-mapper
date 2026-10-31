/**
 * Demo playback frame-rate benchmark, for A/B comparisons of rendering
 * changes: the same stretch of the same demo, followed by the same
 * camera, in a production build with vsync off.
 *
 * Build the tree you are measuring (run from its root), then run:
 *
 *   npx tsx scripts/benchmark-playback-fps.ts build <outDir>
 *   npx tsx scripts/benchmark-playback-fps.ts run <outDir> [--runs 3]
 *     [--demo <file.rec>] [--demo-dir <dir>] [--t 610] [--warmup 10]
 *     [--duration 60] [--hash '#f38'] [--width 1280] [--height 720]
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
import { spawn } from "node:child_process";
import type { AddressInfo } from "node:net";
import { parseArgs } from "node:util";
import express from "express";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { ASSET_BASE_DIR } from "../src/resourcePaths";

const DEMOS_BUCKET_URL = "https://demos.tribes2.online/demos";
const BASE_PATH = "/t2-mapper/";

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
    // "sake", the busiest player in that window.
    hash: { type: "string", default: "#f38" },
    width: { type: "string", default: "1280" },
    height: { type: "string", default: "720" },
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

async function build(outDir: string) {
  const env = {
    ...process.env,
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

async function ensureDemo(dir: string, name: string) {
  await fs.mkdir(dir, { recursive: true });
  for (const file of [name, `${name}.checkpoints.json`]) {
    const target = path.join(dir, file);
    try {
      await fs.access(target);
      continue;
    } catch {
      // Not cached yet.
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
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { server, origin: `http://localhost:${port}` };
}

interface FrameSample {
  /** rAF timestamp. */
  t: number;
  /** Cumulative rAF callback time (ms) and draw calls at this frame. */
  js: number;
  draws: number;
}

/**
 * Installed before any app script: times every rAF callback (the engine's
 * loop included) and counts WebGL draw calls, so per-frame JS and draw counts
 * fall out of cumulative counters sampled once per frame.
 */
function instrumentPage() {
  const bench = {
    js: 0,
    draws: 0,
    frames: [] as FrameSample[],
    recording: false,
    longTasks: [] as number[],
  };
  (window as unknown as { __bench: typeof bench }).__bench = bench;

  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    raf((time) => {
      const start = performance.now();
      try {
        callback(time);
      } finally {
        bench.js += performance.now() - start;
      }
    });
  const sample = (time: number) => {
    if (bench.recording)
      bench.frames.push({ t: time, js: bench.js, draws: bench.draws });
    raf(sample);
  };
  raf(sample);

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
        bench.draws++;
        return original.apply(this, args);
      };
    }
  }

  new PerformanceObserver((list) => {
    if (!bench.recording) return;
    for (const entry of list.getEntries()) bench.longTasks.push(entry.duration);
  }).observe({ type: "longtask", buffered: false });
}

/** The demo time the seek bar shows, or null while it isn't mounted. */
function readPlayhead(): number | null {
  const thumb = document.querySelector('[role="slider"][aria-label="Seek"]');
  const value = thumb?.getAttribute("aria-valuenow");
  return value != null ? Number(value) : null;
}

async function waitForPlayhead(page: Page, atLeast: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const playhead = await page.evaluate(readPlayhead);
    if (playhead != null && playhead >= atLeast) return playhead;
    if (Date.now() > deadline)
      throw new Error(
        `Timed out waiting for playhead ${atLeast}s (at ${playhead ?? "?"})`,
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

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

interface RunResult {
  frames: number;
  fps: number;
  frameMs: { mean: number; p50: number; p95: number; p99: number; max: number };
  over20ms: number;
  over33ms: number;
  rafJsMs: { mean: number; p95: number };
  drawsPerFrame: number;
  /** Main-thread time as a share of wall time (CDP Performance metrics). */
  scriptUtil: number;
  taskUtil: number;
  layoutAndStyleMs: number;
  longTasks: { count: number; totalMs: number };
  heapMB: number;
  /** Demo seconds advanced per wall second over the window (should be ~1). */
  playbackRate: number;
}

async function launch(width: number, height: number): Promise<Browser> {
  return puppeteer.launch({
    headless: !values.headed,
    defaultViewport: { width, height, deviceScaleFactor: 1 },
    args: [
      `--window-size=${width},${height}`,
      "--disable-gpu-vsync",
      "--disable-frame-rate-limit",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
    ],
  });
}

async function measure(
  origin: string,
  options: { profile?: string; screenshot?: string },
): Promise<RunResult | null> {
  const width = Number(values.width);
  const height = Number(values.height);
  const startSec = Number(values.t);
  const warmup = Number(values.warmup);
  const duration = Number(values.duration);
  const browser = await launch(width, height);
  try {
    const page = await browser.newPage();
    page.on("pageerror", (err) =>
      console.warn(`  pageerror: ${(err as Error).message}`),
    );
    // tsx emits __name() wrappers into functions passed to the page.
    await page.evaluateOnNewDocument("globalThis.__name = (fn) => fn");
    await page.evaluateOnNewDocument(instrumentPage);
    const url = `${origin}${BASE_PATH}?mode=demo&demo=${encodeURIComponent(values.demo!)}&t=${startSec}${values.hash ?? ""}`;
    await page.goto(url, { waitUntil: "load" });
    const gpu = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) : "?";
    });
    console.log(`  GPU: ${gpu}`);

    // The link seeks once the demo is ready and leaves it paused there.
    await waitForPlayhead(page, startSec, 180_000);
    const play = await page.waitForSelector(
      'button[aria-label="Play"], button[aria-label="Play after seeking"]',
    );
    await play!.click();
    const measureFrom = startSec + warmup;
    await waitForPlayhead(page, measureFrom, (warmup + 60) * 1000);

    const cdp = await page.createCDPSession();
    if (options.profile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
      await cdp.send("Profiler.start");
    }
    const metricsBefore = await page.metrics();
    const playheadBefore = await page.evaluate(readPlayhead);
    const wallBefore = Date.now();
    await page.evaluate(() => {
      (
        window as unknown as { __bench: { recording: boolean } }
      ).__bench.recording = true;
    });
    if (options.screenshot) await page.screenshot({ path: options.screenshot });

    await waitForPlayhead(page, measureFrom + duration, duration * 3_000);

    await page.evaluate(() => {
      (
        window as unknown as { __bench: { recording: boolean } }
      ).__bench.recording = false;
    });
    const wallMs = Date.now() - wallBefore;
    const playheadAfter = await page.evaluate(readPlayhead);
    const metricsAfter = await page.metrics();
    if (options.profile) {
      const { profile } = await cdp.send("Profiler.stop");
      await fs.writeFile(options.profile, JSON.stringify(profile));
      console.log(`  CPU profile: ${options.profile}`);
      return null;
    }

    const bench = await page.evaluate(
      () =>
        (
          window as unknown as {
            __bench: { frames: FrameSample[]; longTasks: number[] };
          }
        ).__bench,
    );
    const frames = bench.frames;
    const intervals: number[] = [];
    const js: number[] = [];
    const draws: number[] = [];
    for (let i = 1; i < frames.length; i++) {
      intervals.push(frames[i].t - frames[i - 1].t);
      js.push(frames[i].js - frames[i - 1].js);
      draws.push(frames[i].draws - frames[i - 1].draws);
    }
    const sorted = [...intervals].sort((a, b) => a - b);
    const sortedJs = [...js].sort((a, b) => a - b);
    const delta = (key: keyof typeof metricsAfter) =>
      (metricsAfter[key] ?? 0) - (metricsBefore[key] ?? 0);
    const wallSec = wallMs / 1000;
    return {
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
      scriptUtil: delta("ScriptDuration") / wallSec,
      taskUtil: delta("TaskDuration") / wallSec,
      layoutAndStyleMs:
        ((delta("LayoutDuration") + delta("RecalcStyleDuration")) * 1000) /
        wallSec,
      longTasks: {
        count: bench.longTasks.length,
        totalMs: bench.longTasks.reduce((a, b) => a + b, 0),
      },
      heapMB: (metricsAfter.JSHeapUsedSize ?? 0) / 1048576,
      playbackRate:
        ((playheadAfter ?? NaN) - (playheadBefore ?? NaN)) / wallSec,
    };
  } finally {
    await browser.close();
  }
}

function formatRun(r: RunResult) {
  return [
    `fps ${r.fps.toFixed(1)}`,
    `frame ${r.frameMs.mean.toFixed(2)} ms (p50 ${r.frameMs.p50.toFixed(2)}, p95 ${r.frameMs.p95.toFixed(2)}, p99 ${r.frameMs.p99.toFixed(2)}, max ${r.frameMs.max.toFixed(0)})`,
    `>20ms ${r.over20ms}, >33ms ${r.over33ms}`,
    `rAF JS ${r.rafJsMs.mean.toFixed(2)} ms (p95 ${r.rafJsMs.p95.toFixed(2)})`,
    `script ${(r.scriptUtil * 100).toFixed(1)}%, tasks ${(r.taskUtil * 100).toFixed(1)}%, layout+style ${r.layoutAndStyleMs.toFixed(1)} ms/s`,
    `long tasks ${r.longTasks.count} (${r.longTasks.totalMs.toFixed(0)} ms)`,
    `draws/frame ${r.drawsPerFrame.toFixed(0)}`,
    `heap ${r.heapMB.toFixed(0)} MB`,
    `rate ${r.playbackRate.toFixed(2)}x`,
  ].join("\n    ");
}

async function run(buildDir: string) {
  const demoDir = path.resolve(values["demo-dir"]!);
  await ensureDemo(demoDir, values.demo!);
  const { server, origin } = await serve(buildDir, demoDir);
  console.log(`Serving ${buildDir} at ${origin}${BASE_PATH}`);
  const results: RunResult[] = [];
  try {
    const runs = Number(values.runs);
    for (let i = 0; i < runs; i++) {
      console.log(`Run ${i + 1}/${runs}`);
      const result = await measure(origin, {
        screenshot: i === 0 ? values.screenshot : undefined,
      });
      if (result) {
        results.push(result);
        console.log(`    ${formatRun(result)}`);
      }
    }
    if (values.profile) {
      console.log("Profile run");
      await measure(origin, { profile: path.resolve(values.profile) });
    }
  } finally {
    server.close();
  }
  if (results.length > 1) {
    const pick = (f: (r: RunResult) => number) => median(results.map(f));
    console.log(
      `Median of ${results.length}: fps ${pick((r) => r.fps).toFixed(1)}, ` +
        `frame ${pick((r) => r.frameMs.mean).toFixed(2)} ms, ` +
        `p95 ${pick((r) => r.frameMs.p95).toFixed(2)} ms, ` +
        `rAF JS ${pick((r) => r.rafJsMs.mean).toFixed(2)} ms, ` +
        `script ${(pick((r) => r.scriptUtil) * 100).toFixed(1)}%`,
    );
  }
  if (values.json) {
    await fs.writeFile(
      values.json,
      JSON.stringify(
        {
          buildDir,
          demo: values.demo,
          t: Number(values.t),
          warmup: Number(values.warmup),
          duration: Number(values.duration),
          hash: values.hash,
          viewport: [Number(values.width), Number(values.height)],
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
