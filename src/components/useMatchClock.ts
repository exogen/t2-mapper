import { useEffect, useState } from "react";
import { streamClock } from "../state/streamPlaybackStore";
import { streamSnapshotStore } from "../state/streamSnapshotStore";
import { matchClockAt } from "../state/matchClock";

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Render a HudClock value as Tribes2.exe does below an hour (HudClock::
 * onRender 0x004fe8a0, binary-verified): |ms| truncated, with integer
 * division, as "%02d:%02d" minutes:seconds, or "%02d.%02d"
 * seconds.centiseconds while counting down through the final minute. The
 * engine never shows hours: a server's 999-minute limit reads 38:40 with
 * 998:40 left, and fakes a final minute every hour. From an hour up this
 * shows H:MM:SS instead.
 */
export function formatHudClock(clockMs: number): string {
  const absMs = Math.abs(Math.trunc(clockMs));
  const totalSec = Math.floor(absMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  if (hours > 0) return `${hours}:${pad2(mins)}:${pad2(secs)}`;
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
 * while paused. Match end holds the last value even as transport continues.
 * Extrapolation is exact,
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
      const next = matchClockAt(snap, streamClock.time);
      setClockMs((prev) =>
        next != null &&
        prev != null &&
        formatHudClock(next) === formatHudClock(prev)
          ? prev
          : next,
      );
      // The final countdown minute renders centiseconds — sample fast
      // enough there to animate them; whole seconds elsewhere.
      const centiseconds = next != null && formatHudClock(next).includes(".");
      timer = setTimeout(update, centiseconds ? 50 : 500);
    };
    update();
    return () => clearTimeout(timer);
  }, []);
  return clockMs;
}
