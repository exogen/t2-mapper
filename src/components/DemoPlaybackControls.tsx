import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import { clipStore } from "../state/clipStore";
import { clipDurationMs } from "../../relay/clipTypes";
import { clipJumpTransitionEnd } from "../stream/clipJumpTransitions";
import { ClipPlaybackControls } from "./ClipControls";
import { ClipTrimTimeline } from "./ClipTrimTimeline";
import { useClipDraftSaving } from "./clipControlsContext";
import { isPlaybackControl } from "../keyboard";
import { Select } from "./Select";
import { useInputAction } from "./InputControls";
import { useNavigationQueryState } from "./useQueryParams";
import {
  usePlaybackActions,
  useCurrentTime,
  useDuration,
  useIsPlaying,
  useIsSeeking,
  useRecording,
  SPEED_OPTIONS,
} from "./usePlayback";
import { GrPauseFill, GrPlayFill } from "react-icons/gr";
import { RiMovieAiLine } from "react-icons/ri";
import {
  exitDirector,
  startDirector,
  useDirector,
} from "../state/demoDirectorStore";
import { isCurrentPlayback, useEngineSelector } from "../state/engineStore";
import { useDemoLoad } from "../state/demoLoadStore";
import {
  type TimelineEvent,
  useDemoTimeline,
} from "../state/demoTimelineStore";
import { formatPlayheadTime, formatPlayheadTimeAligned } from "./demoFormat";
import { LoadingIndicator } from "./LoadingIndicator";
import { useSettings } from "./SettingsProvider";
import { timelineFlagColor } from "./demoTimelineColors";
import { DEFAULT_TEAM_NAMES } from "../stringUtils";
import { PlaybackSeekBar } from "./PlaybackSeekBar";
import {
  TimelineMarkerButton,
  TimelineMarkerLayer,
} from "./TimelineMarkerButton";
import playbackStyles from "./PlaybackControls.module.css";
import styles from "./DemoPlaybackControls.module.css";

/**
 * iOS-app-download-style progress: a ring with a pie wedge filling
 * clockwise from 12 o'clock. The wedge is a stroked circle of half the
 * radius with a dash length proportional to progress.
 */
function ScanProgressPie({ progress }: { progress: number }) {
  const clamped = Math.max(0, Math.min(1, progress));
  // Pie trick: a circle of radius 5 with stroke-width 10 fills the
  // full 10-radius disc; the dash arc length maps to the fraction.
  const pieCircumference = 2 * Math.PI * 5;
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="12"
        cy="12"
        r="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="10"
        strokeDasharray={`${clamped * pieCircumference} ${pieCircumference}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

export function DemoPlaybackControls() {
  const [route] = useNavigationQueryState();
  const recording = useRecording();
  const sourceIsPlaying = useIsPlaying();
  const recordingClip = useStore(clipStore, (state) => state.recording);
  const playPauseButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (recordingClip) playPauseButton.current?.focus({ preventScroll: true });
  }, [recordingClip]);
  const activeClip = useStore(clipStore, (state) => state.active);
  const draft = useStore(clipStore, (state) => state.draft);
  const clipJumps = useMemo(
    () =>
      draft?.samples.flatMap(({ timeMs, jump }, index, samples) =>
        jump
          ? [
              {
                timeMs,
                jump,
                transitionEndMs: clipJumpTransitionEnd(samples, index),
              },
            ]
          : [],
      ) ?? [],
    [draft],
  );
  const jumpTransitions = useStore(clipStore, (state) => state.jumpTransitions);
  const trimStartMs = useStore(clipStore, (state) => state.trimStartMs);
  const trimEndMs = useStore(clipStore, (state) => state.trimEndMs);
  const clipHeadMs = useStore(clipStore, (state) =>
    state.active ? state.playheadMs : 0,
  );
  const clipPlaying = useStore(clipStore, (state) => state.playing);
  const savingClip = useClipDraftSaving();
  const isPlaying = activeClip ? clipPlaying : sourceIsPlaying;
  const isSeeking = useIsSeeking();
  const currentTime = useCurrentTime();
  const duration = useDuration();
  // Demo time downloaded so far (progressive load), or null when the
  // whole file is local — drives the buffered bar under the seek track.
  const downloadedSec = useDemoLoad((s) => s.downloadedSec);
  const speed = useEngineSelector((state) =>
    activeClip ? 1 : state.playback.rate,
  );
  const intendsToPlay = useEngineSelector(
    (state) =>
      (state.playback.resumeAfterSeek ?? state.playback.status) === "playing",
  );
  const { toggle: toggleSource, seek, setSpeed } = usePlaybackActions();
  const toggle = useCallback(() => {
    const clip = clipStore.getState();
    if (clip.draft) {
      if (!savingClip) {
        if (clip.playing) clip.pause();
        else clip.resume();
      }
      return;
    }
    if (!clip.active) return toggleSource();
    if (clip.playing) return clip.pause();
    clip.resume();
  }, [toggleSource, savingClip]);

  // Spacebar toggles play/pause during demo playback.
  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.code !== "Space" ||
        isPlaybackControl(e.target)
      ) {
        return;
      }
      e.preventDefault();
      if (!e.repeat) toggle();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [recording, toggle]);

  useInputAction("decreasePlaybackSpeed", () => {
    if (clipStore.getState().active) return;
    const idx = SPEED_OPTIONS.indexOf(speed);
    if (idx > 0) setSpeed(SPEED_OPTIONS[idx - 1]);
  });

  useInputAction("increasePlaybackSpeed", () => {
    if (clipStore.getState().active) return;
    const idx = SPEED_OPTIONS.indexOf(speed);
    if (idx < SPEED_OPTIONS.length - 1) setSpeed(SPEED_OPTIONS[idx + 1]);
  });

  // Deferred-commit scrubbing: while dragging, only this local ghost
  // value moves (instant — no engine work); the real seek runs once on
  // release. Per-pointermove seeks would reconstruct the world dozens of times
  // per drag.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragging = dragValue != null;

  const scrubRecording = useRef<typeof recording>(null);
  useEffect(() => {
    scrubRecording.current = null;
    setDragValue(null);
  }, [recording, activeClip]);

  // If the drag ends without a commit (pointercancel, window losing
  // focus mid-drag), cancel the scrub instead of freezing the ghost.
  useEffect(() => {
    if (!dragging) return;
    const cancel = () => {
      scrubRecording.current = null;
      setDragValue(null);
    };
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [dragging]);

  // The ghost may roam the whole timeline: a release beyond the
  // downloaded frontier becomes a PENDING seek in the store (executed
  // by the loader when the buffer reaches it). Keep the thumb at that target.
  const downloadComplete = useEngineSelector(
    (state) => state.playback.downloadComplete,
  );
  const pendingSeekSec = useEngineSelector(
    (state) => state.playback.pendingSeekSec,
  );
  const replay = useEngineSelector((state) => state.playback.seekProgress);

  const beginScrub = () => {
    scrubRecording.current = recording;
  };
  const handleSeekChange = useCallback(
    (time: number) => {
      if (
        !recording ||
        scrubRecording.current !== recording ||
        !isCurrentPlayback(recording)
      )
        return;
      setDragValue(time);
    },
    [recording],
  );

  const handleSeekCommit = useCallback(
    (time: number) => {
      if (recording && scrubRecording.current === recording) {
        if (clipStore.getState().active) clipStore.getState().seek(time * 1000);
        else seek(time);
      }
      scrubRecording.current = null;
      setDragValue(null);
    },
    [recording, seek],
  );

  // CastGenius needs the whole demo (its scan buffer arrives at
  // download completion) — a press while downloading queues the start
  // and the button shows download progress until then. Press again to
  // cancel the queue.
  const [queuedRecording, setQueuedRecording] =
    useState<typeof recording>(null);
  const directorQueued = recording != null && queuedRecording === recording;
  useEffect(() => {
    setQueuedRecording(null);
  }, [recording, activeClip, route.clip]);
  useEffect(() => {
    if (
      directorQueued &&
      !activeClip &&
      !route.clip &&
      downloadComplete &&
      !isSeeking &&
      isCurrentPlayback(recording!)
    ) {
      setQueuedRecording(null);
      void startDirector();
    }
  }, [
    directorQueued,
    downloadComplete,
    isSeeking,
    recording,
    activeClip,
    route.clip,
  ]);

  const handleSpeedChange = useCallback(
    (value: string) => {
      setSpeed(parseFloat(value));
    },
    [setSpeed],
  );

  // Timeline match starts and captures ride above the seek track, with
  // match descriptions or the scoring team/capper, plus each timestamp.
  const timelineEvents = useDemoTimeline((s) => s.events);
  const { observerTeamColors } = useSettings();
  const seekMarkers = useMemo(
    () =>
      (timelineEvents ?? [])
        .filter(
          (
            event,
          ): event is TimelineEvent & { type: "match-start" | "flag-cap" } =>
            event.type === "match-start" || event.type === "flag-cap",
        )
        .map((event) => {
          if (event.type !== "flag-cap") return event;
          const teamName =
            event.actorTeamName ??
            DEFAULT_TEAM_NAMES[event.actorTeamId ?? 0] ??
            "Team";
          const capper =
            event.capturer && event.capturer !== "0"
              ? ` (${event.capturer})`
              : "";
          return { ...event, description: `${teamName} scores${capper}` };
        }),
    [timelineEvents],
  );

  const directorStatus = useDirector((s) => s.status);
  const directorProgress = useDirector((s) => s.scanProgress);
  const directorError = useDirector((s) => s.error);

  if (!recording || !Number.isFinite(recording.duration)) return null;

  const directorTitle = directorQueued
    ? "Waiting for the download – CastGenius starts when it finishes (click to cancel)"
    : directorStatus === "playing"
      ? "Exit CastGenius (F or Esc)"
      : directorStatus === "scanning"
        ? "Analyzing demo…"
        : directorStatus === "error"
          ? (directorError ?? "CastGenius unavailable")
          : "CastGenius: Sit back and let the camera follow the action";

  // Waiting for the download to reach a requested seek time: show a
  // progress pie toward the target on the play button.
  const pendingSeekProgress =
    pendingSeekSec != null && pendingSeekSec > 0
      ? Math.min(1, (downloadedSec ?? 0) / pendingSeekSec)
      : null;
  const replayProgress = replay
    ? Math.max(
        0,
        Math.min(
          1,
          replay.targetTimeSec > replay.startTimeSec
            ? (replay.currentTimeSec - replay.startTimeSec) /
                (replay.targetTimeSec - replay.startTimeSec)
            : 1,
        ),
      )
    : null;
  const progress = pendingSeekProgress ?? replayProgress;
  const replayTime =
    pendingSeekSec != null
      ? (downloadedSec ?? 0)
      : (replay?.currentTimeSec ?? 0);

  if (draft) {
    const selectedDuration = (trimEndMs - trimStartMs) / 1000;
    const selectedTime = Math.max(
      0,
      Math.min(selectedDuration, (clipHeadMs - trimStartMs) / 1000),
    );
    return (
      <div
        className={`${playbackStyles.Root} ${styles.ClipEditor}`}
        data-clip-editing=""
      >
        <button
          type="button"
          className={`${playbackStyles.PlayPause} ${styles.ClipPlay}`}
          onClick={toggle}
          disabled={savingClip}
          aria-label={clipPlaying ? "Pause clip" : "Play clip"}
          title={clipPlaying ? "Pause clip (Space)" : "Play clip (Space)"}
        >
          {isSeeking ? (
            <span className={playbackStyles.PlaySpinner}>
              <LoadingIndicator isLoading inline />
            </span>
          ) : clipPlaying ? (
            <GrPauseFill />
          ) : (
            <GrPlayFill />
          )}
        </button>
        <span className={`${playbackStyles.Time} ${styles.ClipTime}`}>
          {formatPlayheadTimeAligned(selectedTime, selectedDuration)}
          {` / ${formatPlayheadTime(selectedDuration)}`}
        </span>
        <div className={styles.ClipTimeline}>
          <ClipTrimTimeline
            durationMs={clipDurationMs(draft)}
            startMs={trimStartMs}
            endMs={trimEndMs}
            playheadMs={clipHeadMs}
            jumps={clipJumps}
            jumpTransitions={jumpTransitions}
            disabled={savingClip}
            onPause={() => clipStore.getState().pause()}
            onTrim={(start, end) =>
              clipStore.getState().setTrimRange(start, end)
            }
            onSeek={(time) => clipStore.getState().seek(time)}
            onToggleJump={(time) =>
              clipStore.getState().toggleJumpTransition(time)
            }
          />
        </div>
      </div>
    );
  }

  if (activeClip) {
    const duration = clipDurationMs(activeClip) / 1000;
    const ended = clipHeadMs >= clipDurationMs(activeClip);
    const label = clipPlaying
      ? "Pause clip"
      : ended
        ? "Replay clip"
        : "Play clip";
    return (
      <div className={playbackStyles.Root} data-clip-playing>
        <button
          type="button"
          className={playbackStyles.PlayPause}
          onClick={toggle}
          aria-label={label}
          title={`${label} (Space)`}
        >
          {isSeeking ? (
            <LoadingIndicator isLoading inline />
          ) : clipPlaying ? (
            <GrPauseFill />
          ) : (
            <GrPlayFill />
          )}
        </button>
        <span className={playbackStyles.Time}>
          {formatPlayheadTimeAligned(clipHeadMs / 1000, duration)}
          {` / ${formatPlayheadTime(duration)}`}
        </span>
        <PlaybackSeekBar
          currentTime={clipHeadMs / 1000}
          duration={duration}
          dragValue={dragValue}
          onBeginScrub={beginScrub}
          onValueChange={handleSeekChange}
          onValueCommit={handleSeekCommit}
          seeking={isSeeking}
        />
        <ClipPlaybackControls />
      </div>
    );
  }

  return (
    <div className={playbackStyles.Root}>
      <button
        ref={playPauseButton}
        className={playbackStyles.PlayPause}
        onClick={toggle}
        aria-label={
          isSeeking
            ? intendsToPlay
              ? "Pause after seeking"
              : "Play after seeking"
            : isPlaying
              ? "Pause"
              : "Play"
        }
        title={
          pendingSeekProgress != null
            ? `Downloading to ${formatPlayheadTime(pendingSeekSec!)}…`
            : isSeeking
              ? `Seeking to ${formatPlayheadTime(currentTime)}… (${intendsToPlay ? "pause" : "play"} afterwards: Space)`
              : isPlaying
                ? "Pause (Space)"
                : "Play (Space)"
        }
        autoFocus
      >
        {pendingSeekProgress != null ? (
          <ScanProgressPie progress={pendingSeekProgress} />
        ) : isSeeking ? (
          <span className={playbackStyles.PlaySpinner}>
            <LoadingIndicator isLoading inline />
          </span>
        ) : isPlaying ? (
          <GrPauseFill />
        ) : (
          <GrPlayFill />
        )}
      </button>
      <button
        className={styles.Director}
        data-active={directorStatus === "playing"}
        disabled={
          !!route.clip ||
          directorStatus === "scanning" ||
          directorStatus === "error" ||
          (isSeeking && directorStatus !== "playing")
        }
        onClick={() => {
          if (directorStatus === "playing") {
            exitDirector();
          } else if (!downloadComplete) {
            setQueuedRecording((queued) =>
              queued === recording ? null : recording,
            );
          } else {
            void startDirector();
          }
        }}
        aria-label="CastGenius"
        title={directorTitle}
      >
        {directorQueued && duration > 0 ? (
          <ScanProgressPie progress={(downloadedSec ?? 0) / duration} />
        ) : directorStatus === "scanning" && directorProgress != null ? (
          <ScanProgressPie progress={directorProgress} />
        ) : (
          <RiMovieAiLine />
        )}
      </button>
      <span className={playbackStyles.Time}>
        {formatPlayheadTimeAligned(currentTime, duration)}
        <span className={playbackStyles.TotalTime}>
          {` / ${formatPlayheadTime(duration)}`}
        </span>
      </span>
      <PlaybackSeekBar
        currentTime={currentTime}
        duration={duration}
        dragValue={dragValue}
        onBeginScrub={beginScrub}
        onValueChange={handleSeekChange}
        onValueCommit={handleSeekCommit}
        seeking={isSeeking}
        bufferedTime={downloadComplete ? duration : (downloadedSec ?? 0)}
        progress={{
          time: replayTime,
          ratio: progress,
          label:
            pendingSeekSec != null
              ? "Downloading demo"
              : "Replaying demo ticks",
        }}
      >
        {/* Timeline markers sit ABOVE the track (they'd be clipped by
            its overflow: hidden), and AFTER the thumb in the DOM so the
            playhead comes first in the tab order. */}
        {seekMarkers.length > 0 && duration > 0 && (
          <TimelineMarkerLayer>
            {seekMarkers.map((event, i) => (
              <TimelineMarkerButton
                key={`${event.type}-${event.timeSec}-${i}`}
                kind={event.type}
                position={event.timeSec / duration}
                color={timelineFlagColor(event, observerTeamColors)}
                title={`${event.description} – ${formatPlayheadTime(event.timeSec)}`}
                aria-label={`Seek to ${event.description} – ${formatPlayheadTime(event.timeSec)}`}
                onActivate={() => {
                  scrubRecording.current = null;
                  // Match timeline clicks with a three-second lead-in.
                  seek(Math.max(0, event.timeSec - 3));
                }}
              />
            ))}
          </TimelineMarkerLayer>
        )}
      </PlaybackSeekBar>
      <div
        className={styles.Field}
        title="Playback speed (< slows down, > speeds up)"
      >
        <label id="playbackSpeed-label" htmlFor="playbackSpeed">
          Speed
        </label>
        <Select
          id="playbackSpeed"
          aria-labelledby="playbackSpeed-label"
          className={styles.Speed}
          value={String(speed)}
          onChange={handleSpeedChange}
          title="Playback speed (< slows down, > speeds up)"
          options={SPEED_OPTIONS.map((s) => ({
            value: String(s),
            label: `${s}×`,
          }))}
        />
      </div>
    </div>
  );
}
