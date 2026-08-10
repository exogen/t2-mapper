import {
  lazy,
  ReactNode,
  Suspense,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import { JoystickProvider } from "./JoystickContext";
import { useTouchDevice } from "./useTouchDevice";
import { MouseAndKeyboardHandler } from "./MouseAndKeyboardHandler";
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

  // Stable identity except on real mode changes — consumers include every
  // input handler, so a fresh object here invalidates all of them.
  const value = useMemo(
    () => ({ moveQueue, onInput, mode, setMode }),
    [onInput, mode],
  );

  return (
    <InputContext.Provider value={value}>
      <JoystickProvider>{children}</JoystickProvider>
    </InputContext.Provider>
  );
}

export function InputProducer() {
  const isTouch = useTouchDevice();

  return (
    <>
      <MouseAndKeyboardHandler />
      {isTouch ? (
        <Suspense>
          <TouchHandler />
        </Suspense>
      ) : null}
    </>
  );
}
