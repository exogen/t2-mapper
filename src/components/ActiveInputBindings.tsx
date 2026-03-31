import { useRecording } from "./usePlayback";
import { useInputMode } from "./InputContext";
import { useCameraTour } from "../state/cameraTourStore";
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
  const isDemo = recording?.source === "demo";
  const isLive = recording?.source === "live";
  const isMap = !recording;

  // Free-fly movement: map mode (no tour) or live free-fly.
  const showFreeFly =
    (isMap && !isTourActive) || (isLive && inputMode === "fly");

  // Camera can be moved by drag/touch in most modes.
  const showMovableCamera = !isTourActive;

  // Pointer lock: available when not touring.
  const showPointerLockable = !isTourActive;

  return (
    <>
      {showFreeFly && <InputBindings map={FREE_FLY_INPUT} />}
      {showMovableCamera && <InputBindings map={MOVABLE_CAMERA_INPUT} />}
      {showPointerLockable && <InputBindings map={POINTER_LOCKABLE_INPUT} />}
      {isMap && !isTourActive && <InputBindings map={MAP_MODE_INPUT} />}
      {isDemo && <InputBindings map={DEMO_MODE_INPUT} />}
      {isLive && <InputBindings map={LIVE_OBSERVER_INPUT} />}
      {isLive && inputMode === "follow" && (
        <InputBindings map={LIVE_FOLLOW_INPUT} />
      )}
      {isTourActive && <InputBindings map={TOUR_MODE_INPUT} />}
    </>
  );
}
