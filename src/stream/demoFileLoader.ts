/**
 * Shared .rec demo file loading pipeline (sidebar button + drop screen):
 * parse the recording, swap it into the engine, and kick off the
 * background timeline scan. Module-level token/abort state means a new
 * load or an unload always cancels the previous pipeline.
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

const log = createLogger("demoFileLoader");

let parseToken = 0;
let scanAbort: AbortController | null = null;

/**
 * Eject the current recording: cancel any in-flight load/scan and fully
 * clear the streamed scene, returning demo mode to its drop screen.
 */
export function unloadDemo(): void {
  parseToken += 1;
  scanAbort?.abort();
  scanAbort = null;
  demoLoadStore.getState().reset();
  demoLoadStore.getState().setSourceUrl(null);
  demoLoadStore.getState().setDownloadedSec(null);
  engineStore.getState().setRecording(null);
  demoTimelineStore.getState().reset();
  resetDirector();
  void commentaryTracksStore.getState().load(null);
  gameEntityStore.getState().endStreaming();
  commandCircuitStore.getState().deactivate();
}

export async function loadDemoFile(file: File): Promise<void> {
  // Take our turn number before the (possibly slow) read, so if another
  // load starts while we're reading, that newer one wins — not whichever
  // happens to finish last.
  const token = ++parseToken;
  try {
    const buffer = await file.arrayBuffer();
    if (parseToken !== token) return;
    await loadDemoBuffer(buffer, null);
  } catch (err) {
    log.error("Failed to load demo: %o", err);
    if (parseToken === token) {
      demoLoadStore.getState().fail("Couldn't read the demo file");
    }
  }
}

/**
 * Download an indexed demo and load it exactly like an uploaded file.
 * A newer load or an unload started mid-download wins over this one.
 */
export async function loadDemoUrl(url: string): Promise<void> {
  const token = ++parseToken;
  demoLoadStore.getState().begin("downloading");
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    if (!response.body) {
      // No streaming body (ancient environment): one-shot fallback.
      const buffer = await response.arrayBuffer();
      if (parseToken !== token) return;
      await loadDemoBuffer(buffer, url);
      return;
    }
    const totalBytes = Number(response.headers.get("content-length")) || 0;
    await streamDemoResponse(response.body, url, token, totalBytes);
  } catch (err) {
    log.error("Failed to load demo from %s: %o", url, err);
    if (parseToken === token) {
      demoLoadStore.getState().fail("Couldn't download the demo");
    }
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
 * plays. Forward seeks stay disabled (engineStore clamps them) until
 * the download completes; the timeline scan and the auto-director need
 * the whole file, so they start at completion.
 *
 * Failure model: before the recording installs, any error surfaces as a
 * normal load failure. After install, a mid-download network error
 * degrades to a shorter demo (everything parsed so far stays playable)
 * rather than tearing down a scene the user is already watching.
 */
async function streamDemoResponse(
  body: ReadableStream<Uint8Array>,
  url: string,
  token: number,
  totalBytes: number,
): Promise<void> {
  const reader = body.getReader();
  const [{ DemoParser }, demoStreaming] = await Promise.all([
    import("t2-demo-parser"),
    import("./demoStreaming"),
  ]);
  if (parseToken !== token) {
    void reader.cancel();
    return;
  }
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

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (parseToken !== token) {
        void reader.cancel();
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
          installRecording(recording, url);
          demoTimelineStore.getState().reset();
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
    if (parseToken !== token) return;
    if (!installed) throw err;
    // Mid-download failure after the scene is already up: keep what we
    // have. finish() flushes what the inflator holds; the demo simply
    // ends at the frontier.
    log.warn(
      "download interrupted after install — keeping partial demo: %o",
      err,
    );
    parser?.finish();
    // Fulfill before clearing downloadedSec: a render between the two
    // would show the pending-seek pie at 0% for a frame.
    engineStore.getState().setDownloadComplete(true);
    engineStore.getState().fulfillPendingSeek();
    demoLoadStore.getState().setDownloadedSec(null);
    return;
  }

  if (parseToken !== token) return;
  const buffer = assemble();
  if (!parser || !recording) {
    // Never got a parsable header/initial block from the stream (or the
    // demo is tiny): parse the assembled whole the classic way.
    await loadDemoBuffer(buffer, url);
    return;
  }
  parser.finish();
  if (!installed) {
    // Download finished before a renderable scene appeared (odd but
    // possible): install now — everything is parsed and playable.
    installRecording(recording, url);
  }
  engineStore.getState().setDownloadComplete(true);
  engineStore.getState().fulfillPendingSeek();
  demoLoadStore.getState().setDownloadedSec(null);
  // The whole-file consumers unlock now: the auto-director's scan buffer
  // and the timeline scan.
  setDirectorDemoBuffer(buffer);
  startTimelineScan(buffer, recording.recorderName, token);
}

/**
 * Swap a ready-to-play recording into the engine. Shared by the one-shot
 * (full buffer) and progressive (mid-download) paths; ordering matters —
 * the source is set atomically with the recording so readers never
 * observe a loaded demo with a stale/transient source.
 */
function installRecording(
  recording: StreamRecording,
  sourceUrl: string | null,
): void {
  demoLoadStore.getState().reset();
  // Leave any live session and close the relay socket before loading
  // the demo — demo playback has no use for it.
  const liveState = liveConnectionStore.getState();
  liveState.leaveServer();
  liveState.disconnectRelay();
  engineStore.getState().setRecording(recording);
  demoLoadStore.getState().setSourceUrl(sourceUrl);
  // Which commentary tracks this demo has, from its record sidecar.
  void commentaryTracksStore.getState().load(sourceUrl);
  resetDirector();
}

/**
 * Resolves true once the recording is live; false if it failed or a
 * newer load replaced it first.
 */
async function loadDemoBuffer(
  buffer: ArrayBuffer,
  sourceUrl: string | null = null,
): Promise<boolean> {
  const token = ++parseToken;
  try {
    demoLoadStore.getState().begin("parsing");
    const { createDemoStreamingRecording } = await import("./demoStreaming");
    const recording = await createDemoStreamingRecording(buffer);
    if (parseToken !== token) return false;
    installRecording(recording, sourceUrl);

    // Retain the buffer for the auto-director's lazy scan pass.
    setDirectorDemoBuffer(buffer);

    startTimelineScan(buffer, recording.recorderName, token);
    return true;
  } catch (err) {
    log.error("Failed to load demo: %o", err);
    if (parseToken === token) {
      demoLoadStore.getState().fail("Couldn't parse the demo");
    }
    return false;
  }
}

/** Kick off the background timeline scan over the complete demo bytes. */
function startTimelineScan(
  buffer: ArrayBuffer,
  recorderName: string | null,
  token: number,
): void {
  scanAbort?.abort();
  const abortController = new AbortController();
  scanAbort = abortController;
  const store = demoTimelineStore.getState();
  store.reset();
  store.setScanProgress(0);
  import("./demoTimelineScanner")
    .then(({ scanDemoTimeline }) =>
      scanDemoTimeline(
        buffer,
        recorderName,
        (p) => {
          if (parseToken !== token) return;
          demoTimelineStore.getState().setScanProgress(p);
        },
        abortController.signal,
      ),
    )
    .then((result) => {
      if (parseToken !== token) return;
      const s = demoTimelineStore.getState();
      s.setEvents(result.events, result.observerPerspective, result.killEvents);
      s.setScanProgress(null);
    })
    .catch((err: unknown) => {
      if (parseToken !== token) return;
      if (err instanceof Error && err.name === "AbortError") return;
      log.error("Timeline scan failed: %o", err);
      demoTimelineStore.getState().setScanProgress(null);
    });
}
