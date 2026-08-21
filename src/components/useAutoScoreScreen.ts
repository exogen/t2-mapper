import { useEffect, useRef } from "react";
import {
  streamSnapshotStore,
  useStreamSnapshot,
} from "../state/streamSnapshotStore";

/** How long (in stream time) the match must have been seen running before
 *  its end counts as witnessed — out-waits the debrief burst some servers
 *  send to every joiner, and joining into a match's final seconds. */
const MIN_WATCHED_SEC = 5;

/**
 * Drive the score screen from the match-over interval, like the real
 * game's end-of-match debrief: open when the gameOver debrief arrives,
 * close when the next mission's MsgClientReady drops the player in.
 *
 * Auto-open requires WITNESSING the match end: the match must have been
 * seen running (matchStarted — MsgMissionStart, a running clock, or a
 * team on the board; the same signal the relay uses) for at least
 * MIN_WATCHED_SEC of stream time before the debrief. Joining or
 * hydrating mid-debrief does not pop the screen, and neither does the
 * debrief burst some servers send to every joiner — indistinguishable
 * from a real end by message content alone. Measured in stream time so
 * demo pause/seek/rate behave like the match they replay. Edge-
 * triggered, so manual open/close in between still wins.
 */
export function useAutoScoreScreen(setOpen: (open: boolean) => void): void {
  const matchStarted = useStreamSnapshot((snap) =>
    snap == null ? null : snap.matchStarted,
  );
  const matchEnded = useStreamSnapshot((snap) =>
    snap == null ? null : snap.matchEnded,
  );
  /** Stream time at which the running match was first seen, or null. */
  const armedAtSecRef = useRef<number | null>(null);
  const prevEndedRef = useRef<boolean | null>(null);
  useEffect(() => {
    const prevEnded = prevEndedRef.current;
    prevEndedRef.current = matchEnded;
    // Read the time non-reactively: subscribing to timeSec would
    // re-render on every snapshot.
    const nowSec = streamSnapshotStore.getState().snapshot?.timeSec ?? null;
    if (matchEnded == null) {
      // No stream (left the session / demo unloaded) — close and require
      // seeing a running match again before the next auto-open.
      armedAtSecRef.current = null;
      setOpen(false);
      return;
    }
    if (!matchEnded) {
      if (matchStarted) {
        armedAtSecRef.current ??= nowSec;
      } else {
        // New mission, reset, backward seek, or a re-hydrated session:
        // the previous arm no longer describes this stretch of play.
        armedAtSecRef.current = null;
      }
      // The next mission dropped us in: the debrief is over.
      if (prevEnded) setOpen(false);
      return;
    }
    const armedAtSec = armedAtSecRef.current;
    if (!prevEnded && armedAtSec != null && nowSec != null) {
      if (nowSec - armedAtSec >= MIN_WATCHED_SEC) setOpen(true);
      // One pop per witnessed end; the next mission must be seen running
      // before another.
      armedAtSecRef.current = null;
    }
  }, [matchStarted, matchEnded, setOpen]);
}
