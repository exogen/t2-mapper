import { useCallback, useEffect, type ChangeEvent } from "react";
import { useInputAction } from "./InputControls";
// import { useStore } from "zustand";
import {
  usePlaybackActions,
  useCurrentTime,
  useDuration,
  useIsPlaying,
  useRecording,
  useSpeed,
  SPEED_OPTIONS,
} from "./usePlayback";
// import {
// streamPlaybackStore,
// type DemoCameraMode,
// } from "../state/streamPlaybackStore";
// import { useEngineStoreApi } from "../state/engineStore";
import { GrPauseFill, GrPlayFill } from "react-icons/gr";
import styles from "./DemoPlaybackControls.module.css";

// const CAMERA_MODE_OPTIONS: { value: DemoCameraMode; label: string }[] = [
//   { value: "original", label: "Original" },
//   { value: "freeFly", label: "Free Fly" },
//   { value: "orbitOverride", label: "Orbit Target" },
// ];

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
  // const cameraMode = useStore(streamPlaybackStore, (s) => s.cameraMode);
  // const engineStore = useEngineStoreApi();

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

  // const handleCameraModeChange = useCallback(
  //   (e: ChangeEvent<HTMLSelectElement>) => {
  //     const newMode = e.target.value as DemoCameraMode;
  //     if (newMode === "orbitOverride") {
  //       // Seed yaw/pitch from current stream camera to avoid a jump.
  //       const cam =
  //         engineStore.getState().playback.streamSnapshot?.camera ?? null;
  //       streamPlaybackStore.setState({
  //         cameraMode: newMode,
  //         orbitOverrideYaw: cam?.yaw ?? 0,
  //         orbitOverridePitch: cam?.pitch ?? 0,
  //       });
  //     } else {
  //       streamPlaybackStore.setState({ cameraMode: newMode });
  //     }
  //   },
  //   [engineStore],
  // );

  if (!recording || !Number.isFinite(recording.duration)) return null;

  return (
    <div className={styles.Root}>
      <button
        className={styles.PlayPause}
        onClick={isPlaying ? pause : play}
        aria-label={isPlaying ? "Pause" : "Play"}
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
      <div className={styles.Field}>
        <label htmlFor="playbackSpeed">Speed</label>
        <select
          id="playbackSpeed"
          className={styles.Speed}
          value={speed}
          onChange={handleSpeedChange}
        >
          {SPEED_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}&times;
            </option>
          ))}
        </select>
      </div>
      {/* <select
        className={styles.CameraMode}
        value={cameraMode}
        onChange={handleCameraModeChange}
      >
        {CAMERA_MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select> */}
    </div>
  );
}
