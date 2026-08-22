import { useEffect, useState } from "react";
import { LuClock } from "react-icons/lu";
import { useLiveSelector } from "../state/liveConnectionStore";
import styles from "./StreamDelayNotice.module.css";

/** Delay label like "60s" / "2m". */
function formatDelay(sec: number): string {
  return sec >= 60 && sec % 60 === 0 ? `${sec / 60}m` : `${sec}s`;
}

/** Countdown as MM:SS. */
function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Shown to a watcher while a tournament-delayed session is still buffering
 * its first `delayMs` — the relay is recording live but withholds frames
 * to prevent screen-peeking, so nothing renders yet. Explains the wait
 * and counts down roughly to when live (delayed) coverage begins.
 */
export function StreamDelayNotice() {
  const streamDelayMs = useLiveSelector((s) => s.streamDelayMs);
  const readyAt = useLiveSelector((s) => s.streamDelayReadyAt);
  const catchupProgress = useLiveSelector((s) => s.catchupProgress);
  const [now, setNow] = useState(() => Date.now());

  const active =
    streamDelayMs > 0 && readyAt != null && catchupProgress == null;

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  if (!active) return null;

  const remainingSec = Math.max(0, Math.ceil((readyAt - now) / 1000));

  return (
    <div className={styles.Notice} role="status">
      <LuClock className={styles.Icon} aria-hidden />
      <div className={styles.Text}>
        <div className={styles.Title}>
          Tournament stream delayed{" "}
          {formatDelay(Math.round(streamDelayMs / 1000))}
        </div>
        <div className={styles.Subtitle}>
          {remainingSec > 0
            ? `Live coverage begins in ${formatClock(remainingSec)}`
            : "Starting…"}
        </div>
        <div className={styles.Note}>
          Tournament mode games are delayed to avoid benefiting active players.
        </div>
      </div>
    </div>
  );
}
