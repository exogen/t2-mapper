import type { ClipTake } from "../../relay/clipTypes";
import { createLogger } from "../logger";
import { RETAIL_PLAYER_INTERPOLATION } from "./playerInterpolation";
import { clipStore, seekClipSource } from "../state/clipStore";
import { engineStore } from "../state/engineStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { exitDirector } from "../state/demoDirectorStore";
import { publishedDemoFilename } from "../state/editableGame";
import { readDemoCheckpoints } from "./demoCheckpoints";
import { streamTimeToTick } from "./streamHelpers";
import type { StreamRecording } from "./types";

let startGeneration = 0;
const log = createLogger("clipPlayback");
const CLIP_CHECKPOINT_DECODE_TIMEOUT_MS = 60_000;
const CLIP_SEEK_STALL_TIMEOUT_MS = 60_000;

interface ClipPlaybackCheckpoint {
  text: string;
  sourceSha256?: string;
  recover?: (error: unknown) => Promise<void>;
}

/** Restore the cached start before seeking, when available. */
export async function startClipPlayback(
  take: ClipTake,
  recording: StreamRecording,
  signal: AbortSignal,
  checkpoint?: ClipPlaybackCheckpoint,
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
    if (checkpoint) {
      const { text, sourceSha256, recover } = checkpoint;
      const { demoBuffer, downloadStatus } = engineStore.getState().playback;
      if (!demoBuffer || downloadStatus !== "complete")
        throw new Error("Wait for the source demo to finish downloading.");
      try {
        const checkpoints = await readDemoCheckpoints(
          text,
          { demoBytes: demoBuffer.byteLength, demoSha256: sourceSha256 },
          AbortSignal.any([
            signal,
            AbortSignal.timeout(CLIP_CHECKPOINT_DECODE_TIMEOUT_MS),
          ]),
        );
        ensureCurrent();
        if (
          !recording.streamingPlayback.importCheckpoints ||
          checkpoints.length !== 1 ||
          checkpoints[0].cursor.moveTicks !==
            streamTimeToTick(first.demoTimeSec)
        )
          throw new Error("The clip's starting checkpoint is unavailable.");
        recording.streamingPlayback.importCheckpoints(
          checkpoints,
          recover &&
            ((error) => {
              void recover(error).catch((reportError) =>
                log.warn(
                  "Could not report checkpoint restore failure: %o",
                  reportError,
                ),
              );
            }),
        );
      } catch (error) {
        ensureCurrent();
        if (!recover) throw error;
        await recover(error);
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
      let lastProgressSec: number | undefined;
      let lastProgressAt = performance.now();
      const finish = (error?: unknown) => {
        clearTimeout(stallTimer);
        unsubscribe();
        signal.removeEventListener("abort", aborted);
        if (error) reject(error);
        else resolve();
      };
      const aborted = () => finish(signal.reason);
      // A cold seek may need to replay the recording from the beginning.
      const checkForStall = () => {
        const remaining =
          CLIP_SEEK_STALL_TIMEOUT_MS - (performance.now() - lastProgressAt);
        if (remaining > 0) stallTimer = setTimeout(checkForStall, remaining);
        else finish(new Error("The clip's starting seek stopped progressing."));
      };
      let stallTimer = setTimeout(checkForStall, CLIP_SEEK_STALL_TIMEOUT_MS);
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
        if (playback.status !== "seeking") return finish();
        const timeSec = playback.seekProgress?.currentTimeSec;
        if (timeSec !== undefined && timeSec !== lastProgressSec) {
          lastProgressSec = timeSec;
          lastProgressAt = performance.now();
        }
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
