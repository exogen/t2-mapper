import { useLiveSelector } from "../state/liveConnectionStore";
import { useReplaySelector } from "../state/replayConnectionStore";
import { useRecording } from "./usePlayback";

/** Live watchers and replay viewers both control an entirely local camera. */
export function useIsWatchSpectator({
  requireReady = false,
}: { requireReady?: boolean } = {}): boolean {
  const localSpectator =
    useRecording()?.streamingPlayback?.localSpectator === true;
  const watching = useLiveSelector(
    (state) => state.role === "watcher" && (!requireReady || state.liveReady),
  );
  const replayReady = useReplaySelector(
    (state) => !requireReady || state.ready,
  );
  return watching || (localSpectator && replayReady);
}
