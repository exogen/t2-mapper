import type { PlaybackSliceState } from "../state/engineStore";
import { STREAM_TICK_SEC, TICK_DURATION_MS } from "./streamHelpers";
import type { StreamSnapshot, StreamingPlayback } from "./types";

type PlaybackControls = Pick<
  PlaybackSliceState,
  "status" | "rate" | "seekTime" | "seekNonce"
>;

const SEEK_FRAME_BUDGET_MS = 12;

export interface SeekProgress {
  startTimeSec: number;
  currentTimeSec: number;
  targetTimeSec: number;
}

/** Render time advances only after the simulation successfully reaches it. */
export class PlaybackClock {
  time = 0;
  seekNonce = 0;
  seekProgress: SeekProgress | null = null;
  failedSeek: { nonce: number; timeSec: number } | null = null;
  private pendingSeekNonce: number | null = null;
  private wasSeeking = false;
  private currentSnapshot: StreamSnapshot | null = null;
  private previousSnapshot: StreamSnapshot | null = null;

  reset(
    time: number,
    seekNonce: number,
    snapshot: StreamSnapshot | null = null,
  ): void {
    this.time = time;
    this.seekNonce = seekNonce;
    this.wasSeeking = false;
    this.seekProgress = null;
    this.failedSeek = null;
    this.pendingSeekNonce = null;
    this.currentSnapshot = this.previousSnapshot = snapshot;
  }

  /** Preserve the last frame until an explicit transport action retries. */
  stopAfterError(nonce: number, timeSec: number): void {
    this.seekNonce = nonce;
    this.seekProgress = null;
    this.pendingSeekNonce = null;
    this.failedSeek = { nonce, timeSec };
  }

  /** Returns null while a seek is pending; retain the last rendered frame. */
  step(
    stream: Pick<
      StreamingPlayback,
      "stepToTime" | "lastStepStartTimeSec" | "streamComplete"
    >,
    playback: PlaybackControls,
    delta: number,
  ) {
    if (this.failedSeek?.nonce === playback.seekNonce) return null;
    this.failedSeek = null;
    const isPlaying = playback.status === "playing";
    const isSeeking = playback.seekNonce !== this.seekNonce;
    // Seeking (including the next frame's elapsed time) is
    // parsing work, not elapsed playback time.
    const playbackDelta = isSeeking || this.wasSeeking ? 0 : delta;
    const targetTime =
      (isSeeking ? playback.seekTime : this.time) +
      (isPlaying ? playbackDelta * playback.rate : 0);
    const moveTicksNeeded =
      Math.ceil((playbackDelta * playback.rate) / STREAM_TICK_SEC) + 2;

    // Torque interpolates backwards from the end of the current tick.
    // Reconstruct in slices, leaving the published clock/snapshots untouched
    // until both endpoints are ready. Each frame reads the newest seek nonce,
    // so a replacement seek takes over without an asynchronous completion race.
    const seekPrevious = isSeeking
      ? stream.stepToTime(targetTime, Infinity, SEEK_FRAME_BUDGET_MS)
      : null;
    const targetTickTime =
      (Math.floor((Math.max(0, targetTime) * 1000) / TICK_DURATION_MS) *
        TICK_DURATION_MS) /
      1000;
    if (seekPrevious) {
      const sliceStart =
        stream.lastStepStartTimeSec ??
        Math.min(this.time, seekPrevious.timeSec);
      const previous = this.seekProgress;
      this.seekProgress = {
        startTimeSec:
          this.pendingSeekNonce !== playback.seekNonce ||
          !previous ||
          sliceStart < previous.currentTimeSec
            ? sliceStart
            : previous.startTimeSec,
        currentTimeSec: seekPrevious.timeSec,
        targetTimeSec: targetTickTime,
      };
      this.pendingSeekNonce = playback.seekNonce;
    }
    if (
      seekPrevious &&
      seekPrevious.timeSec < targetTickTime &&
      (!seekPrevious.exhausted || stream.streamComplete === false)
    ) {
      return null;
    }
    // Once at the target, only one more tick is needed for interpolation.
    const snapshot = stream.stepToTime(
      targetTime + STREAM_TICK_SEC,
      isPlaying && !isSeeking ? moveTicksNeeded : Number.POSITIVE_INFINITY,
    );
    if (isSeeking && snapshot.exhausted && stream.streamComplete === false) {
      return null;
    }

    // Never acknowledge a failed seek or leave the clock ahead of its
    // reconstruction: that would turn the next frame into fast catch-up.
    this.time =
      snapshot.exhausted && (isPlaying || isSeeking)
        ? Math.min(targetTime, snapshot.timeSec)
        : targetTime;
    this.seekNonce = playback.seekNonce;
    this.wasSeeking = isSeeking;
    this.seekProgress = null;
    this.pendingSeekNonce = null;

    const current = this.currentSnapshot;
    if (seekPrevious) this.previousSnapshot = seekPrevious;
    else if (
      !current ||
      snapshot.timeSec < current.timeSec ||
      snapshot.timeSec - current.timeSec > STREAM_TICK_SEC * 1.5
    ) {
      this.previousSnapshot = snapshot;
    } else if (snapshot.timeSec !== current.timeSec) {
      this.previousSnapshot = current;
    }
    // Packets can change state without a move tick (including MissionEnd
    // at EOF). Accept the replacement without advancing the previous tick.
    this.currentSnapshot = snapshot;
    return {
      snapshot,
      previousSnapshot: this.previousSnapshot ?? snapshot,
      seekPrevious,
      isSeeking,
      playbackDelta,
    };
  }
}
