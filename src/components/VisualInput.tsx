import { lazy, Suspense } from "react";
import { useTouchDevice } from "./useTouchDevice";
import { useCameraTour } from "../state/cameraTourStore";
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
  const { showInputOverlay } = useSettings();

  return (
    <Suspense>
      {isTouch && !isTourActive ? <TouchJoystick /> : null}
      {isTouch === false && showInputOverlay ? (
        // isTouch can be `null` before we know for sure; make sure this doesn't
        // render until it's definitively false
        <KeyboardOverlay />
      ) : null}
    </Suspense>
  );
}
