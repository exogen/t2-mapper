import { useRecording } from "./usePlayback";
import { useInputMode } from "./InputContext";
import { useCameraTour } from "../state/cameraTourStore";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { useLiveSelector } from "../state/liveConnectionStore";
import { useSettings } from "./SettingsProvider";
import { InputBindings } from "./InputBindings";
import {
  FREE_FLY_INPUT,
  MOVABLE_CAMERA_INPUT,
  POINTER_LOCKABLE_INPUT,
  MAP_MODE_INPUT,
  DEMO_MODE_INPUT,
  LIVE_OBSERVER_INPUT,
  LIVE_FOLLOW_INPUT,
  TOUR_MODE_INPUT,
  COMMAND_CIRCUIT_TOGGLE_INPUT,
  COMMAND_CIRCUIT_STREAM_INPUT,
  COMMAND_CIRCUIT_LIVE_INPUT,
  COMMAND_CIRCUIT_INPUT,
  COMMAND_CIRCUIT_EXIT_INPUT,
  LIVE_CHAT_INPUT,
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
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  // Watch mode: client-only free-fly camera; server-observer bindings
  // (fly/follow toggle, ObserveClient) don't apply.
  const isWatcher = useLiveSelector((s) => s.role === "watcher");
  const { showChat } = useSettings();
  const isDemo = recording?.source === "demo";
  const isLive = recording?.source === "live";
  const isMap = !recording;

  // Free-fly movement: map mode (no tour), live server-observer fly
  // mode, or watch-mode spectating.
  const showFreeFly =
    (isMap && !isTourActive && !isCommandCircuit) ||
    (isLive && inputMode === "fly") ||
    (isLive && isWatcher && !isTourActive && !isCommandCircuit);

  // Camera can be moved by drag/touch in most modes.
  const showMovableCamera = !isTourActive && !isCommandCircuit;

  // Pointer lock: available when not touring.
  const showPointerLockable = !isTourActive && !isCommandCircuit;

  return (
    <>
      {showFreeFly && <InputBindings map={FREE_FLY_INPUT} />}
      {showMovableCamera && <InputBindings map={MOVABLE_CAMERA_INPUT} />}
      {showPointerLockable && <InputBindings map={POINTER_LOCKABLE_INPUT} />}
      {isMap && !isTourActive && !isCommandCircuit && (
        <InputBindings map={MAP_MODE_INPUT} />
      )}
      <InputBindings map={COMMAND_CIRCUIT_TOGGLE_INPUT} />
      {isCommandCircuit && <InputBindings map={COMMAND_CIRCUIT_INPUT} />}
      {/* During a tour Escape always exits the tour, so CC's Escape
          binding stays unmounted — C is the only CC toggle then. */}
      {isCommandCircuit && !isTourActive && (
        <InputBindings map={COMMAND_CIRCUIT_EXIT_INPUT} />
      )}
      {isCommandCircuit && (isDemo || isLive) && (
        <InputBindings map={COMMAND_CIRCUIT_STREAM_INPUT} />
      )}
      {isCommandCircuit && isLive && (
        <InputBindings map={COMMAND_CIRCUIT_LIVE_INPUT} />
      )}
      {isDemo && <InputBindings map={DEMO_MODE_INPUT} />}
      {/* Y focuses chat only while the chat HUD is actually visible. */}
      {isLive && showChat && <InputBindings map={LIVE_CHAT_INPUT} />}
      {/* Observer fly/follow toggle shares F with the CC follow toggle —
          only one is mounted at a time. Watchers get the same toggle,
          handled client-side by SpectatorController. */}
      {isLive && !isCommandCircuit && (
        <InputBindings map={LIVE_OBSERVER_INPUT} />
      )}
      {isLive && inputMode === "follow" && (
        <InputBindings map={LIVE_FOLLOW_INPUT} />
      )}
      {isTourActive && <InputBindings map={TOUR_MODE_INPUT} />}
    </>
  );
}
