import { useEffect, useState } from "react";
import { streamClock } from "../state/streamPlaybackStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Render a HudClock value exactly as Tribes2.exe does (HudClock::onRender
 * 0x004fe8a0, binary-verified): |ms| with floored integer division as
 * "%02d:%02d" minutes:seconds — except while counting down inside the
 * final minute, where it renders "%02d.%02d" seconds.centiseconds.
 */
export function formatHudClock(clockMs: number): string {
  const absMs = Math.abs(Math.round(clockMs));
  const totalSec = Math.floor(absMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  if (clockMs < 0 && mins === 0) {
    return `${pad2(secs)}.${pad2(Math.floor((absMs % 1000) / 10))}`;
  }
  return `${pad2(mins)}:${pad2(secs)}`;
}

/**
 * Match clock (ms, negative = counting down) for display. The snapshot's
 * clock is exact only at the instant it was published, and publishes
 * stall whenever the packet stream does (network hiccups, quiet
 * stretches, the loading throttle) — reading it directly froze the
 * displayed clock for seconds at a time. Instead, sample twice per
 * second and extrapolate the latest published value along the playback
 * clock, which advances every frame regardless of packets and stops
 * while paused (freezing the clock correctly). Extrapolation is exact,
 * not drift-prone: both sides advance on the same playback clock, so
 * re-syncs from later snapshots never cause visible jumps. Re-renders
 * only when the displayed label changes.
 */
export function useMatchClockMs(): number | null {
  const [clockMs, setClockMs] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const snap = streamSnapshotStore.getState().snapshot;
      const next =
        snap == null || snap.matchClockMs == null
          ? null
          : snap.matchClockMs + (streamClock.time - snap.timeSec) * 1000;
      setClockMs((prev) =>
        next != null &&
        prev != null &&
        formatHudClock(next) === formatHudClock(prev)
          ? prev
          : next,
      );
      // The final countdown minute renders centiseconds — sample fast
      // enough there to animate them; whole seconds elsewhere.
      const finalMinute = next != null && next < 0 && next > -60_000;
      timer = setTimeout(update, finalMinute ? 50 : 500);
    };
    update();
    return () => clearTimeout(timer);
  }, []);
  return clockMs;
}
