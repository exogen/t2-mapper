/**
 * Shared .rec demo file loading pipeline (sidebar button + drop screen):
 * parse the recording, swap it into the engine, and kick off the
 * background timeline scan. Module-level token/abort state means a new
 * load or an unload always cancels the previous pipeline.
 */
import { createLogger } from "../logger";
import { commandCircuitStore } from "../state/commandCircuitStore";
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
  engineStore.getState().setRecording(null);
  demoTimelineStore.getState().reset();
  gameEntityStore.getState().endStreaming();
  commandCircuitStore.getState().deactivate();
}

export async function loadDemoFile(file: File): Promise<void> {
  try {
    const buffer = await file.arrayBuffer();
    const token = ++parseToken;
    const { createDemoStreamingRecording } = await import("./demoStreaming");
    const recording = await createDemoStreamingRecording(buffer);
    if (parseToken !== token) return;

    // Leave any live session and close the relay socket before loading
    // the demo — demo playback has no use for it.
    const liveState = liveConnectionStore.getState();
    liveState.leaveServer();
    liveState.disconnectRelay();
    // Metadata-first: mission/game-mode sync happens immediately.
    engineStore.getState().setRecording(recording);

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
      .then((events) => {
        if (parseToken !== token) return;
        const s = demoTimelineStore.getState();
        s.setEvents(events);
        s.setScanProgress(null);
      })
      .catch((err: unknown) => {
        if (parseToken !== token) return;
        if (err instanceof Error && err.name === "AbortError") return;
        log.error("Timeline scan failed: %o", err);
        demoTimelineStore.getState().setScanProgress(null);
      });
  } catch (err) {
    log.error("Failed to load demo: %o", err);
  }
}
