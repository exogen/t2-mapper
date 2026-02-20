import { useCallback, type ChangeEvent } from "react";
import { useDemo } from "./DemoProvider";

const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function DemoControls() {
  const {
    recording,
    isPlaying,
    currentTime,
    duration,
    speed,
    play,
    pause,
    seek,
    setSpeed,
  } = useDemo();

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

  if (!recording) return null;

  return (
    <div
      className="DemoControls"
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="DemoControls-playPause"
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? "\u275A\u275A" : "\u25B6"}
      </button>
      <span className="DemoControls-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
      <input
        className="DemoControls-seek"
        type="range"
        min={0}
        max={duration}
        step={0.01}
        value={currentTime}
        onChange={handleSeek}
      />
      <select
        className="DemoControls-speed"
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
