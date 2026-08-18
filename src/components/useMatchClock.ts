import { useEffect, useState } from "react";
import { streamClock } from "../state/streamPlaybackStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";

/** Displayed second for a HudClockCtrl-style value (negative = countdown). */
function displayedSecond(clockMs: number): number {
  const absSec = Math.abs(clockMs) / 1000;
  return clockMs < 0 ? Math.ceil(absSec) : Math.floor(absSec);
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
 * only when the displayed second changes.
 */
export function useMatchClockMs(): number | null {
  const [clockMs, setClockMs] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const snap = streamSnapshotStore.getState().snapshot;
      const next =
        snap == null || snap.matchClockMs == null
          ? null
          : snap.matchClockMs + (streamClock.time - snap.timeSec) * 1000;
      setClockMs((prev) =>
        next != null &&
        prev != null &&
        displayedSecond(next) === displayedSecond(prev)
          ? prev
          : next,
      );
    };
    update();
    const timer = setInterval(update, 500);
    return () => clearInterval(timer);
  }, []);
  return clockMs;
}
