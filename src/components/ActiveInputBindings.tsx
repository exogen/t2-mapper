import { useStore } from "zustand";
import { useRecording } from "./usePlayback";
import { useInputMode } from "./InputContext";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { useCameraTour } from "../state/cameraTourStore";
import { useDirector } from "../state/demoDirectorStore";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { InputBindings } from "./InputBindings";
import {
  FREE_FLY_INPUT,
  MOVABLE_CAMERA_INPUT,
  POINTER_LOCKABLE_INPUT,
  MAP_MODE_INPUT,
  DEMO_MODE_INPUT,
  LIVE_OBSERVER_INPUT,
  FLAG_FOLLOW_INPUT,
  LIVE_FOLLOW_INPUT,
  TOUR_MODE_INPUT,
  DIRECTOR_MODE_INPUT,
  COMMAND_CIRCUIT_TOGGLE_INPUT,
  COMMAND_CIRCUIT_STREAM_INPUT,
  COMMAND_CIRCUIT_INPUT,
  COMMAND_CIRCUIT_EXIT_INPUT,
} from "./inputMap";

/**
 * Mounts the appropriate `InputBindings` components based on the current
 * app mode. Each binding group has its own lifecycle — when a group
 * unmounts, its actions are automatically cleaned up from the store.
 */
export function ActiveInputBindings() {
  const recording = useRecording();
  const inputMode = useInputMode();
  const isTourActive = useCameraTour((s) => s.animation !== null);
  const isDirecting = useDirector((s) => s.status === "playing");
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  // Watch mode: client-only free-fly camera; server-observer bindings
  // (fly/follow toggle, ObserveClient) don't apply.
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  // Flag follow (number keys) is not a player follow — no player cycling.
  const isFlagFollow = useStore(
    streamPlaybackStore,
    (s) => s.followFlagSlot != null,
  );
  const isDemo = recording?.source === "demo";
  const isLive = recording?.source === "live";
  const isMap = !recording;

  // An active tour owns ALL input: only its bindings (click = next
  // stop, Escape = exit) are mounted — no camera-mode cycling, pointer
  // lock, CC toggling, or follow controls until the tour ends.
  if (isTourActive) {
    return <InputBindings map={TOUR_MODE_INPUT} />;
  }

  // The auto-director likewise owns all input: one interrupt action
  // covering every camera gesture (exits back to free-fly), plus the
  // demo transport (Space / , / .) which deliberately stays live.
  if (isDirecting) {
    return (
      <>
        <InputBindings map={DIRECTOR_MODE_INPUT} />
        {isDemo && <InputBindings map={DEMO_MODE_INPUT} />}
      </>
    );
  }

  // Free-fly movement: map mode, live server-observer fly mode,
  // watch-mode spectating, or demo playback (InputConsumer only acts on
  // WASD when cameraMode is "freeFly", so it's inert otherwise).
  const showFreeFly =
    (isMap && !isCommandCircuit) ||
    (isLive && inputMode === "fly") ||
    (isLive && isWatcher && !isCommandCircuit) ||
    (isDemo && !isCommandCircuit);

  return (
    <>
      {showFreeFly && <InputBindings map={FREE_FLY_INPUT} />}
      {!isCommandCircuit && <InputBindings map={MOVABLE_CAMERA_INPUT} />}
      {!isCommandCircuit && <InputBindings map={POINTER_LOCKABLE_INPUT} />}
      {isMap && !isCommandCircuit && <InputBindings map={MAP_MODE_INPUT} />}
      <InputBindings map={COMMAND_CIRCUIT_TOGGLE_INPUT} />
      {isCommandCircuit && <InputBindings map={COMMAND_CIRCUIT_INPUT} />}
      {isCommandCircuit && <InputBindings map={COMMAND_CIRCUIT_EXIT_INPUT} />}
      {isCommandCircuit && (isDemo || isLive) && (
        <InputBindings map={COMMAND_CIRCUIT_STREAM_INPUT} />
      )}
      {isDemo && <InputBindings map={DEMO_MODE_INPUT} />}
      {/* Observer fly/follow toggle shares F with the CC follow toggle —
          only one is mounted at a time. Watchers get the same toggle
          (SpectatorController), demos too (DemoCameraController). */}
      {(isLive || isDemo) && !isCommandCircuit && (
        <InputBindings map={LIVE_OBSERVER_INPUT} />
      )}
      {/* Pointer-locked click cycles the followed player. inputMode is
          "follow" during orbit/first-person in both live and demo —
          but not while following a flag (nothing to cycle). */}
      {(isLive || isDemo) && inputMode === "follow" && !isFlagFollow && (
        <InputBindings map={LIVE_FOLLOW_INPUT} />
      )}
      {/* Number keys orbit the flags — client-side follow (demo and watch
          spectate). The server CAN orbit arbitrary targets
          (serverCmdAttachCommanderCamera), but its sensor-group gate
          rejects observers for EVERY target — verified live with
          scripts/attach-camera-probe.ts — so real observers aren't
          wired up. */}
      {(isDemo || (isLive && isWatcher)) && (
        <InputBindings map={FLAG_FOLLOW_INPUT} />
      )}
    </>
  );
}
