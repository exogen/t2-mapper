import { useEffect } from "react";
import { useStreamSnapshot } from "../state/streamSnapshotStore";

/**
 * Drive the score screen from the match-over interval, like the real
 * game's end-of-match debrief: open when the gameOver debrief arrives,
 * close when the next mission's MsgClientReady drops the player in.
 * Edge-triggered on the interval transitions, so manual open/close in
 * between still wins.
 */
export function useAutoScoreScreen(setOpen: (open: boolean) => void): void {
  const matchEnded = useStreamSnapshot((snap) => snap?.matchEnded ?? false);
  useEffect(() => {
    setOpen(matchEnded);
  }, [matchEnded, setOpen]);
}
