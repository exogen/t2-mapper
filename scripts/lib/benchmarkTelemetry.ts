import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Browser, CDPSession, HTTPRequest, Page } from "puppeteer";
import type {
  DiagnosticDetails,
  DiagnosticsObservation,
  DiagnosticsReading,
  DiagnosticsReport,
} from "../../src/diagnostics/protocol";
import {
  captureDiagnostics,
  markDiagnosticsPhase,
} from "./benchmarkDiagnosticsClient";

const execFileAsync = promisify(execFile);

const PERFORMANCE_GAUGES = [
  "JSHeapUsedSize",
  "JSHeapTotalSize",
  "ScriptDuration",
  "TaskDuration",
  "LayoutDuration",
] as const;
export interface ProcessMemory {
  /** Summed RSS counts shared pages in each process; not unique physical RAM. */
  aggregateRssBytes: number;
  processCount: number;
  roles: Record<
    "browser" | "renderer" | "gpu" | "other",
    { rssBytes: number; processes: number }
  >;
}

export async function browserProcessMemory(
  browserPid: number | undefined,
): Promise<ProcessMemory | null> {
  if (!browserPid || !["darwin", "linux"].includes(process.platform))
    return null;
  // All command lines stay transient in this function. Only numeric totals for
  // this browser and its descendants leave it; other processes are never logged.
  const { stdout } = await execFileAsync(
    "ps",
    ["-axo", "pid=,ppid=,rss=,args="],
    { timeout: 5000, maxBuffer: 8 * 1024 * 1024 },
  );
  return processMemoryFromPs(stdout, browserPid);
}

/** Only descendant numeric totals leave the transient process inventory. */
export function processMemoryFromPs(
  stdout: string,
  browserPid: number,
): ProcessMemory {
  const rows = stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return match
      ? [
          {
            pid: Number(match[1]),
            parent: Number(match[2]),
            rss: Number(match[3]) * 1024,
            command: match[4],
          },
        ]
      : [];
  });
  const pids = new Set([browserPid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows)
      if (!pids.has(row.pid) && pids.has(row.parent)) {
        pids.add(row.pid);
        changed = true;
      }
  }
  const roles: ProcessMemory["roles"] = {
    browser: { rssBytes: 0, processes: 0 },
    renderer: { rssBytes: 0, processes: 0 },
    gpu: { rssBytes: 0, processes: 0 },
    other: { rssBytes: 0, processes: 0 },
  };
  let aggregateRssBytes = 0,
    processCount = 0;
  for (const row of rows) {
    if (!pids.has(row.pid)) continue;
    const role =
      row.pid === browserPid
        ? "browser"
        : /--type=renderer(?:\s|$)/.test(row.command)
          ? "renderer"
          : /--type=gpu-process(?:\s|$)/.test(row.command)
            ? "gpu"
            : "other";
    roles[role].rssBytes += row.rss;
    roles[role].processes++;
    aggregateRssBytes += row.rss;
    processCount++;
  }
  return { aggregateRssBytes, processCount, roles };
}

/** Pin startup rows and rotate the rest, bounding host-side experiment data. */
function retainObservation<T>(
  rows: T[],
  value: T,
  limit: number,
  startup = 16,
): boolean {
  const dropped = rows.length >= limit;
  if (dropped) rows.splice(startup, 1);
  rows.push(value);
  return dropped;
}

const SEEK_SUMMARY_GAUGES = [
  "browser.jsHeapUsedBytes",
  "bitmapTextureCache.estimatedDecodedImageBytes",
  "imageTextureCache.estimatedDecodedImageBytes",
  "renderer.geometries",
  "renderer.textures",
  "renderer.programs",
  "dtsInstances.pages",
  "dtsInstances.activePages",
  "dtsInstances.idlePages",
  "dtsInstances.capacity",
  "dtsInstances.attributeArrayBytes",
  "dtsInstances.boneArrayBytes",
  "dtsInstances.morphArrayBytes",
  "dtsInstances.skinArrayEstimatedBytes",
  "dtsInstances.skinLayers",
  "dtsInstances.ownedCpuArrayBytes",
  "dtsInstances.pagesCreated",
  "dtsInstances.pagesDisposed",
  "streamParticleEffects.ownedParticleSlots",
  "streamParticleEffects.liveParticles",
  "streamParticleEffects.freeParticleSlots",
  "streamParticleEffects.ownedGeometryArrayBytes",
  "playback.sessionCheckpointEntries",
  "playback.persistedCheckpointEntries",
  "playback.uniqueCheckpointEntries",
  "playback.encodedCheckpointEntries",
  "playback.checkpointEvictions",
  "playback.playheadSec",
  "playback.rate",
] as const;

export interface SeekCycleSummary {
  capturedAtMs: number | null;
  sampleTimeMs: number | null;
  frameCount: number | null;
  intervalCount: number | null;
  values: Record<string, number | null>;
}

/** CDP's post-collection JavaScript heap, not process or GPU memory. */
export interface RetainedHeapUsage {
  usedSize: number;
  totalSize: number;
}

export function summarizeSeekReport(
  report: DiagnosticsReading | null,
  capturedAtMs: number | null,
  allGauges = false,
): SeekCycleSummary {
  const latest =
    report &&
    ("latestSample" in report ? report.latestSample : report.samples.at(-1));
  const numeric = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const values: Record<string, number | null> = {};
  for (const key of allGauges
    ? Object.keys(latest?.values ?? {}).slice(0, 256)
    : SEEK_SUMMARY_GAUGES)
    values[key] = numeric(latest?.values[key]);
  return {
    capturedAtMs,
    sampleTimeMs: numeric(latest?.timeMs),
    frameCount: numeric(report?.frames.count),
    intervalCount: numeric(report?.frames.intervalCount),
    values,
  };
}

export interface BenchmarkTelemetryData {
  resourceSamples: (SeekCycleSummary & { phase: string })[];
  resourceSamplesDropped: number;
  browserTelemetry: {
    intervalSeconds: 10;
    dropped: number;
    errors: number;
    samples: {
      timeMs: number;
      phase: string;
      performance: Record<string, number | null>;
      dom: {
        documents: number;
        nodes: number;
        jsEventListeners: number;
      } | null;
      processMemory: ProcessMemory | null;
    }[];
  };
  pageErrors: { count: number; dropped: number; messages: string[] };
  externalNetwork: {
    blockedRequests: number;
    blockedWebSockets: number;
    hostnames: string[];
  };
  diagnostics: DiagnosticsReport | null;
  diagnosticsCapturedAtMs: number | null;
  observation: DiagnosticsObservation | null;
  observationCapturedAtMs: number | null;
  fullHistoryPolling: false;
  fullSnapshotCaptures: number;
  phases: {
    timeMs: number;
    name: string;
    details?: DiagnosticDetails;
  }[];
}

/** This object is embedded in the unchanged run result. The collector is its
 * sole instrumentation writer; scenario metrics remain with the runner. */
export function createBenchmarkTelemetryData(): BenchmarkTelemetryData {
  return {
    resourceSamples: [],
    resourceSamplesDropped: 0,
    browserTelemetry: {
      intervalSeconds: 10,
      dropped: 0,
      errors: 0,
      samples: [],
    },
    pageErrors: { count: 0, dropped: 0, messages: [] },
    externalNetwork: {
      blockedRequests: 0,
      blockedWebSockets: 0,
      hostnames: [],
    },
    diagnostics: null,
    diagnosticsCapturedAtMs: null,
    observation: null,
    observationCapturedAtMs: null,
    fullHistoryPolling: false,
    fullSnapshotCaptures: 0,
    phases: [],
  };
}

export interface BenchmarkProgress {
  phase: string;
  elapsedMs: number;
  measurementElapsedSeconds: number | null;
  requestedWallSeconds: number | null;
  failure: string | null;
  resource: BenchmarkTelemetryData["resourceSamples"][number] | null;
  browser: BenchmarkTelemetryData["browserTelemetry"]["samples"][number] | null;
  pageErrors: number;
  externalNetwork: BenchmarkTelemetryData["externalNetwork"];
  observation: DiagnosticsObservation | null;
}

interface TelemetryOptions {
  state: BenchmarkTelemetryData;
  startedAt: number;
  requestedWallSeconds: number | null;
  collectDiagnostics: boolean;
  processMemoryEnabled: boolean;
  progressFile?: string;
  now?: () => number;
  sampleProcessMemory?: (
    pid: number | undefined,
  ) => Promise<ProcessMemory | null>;
  persistProgress?: (
    file: string,
    progress: BenchmarkProgress,
  ) => Promise<void>;
}

async function persistProgress(file: string, progress: BenchmarkProgress) {
  await fs.writeFile(`${file}.tmp`, JSON.stringify(progress));
  await fs.rename(`${file}.tmp`, file);
}

/** Run-scoped instrumentation owns polling, bounded histories and teardown.
 * No scenario actions or measurement boundary decisions live here. */
export class BenchmarkTelemetry {
  private options: TelemetryOptions;
  private now: () => number;
  private state: BenchmarkTelemetryData;
  private page: Page | undefined;
  private browser: Browser | undefined;
  private cdp: CDPSession | undefined;
  private cleanup: Array<() => void> = [];
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private telemetryTimer: ReturnType<typeof setInterval> | undefined;
  private polling = false;
  private telemetryBusy = false;
  private closing = false;
  private topLevelDocuments = 0;
  private measurementWallStart: number | undefined;
  private progressWrite: Promise<void> | undefined;
  private pendingProgress: BenchmarkProgress | undefined;
  phase = "launch";
  failure: string | null = null;

  constructor(options: TelemetryOptions) {
    this.options = options;
    this.state = options.state;
    this.now = options.now ?? Date.now;
  }

  assertHealthy = () => {
    if (this.failure) throw new Error(this.failure);
  };

  private fail(message: string) {
    if (this.closing) return;
    this.failure ??= message;
    void this.writeProgress().catch(() => {});
  }

  watchBrowser(browser: Browser) {
    this.browser = browser;
    const disconnected = () => this.fail("Browser disconnected unexpectedly");
    browser.on("disconnected", disconnected);
    this.cleanup.push(() => browser.off("disconnected", disconnected));
  }

  watchPage(page: Page) {
    this.page = page;
    const crash = (error: Error) => this.fail(`Page crashed: ${error.message}`);
    const close = () => this.fail("Page closed unexpectedly");
    const pageError = (error: unknown) => {
      if (this.closing) return;
      this.state.pageErrors.count++;
      if (this.state.pageErrors.messages.length < 20) {
        const message = String(error).slice(0, 500);
        this.state.pageErrors.messages.push(message);
        console.warn(`  pageerror: ${message}`);
      } else this.state.pageErrors.dropped++;
    };
    page.on("error", crash);
    page.on("close", close);
    page.on("pageerror", pageError);
    this.cleanup.push(() => {
      page.off("error", crash);
      page.off("close", close);
      page.off("pageerror", pageError);
    });
  }

  watchCdp(cdp: CDPSession) {
    this.cdp = cdp;
    const navigation = (event: { frame: { parentId?: string } }) => {
      if (!event.frame.parentId && ++this.topLevelDocuments > 1)
        this.fail("Unexpected page navigation or reload");
    };
    cdp.on("Page.frameNavigated", navigation);
    this.cleanup.push(() => cdp.off("Page.frameNavigated", navigation));
  }

  async blockExternalRequests(page: Page) {
    const request = (request: HTTPRequest) => {
      const url = new URL(request.url());
      if (
        /^https?:$/.test(url.protocol) &&
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      ) {
        this.state.externalNetwork.blockedRequests++;
        this.rememberHost(url.hostname.slice(0, 255));
        void request.abort("blockedbyclient").catch(() => {});
      } else void request.continue().catch(() => {});
    };
    await page.setRequestInterception(true);
    page.on("request", request);
    this.cleanup.push(() => page.off("request", request));
  }

  private rememberHost(host: string) {
    const hosts = this.state.externalNetwork.hostnames;
    if (hosts.length < 16 && !hosts.includes(host)) hosts.push(host);
  }

  startDiagnosticPolling() {
    if (this.options.collectDiagnostics && !this.pollTimer && !this.closing)
      this.pollTimer = setInterval(() => void this.captureDiagnostics(), 5000);
  }

  async startBrowserSampling() {
    if (!this.cdp || this.closing || this.telemetryTimer) return;
    await this.cdp.send("Performance.enable");
    await this.captureBrowserTelemetry();
    if (!this.closing)
      this.telemetryTimer = setInterval(
        () => void this.captureBrowserTelemetry(),
        10_000,
      );
  }

  markMeasurementStart(wallTime: number) {
    this.measurementWallStart = wallTime;
  }

  async writeProgress() {
    const file = this.options.progressFile;
    if (!file) return;
    const progress: BenchmarkProgress = {
      phase: this.phase,
      elapsedMs: this.now() - this.options.startedAt,
      measurementElapsedSeconds:
        this.measurementWallStart === undefined
          ? null
          : (this.now() - this.measurementWallStart) / 1000,
      requestedWallSeconds: this.options.requestedWallSeconds,
      failure: this.failure?.slice(0, 500) ?? null,
      resource: this.state.resourceSamples.at(-1) ?? null,
      browser: this.state.browserTelemetry.samples.at(-1) ?? null,
      pageErrors: this.state.pageErrors.count,
      externalNetwork: {
        ...this.state.externalNetwork,
        hostnames: [...this.state.externalNetwork.hostnames],
      },
      observation: this.state.observation,
    };
    this.pendingProgress = progress;
    if (!this.progressWrite) {
      // A failure listener and the sampling/runner paths can persist together.
      // One writer owns the temporary file; retain only the latest pending
      // snapshot so slow storage cannot create an unbounded write queue.
      this.progressWrite = Promise.resolve().then(async () => {
        try {
          while (this.pendingProgress) {
            const next = this.pendingProgress;
            this.pendingProgress = undefined;
            await (this.options.persistProgress ?? persistProgress)(file, next);
          }
        } catch (error) {
          this.pendingProgress = undefined;
          throw error;
        } finally {
          this.progressWrite = undefined;
        }
      });
    }
    await this.progressWrite;
  }

  async captureDiagnostics(full = false) {
    const page = this.page;
    if (!page || this.polling || (!full && this.failure) || this.closing)
      return;
    this.polling = true;
    try {
      const capture = await captureDiagnostics(page, full);
      if (this.closing) return;
      if (capture.network) {
        this.state.externalNetwork.blockedWebSockets =
          capture.network.blockedWebSockets;
        for (const host of capture.network.hostnames) this.rememberHost(host);
      }
      if (capture.report !== null) {
        const capturedAt = this.now() - this.options.startedAt;
        if (full) {
          this.state.diagnostics = capture.report as DiagnosticsReport;
          this.state.diagnosticsCapturedAtMs = capturedAt;
          this.state.fullSnapshotCaptures++;
        } else {
          this.state.observation = capture.report as DiagnosticsObservation;
          this.state.observationCapturedAtMs = capturedAt;
        }
        if (
          retainObservation(
            this.state.resourceSamples,
            {
              ...summarizeSeekReport(capture.report, capturedAt, true),
              phase: this.phase,
            },
            512,
            32,
          )
        )
          this.state.resourceSamplesDropped++;
      }
    } catch {
      // Navigation destroys execution contexts. Keep the last successful
      // observation; the run's health events record unrecovered failures.
    } finally {
      this.polling = false;
    }
  }

  async captureFreshDiagnostics(full = false) {
    while (this.polling && !this.closing) {
      if (!full) this.assertHealthy();
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    await this.captureDiagnostics(full);
  }

  async captureBrowserTelemetry() {
    const cdp = this.cdp;
    if (!cdp || this.telemetryBusy || this.closing || this.failure) return;
    this.telemetryBusy = true;
    try {
      const [metrics, dom, memory] = await Promise.allSettled([
        cdp.send("Performance.getMetrics"),
        cdp.send("Memory.getDOMCounters"),
        this.options.processMemoryEnabled
          ? (this.options.sampleProcessMemory ?? browserProcessMemory)(
              this.browser?.process()?.pid,
            )
          : Promise.resolve(null),
      ]);
      if (this.closing) return;
      const performance: Record<string, number | null> = {};
      for (const key of PERFORMANCE_GAUGES)
        performance[key] =
          metrics.status === "fulfilled"
            ? (metrics.value.metrics.find((metric) => metric.name === key)
                ?.value ?? null)
            : null;
      for (const result of [metrics, dom, memory])
        if (result.status === "rejected") this.state.browserTelemetry.errors++;
      if (
        retainObservation(
          this.state.browserTelemetry.samples,
          {
            timeMs: this.now() - this.options.startedAt,
            phase: this.phase,
            performance,
            dom: dom.status === "fulfilled" ? dom.value : null,
            processMemory: memory.status === "fulfilled" ? memory.value : null,
          },
          256,
        )
      )
        this.state.browserTelemetry.dropped++;
      await this.writeProgress().catch(() => {});
    } finally {
      this.telemetryBusy = false;
    }
  }

  async setPhase(name: string, details?: DiagnosticDetails) {
    this.phase = name;
    // Preserve the CLI-bounded scenario's existing phase-history cap.
    if (this.state.phases.length < 1200)
      this.state.phases.push({
        timeMs: this.now() - this.options.startedAt,
        name,
        ...(details && { details }),
      });
    this.assertHealthy();
    if (this.page) {
      await markDiagnosticsPhase(this.page, name, details);
      await this.captureFreshDiagnostics();
    }
  }

  /** Stop first, before draining GC trace and closing the browser. Late
   * responses cannot mutate exported histories or schedule more work. */
  stop() {
    if (this.closing) return;
    this.closing = true;
    clearInterval(this.pollTimer);
    clearInterval(this.telemetryTimer);
    for (const cleanup of this.cleanup.splice(0)) cleanup();
    this.page = this.browser = this.cdp = undefined;
  }
}
