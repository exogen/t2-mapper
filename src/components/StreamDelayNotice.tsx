import { useEffect, useState } from "react";
import { LuClock } from "react-icons/lu";
import { useStore } from "zustand";
import { useLiveSelector } from "../state/liveConnectionStore";
import {
  exitLiveDirector,
  liveDirectorStore,
} from "../state/liveDirectorStore";
import { formatDelay } from "../stringUtils";
import { PlaybackNotice } from "./PlaybackNotice";
import styles from "./StreamDelayNotice.module.css";

const preparingCastGenius = "Preparing the CastGenius view…";

/** Countdown as MM:SS. */
function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function StreamDelayCountdown({
  readyAt,
  castGenius = false,
}: {
  readyAt: number;
  castGenius?: boolean;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remainingSec = Math.max(0, Math.ceil((readyAt - now) / 1000));
  if (!remainingSec) return castGenius ? preparingCastGenius : "Starting…";
  const countdown = formatClock(remainingSec);
  return castGenius
    ? `CastGenius starts in ${countdown}`
    : `Live coverage begins in ${countdown}`;
}

/** Show the wait for a delayed live picture or for CastGenius camera directions. */
export function StreamDelayNotice() {
  const streamDelayMs = useLiveSelector((s) => s.streamDelayMs);
  const reason = useLiveSelector((s) => s.streamDelayReason);
  const readyAt = useLiveSelector((s) => s.streamDelayReadyAt);
  const catchupProgress = useLiveSelector((s) => s.catchupProgress);
  const status = useStore(liveDirectorStore, (s) => s.status);
  const error = useStore(liveDirectorStore, (s) => s.error);
  if (catchupProgress == null && streamDelayMs > 0 && readyAt != null) {
    if (reason === "castGenius") {
      return (
        <PlaybackNotice failed={false}>
          <span className={styles.Countdown}>
            <StreamDelayCountdown key={readyAt} readyAt={readyAt} castGenius />
          </span>
        </PlaybackNotice>
      );
    }
    return (
      <div className={styles.Notice} role="status">
        <LuClock className={styles.Icon} aria-hidden />
        <div className={styles.Text}>
          <div className={styles.Title}>
            Stream delayed {formatDelay(streamDelayMs)}
          </div>
          <div className={styles.Subtitle}>
            <StreamDelayCountdown key={readyAt} readyAt={readyAt} />
          </div>
        </div>
      </div>
    );
  }

  if (!error && (status !== "loading" || catchupProgress != null)) return null;
  return (
    <PlaybackNotice failed={!!error}>
      <span>{error ?? preparingCastGenius}</span>
      {error && (
        <button
          type="button"
          className={styles.DismissButton}
          onClick={exitLiveDirector}
        >
          Dismiss
        </button>
      )}
    </PlaybackNotice>
  );
}
