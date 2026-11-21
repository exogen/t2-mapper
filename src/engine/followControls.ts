import { createLogger } from "../logger";
import { resolveCameraOwner } from "../state/cameraOwner";
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
  const { followEntityId, followPlayer, projectileFollow } =
    streamPlaybackStore.getState();
  if (projectileFollow?.kind === "tracking") return true;
  if (!followEntityId && !followPlayer) return false;
  const followRespawns = resolveCameraOwner() !== "director";
  const target = resolveWatchFollowTarget(followRespawns);
  if (target) {
    const wanted = streamPlaybackStore.getState().followCameraMode;
    if (streamPlaybackStore.getState().cameraMode !== wanted) {
      camlog.info("cameraMode -> %s (target %s resolved)", wanted, target);
      streamPlaybackStore.setState({ cameraMode: wanted });
    }
  } else if (streamPlaybackStore.getState().cameraMode !== "freeFly") {
    // Hold the view if the body disappears. Only manual follows can
    // re-lock onto a replacement before the next shot.
    camlog.info("cameraMode -> freeFly (follow target unresolved)");
    streamPlaybackStore.setState({ cameraMode: "freeFly" });
  }
  return true;
}
