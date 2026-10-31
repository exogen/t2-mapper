import { createLogger } from "../logger";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { subscribeAction } from "../state/inputControls";
import {
  cycleWatchFollow,
  enterWatchFollow,
  resolveWatchFollowTarget,
  toggleFollowFirstPerson,
} from "../state/watchFollow";
import { combineCleanups } from "./storeReaction";

const camlog = createLogger("camdbg");

/**
 * Player-follow controls shared by demo playback and live watching: Tab
 * (pointer locked) flips a follow between orbit and first person, N /
 * Shift-N or captured clicks cycle the followed player, and the same keys
 * in the command circuit cycle it or enter follow from pan. Each acts only
 * while `enabled()`.
 */
export function subscribeFollowActions(enabled: () => boolean): () => void {
  const cyclePlayer = (direction: 1 | -1) => {
    if (enabled() && streamPlaybackStore.getState().followEntityId)
      cycleWatchFollow(direction);
  };
  const observePlayer = (direction: 1 | -1) => {
    if (!enabled()) return;
    if (streamPlaybackStore.getState().followEntityId) {
      cycleWatchFollow(direction);
    } else {
      enterWatchFollow();
    }
  };
  return combineCleanups(
    subscribeAction("toggleFollowFirstPerson", () => {
      if (enabled()) toggleFollowFirstPerson();
    }),
    subscribeAction("nextPlayer", () => cyclePlayer(1)),
    subscribeAction("prevPlayer", () => cyclePlayer(-1)),
    subscribeAction("nextPlayerKey", () => cyclePlayer(1)),
    subscribeAction("prevPlayerKey", () => cyclePlayer(-1)),
    subscribeAction("observeNextPlayer", () => observePlayer(1)),
    subscribeAction("observePrevPlayer", () => observePlayer(-1)),
  );
}

/**
 * Keeps an armed follow's camera mode current, once per frame: the follow
 * camera while the followed player has a body, free-fly while they don't.
 * Returns false when no follow is armed.
 */
export function syncFollowCameraMode(): boolean {
  const { followEntityId, followPlayer } = streamPlaybackStore.getState();
  if (!followEntityId && !followPlayer) return false;
  const target = resolveWatchFollowTarget();
  if (target) {
    const wanted = streamPlaybackStore.getState().followCameraMode;
    if (streamPlaybackStore.getState().cameraMode !== wanted) {
      camlog.info("cameraMode -> %s (target %s resolved)", wanted, target);
      streamPlaybackStore.setState({ cameraMode: wanted });
    }
  } else if (streamPlaybackStore.getState().cameraMode !== "freeFly") {
    // Followed player has no body this instant (dead, corpse faded,
    // respawn pending) — hold in free-fly with follow still armed; it
    // re-locks onto their new body when it appears.
    camlog.info("cameraMode -> freeFly (follow target unresolved)");
    streamPlaybackStore.setState({ cameraMode: "freeFly" });
  }
  return true;
}
