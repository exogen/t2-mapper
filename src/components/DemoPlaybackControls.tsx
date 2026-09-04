import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";
import { useInputAction } from "./InputControls";
import {
  usePlaybackActions,
  useCurrentTime,
  useDuration,
  useIsPlaying,
  useRecording,
  useSpeed,
  SPEED_OPTIONS,
} from "./usePlayback";
import { GrPauseFill, GrPlayFill } from "react-icons/gr";
import { RiMovieAiLine } from "react-icons/ri";
import {
  exitDirector,
  startDirector,
  useDirector,
} from "../state/demoDirectorStore";
import * as Slider from "@radix-ui/react-slider";
import { useEngineSelector } from "../state/engineStore";
import { useDemoLoad } from "../state/demoLoadStore";
import { useDemoTimeline } from "../state/demoTimelineStore";
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

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * formatTime, but padded to the field width `template` would render at
 * (the demo's duration). The transport label must NEVER change width as
 * the playhead crosses 10 minutes or an hour: the label shares a flex
 * row with the seek bar, so a width change resizes the bar and visibly
 * shifts every percentage-positioned marker on it.
 */
function formatTimeAligned(seconds: number, template: number): string {
  const templateH = Math.floor(template / 3600);
  const s = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  if (templateH > 0) {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(templateH.toString().length, "0");
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    return `${h}:${m}:${s}`;
  }
  const templateM = Math.floor(template / 60);
  const m = Math.floor(seconds / 60)
    .toString()
    .padStart(templateM.toString().length, "0");
  return `${m}:${s}`;
}

export function DemoPlaybackControls() {
  const recording = useRecording();
  const isPlaying = useIsPlaying();
  const currentTime = useCurrentTime();
  const duration = useDuration();
  // Demo time downloaded so far (progressive load), or null when the
  // whole file is local — drives the buffered bar under the seek track.
  const downloadedSec = useDemoLoad((s) => s.downloadedSec);
  const speed = useSpeed();
  const { play, pause, seek, setSpeed } = usePlaybackActions();

  // Spacebar toggles play/pause during demo playback.
  useEffect(() => {
    if (!recording) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.tagName === "BUTTON" ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      if (isPlaying) {
        pause();
      } else {
        play();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [recording, isPlaying, play, pause]);

  useInputAction("decreasePlaybackSpeed", () => {
    const idx = SPEED_OPTIONS.indexOf(speed);
    if (idx > 0) setSpeed(SPEED_OPTIONS[idx - 1]);
  });

  useInputAction("increasePlaybackSpeed", () => {
    const idx = SPEED_OPTIONS.indexOf(speed);
    if (idx < SPEED_OPTIONS.length - 1) setSpeed(SPEED_OPTIONS[idx + 1]);
  });

  // Deferred-commit scrubbing: while dragging, only this local ghost
  // value moves (instant — no engine work); the real seek runs once on
  // release. A backward seek replays the demo from the start, so
  // per-pointermove seeks would reconstruct the world dozens of times
  // per drag.
  const [dragValue, setDragValue] = useState<number | null>(null);
  const dragging = dragValue != null;

  // A demo swap mid-drag would leave the ghost pointing into the OLD
  // demo's timeline — drop it (Radix's commit for the dead drag then
  // seeks to a clamped value at worst, and the store re-clamps anyway).
  useEffect(() => {
    setDragValue(null);
  }, [recording]);

  // If the drag ends without a commit (pointercancel, window losing
  // focus mid-drag), cancel the scrub instead of freezing the ghost.
  useEffect(() => {
    if (!dragging) return;
    const cancel = () => setDragValue(null);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
    };
  }, [dragging]);

  // The ghost may roam the whole timeline: a release beyond the
  // downloaded frontier becomes a PENDING seek in the store (executed
  // by the loader when the buffer reaches it), signalled by the wait
  // pie on the play button and a marker at the requested time.
  const downloadComplete = useEngineSelector(
    (state) => state.playback.downloadComplete,
  );
  const pendingSeekSec = useEngineSelector(
    (state) => state.playback.pendingSeekSec,
  );

  const handleSeekChange = useCallback((value: number[]) => {
    setDragValue(value[0]);
  }, []);

  const handleSeekCommit = useCallback(
    (value: number[]) => {
      seek(value[0]);
      setDragValue(null);
    },
    [seek],
  );

  // CastGenius needs the whole demo (its scan buffer arrives at
  // download completion) — a press while downloading queues the start
  // and the button shows download progress until then. Press again to
  // cancel the queue.
  const [directorQueued, setDirectorQueued] = useState(false);
  useEffect(() => {
    setDirectorQueued(false);
  }, [recording]);
  useEffect(() => {
    if (directorQueued && downloadComplete) {
      setDirectorQueued(false);
      void startDirector();
    }
  }, [directorQueued, downloadComplete]);

  const handleSpeedChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setSpeed(parseFloat(e.target.value));
    },
    [setSpeed],
  );

  // Mission starts from the timeline scan (one per map in multi-mission
  // demos) — rendered as tick marks above the seek track, with the
  // scan's own label ("Match started (Mission)") as the tooltip.
  const timelineEvents = useDemoTimeline((s) => s.events);
  const missionStarts = useMemo(
    () =>
      (timelineEvents ?? [])
        .filter((e) => e.type === "match-start")
        .map((e) => ({ timeSec: e.timeSec, description: e.description })),
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

  return (
    <div className={styles.Root}>
      <button
        className={styles.PlayPause}
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? "Pause" : "Play"}
        title={
          pendingSeekProgress != null
            ? `Downloading to ${formatTime(pendingSeekSec!)}…`
            : isPlaying
              ? "Pause (Space)"
              : "Play (Space)"
        }
        autoFocus
      >
        {pendingSeekProgress != null ? (
          <ScanProgressPie progress={pendingSeekProgress} />
        ) : isPlaying ? (
          <GrPauseFill />
        ) : (
          <GrPlayFill />
        )}
      </button>
      <button
        className={styles.Director}
        data-active={directorStatus === "playing"}
        disabled={directorStatus === "scanning" || directorStatus === "error"}
        onClick={() => {
          if (directorStatus === "playing") {
            exitDirector();
          } else if (!downloadComplete) {
            setDirectorQueued((queued) => !queued);
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
      <span className={styles.Time}>
        {`${formatTimeAligned(currentTime, duration)} / ${formatTime(duration)}`}
      </span>
      <Slider.Root
        className={styles.SeekRoot}
        min={0}
        max={duration}
        step={0.01}
        value={[dragValue ?? currentTime]}
        onValueChange={handleSeekChange}
        onValueCommit={handleSeekCommit}
      >
        <Slider.Track className={styles.SeekTrack}>
          {/* YouTube-style layers: gray = demo time available locally,
              colored Range = played. Stays at 100% once complete —
              "fully downloaded" must not look like "nothing yet". */}
          {duration > 0 && (
            <div
              className={styles.SeekBuffered}
              aria-hidden="true"
              style={{
                width: downloadComplete
                  ? "100%"
                  : `${Math.min(100, ((downloadedSec ?? 0) / duration) * 100)}%`,
              }}
            />
          )}
          <Slider.Range className={styles.SeekRange} />
          {/* While scrubbing, mark where playback actually still is —
              the thumb is the ghost until release commits the seek. */}
          {dragValue != null && duration > 0 && (
            <div
              className={styles.SeekLiveTick}
              aria-hidden="true"
              style={{
                left: `${Math.min(100, (currentTime / duration) * 100)}%`,
              }}
            />
          )}
          {/* A seek waiting on the download: mark the requested time. */}
          {pendingSeekSec != null && duration > 0 && (
            <div
              className={styles.SeekPendingTick}
              aria-hidden="true"
              style={{
                left: `${Math.min(100, (pendingSeekSec / duration) * 100)}%`,
              }}
            />
          )}
        </Slider.Track>
        <Slider.Thumb className={styles.SeekThumb} aria-label="Seek">
          {dragValue != null && (
            <div className={styles.SeekTooltip} aria-hidden="true">
              {formatTime(dragValue)}
            </div>
          )}
        </Slider.Thumb>
        {/* Mission-start ticks sit ABOVE the track (they'd be clipped by
            its overflow: hidden), and AFTER the thumb in the DOM so the
            playhead comes first in the tab order. */}
        {missionStarts.length > 0 && duration > 0 && (
          <div className={styles.SeekMarkers}>
            {missionStarts.map(({ timeSec, description }) => (
              <button
                key={timeSec}
                type="button"
                className={styles.SeekMissionTick}
                title={`${description} – ${formatTime(timeSec)}`}
                aria-label={`Seek to ${description} – ${formatTime(timeSec)}`}
                onClick={(e) => {
                  seek(timeSec);
                  // A pointer click leaves the button focused, where a
                  // later Space re-seeks instead of toggling playback —
                  // blur, but only for pointer activations (detail 0 =
                  // keyboard, which must keep its focus position).
                  if (e.detail > 0) e.currentTarget.blur();
                }}
                style={{
                  left: `${Math.min(100, (timeSec / duration) * 100)}%`,
                }}
              />
            ))}
          </div>
        )}
      </Slider.Root>
      <div
        className={styles.Field}
        title="Playback speed (< slows down, > speeds up)"
      >
        <label htmlFor="playbackSpeed">Speed</label>
        <select
          id="playbackSpeed"
          className={styles.Speed}
          value={speed}
          onChange={handleSpeedChange}
          title="Playback speed (< slows down, > speeds up)"
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}&times;
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
