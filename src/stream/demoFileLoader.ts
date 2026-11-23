/**
 * Shared .rec demo file loading pipeline (sidebar button + drop screen):
 * parse the recording, swap it into the engine, and kick off the
 * background timeline scan. Module-level attempt/abort state means a new
 * load cancels the previous download; scans belong to the installed recording.
 */
import { createLogger } from "../logger";
import { commandCircuitStore } from "../state/commandCircuitStore";
import {
  resetDirector,
  setDirectorDemoBuffer,
} from "../state/demoDirectorStore";
import { commentaryTracksStore } from "../state/commentaryTracksStore";
import { casterStore } from "../state/casterStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { clipStore } from "../state/clipStore";
import { demoTimelineStore } from "../state/demoTimelineStore";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import type { StreamRecording } from "./types";
import type { DemoParser } from "t2-demo-parser";
import { DemoLoadAttempt } from "./demoLoadAttempt";
import {
  directDemoSource,
  resolveDemoSource,
  type DemoSource,
  DemoSourceLoadError,
} from "./demoSources";
import type { SourceDemoMetadata } from "../../relay/demoSourceMetadata";
import {
  DEMO_CHECKPOINT_SUFFIX,
  readDemoCheckpoints,
  readDemoCheckpointIndex,
} from "./demoCheckpoints";
import { readDemoGames } from "../../relay/demoMetadata";
import { versionedDemoMetadataUrl, type DemoIndexEntry } from "./demoIndex";
import { markDiagnosticEvent } from "../diagnostics/browserDiagnostics";
import { browserCheckpointMemoryPolicy } from "./checkpointMemoryPolicy";
import { readDeviceSignals } from "../deviceConstraints";
import { classifyDevice } from "../deviceConstraints";
import { CompressedDemoBuffer } from "./compressedDemoBuffer";
import { registerMetricSource } from "../diagnostics/resourceMetricRegistry";
import { deviceTierValue, performanceTuning } from "../performanceTuning";

interface LoadedDemoSource {
  url: string;
  reference: string | null;
  sidecarSourceUrl: string | null;
  metadata: SourceDemoMetadata | null;
  recording: StreamRecording | null;
  publishedGames: DemoIndexEntry["games"] | null;
  checkpoints?: Promise<string | null>;
}

const log = createLogger("demoFileLoader");

let loadAttempt: DemoLoadAttempt | undefined;
let scanAbort: AbortController | null = null;
let timelineScanEnabled = true;
let timelineScan: {
  buffer: ArrayBuffer;
  recording: StreamRecording;
  settled: boolean;
} | null = null;

/** Clips use their own camera track; defer the full-demo event scan until exit. */
export function setDemoTimelineScanEnabled(enabled: boolean): void {
  if (timelineScanEnabled === enabled) return;
  timelineScanEnabled = enabled;
  if (!enabled) {
    scanAbort?.abort();
    scanAbort = null;
    demoTimelineStore.getState().setScanProgress(null);
  } else if (
    timelineScan &&
    engineStore.getState().playback.recording === timelineScan.recording
  ) {
    startTimelineScan(timelineScan.buffer, timelineScan.recording);
  }
}

function isInstalledSource(source: LoadedDemoSource): boolean {
  return (
    source.recording !== null &&
    engineStore.getState().playback.recording === source.recording
  );
}

function cancelLoad(preserveRecording = true): DemoLoadAttempt {
  const clip = clipStore.getState();
  if (clip.recording || clip.draft) clip.discard();
  else if (clip.active) clip.stopPlayback();
  const previous = loadAttempt;
  const next = new DemoLoadAttempt();
  loadAttempt = next;
  previous?.cancel(preserveRecording);
  if (!preserveRecording) {
    scanAbort?.abort();
    scanAbort = null;
    timelineScan = null;
  }
  return next;
}

/**
 * Eject the current recording: cancel any in-flight load/scan and fully
 * clear the streamed scene, returning demo mode to its drop screen.
 */
export function unloadDemo(): void {
  cancelLoad(false);
  engineStore
    .getState()
    .playback.recording?.streamingPlayback?.disposeCheckpointIndex?.();
  casterStore.getState().suspend();
  demoLoadStore.setState({
    requestedUrl: null,
    requestedDemo: null,
    phase: "idle",
    progress: null,
    error: null,
    sourceUrl: null,
    sourceReference: null,
    sourceFileName: null,
    sourceMetadata: null,
    publishedGames: null,
    sidecarSourceUrl: null,
    downloadedSec: null,
  });
  engineStore.getState().setRecording(null);
  demoTimelineStore.getState().reset();
  resetDirector();
  void commentaryTracksStore.getState().load(null);
  gameEntityStore.getState().endStreaming();
  commandCircuitStore.getState().deactivate();
}

export async function loadDemoFile(
  file: File,
  checkpoints?: File,
): Promise<void> {
  // Own the attempt before a slow file read so a newer load wins even if
  // this read finishes last.
  const attempt = cancelLoad();
  demoLoadStore.setState({
    requestedUrl: null,
    requestedDemo: null,
  });
  demoLoadStore.getState().begin("parsing");
  try {
    const buffer = await file.arrayBuffer();
    if (!attempt.isCurrent) return;
    await loadDemoBuffer(
      buffer,
      null,
      attempt,
      checkpoints
        ? checkpoints.text().catch((error) => {
            log.warn("Couldn't read seek checkpoints: %o", error);
            return null;
          })
        : undefined,
      file.name ?? null,
    );
  } catch (err) {
    log.error("Failed to load demo: %o", err);
    if (attempt.isCurrent) {
      demoLoadStore.getState().fail("Couldn't read the demo file");
    }
  }
}

/**
 * Download a demo and load it exactly like an uploaded file.
 * A newer load or an unload started mid-download wins over this one.
 */
export async function loadDemoUrl(url: string): Promise<void> {
  await loadRemoteDemo(() => directDemoSource(url));
}

/** Load a filename or a qualified reference from the demo URL parameter. */
export async function loadDemoReference(reference: string): Promise<void> {
  await loadRemoteDemo(() => resolveDemoSource(reference), reference);
}

async function loadRemoteDemo(
  resolve: () => DemoSource,
  reference: string | null = null,
): Promise<void> {
  const attempt = cancelLoad();
  const abort = attempt.abortController;
  demoLoadStore.setState({
    requestedUrl: null,
    requestedDemo: reference,
  });
  demoLoadStore.getState().begin("downloading");
  let source: DemoSource;
  try {
    source = resolve();
  } catch (err) {
    abort.abort();
    demoLoadStore
      .getState()
      .fail(err instanceof Error ? err.message : "Invalid demo source");
    return;
  }
  const url = source.url;
  demoLoadStore.setState({ requestedUrl: url });
  let response: Response | undefined;
  try {
    const loadedSource: LoadedDemoSource = {
      url,
      reference: reference?.includes(":")
        ? reference.slice(0, reference.indexOf(":")).toLowerCase() +
          reference.slice(reference.indexOf(":"))
        : reference,
      sidecarSourceUrl: source.sidecarSourceUrl,
      metadata: null,
      recording: null,
      publishedGames: null,
    };
    // Fetch metadata alongside the recording so it can be ready at installation.
    if (source.sidecarSourceUrl) {
      const metadataUrl = new URL(
        source.sidecarSourceUrl,
        typeof location === "undefined" ? "http://localhost/" : location.href,
      );
      metadataUrl.pathname += ".json";
      void Promise.resolve()
        .then(() =>
          fetch(versionedDemoMetadataUrl(metadataUrl.href), {
            signal: abort.signal,
            cache: "no-cache",
          }),
        )
        .then(async (response) => {
          if (!response.ok) {
            await response.body?.cancel();
            return;
          }
          const metadata: unknown = await response.json();
          const games = readDemoGames(metadata);
          if (
            !games.length &&
            !(
              metadata &&
              typeof metadata === "object" &&
              "games" in metadata &&
              Array.isArray(metadata.games) &&
              metadata.games.length === 0
            )
          )
            return;
          if (!attempt.isCurrent || abort.signal.aborted) return;
          const installed = isInstalledSource(loadedSource);
          // An editor can fetch or save newer metadata while this initial
          // public request is in flight. Keep the newer installed snapshot.
          if (
            loadedSource.recording &&
            (!installed ||
              demoLoadStore.getState().publishedGames !==
                loadedSource.publishedGames)
          )
            return;
          loadedSource.publishedGames = games;
          if (installed) demoLoadStore.setState({ publishedGames: games });
        })
        .catch((err) => {
          if (attempt.isCurrent && !abort.signal.aborted)
            log.warn("Couldn't load saved game details: %o", err);
        });
    }
    response = await source.load(abort.signal);
    if (!attempt.isCurrent) return;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const checkpointSourceUrl =
      source.checkpointSourceUrl?.(response) ?? source.sidecarSourceUrl;
    if (checkpointSourceUrl) {
      const checkpointUrl = new URL(
        checkpointSourceUrl,
        typeof location === "undefined" ? "http://localhost/" : location.href,
      );
      checkpointUrl.pathname += DEMO_CHECKPOINT_SUFFIX;
      loadedSource.checkpoints = Promise.resolve()
        .then(() =>
          fetch(checkpointUrl.href, {
            signal: AbortSignal.any([
              abort.signal,
              AbortSignal.timeout(10_000),
            ]),
          }),
        )
        .then(async (response) => {
          if (response.ok) return response.text();
          await response.body?.cancel();
          return null;
        })
        .catch(() => null);
    }
    // Metadata is optional and must not delay playback. Keep it on the source
    // until installation, or update the installed demo if it arrives later.
    if (source.loadMetadata) {
      void source
        .loadMetadata(response, abort.signal)
        .then((metadata) => {
          loadedSource.metadata = metadata;
          if (attempt.isCurrent && isInstalledSource(loadedSource)) {
            demoLoadStore.setState({ sourceMetadata: metadata });
          }
        })
        .catch((err) => {
          if (attempt.isCurrent && !abort.signal.aborted)
            log.warn("Couldn't load demo metadata: %o", err);
        });
    }
    if (!response.body) {
      // No streaming body (ancient environment): one-shot fallback.
      const buffer = await response.arrayBuffer();
      if (!attempt.isCurrent) return;
      if (!(await loadDemoBuffer(buffer, loadedSource, attempt))) abort.abort();
      return;
    }
    const totalBytes = Number(response.headers.get("content-length")) || 0;
    await streamDemoResponse(response.body, loadedSource, attempt, totalBytes);
    if (!loadedSource.recording) abort.abort();
  } catch (err) {
    abort.abort();
    if (!attempt.isCurrent) return;
    log.error("Failed to load demo from %s: %o", url, err);
    if (attempt.isCurrent) {
      demoLoadStore
        .getState()
        .fail(
          err instanceof DemoSourceLoadError
            ? err.message
            : "Couldn't download the demo",
        );
    }
  } finally {
    // Covers HTTP errors and failures before the streaming reader is created.
    if (response?.body && !response.body.locked)
      void response.body.cancel().catch(() => {});
  }
}

/** World geometry present = something worth putting on screen (the
 *  snapshot-side twin of StreamingPlayback's private
 *  hasRenderableWorld — keep the class names in sync). */
function snapshotHasWorld(snapshot: {
  entities: { sceneData?: { className?: string } }[];
}): boolean {
  return snapshot.entities.some(
    (e) =>
      e.sceneData?.className === "TerrainBlock" ||
      e.sceneData?.className === "InteriorInstance",
  );
}

/**
 * Progressive download: feed chunks into an incremental parser as they
 * arrive, install the recording as soon as the actual server ghosts
 * yield a renderable scene, and keep parsing the tail while it already
 * plays. Seeks beyond the downloaded portion wait for more data; background
 * scans start once the source bytes are available.
 *
 * Failure model: before the recording installs, any error surfaces as a
 * normal load failure. After install, a mid-download network error
 * degrades to a shorter demo (everything parsed so far stays playable)
 * rather than tearing down a scene the user is already watching.
 */
async function streamDemoResponse(
  body: ReadableStream<Uint8Array>,
  source: LoadedDemoSource,
  attempt: DemoLoadAttempt,
  totalBytes: number,
): Promise<void> {
  const constrained = classifyDevice(readDeviceSignals()).constrained;
  const bytes = new CompressedDemoBuffer(
    totalBytes,
    deviceTierValue(
      performanceTuning.compressedDemoBuffer.maximumPreallocationBytes,
      constrained,
    ),
    () => markDiagnosticEvent("demo-compressed-copy"),
  );
  const stopMetrics = registerMetricSource("demoDownload", () =>
    bytes.metrics(),
  );
  try {
    await streamDemoResponseBytes(body, source, attempt, totalBytes, bytes);
  } finally {
    stopMetrics();
  }
}

async function streamDemoResponseBytes(
  body: ReadableStream<Uint8Array>,
  source: LoadedDemoSource,
  attempt: DemoLoadAttempt,
  totalBytes: number,
  compressed: CompressedDemoBuffer,
): Promise<void> {
  const url = source.url;
  const [{ DemoParser }, demoStreaming, { shareDemoParser }] =
    await Promise.all([
      import("t2-demo-parser"),
      import("./demoStreaming"),
      import("./loadDemoParser"),
    ]);
  if (!attempt.isCurrent) {
    void body.cancel().catch(() => {});
    return;
  }
  const reader = body.getReader();
  let received = 0;
  let reportedPercent = -1;
  // Set once enough bytes exist for the header + initial block.
  let parser: InstanceType<typeof DemoParser> | null = null;
  let recording: StreamRecording | null = null;
  let prefixNeed = Number.POSITIVE_INFINITY;
  let installed = false;
  let reportedBufferedSec = -1;

  const assemble = () => compressed.prefix();
  const finishParsedBuffer = (loadedParser: DemoParser) => {
    // Release chunk owners before finish() may trim the inflated backing store.
    const buffer = compressed.finish();
    loadedParser.finish();
    shareDemoParser(buffer, loadedParser);
    return buffer;
  };

  const finishInstalledPrefix = () => {
    if (
      !parser ||
      !recording ||
      !installed ||
      engineStore.getState().playback.recording !== recording
    )
      return;
    publishDownloadedDemo(finishParsedBuffer(parser), recording);
  };
  const cancel = (preserveRecording: boolean) => {
    void reader.cancel().catch(() => {});
    // The next load can fail. Keep the already installed prefix playable,
    // with a real EOF instead of waiting forever for the aborted download.
    if (preserveRecording) finishInstalledPrefix();
  };
  const stopCancelling = attempt.onDownloadCancel(cancel);

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (!attempt.isCurrent) {
        void reader.cancel().catch(() => {});
        return;
      }
      if (done) break;
      compressed.append(value);
      received += value.length;

      if (parser) {
        parser.push(value);
      } else {
        // Still assembling the raw prefix (header + initial block).
        if (!Number.isFinite(prefixNeed)) {
          try {
            const peeked = DemoParser.peekHeader(
              received === value.length ? value : new Uint8Array(assemble()),
            );
            prefixNeed = peeked.byteLength + peeked.header.initialBlockSize;
          } catch (err) {
            // RangeError = header incomplete, wait for more bytes.
            // Anything else is a real fault — surface it, don't quietly
            // degrade to the one-shot path.
            if (!(err instanceof RangeError)) throw err;
          }
        }
        if (received >= prefixNeed) {
          parser = new DemoParser(new Uint8Array(assemble()), {
            incremental: true,
          });
          await parser.load();
          if (!attempt.isCurrent) return;
          recording = demoStreaming.createRecordingFromParser(parser, {
            checkpointMemoryPolicy:
              browserCheckpointMemoryPolicy(readDeviceSignals()),
          });
        }
      }

      // Install as soon as the streamed ghosts produce a renderable
      // scene — findSceneReadyTime steps only newly-arrived blocks
      // (frontier-safe), so this probe is cheap per chunk.
      if (recording && !installed) {
        const playback = recording.streamingPlayback;
        playback.findSceneReadyTime(60);
        if (snapshotHasWorld(playback.getSnapshot())) {
          installed = true;
          if (!installRecording(recording, source, attempt)) return;
          if (!attempt.isCurrent) return;
          log.info(
            "progressive: playable at %d KB of %s",
            Math.round(received / 1024),
            url,
          );
        }
      }

      // Buffered demo time for the seek bar's downloaded indicator —
      // whole seconds only, so a big demo doesn't drive thousands of
      // store updates.
      if (recording) {
        const raw = recording.streamingPlayback.bufferedSec;
        const bufferedSec = Number.isFinite(raw) ? Math.floor(raw!) : 0;
        if (bufferedSec !== reportedBufferedSec) {
          reportedBufferedSec = bufferedSec;
          demoLoadStore.getState().setDownloadedSec(bufferedSec);
          engineStore.getState().refreshRecordingDuration(recording);
          // A seek parked beyond the frontier executes the moment the
          // buffer reaches it.
          engineStore.getState().fulfillPendingSeek();
        }
      }

      // Whole-percent download progress while the loading screen shows;
      // once the recording is installed the screen is gone, so stop
      // touching the load store.
      if (!installed && totalBytes > 0) {
        const percent = Math.min(
          100,
          Math.floor((received / totalBytes) * 100),
        );
        if (percent !== reportedPercent) {
          reportedPercent = percent;
          demoLoadStore.getState().setProgress(percent / 100);
        }
      }
    }
  } catch (err) {
    void reader.cancel().catch(() => {});
    if (!attempt.isCurrent) return;
    if (!installed) throw err;
    // Mid-download failure after the scene is already up: keep what we
    // have. finish() flushes what the inflator holds; the demo simply
    // ends at the frontier.
    log.warn(
      "download interrupted after install — keeping partial demo: %o",
      err,
    );
    finishInstalledPrefix();
    return;
  } finally {
    stopCancelling();
    reader.releaseLock();
  }

  if (!attempt.isCurrent) return;
  if (!parser || !recording) {
    // A tiny/unusual stream may finish before a parsable initial block exists.
    await loadDemoBuffer(compressed.finish(), source, attempt);
    return;
  }
  const buffer = finishParsedBuffer(parser);
  if (!installed) {
    // A complete recording installs its source and buffer atomically.
    if (!installRecording(recording, source, attempt, buffer)) return;
  }
  publishDownloadedDemo(buffer, recording, {
    pending: source.checkpoints,
    attempt,
  });
}

/**
 * Swap a ready-to-play recording into the engine. Shared by the one-shot
 * (full buffer) and progressive (mid-download) paths; ordering matters —
 * the source is set atomically with the recording so readers never
 * observe a loaded demo with a stale/transient source.
 */
function installRecording(
  recording: StreamRecording,
  source: LoadedDemoSource | null,
  attempt: DemoLoadAttempt,
  demoBuffer: ArrayBuffer | null = null,
  fileName: string | null = null,
): boolean {
  if (!attempt.isCurrent) return false;
  const previous = engineStore.getState().playback.recording;
  demoLoadStore.getState().reset();
  if (!attempt.isCurrent) return false;
  // Leave any live session and close the relay socket before loading
  // the demo — demo playback has no use for it.
  const liveState = liveConnectionStore.getState();
  liveState.leaveServer();
  if (!attempt.isCurrent) return false;
  liveState.disconnectRelay();
  if (!attempt.isCurrent) return false;
  engineStore.getState().setRecording(recording, demoBuffer);
  // Retire the previous recording only after this replacement commits. A
  // pre-commit store callback can supersede this attempt and keep it playing.
  if (previous && previous !== recording && !isInstalledRecording(previous))
    previous.streamingPlayback?.disposeCheckpointIndex?.();
  // Store subscribers can synchronously eject or replace this recording.
  // Once installed, its lifetime is independent of pending replacement loads.
  if (!isInstalledRecording(recording)) return false;
  const previousScan = scanAbort;
  scanAbort = null;
  timelineScan = null;
  previousScan?.abort();
  if (!isInstalledRecording(recording)) return false;
  demoTimelineStore.getState().reset();
  if (!isInstalledRecording(recording)) return false;
  if (source) source.recording = recording;
  demoLoadStore
    .getState()
    .setSourceUrl(
      source?.url ?? null,
      source?.sidecarSourceUrl ?? null,
      source?.metadata ?? null,
      source?.reference ?? null,
      fileName,
      source?.publishedGames ?? null,
    );
  if (!isInstalledRecording(recording)) return false;
  // Which commentary tracks this demo has, from its record sidecar.
  void commentaryTracksStore.getState().load(source?.sidecarSourceUrl ?? null);
  if (!isInstalledRecording(recording)) return false;
  resetDirector();
  return isInstalledRecording(recording);
}

function isInstalledRecording(recording: StreamRecording): boolean {
  return engineStore.getState().playback.recording === recording;
}

/**
 * Resolves true once the recording is live; false if it failed or a
 * newer load replaced it first.
 */
async function loadDemoBuffer(
  buffer: ArrayBuffer,
  source: LoadedDemoSource | null,
  attempt: DemoLoadAttempt,
  localCheckpoints?: Promise<string | null>,
  fileName: string | null = null,
): Promise<boolean> {
  try {
    demoLoadStore.getState().begin("parsing");
    const { createDemoStreamingRecording } = await import("./demoStreaming");
    if (!attempt.isCurrent) return false;
    const recording = await createDemoStreamingRecording(buffer, {
      checkpointMemoryPolicy:
        browserCheckpointMemoryPolicy(readDeviceSignals()),
    });
    if (!attempt.isCurrent) return false;
    if (localCheckpoints)
      await installCheckpoints(buffer, recording, localCheckpoints, attempt);
    if (!attempt.isCurrent) return false;
    if (!installRecording(recording, source, attempt, buffer, fileName))
      return false;
    if (!localCheckpoints)
      void installCheckpoints(buffer, recording, source?.checkpoints, attempt);

    startWholeDemoConsumers(buffer, recording);
    return true;
  } catch (err) {
    log.error("Failed to load demo: %o", err);
    if (attempt.isCurrent) {
      demoLoadStore.getState().fail("Couldn't parse the demo");
    }
    return false;
  }
}

/** Streamed buffers become final either at EOF or at a preserved partial EOF.
 * Partial demos omit checkpoint sidecars, which describe the complete file. */
function publishDownloadedDemo(
  buffer: ArrayBuffer,
  recording: StreamRecording,
  checkpoints?: {
    pending: Promise<string | null> | undefined;
    attempt: DemoLoadAttempt;
  },
): void {
  if (!isInstalledRecording(recording)) return;
  engineStore.getState().refreshRecordingDuration(recording);
  if (!isInstalledRecording(recording)) return;
  engineStore.getState().setDemoBuffer(recording, buffer);
  if (!isInstalledRecording(recording)) return;
  engineStore.getState().setDownloadComplete(true);
  if (!isInstalledRecording(recording)) return;
  if (checkpoints)
    void installCheckpoints(
      buffer,
      recording,
      checkpoints.pending,
      checkpoints.attempt,
    );
  engineStore.getState().fulfillPendingSeek();
  if (!isInstalledRecording(recording)) return;
  demoLoadStore.getState().setDownloadedSec(null);
  if (!isInstalledRecording(recording)) return;
  startWholeDemoConsumers(buffer, recording);
}

/** Shared by complete one-shot files and finalized progressive downloads. */
function startWholeDemoConsumers(
  buffer: ArrayBuffer,
  recording: StreamRecording,
): void {
  if (!isInstalledRecording(recording)) return;
  setDirectorDemoBuffer(buffer);
  if (!isInstalledRecording(recording)) return;
  startTimelineScan(buffer, recording);
}

async function installCheckpoints(
  buffer: ArrayBuffer,
  recording: StreamRecording,
  pending: Promise<string | null> | undefined,
  attempt: DemoLoadAttempt,
): Promise<void> {
  if (!pending || !recording.streamingPlayback) return;
  const playback = recording.streamingPlayback;
  if (!playback.installCheckpointIndex && !playback.importCheckpoints) return;
  const { signal } = attempt.abortController;
  try {
    const text = await pending;
    if (!text || !attempt.isCurrent || signal.aborted) return;
    const started = performance.now();
    markDiagnosticEvent("checkpoint-import-start", {
      sidecarCharacters: text.length,
    });
    let entries: number;
    if (playback.installCheckpointIndex) {
      const index = await readDemoCheckpointIndex(text, buffer, signal);
      if (!attempt.isCurrent) return;
      playback.installCheckpointIndex(index);
      entries = index.ticks.length;
    } else {
      const checkpoints = await readDemoCheckpoints(text, buffer, signal);
      if (!attempt.isCurrent) return;
      playback.importCheckpoints!(checkpoints);
      entries = checkpoints.length;
    }
    markDiagnosticEvent("checkpoint-import-end", {
      entries,
      durationMs: performance.now() - started,
    });
    log.info("Indexed %d precomputed seek checkpoints", entries);
  } catch (error) {
    if (attempt.isCurrent && !signal.aborted) {
      markDiagnosticEvent("checkpoint-import-error");
      log.warn("Ignoring unusable seek checkpoints: %o", error);
    }
  }
}

/** Kick off the background timeline scan over the complete demo bytes. */
function startTimelineScan(
  buffer: ArrayBuffer,
  recording: StreamRecording,
): void {
  if (!isInstalledRecording(recording)) return;
  if (timelineScan?.buffer !== buffer || timelineScan.recording !== recording) {
    scanAbort?.abort();
    scanAbort = null;
    timelineScan = { buffer, recording, settled: false };
  }
  if (!timelineScanEnabled || timelineScan.settled || scanAbort) return;
  const request = timelineScan;
  const abortController = new AbortController();
  scanAbort = abortController;
  const isCurrentScan = () =>
    timelineScanEnabled &&
    timelineScan === request &&
    !abortController.signal.aborted &&
    engineStore.getState().playback.recording === recording;
  const store = demoTimelineStore.getState();
  store.reset();
  if (!isCurrentScan()) return;
  store.setScanProgress(0);
  if (!isCurrentScan()) return;
  import("./demoTimelineScanner")
    .then(({ scanDemoTimeline }) => {
      if (!isCurrentScan()) return null;
      const recorderName =
        recording.streamingPlayback?.connectedPlayerName ??
        recording.recorderName;
      recording.recorderName ??= recorderName;
      return scanDemoTimeline(
        buffer,
        recorderName,
        (p) => {
          if (!isCurrentScan()) return;
          demoTimelineStore.getState().setScanProgress(p);
        },
        abortController.signal,
        (name) => {
          if (!isCurrentScan()) return;
          const playback = recording.streamingPlayback;
          recording.serverDisplayName ??= playback?.serverDisplayName ?? name;
          playback?.setServerNameFallback?.(recording.serverDisplayName);
          gameEntityStore.getState().setMissionInfo({
            serverDisplayName:
              playback?.serverDisplayName ??
              recording.serverDisplayName ??
              name,
          });
        },
      );
    })
    .then((result) => {
      if (!result || !isCurrentScan()) return;
      request.settled = true;
      const s = demoTimelineStore.getState();
      s.setEvents(
        result.events,
        result.players,
        result.recorderNames,
        result.playerRawNames,
      );
      s.setScanProgress(null);
    })
    .catch((err: unknown) => {
      if (!isCurrentScan()) return;
      if (err instanceof Error && err.name === "AbortError") return;
      request.settled = true;
      log.error("Timeline scan failed: %o", err);
      demoTimelineStore
        .getState()
        .setError(err instanceof Error ? err.message : String(err));
    });
}
