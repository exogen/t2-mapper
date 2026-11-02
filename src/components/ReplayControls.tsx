import { useCallback, useEffect, useRef, useState } from "react";
import { GrPauseFill, GrPlayFill } from "react-icons/gr";
import {
  replayConnectionStore,
  useReplaySelector,
} from "../state/replayConnectionStore";
import { streamClock } from "../state/streamPlaybackStore";
import { STREAM_TICK_SEC } from "../stream/streamHelpers";
import { useCurrentTime } from "./usePlayback";
import { useAppNavigation } from "./useAppNavigation";
import { formatPlayheadTime, formatPlayheadTimeAligned } from "./demoFormat";
import { PlaybackSeekBar } from "./PlaybackSeekBar";
import playbackStyles from "./PlaybackControls.module.css";
import { LoadingIndicator } from "./LoadingIndicator";
import styles from "./ReplayControls.module.css";

/** Loading and error state for a session started from a demo or invitation. */
export function ReplaySessionStatus() {
  const navigation = useAppNavigation();
  const connecting = useReplaySelector((s) => s.connecting);
  const uploading = useReplaySelector((s) => s.uploading);
  const uploadProgress = useReplaySelector((s) => s.uploadProgress);
  const state = useReplaySelector((s) => s.state);
  const error = useReplaySelector((s) => s.error);
  const waiting = connecting || (state !== null && state.status !== "ended");
  const preparingUpload = uploading && uploadProgress === 1;
  return (
    <section className={styles.Landing} aria-label="Replay session">
      <div className={styles.Card}>
        <h1>
          {uploading
            ? preparingUpload
              ? "Preparing replay…"
              : "Uploading demo…"
            : waiting
              ? "Joining shared replay…"
              : "Replay unavailable"}
        </h1>
        <p>
          {uploading
            ? "This demo is shared only for this session."
            : waiting
              ? state?.status === "seeking"
                ? "Moving to the selected tick…"
                : "Preparing the stream…"
              : "Open a demo to start a new shared replay, or join another session using its invitation link."}
        </p>
        {uploading && (
          <div
            className={styles.UploadProgress}
            role="progressbar"
            aria-label={preparingUpload ? "Preparing replay" : "Demo upload"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              preparingUpload || uploadProgress == null
                ? undefined
                : Math.round(uploadProgress * 100)
            }
          >
            <LoadingIndicator
              inline
              isLoading
              progress={preparingUpload ? null : uploadProgress}
            />
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          type="button"
          className={styles.LandingButton}
          onClick={navigation.demoIndex}
        >
          {waiting ? "Cancel" : "Open a demo"}
        </button>
      </div>
    </section>
  );
}

export function ReplayControls() {
  const state = useReplaySelector((value) => value.state);
  const error = useReplaySelector((value) => value.error);
  const connecting = useReplaySelector((value) => value.connecting);
  const ready = useReplaySelector((value) => value.ready);
  const currentTime = useCurrentTime();
  const [dragValue, setDragValue] = useState<number | null>(null);
  const scrub = useRef<{
    sessionId: string;
    epoch: number;
    revision: number;
  } | null>(null);
  const busy =
    !state?.closed &&
    (connecting ||
      !ready ||
      state?.status === "seeking" ||
      state?.status === "preparing");
  const canControl = !!state?.isOwner && ready && !busy && !state.closed;
  const canPlay = canControl && state.status !== "ended";
  const playing = state?.status === "playing";
  const duration = (state?.durationTicks ?? 0) * STREAM_TICK_SEC;
  const time = Math.max(
    0,
    Math.min(
      duration,
      playing ? currentTime : (state?.tick ?? 0) * STREAM_TICK_SEC,
    ),
  );

  const currentControlState = useCallback(() => {
    const current = replayConnectionStore.getState();
    const latest = current.state;
    if (
      !state ||
      !latest ||
      latest.sessionId !== state.sessionId ||
      latest.epoch !== state.epoch ||
      latest.revision !== state.revision ||
      !latest.isOwner ||
      latest.closed ||
      !current.ready ||
      current.connecting ||
      latest.status === "preparing" ||
      latest.status === "seeking"
    )
      return null;
    return latest;
  }, [state]);

  const toggle = useCallback(() => {
    const latest = currentControlState();
    if (!latest || latest.status === "ended") return;
    replayConnectionStore
      .getState()
      .control(
        latest.status === "playing" ? "pause" : "play",
        latest.status === "playing"
          ? Math.max(
              0,
              Math.min(
                latest.durationTicks,
                Math.round(streamClock.time / STREAM_TICK_SEC),
              ),
            )
          : undefined,
      );
  }, [currentControlState]);

  useEffect(() => {
    scrub.current = null;
    setDragValue(null);
  }, [state?.sessionId, state?.epoch, state?.revision, canControl]);

  const dragging = dragValue !== null;
  useEffect(() => {
    if (!dragging) return;
    const cancel = () => {
      scrub.current = null;
      setDragValue(null);
    };
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [dragging]);

  useEffect(() => {
    if (!canPlay) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.code !== "Space" ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        target?.isContentEditable ||
        target?.closest("input, textarea, select, button")
      )
        return;
      event.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canPlay, toggle]);

  if (!state) return null;
  const playTitle = state.closed
    ? "This replay session has ended"
    : !state.isOwner
      ? "Only the session creator can control playback"
      : busy
        ? "Synchronizing replay…"
        : state.status === "ended"
          ? "Seek backwards to play again"
          : playing
            ? "Pause (Space)"
            : "Play (Space)";

  return (
    <div aria-label="Replay controls" aria-busy={busy}>
      <div className={playbackStyles.Root}>
        <button
          type="button"
          className={playbackStyles.PlayPause}
          disabled={!canPlay}
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          title={playTitle}
        >
          {busy ? (
            <span className={playbackStyles.PlaySpinner}>
              <LoadingIndicator isLoading inline />
            </span>
          ) : playing ? (
            <GrPauseFill />
          ) : (
            <GrPlayFill />
          )}
        </button>
        <span className={playbackStyles.Time}>
          {formatPlayheadTimeAligned(time, duration)}
          <span
            className={playbackStyles.TotalTime}
          >{` / ${formatPlayheadTime(duration)}`}</span>
        </span>
        <PlaybackSeekBar
          currentTime={time}
          duration={duration}
          dragValue={dragValue}
          disabled={!canControl}
          seeking={busy}
          step={STREAM_TICK_SEC}
          onBeginScrub={() => {
            const latest = currentControlState();
            scrub.current = latest
              ? {
                  sessionId: latest.sessionId,
                  epoch: latest.epoch,
                  revision: latest.revision,
                }
              : null;
          }}
          onValueChange={(value) => {
            const latest = currentControlState();
            if (
              latest &&
              scrub.current?.sessionId === latest.sessionId &&
              scrub.current.epoch === latest.epoch &&
              scrub.current.revision === latest.revision
            )
              setDragValue(value);
          }}
          onValueCommit={(value) => {
            const latest = currentControlState();
            if (
              latest &&
              scrub.current?.sessionId === latest.sessionId &&
              scrub.current.epoch === latest.epoch &&
              scrub.current.revision === latest.revision &&
              Number.isFinite(value)
            )
              replayConnectionStore
                .getState()
                .control(
                  "seek",
                  Math.max(
                    0,
                    Math.min(
                      latest.durationTicks,
                      Math.round(value / STREAM_TICK_SEC),
                    ),
                  ),
                );
            scrub.current = null;
            setDragValue(null);
          }}
        />
      </div>
      {error && (
        <div className={styles.Error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
