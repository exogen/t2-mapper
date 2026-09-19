import {
  engineStore,
  isCurrentPlayback,
  type PlaybackSliceState,
} from "../state/engineStore";
import { PlaybackClock } from "./PlaybackClock";
import type { StreamRecording } from "./types";

type PlaybackFrame = NonNullable<ReturnType<PlaybackClock["step"]>>;

/** Step privately, then publish a complete frame before restoring transport. */
export function advancePlaybackFrame(
  recording: StreamRecording,
  clock: PlaybackClock,
  delta: number,
  publish: (frame: PlaybackFrame, playback: PlaybackSliceState) => void,
): void {
  if (!isCurrentPlayback(recording)) return;
  const stream = recording.streamingPlayback;
  const current = engineStore.getState().playback;
  if (clock.failedSeek?.nonce === current.seekNonce) {
    if (current.status !== "playing") return;
    // Play explicitly retries the failed destination, using the same yielding
    // reconstruction path as a new seek rather than ordinary tick playback.
    engineStore.getState().seekPlayback(clock.failedSeek.timeSec);
  }
  if (
    stream.needsReplay &&
    engineStore.getState().playback.seekNonce === clock.seekNonce
  ) {
    engineStore.getState().seekPlayback(clock.time);
  }
  const playback = engineStore.getState().playback;
  if (playback.recording !== recording || playback.pendingSeekSec != null)
    return;
  const nonce = playback.seekNonce;
  const retryTime =
    playback.status === "seeking" ? playback.seekTime : clock.time;
  try {
    const frame = clock.step(stream, playback, delta);
    if (!isCurrentPlayback(recording, nonce)) return;
    if (!frame) {
      if (clock.seekProgress)
        engineStore
          .getState()
          .updateSeekProgress(recording, nonce, clock.seekProgress);
      return;
    }
    publish(frame, playback);
    if (!isCurrentPlayback(recording, nonce)) return;
    const atEnd = frame.snapshot.exhausted && stream.streamComplete !== false;
    if (frame.isSeeking) {
      engineStore
        .getState()
        .completePlaybackSeek(recording, nonce, atEnd ? "paused" : undefined);
    } else if (atEnd && engineStore.getState().playback.status === "playing") {
      engineStore.getState().setPlaybackStatus("paused");
    }
  } catch (error) {
    if (isCurrentPlayback(recording, nonce)) {
      // A failed slice must not retry itself indefinitely on every frame.
      clock.stopAfterError(nonce, retryTime);
      engineStore.getState().completePlaybackSeek(recording, nonce, "paused");
      if (isCurrentPlayback(recording, nonce))
        engineStore.getState().setPlaybackStatus("paused");
    }
    throw error;
  }
}
