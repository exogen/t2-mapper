import { lazy, Suspense } from "react";
import { useTouchDevice } from "./useTouchDevice";

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

  return (
    <Suspense>
      {isTouch ? <TouchJoystick /> : null}
      {isTouch === false ? (
        // isTouch can be `null` before we know for sure; make sure this doesn't
        // render until it's definitively false
        <KeyboardOverlay />
      ) : null}
    </Suspense>
  );
}
