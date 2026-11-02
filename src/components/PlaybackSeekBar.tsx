import type { ReactNode } from "react";
import * as Slider from "@radix-ui/react-slider";
import { formatPlayheadTime } from "./demoFormat";
import styles from "./PlaybackControls.module.css";

/** Arrow keys belong to the camera; Home/End still seek the timeline. */
const UNSTEPPED_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
]);

interface PlaybackSeekBarProps {
  currentTime: number;
  duration: number;
  dragValue: number | null;
  onBeginScrub(): void;
  onValueChange(time: number): void;
  onValueCommit(time: number): void;
  seeking?: boolean;
  disabled?: boolean;
  step?: number;
  bufferedTime?: number;
  progress?: { time: number; ratio: number | null; label: string } | null;
  children?: ReactNode;
}

/** Shared timeline presentation; each transport owns its deferred seek action. */
export function PlaybackSeekBar({
  currentTime,
  duration,
  dragValue,
  onBeginScrub,
  onValueChange,
  onValueCommit,
  seeking = false,
  disabled = false,
  step = 0.01,
  bufferedTime,
  progress,
  children,
}: PlaybackSeekBarProps) {
  return (
    <Slider.Root
      className={styles.SeekRoot}
      min={0}
      max={duration > 0 ? duration : step}
      step={step}
      value={[duration > 0 ? (dragValue ?? currentTime) : 0]}
      disabled={disabled || duration <= 0}
      onPointerDownCapture={onBeginScrub}
      onKeyDownCapture={onBeginScrub}
      onKeyDown={(event) => {
        if (UNSTEPPED_KEYS.has(event.key)) event.preventDefault();
      }}
      onValueChange={(value) => onValueChange(value[0])}
      onValueCommit={(value) => onValueCommit(value[0])}
      aria-busy={seeking}
      data-seeking={seeking}
    >
      <Slider.Track className={styles.SeekTrack}>
        {bufferedTime !== undefined && duration > 0 && (
          <div
            className={styles.SeekBuffered}
            aria-hidden="true"
            style={{
              width: `${Math.max(0, Math.min(100, (bufferedTime / duration) * 100))}%`,
            }}
          />
        )}
        <Slider.Range className={styles.SeekRange} />
        {seeking && progress && duration > 0 && (
          <div
            className={styles.SeekReplayRange}
            role="progressbar"
            aria-label={progress.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={
              progress.ratio != null
                ? Math.round(progress.ratio * 100)
                : undefined
            }
            style={{
              width: `${Math.max(0, Math.min(100, (progress.time / duration) * 100))}%`,
            }}
          />
        )}
        {dragValue != null && duration > 0 && (
          <div
            className={styles.SeekLiveTick}
            aria-hidden="true"
            style={{
              left: `${Math.max(0, Math.min(100, (currentTime / duration) * 100))}%`,
            }}
          />
        )}
      </Slider.Track>
      <Slider.Thumb
        className={styles.SeekThumb}
        aria-label="Seek"
        data-seeking={seeking && dragValue === null}
      >
        {dragValue != null && (
          <div className={styles.SeekTooltip} aria-hidden="true">
            {formatPlayheadTime(dragValue)}
          </div>
        )}
      </Slider.Thumb>
      {children}
    </Slider.Root>
  );
}
