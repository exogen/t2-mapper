/**
 * Shared .rec demo file loading pipeline (sidebar button + drop screen):
 * parse the recording, swap it into the engine, and kick off the
 * background timeline scan. Module-level token/abort state means a new
 * load or an unload always cancels the previous pipeline.
 */
import { createLogger } from "../logger";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { demoTimelineStore } from "../state/demoTimelineStore";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";

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
  engineStore.getState().setRecording(null);
  demoTimelineStore.getState().reset();
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
    const buffer = await readWithProgress(response, token);
    if (parseToken !== token) return;
    // The URL is recorded as the source only on the success path inside
    // loadDemoBuffer (atomically with the recording), so a failed parse
    // never leaves a dangling download link.
    await loadDemoBuffer(buffer, url);
  } catch (err) {
    log.error("Failed to load demo from %s: %o", url, err);
    if (parseToken === token) {
      demoLoadStore.getState().fail("Couldn't download the demo");
    }
  }
}

/**
 * Buffer the response body, reporting download progress when the
 * content length is known. If a newer load started meanwhile, stop
 * reading and return an empty buffer (the caller's check discards it).
 */
async function readWithProgress(
  response: Response,
  token: number,
): Promise<ArrayBuffer> {
  const total = Number(response.headers.get("content-length")) || 0;
  const body = response.body;
  if (!body) return response.arrayBuffer();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let reportedPercent = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (parseToken !== token) {
      void reader.cancel();
      return new ArrayBuffer(0);
    }
    chunks.push(value);
    received += value.length;
    // Chunks can be ~16KB; only publish whole-percent steps so a large
    // demo doesn't drive thousands of store updates and re-renders.
    if (total > 0) {
      const percent = Math.min(100, Math.floor((received / total) * 100));
      if (percent !== reportedPercent) {
        reportedPercent = percent;
        demoLoadStore.getState().setProgress(percent / 100);
      }
    }
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }
  return buffer.buffer;
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
    demoLoadStore.getState().reset();

    // Leave any live session and close the relay socket before loading
    // the demo — demo playback has no use for it.
    const liveState = liveConnectionStore.getState();
    liveState.leaveServer();
    liveState.disconnectRelay();
    // Metadata-first: mission/game-mode sync happens immediately. Set the
    // source atomically with the recording so readers never observe a
    // loaded demo with a stale/transient source (a null here means a
    // local upload; a URL means an indexed demo).
    engineStore.getState().setRecording(recording);
    demoLoadStore.getState().setSourceUrl(sourceUrl);

    // Kick off background timeline scan.
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
          recording.recorderName,
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
        s.setEvents(result.events, result.observerPerspective);
        s.setScanProgress(null);
      })
      .catch((err: unknown) => {
        if (parseToken !== token) return;
        if (err instanceof Error && err.name === "AbortError") return;
        log.error("Timeline scan failed: %o", err);
        demoTimelineStore.getState().setScanProgress(null);
      });
    return true;
  } catch (err) {
    log.error("Failed to load demo: %o", err);
    if (parseToken === token) {
      demoLoadStore.getState().fail("Couldn't parse the demo");
    }
    return false;
  }
}
