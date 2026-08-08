import { lazy, Suspense } from "react";
import { useTouchDevice } from "./useTouchDevice";
import { useCameraTour } from "../state/cameraTourStore";
import { useCommandCircuit } from "../state/commandCircuitStore";
import { useSettings } from "./SettingsProvider";

const TouchJoystick = lazy(() =>
  import("@/src/components/TouchJoystick").then((mod) => ({
    default: mod.TouchJoystick,
  })),
);

const KeyboardOverlay = lazy(() =>
  import("@/src/components/KeyboardOverlay").then((mod) => ({
    default: mod.KeyboardOverlay,
  })),
);

export function VisualInput() {
  const isTouch = useTouchDevice();
  const isTourActive = useCameraTour((s) => s.animation !== null);
  // Command circuit pans/zooms via direct touch gestures; the free-fly
  // joysticks don't apply.
  const isCommandCircuit = useCommandCircuit((s) => s.active);
  const { showInputOverlay } = useSettings();

  return (
    <Suspense>
      {isTouch && !isTourActive && !isCommandCircuit ? <TouchJoystick /> : null}
      {isTouch === false && showInputOverlay ? (
        // isTouch can be `null` before we know for sure; make sure this doesn't
        // render until it's definitively false
        <KeyboardOverlay />
      ) : null}
    </Suspense>
  );
}
