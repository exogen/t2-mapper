import { useFrame } from "@react-three/fiber";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  cycleDemoCameraMode,
  cycleWatchFollow,
  enterWatchFollow,
  resolveWatchFollowTarget,
} from "../state/watchFollow";
import { useInputAction } from "./InputControls";

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
export function DemoCameraController() {
  // F cycles camera modes (shares the action with the live observer).
  useInputAction("toggleObserverMode", cycleDemoCameraMode);
  // Pointer-locked click cycles the followed player, T2-spectator style.
  useInputAction("nextPlayer", () => {
    if (streamPlaybackStore.getState().followEntityId) cycleWatchFollow();
  });
  // ArrowRight in the command circuit cycles the followed player (or
  // enters follow from pan), mirroring live mode's observeNextPlayer.
  useInputAction("observeNextPlayer", () => {
    if (streamPlaybackStore.getState().followEntityId) {
      cycleWatchFollow();
    } else {
      enterWatchFollow();
    }
  });

  useFrame(() => {
    // Only active while following (orbit / first-person). Cleared modes
    // (original / free-fly) leave followEntityId null.
    if (!streamPlaybackStore.getState().followEntityId) return;
    const target = resolveWatchFollowTarget();
    if (target) {
      const wanted = streamPlaybackStore.getState().followCameraMode;
      if (streamPlaybackStore.getState().cameraMode !== wanted) {
        streamPlaybackStore.setState({ cameraMode: wanted });
      }
    } else if (streamPlaybackStore.getState().cameraMode !== "freeFly") {
      // Followed player has no body this instant (dead, corpse faded,
      // respawn pending) — hold in free-fly with follow still armed; it
      // re-locks onto their new body when it appears.
      streamPlaybackStore.setState({ cameraMode: "freeFly" });
    }
  });

  return null;
}
