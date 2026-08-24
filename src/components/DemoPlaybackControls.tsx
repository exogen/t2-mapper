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
import styles from "./DemoPlaybackControls.module.css";

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

  if (!recording || !Number.isFinite(recording.duration)) return null;

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
