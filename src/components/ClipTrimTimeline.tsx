import { useCallback, useEffect, useRef, useState } from "react";
import * as Slider from "@radix-ui/react-slider";
import styles from "./ClipTrimTimeline.module.css";

interface ClipTrimTimelineProps {
  durationMs: number;
  startMs: number;
  endMs: number;
  playheadMs: number;
  disabled?: boolean;
  onPause(): void;
  onTrim(startMs: number, endMs: number): void;
  onSeek(timeMs: number): void;
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(3)}s`;

/** Trim handles and a separate playhead share the recorded take's time axis. */
export function ClipTrimTimeline({
  durationMs,
  startMs,
  endMs,
  playheadMs,
  disabled = false,
  onPause,
  onTrim,
  onSeek,
}: ClipTrimTimelineProps) {
  const [trim, setTrim] = useState<[number, number] | null>(null);
  const [head, setHead] = useState<number | null>(null);
  const seekGesture = useRef<{ pointerId: number; timeMs: number } | null>(
    null,
  );
  const range = trim ?? [startMs, endMs];
  const bounded = (time: number) =>
    Math.max(range[0], Math.min(range[1], time));
  const cancelGesture = useCallback(() => {
    seekGesture.current = null;
    setTrim(null);
    setHead(null);
  }, []);
  useEffect(() => {
    cancelGesture();
  }, [disabled, durationMs, cancelGesture]);
  useEffect(() => {
    window.addEventListener("blur", cancelGesture);
    return () => window.removeEventListener("blur", cancelGesture);
  }, [cancelGesture]);

  const pointTime = (element: HTMLElement, clientX: number) => {
    const rect = element.getBoundingClientRect();
    return bounded(((clientX - rect.left) / rect.width) * durationMs);
  };

  return (
    <div className={styles.Root} data-clip-trim-timeline="">
      <Slider.Root
        className={styles.Range}
        min={0}
        max={durationMs}
        step={1}
        minStepsBetweenThumbs={1}
        value={range}
        disabled={disabled}
        onPointerDownCapture={() => {
          if (!disabled) onPause();
        }}
        onKeyDownCapture={() => {
          if (!disabled) onPause();
        }}
        onPointerDown={(event) => {
          if (
            disabled ||
            event.button !== 0 ||
            (event.target as Element).closest("[data-clip-trim-handle]")
          )
            return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          const timeMs = pointTime(event.currentTarget, event.clientX);
          seekGesture.current = { pointerId: event.pointerId, timeMs };
          setHead(timeMs);
        }}
        onPointerMove={(event) => {
          if (seekGesture.current?.pointerId !== event.pointerId) return;
          event.preventDefault();
          const timeMs = pointTime(event.currentTarget, event.clientX);
          seekGesture.current.timeMs = timeMs;
          setHead(timeMs);
        }}
        onPointerUp={(event) => {
          const gesture = seekGesture.current;
          if (gesture?.pointerId !== event.pointerId) return;
          event.preventDefault();
          seekGesture.current = null;
          if (!disabled) onSeek(gesture.timeMs);
          setHead(null);
        }}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
        onValueChange={(value) => setTrim([value[0], value[1]])}
        onValueCommit={(value) => {
          onTrim(value[0], value[1]);
          setTrim(null);
        }}
      >
        <Slider.Track className={styles.Track}>
          <Slider.Range className={styles.Selected} />
        </Slider.Track>
        <Slider.Thumb
          className={styles.TrimThumb}
          data-clip-trim-handle="start"
          aria-label="Clip start"
          aria-valuetext={seconds(range[0])}
        />
        <Slider.Thumb
          className={styles.TrimThumb}
          data-clip-trim-handle="end"
          aria-label="Clip end"
          aria-valuetext={seconds(range[1])}
        />
      </Slider.Root>
      <Slider.Root
        className={styles.Playhead}
        min={0}
        max={durationMs}
        step={1}
        value={[bounded(head ?? playheadMs)]}
        disabled={disabled}
        onPointerDownCapture={() => {
          if (!disabled) onPause();
        }}
        onKeyDownCapture={() => {
          if (!disabled) onPause();
        }}
        onValueChange={(value) => setHead(bounded(value[0]))}
        onValueCommit={(value) => {
          onSeek(bounded(value[0]));
          setHead(null);
        }}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={cancelGesture}
      >
        <Slider.Thumb
          className={styles.PlayheadThumb}
          aria-label="Seek clip"
          aria-valuemin={range[0]}
          aria-valuemax={range[1]}
          aria-valuetext={seconds(bounded(head ?? playheadMs))}
        />
      </Slider.Root>
    </div>
  );
}
