import { createLogger } from "../logger";
import { useFrame } from "@react-three/fiber";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  cycleDemoCameraMode,
  cycleWatchFollow,
  enterWatchFollow,
  resolveWatchFollowTarget,
  toggleFollowFirstPerson,
} from "../state/watchFollow";
import { useInputAction } from "./InputControls";
import { useFollowFlagActions } from "./useFollowFlagActions";

/**
 * Demo-playback camera controller — the client-side companion to
 * StreamingController, mounted only during demo playback (the non-live
 * counterpart to SpectatorController). Wires the F key to cycle camera
 * modes (original → free-fly → follow → first-person → original) and a
 * pointer-locked click to cycle players while following, then keeps the
 * follow target re-locked onto the player across respawns each frame.
 *
 * StreamingController does the actual camera positioning for every mode;
 * this only drives the `streamPlaybackStore` selection state.
 */

const camlog = createLogger("camdbg");

export function DemoCameraController() {
  // F cycles camera modes (shares the action with the live observer).
  useInputAction("toggleObserverMode", cycleDemoCameraMode);
  // Tab (pointer locked) flips a player follow between orbit and first person.
  useInputAction("toggleFollowFirstPerson", toggleFollowFirstPerson);
  // Pointer-locked left/right click cycles the followed player forward/
  // backward, T2-spectator style (fire and jet triggers).
  useInputAction("nextPlayer", () => {
    if (streamPlaybackStore.getState().followEntityId) cycleWatchFollow();
  });
  useInputAction("prevPlayer", () => {
    if (streamPlaybackStore.getState().followEntityId) cycleWatchFollow(-1);
  });
  // ArrowRight/ArrowLeft in the command circuit cycles the followed player
  // (or enters follow from pan), mirroring live mode's observe actions.
  useInputAction("observeNextPlayer", () => {
    if (streamPlaybackStore.getState().followEntityId) {
      cycleWatchFollow();
    } else {
      enterWatchFollow();
    }
  });
  useInputAction("observePrevPlayer", () => {
    if (streamPlaybackStore.getState().followEntityId) {
      cycleWatchFollow(-1);
    } else {
      enterWatchFollow();
    }
  });
  // Number keys orbit the flags (1 = Storm, 2 = Inferno, …).
  useFollowFlagActions(() => true);

  useFrame(() => {
    // Only active while following (orbit / first-person). Cleared modes
    // (original / free-fly) leave followEntityId null.
    if (!streamPlaybackStore.getState().followEntityId) return;
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
  });

  return null;
}
