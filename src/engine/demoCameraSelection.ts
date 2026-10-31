import { engineStore } from "../state/engineStore";
import { subscribeAction } from "../state/inputControls";
import { cycleDemoCameraMode } from "../state/watchFollow";
import { isRelayRecording } from "../stream/demoDate";
import { FramePriority } from "./framePriority";
import { subscribeFollowActions, syncFollowCameraMode } from "./followControls";
import { combineCleanups } from "./storeReaction";
import type { GameEngine } from "./gameEngine";

/**
 * Demo-playback camera selection — the client-side companion to the
 * stream's camera pass, active only during demo playback (the non-live
 * counterpart to spectatorCamera). Wires the F key to cycle camera
 * modes (original → free-fly → follow → first-person → original) and
 * N / Shift-N or pointer-locked clicks to cycle players, then keeps the
 * follow target re-locked onto the player across respawns each frame.
 *
 * StreamPlaybackSession does the actual camera positioning for every mode;
 * this only drives the `streamPlaybackStore` selection state.
 */
export function installDemoCameraSelection(engine: GameEngine): () => void {
  return combineCleanups(
    // F cycles camera modes (shares the action with the live observer).
    subscribeAction("toggleObserverMode", () => {
      const recording = engineStore.getState().playback.recording;
      cycleDemoCameraMode(!isRelayRecording(recording?.recorderName ?? null));
    }),
    subscribeFollowActions(() => true),
    engine.scheduler.add(FramePriority.CameraSelect, () => {
      syncFollowCameraMode();
    }),
  );
}
