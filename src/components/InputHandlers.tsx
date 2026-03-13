import { lazy, ReactNode, Suspense, useCallback, useRef, useState } from "react";
import { KeyboardControls } from "@react-three/drei";
import { JoystickProvider } from "./JoystickContext";
import { useTouchDevice } from "./useTouchDevice";
import {
  KeyboardAndMouseHandler,
  KEYBOARD_CONTROLS,
} from "./KeyboardAndMouseHandler";
import {
  InputContext,
  type InputFrame,
  type InputMode,
  type OnInput,
} from "./InputContext";

const TouchHandler = lazy(() =>
  import("@/src/components/TouchHandler").then((mod) => ({
    default: mod.TouchHandler,
  })),
);

export function InputProvider({ children }: { children: ReactNode }) {
  const moveQueue = useRef<InputFrame[]>([]);
  const [mode, setMode] = useState<InputMode>("local");

  const onInput: OnInput = useCallback((frame: InputFrame) => {
    moveQueue.current.push(frame);
  }, []);

  return (
    <InputContext.Provider value={{ moveQueue, onInput, mode, setMode }}>
      <KeyboardControls map={KEYBOARD_CONTROLS}>
        <JoystickProvider>{children}</JoystickProvider>
      </KeyboardControls>
    </InputContext.Provider>
  );
}

export function InputProducers() {
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

/** @deprecated Use `InputProducers` instead. */
export const InputHandlers = InputProducers;
