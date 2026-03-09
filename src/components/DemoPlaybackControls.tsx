import { useCallback, useEffect, type ChangeEvent } from "react";
import {
  usePlaybackActions,
  useCurrentTime,
  useDuration,
  useIsPlaying,
  useRecording,
  useSpeed,
} from "./RecordingProvider";
import styles from "./DemoPlaybackControls.module.css";

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
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
    <div
      className={styles.Root}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className={styles.PlayPause}
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "\u275A\u275A" : "\u25B6"}
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
      <select
        className={styles.Speed}
        value={speed}
        onChange={handleSpeedChange}
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}x
          </option>
        ))}
      </select>
    </div>
  );
}
