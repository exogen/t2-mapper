import {
  lazy,
  ReactNode,
  Suspense,
  useCallback,
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

  return (
    <InputContext.Provider value={{ moveQueue, onInput, mode, setMode }}>
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
