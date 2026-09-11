import type { PlaybackSliceState } from "../state/engineStore";
import { STREAM_TICK_SEC } from "./streamHelpers";
import type { StreamingPlayback } from "./types";

type PlaybackControls = Pick<
  PlaybackSliceState,
  "status" | "rate" | "seekTime" | "seekNonce"
>;

/** Render time advances only after the simulation successfully reaches it. */
export class PlaybackClock {
  time = 0;
  seekNonce = 0;
  private wasSeeking = false;

  reset(time: number, seekNonce: number): void {
    this.time = time;
    this.seekNonce = seekNonce;
    this.wasSeeking = false;
  }

  step(
    stream: Pick<StreamingPlayback, "stepToTime">,
    playback: PlaybackControls,
    delta: number,
  ) {
    const isPlaying = playback.status === "playing";
    const isSeeking = playback.seekNonce !== this.seekNonce;
    // Synchronous seeking (including the next frame's elapsed time) is
    // parsing work, not elapsed playback time.
    const playbackDelta = isSeeking || this.wasSeeking ? 0 : delta;
    const targetTime =
      (isSeeking ? playback.seekTime : this.time) +
      (isPlaying ? playbackDelta * playback.rate : 0);
    const moveTicksNeeded =
      Math.ceil((playbackDelta * playback.rate) / STREAM_TICK_SEC) + 2;

    // Torque interpolates backwards from the end of the current tick.
    // A seek must reconstruct both sides of that tick without a frame budget.
    const seekPrevious = isSeeking ? stream.stepToTime(targetTime) : null;
    const snapshot = stream.stepToTime(
      targetTime + STREAM_TICK_SEC,
      isPlaying && !isSeeking ? moveTicksNeeded : Number.POSITIVE_INFINITY,
    );

    // Never acknowledge a failed seek or leave the clock ahead of its
    // reconstruction: that would turn the next frame into fast catch-up.
    this.time =
      snapshot.exhausted && isPlaying
        ? Math.min(targetTime, snapshot.timeSec)
        : targetTime;
    this.seekNonce = playback.seekNonce;
    this.wasSeeking = isSeeking;
    return { snapshot, seekPrevious, isSeeking, playbackDelta };
  }
}
