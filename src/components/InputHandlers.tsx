import { lazy, ReactNode, Suspense } from "react";
import { KeyboardControls } from "@react-three/drei";
import { JoystickProvider } from "./JoystickContext";
import { useTouchDevice } from "./useTouchDevice";
import {
  KeyboardAndMouseHandler,
  KEYBOARD_CONTROLS,
} from "./KeyboardAndMouseHandler";

const TouchHandler = lazy(() =>
  import("@/src/components/TouchHandler").then((mod) => ({
    default: mod.TouchHandler,
  })),
);

export function InputProvider({ children }: { children: ReactNode }) {
  return (
    <KeyboardControls map={KEYBOARD_CONTROLS}>
      <JoystickProvider>{children}</JoystickProvider>
    </KeyboardControls>
  );
}

export function InputHandlers() {
  const isTouch = useTouchDevice();

  return (
    <>
      <KeyboardAndMouseHandler />
      {isTouch ? (
        <Suspense>
          <TouchHandler />
        </Suspense>
      ) : null}
    </>
  );
}
