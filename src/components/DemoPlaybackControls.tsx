import { useCallback, useEffect, type ChangeEvent } from "react";
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

export function DemoPlaybackControls() {
  const recording = useRecording();
  const isPlaying = useIsPlaying();
  const currentTime = useCurrentTime();
  const duration = useDuration();
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

  const handleSeek = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      seek(parseFloat(e.target.value));
    },
    [seek],
  );

  const handleSpeedChange = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      setSpeed(parseFloat(e.target.value));
    },
    [setSpeed],
  );

  const directorStatus = useDirector((s) => s.status);
  const directorProgress = useDirector((s) => s.scanProgress);
  const directorError = useDirector((s) => s.error);

  if (!recording || !Number.isFinite(recording.duration)) return null;

  const directorTitle =
    directorStatus === "playing"
      ? "Exit CastGenius (any camera input)"
      : directorStatus === "scanning"
        ? "Analyzing demo…"
        : directorStatus === "error"
          ? (directorError ?? "CastGenius unavailable")
          : "CastGenius: Sit back and let the camera follow the action";

  return (
    <div className={styles.Root}>
      <button
        className={styles.PlayPause}
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? "Pause" : "Play"}
        title={isPlaying ? "Pause (Space)" : "Play (Space)"}
        autoFocus
      >
        {isPlaying ? <GrPauseFill /> : <GrPlayFill />}
      </button>
      <button
        className={styles.Director}
        data-active={directorStatus === "playing"}
        disabled={directorStatus === "scanning" || directorStatus === "error"}
        onClick={() => {
          if (directorStatus === "playing") {
            exitDirector();
          } else {
            void startDirector();
          }
        }}
        aria-label="CastGenius"
        title={directorTitle}
      >
        {directorStatus === "scanning" && directorProgress != null ? (
          <ScanProgressPie progress={directorProgress} />
        ) : (
          <RiMovieAiLine />
        )}
      </button>
      <span className={styles.Time}>
        {`${formatTime(currentTime)} / ${formatTime(duration)}`}
      </span>
      <input
        className={styles.Seek}
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={currentTime}
        onChange={handleSeek}
      />
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
