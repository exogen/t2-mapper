import type { ClipTake } from "../../relay/clipTypes";
import { createLogger } from "../logger";
import { RETAIL_PLAYER_INTERPOLATION } from "./playerInterpolation";
import { clipStore, seekClipSource } from "../state/clipStore";
import { engineStore } from "../state/engineStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { exitDirector } from "../state/demoDirectorStore";
import { publishedDemoFilename } from "../state/editableGame";
import { readDemoCheckpoints } from "./demoCheckpoints";
import type { StreamRecording } from "./types";

let startGeneration = 0;
const log = createLogger("clipPlayback");

/** Restore the cached start before seeking, when available. */
export async function startClipPlayback(
  take: ClipTake,
  recording: StreamRecording,
  signal: AbortSignal,
  checkpointText?: string,
  recoverCheckpoint?: (error: unknown) => Promise<void>,
): Promise<void> {
  const interpolation = take.playerInterpolation ?? RETAIL_PLAYER_INTERPOLATION;
  const generation = ++startGeneration;
  let expectedSeekIntent = engineStore.getState().playback.seekIntentNonce;
  const ensureCurrent = () => {
    signal.throwIfAborted();
    const { playback } = engineStore.getState();
    if (playback.recording !== recording)
      throw new Error("The demo changed while preparing the clip.");
    if (
      generation !== startGeneration ||
      playback.seekIntentNonce !== expectedSeekIntent
    )
      throw new Error("Clip playback was interrupted.");
    if (
      publishedDemoFilename(demoLoadStore.getState().sourceUrl) !==
      take.sourceDemo
    )
      throw new Error("The clip belongs to a different hosted demo.");
  };
  ensureCurrent();
  if (clipStore.getState().draft)
    throw new Error("Save or discard the current clip before playing another.");
  exitDirector();
  clipStore.getState().stopPlayback();
  engineStore.getState().setPlaybackStatus("paused");
  const first = take.samples[0];
  if (!first) throw new Error("The clip has no camera recording.");
  const releaseInterpolation =
    recording.streamingPlayback.holdPlayerInterpolation?.(interpolation);
  let holdingForPlayback = false;
  try {
    if (checkpointText !== undefined) {
      const { demoBuffer, downloadComplete } = engineStore.getState().playback;
      if (!demoBuffer || !downloadComplete)
        throw new Error("Wait for the source demo to finish downloading.");
      try {
        const checkpoints = await readDemoCheckpoints(
          checkpointText,
          demoBuffer,
          signal,
        );
        ensureCurrent();
        if (
          !recording.streamingPlayback.importCheckpoints ||
          !checkpoints.length
        )
          throw new Error("The clip's starting checkpoint is unavailable.");
        recording.streamingPlayback.importCheckpoints(checkpoints);
      } catch (error) {
        ensureCurrent();
        if (!recoverCheckpoint) throw error;
        await recoverCheckpoint(error);
        ensureCurrent();
        log.warn(
          "Seeking %s without the clip checkpoint: %o",
          take.sourceDemo,
          error,
        );
      }
    }
    if (!seekClipSource(first.demoTimeSec))
      throw new Error("Clip playback was canceled.");
    expectedSeekIntent = engineStore.getState().playback.seekIntentNonce;
    await new Promise<void>((resolve, reject) => {
      let unsubscribe = () => {};
      const finish = (error?: unknown) => {
        unsubscribe();
        signal.removeEventListener("abort", aborted);
        if (error) reject(error);
        else resolve();
      };
      const aborted = () => finish(signal.reason);
      const inspect = () => {
        const { playback } = engineStore.getState();
        if (signal.aborted) return finish(signal.reason);
        if (
          playback.recording !== recording ||
          playback.seekIntentNonce !== expectedSeekIntent
        )
          return finish(new Error("Clip playback was interrupted."));
        if (playback.seekFailed)
          return finish(
            new Error("Could not restore the clip's starting view."),
          );
        if (playback.status !== "seeking") finish();
      };
      unsubscribe = engineStore.subscribe(inspect);
      signal.addEventListener("abort", aborted, { once: true });
      inspect();
    });
    ensureCurrent();
    clipStore.getState().play(take);
    const active = clipStore.getState().active;
    if (releaseInterpolation && active) {
      holdingForPlayback = true;
      const unsubscribe = clipStore.subscribe((state) => {
        if (state.active === active) return;
        unsubscribe();
        releaseInterpolation();
      });
    }
  } finally {
    if (!holdingForPlayback) releaseInterpolation?.();
  }
}
