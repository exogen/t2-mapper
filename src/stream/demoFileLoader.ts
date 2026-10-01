/**
 * Shared .rec demo file loading pipeline (sidebar button + drop screen):
 * parse the recording, swap it into the engine, and kick off the
 * background timeline scan. Module-level token/abort state means a new
 * load cancels the previous download; scans belong to the installed recording.
 */
import { createLogger } from "../logger";
import { commandCircuitStore } from "../state/commandCircuitStore";
import {
  resetDirector,
  setDirectorDemoBuffer,
} from "../state/demoDirectorStore";
import { commentaryTracksStore } from "../state/commentaryTracksStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { demoTimelineStore } from "../state/demoTimelineStore";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import type { StreamRecording } from "./types";
import {
  directDemoSource,
  resolveDemoSource,
  type DemoSource,
  DemoSourceLoadError,
} from "./demoSources";
import type { SourceDemoMetadata } from "../../relay/demoSourceMetadata";
import { DEMO_CHECKPOINT_SUFFIX, readDemoCheckpoints } from "./demoCheckpoints";

interface LoadedDemoSource {
  url: string;
  sidecarSourceUrl: string | null;
  metadata: SourceDemoMetadata | null;
  installed: boolean;
  checkpoints?: Promise<string | null>;
}

const log = createLogger("demoFileLoader");

let parseToken = 0;
let scanAbort: AbortController | null = null;
let loadAbort: AbortController | null = null;
let cancelDownload: ((preserveRecording: boolean) => void) | null = null;

function cancelLoad(preserveRecording = true): number {
  ++parseToken;
  loadAbort?.abort();
  loadAbort = null;
  if (!preserveRecording) {
    scanAbort?.abort();
    scanAbort = null;
  }
  const cancel = cancelDownload;
  cancelDownload = null;
  cancel?.(preserveRecording);
  return parseToken;
}

/**
 * Eject the current recording: cancel any in-flight load/scan and fully
 * clear the streamed scene, returning demo mode to its drop screen.
 */
export function unloadDemo(): void {
  cancelLoad(false);
  demoLoadStore.setState({
    requestedUrl: null,
    requestedDemo: null,
    phase: "idle",
    progress: null,
    error: null,
    sourceUrl: null,
    sourceMetadata: null,
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
  // Take our turn number before the (possibly slow) read, so if another
  // load starts while we're reading, that newer one wins — not whichever
  // happens to finish last.
  const token = cancelLoad();
  demoLoadStore.setState({ requestedUrl: null, requestedDemo: null });
  demoLoadStore.getState().begin("parsing");
  try {
    const buffer = await file.arrayBuffer();
    if (parseToken !== token) return;
    await loadDemoBuffer(
      buffer,
      null,
      token,
      checkpoints
        ? checkpoints.text().catch((error) => {
            log.warn("Couldn't read seek checkpoints: %o", error);
            return null;
          })
        : undefined,
    );
  } catch (err) {
    log.error("Failed to load demo: %o", err);
    if (parseToken === token) {
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
  const token = cancelLoad();
  const abort = new AbortController();
  loadAbort = abort;
  demoLoadStore.setState({ requestedUrl: null, requestedDemo: reference });
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
    response = await source.load(abort.signal);
    if (parseToken !== token) return;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const loadedSource: LoadedDemoSource = {
      url,
      sidecarSourceUrl: source.sidecarSourceUrl,
      metadata: null,
      installed: false,
    };
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
          if (parseToken === token && loadedSource.installed) {
            demoLoadStore.setState({ sourceMetadata: metadata });
          }
        })
        .catch((err) => {
          if (parseToken === token && !abort.signal.aborted)
            log.warn("Couldn't load demo metadata: %o", err);
        });
    }
    if (!response.body) {
      // No streaming body (ancient environment): one-shot fallback.
      const buffer = await response.arrayBuffer();
      if (parseToken !== token) return;
      if (!(await loadDemoBuffer(buffer, loadedSource, token))) abort.abort();
      return;
    }
    const totalBytes = Number(response.headers.get("content-length")) || 0;
    await streamDemoResponse(response.body, loadedSource, token, totalBytes);
    if (!loadedSource.installed) abort.abort();
  } catch (err) {
    abort.abort();
    if (parseToken !== token) return;
    log.error("Failed to load demo from %s: %o", url, err);
    if (parseToken === token) {
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
  token: number,
  totalBytes: number,
): Promise<void> {
  const url = source.url;
  const [{ DemoParser }, demoStreaming] = await Promise.all([
    import("t2-demo-parser"),
    import("./demoStreaming"),
  ]);
  if (parseToken !== token) {
    void body.cancel().catch(() => {});
    return;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let reportedPercent = -1;
  // Set once enough bytes exist for the header + initial block.
  let parser: InstanceType<typeof DemoParser> | null = null;
  let recording: StreamRecording | null = null;
  let prefixNeed = Number.POSITIVE_INFINITY;
  let installed = false;
  let reportedBufferedSec = -1;

  const assemble = (): ArrayBuffer => {
    const buffer = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    return buffer.buffer;
  };

  const finishInstalledPrefix = () => {
    if (
      !parser ||
      !recording ||
      !installed ||
      engineStore.getState().playback.recording !== recording
    )
      return;
    parser.finish();
    const buffer = assemble();
    engineStore.getState().setDemoBuffer(recording, buffer);
    engineStore.getState().setDownloadComplete(true);
    engineStore.getState().fulfillPendingSeek();
    demoLoadStore.getState().setDownloadedSec(null);
    setDirectorDemoBuffer(buffer);
    startTimelineScan(buffer, recording);
  };
  const cancel = (preserveRecording: boolean) => {
    void reader.cancel().catch(() => {});
    // The next load can fail. Keep the already installed prefix playable,
    // with a real EOF instead of waiting forever for the aborted download.
    if (preserveRecording) finishInstalledPrefix();
  };
  cancelDownload = cancel;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (parseToken !== token) {
        void reader.cancel().catch(() => {});
        return;
      }
      if (done) break;
      chunks.push(value);
      received += value.length;

      if (parser) {
        parser.push(value);
      } else {
        // Still assembling the raw prefix (header + initial block).
        if (!Number.isFinite(prefixNeed)) {
          try {
            const peeked = DemoParser.peekHeader(
              chunks.length === 1 ? value : new Uint8Array(assemble()),
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
          if (parseToken !== token) return;
          recording = demoStreaming.createRecordingFromParser(parser);
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
          installRecording(recording, source);
          if (parseToken !== token) return;
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
    if (parseToken !== token) return;
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
    if (cancelDownload === cancel) cancelDownload = null;
    reader.releaseLock();
  }

  if (parseToken !== token) return;
  const buffer = assemble();
  if (!parser || !recording) {
    // Never got a parsable header/initial block from the stream (or the
    // demo is tiny): parse the assembled whole the classic way.
    await loadDemoBuffer(buffer, source, token);
    return;
  }
  parser.finish();
  if (!installed) {
    // Download finished before a renderable scene appeared (odd but
    // possible): install now — everything is parsed and playable.
    installRecording(recording, source, buffer);
  }
  engineStore.getState().setDemoBuffer(recording, buffer);
  engineStore.getState().setDownloadComplete(true);
  void installCheckpoints(buffer, recording, source.checkpoints, token);
  engineStore.getState().fulfillPendingSeek();
  demoLoadStore.getState().setDownloadedSec(null);
  // The whole-file consumers unlock now: the auto-director's scan buffer
  // and the timeline scan.
  setDirectorDemoBuffer(buffer);
  startTimelineScan(buffer, recording);
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
  demoBuffer: ArrayBuffer | null = null,
): void {
  scanAbort?.abort();
  scanAbort = null;
  demoTimelineStore.getState().reset();
  demoLoadStore.getState().reset();
  // Leave any live session and close the relay socket before loading
  // the demo — demo playback has no use for it.
  const liveState = liveConnectionStore.getState();
  liveState.leaveServer();
  liveState.disconnectRelay();
  engineStore.getState().setRecording(recording, demoBuffer);
  if (source) source.installed = true;
  demoLoadStore
    .getState()
    .setSourceUrl(
      source?.url ?? null,
      source?.sidecarSourceUrl ?? null,
      source?.metadata ?? null,
    );
  // Which commentary tracks this demo has, from its record sidecar.
  void commentaryTracksStore.getState().load(source?.sidecarSourceUrl ?? null);
  resetDirector();
}

/**
 * Resolves true once the recording is live; false if it failed or a
 * newer load replaced it first.
 */
async function loadDemoBuffer(
  buffer: ArrayBuffer,
  source: LoadedDemoSource | null,
  token: number,
  localCheckpoints?: Promise<string | null>,
): Promise<boolean> {
  try {
    demoLoadStore.getState().begin("parsing");
    const { createDemoStreamingRecording } = await import("./demoStreaming");
    if (parseToken !== token) return false;
    const recording = await createDemoStreamingRecording(buffer);
    if (parseToken !== token) return false;
    if (localCheckpoints)
      await installCheckpoints(buffer, recording, localCheckpoints, token);
    if (parseToken !== token) return false;
    installRecording(recording, source, buffer);
    if (!localCheckpoints)
      void installCheckpoints(buffer, recording, source?.checkpoints, token);

    // Retain the buffer for the auto-director's lazy scan pass.
    setDirectorDemoBuffer(buffer);

    startTimelineScan(buffer, recording);
    return true;
  } catch (err) {
    log.error("Failed to load demo: %o", err);
    if (parseToken === token) {
      demoLoadStore.getState().fail("Couldn't parse the demo");
    }
    return false;
  }
}

async function installCheckpoints(
  buffer: ArrayBuffer,
  recording: StreamRecording,
  pending: Promise<string | null> | undefined,
  token: number,
): Promise<void> {
  if (!pending || !recording.streamingPlayback?.importCheckpoints) return;
  try {
    const text = await pending;
    if (!text || parseToken !== token) return;
    const checkpoints = await readDemoCheckpoints(text, buffer);
    if (parseToken !== token) return;
    recording.streamingPlayback.importCheckpoints(checkpoints);
    log.info("Loaded %d precomputed seek checkpoints", checkpoints.length);
  } catch (error) {
    if (parseToken === token)
      log.warn("Ignoring unusable seek checkpoints: %o", error);
  }
}

/** Kick off the background timeline scan over the complete demo bytes. */
function startTimelineScan(
  buffer: ArrayBuffer,
  recording: StreamRecording,
): void {
  scanAbort?.abort();
  const abortController = new AbortController();
  scanAbort = abortController;
  const isCurrentScan = () =>
    !abortController.signal.aborted &&
    engineStore.getState().playback.recording === recording;
  const store = demoTimelineStore.getState();
  store.reset();
  store.setScanProgress(0);
  import("./demoTimelineScanner")
    .then(({ scanDemoTimeline }) =>
      isCurrentScan()
        ? scanDemoTimeline(
            buffer,
            recording.recorderName,
            (p) => {
              if (!isCurrentScan()) return;
              demoTimelineStore.getState().setScanProgress(p);
            },
            abortController.signal,
          )
        : null,
    )
    .then((result) => {
      if (!result || !isCurrentScan()) return;
      const s = demoTimelineStore.getState();
      s.setEvents(result.events, result.observerPerspective, result.killEvents);
      s.setScanProgress(null);
    })
    .catch((err: unknown) => {
      if (!isCurrentScan()) return;
      if (err instanceof Error && err.name === "AbortError") return;
      log.error("Timeline scan failed: %o", err);
      demoTimelineStore
        .getState()
        .setError(err instanceof Error ? err.message : String(err));
    });
}
