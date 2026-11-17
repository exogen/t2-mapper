import type { ClipTake } from "../../relay/clipTypes";
import { clipStore, seekClipSource } from "../state/clipStore";
import { engineStore } from "../state/engineStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { exitDirector } from "../state/demoDirectorStore";
import { publishedDemoFilename } from "../state/editableGame";
import { readDemoCheckpoints } from "./demoCheckpoints";
import type { StreamRecording } from "./types";

let startGeneration = 0;

/** Restore before seeking so the clip never replays the recording's long prefix. */
export async function startClipPlayback(
  take: ClipTake,
  recording: StreamRecording,
  signal: AbortSignal,
  checkpointText?: string,
): Promise<void> {
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
  if (checkpointText !== undefined) {
    const buffer = engineStore.getState().playback.demoBuffer;
    if (!buffer || !engineStore.getState().playback.downloadComplete)
      throw new Error("Wait for the source demo to finish downloading.");
    const checkpoints = await readDemoCheckpoints(
      checkpointText,
      buffer,
      signal,
    );
    ensureCurrent();
    if (!recording.streamingPlayback.importCheckpoints || !checkpoints.length)
      throw new Error("The clip's starting checkpoint is unavailable.");
    recording.streamingPlayback.importCheckpoints(checkpoints);
  }
  ensureCurrent();
  const first = take.samples[0];
  if (!first) throw new Error("The clip has no camera recording.");
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
      if (playback.status !== "seeking") finish();
    };
    unsubscribe = engineStore.subscribe(inspect);
    signal.addEventListener("abort", aborted, { once: true });
    inspect();
  });
  ensureCurrent();
  clipStore.getState().play(take);
}
