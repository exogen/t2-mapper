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
import { FramePriority } from "./framePriority";
import { useRecording } from "./usePlayback";
import { isRelayRecording } from "../stream/demoDate";

/**
 * Demo-playback camera controller — the client-side companion to
 * StreamingController, mounted only during demo playback (the non-live
 * counterpart to SpectatorController). Wires the F key to cycle camera
 * modes (original → free-fly → follow → first-person → original) and
 * N / Shift-N or pointer-locked clicks to cycle players, then keeps the
 * follow target re-locked onto the player across respawns each frame.
 *
 * StreamingController does the actual camera positioning for every mode;
 * this only drives the `streamPlaybackStore` selection state.
 */

const camlog = createLogger("camdbg");

export function DemoCameraController() {
  const recording = useRecording();
  // F cycles camera modes (shares the action with the live observer).
  useInputAction("toggleObserverMode", () => {
    cycleDemoCameraMode(!isRelayRecording(recording?.recorderName ?? null));
  });
  // Tab (pointer locked) flips a player follow between orbit and first person.
  useInputAction("toggleFollowFirstPerson", toggleFollowFirstPerson);
  // N / Shift-N and optional captured clicks cycle forward/backward.
  const cyclePlayer = (direction: 1 | -1) => {
    if (streamPlaybackStore.getState().followEntityId)
      cycleWatchFollow(direction);
  };
  useInputAction("nextPlayer", () => cyclePlayer(1));
  useInputAction("prevPlayer", () => cyclePlayer(-1));
  useInputAction("nextPlayerKey", () => cyclePlayer(1));
  useInputAction("prevPlayerKey", () => cyclePlayer(-1));
  // N / Shift-N in the command circuit cycles the followed player
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
  useFrame(() => {
    const { followEntityId, pendingFollowPlayerName } =
      streamPlaybackStore.getState();
    if (!followEntityId && !pendingFollowPlayerName) return;
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
  }, FramePriority.CameraSelect);

  return null;
}
