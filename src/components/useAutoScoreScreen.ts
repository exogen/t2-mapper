import { useEffect, useRef } from "react";
import { useStreamSnapshot } from "../state/streamSnapshotStore";

/**
 * Drive the score screen from the match-over interval, like the real
 * game's end-of-match debrief: open when the gameOver debrief arrives,
 * close when the next mission's MsgClientReady drops the player in.
 *
 * Auto-open requires WITNESSING the match end: it only fires after this
 * session has shown in-match (non-ended) state first. Joining or
 * hydrating mid-debrief (the catch-up payload carries matchEnded) does
 * not pop the screen — the next real transition does. Edge-triggered
 * either way, so manual open/close in between still wins.
 */
export function useAutoScoreScreen(setOpen: (open: boolean) => void): void {
  const matchEnded = useStreamSnapshot((snap) =>
    snap == null ? null : snap.matchEnded,
  );
  const armedRef = useRef(false);
  useEffect(() => {
    if (matchEnded == null) {
      // No stream (left the session / demo unloaded) — close and require
      // seeing in-match state again before the next auto-open.
      armedRef.current = false;
      setOpen(false);
    } else if (!matchEnded) {
      armedRef.current = true;
      setOpen(false);
    } else if (armedRef.current) {
      setOpen(true);
    }
  }, [matchEnded, setOpen]);
}
