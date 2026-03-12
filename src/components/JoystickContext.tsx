import {
  createContext,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from "react";

export type JoystickState = {
  angle: number;
  force: number;
};

type JoystickContextType = {
  moveState: RefObject<JoystickState>;
  lookState: RefObject<JoystickState>;
  setMoveState: (state: Partial<JoystickState>) => void;
  setLookState: (state: Partial<JoystickState>) => void;
};

export const JoystickContext = createContext<JoystickContextType | null>(null);

export function useJoystick() {
  const context = useContext(JoystickContext);
  if (!context) {
    throw new Error(
      "No JoystickContext found. Did you forget to add a <JoystickProvider>?",
    );
  }
  return context;
}

export function JoystickProvider({ children }: { children: ReactNode }) {
  const moveState = useRef<JoystickState>({ angle: 0, force: 0 });
  const lookState = useRef<JoystickState>({ angle: 0, force: 0 });

  const setMoveState = useCallback(
    ({ angle, force }: Partial<JoystickState>) => {
      if (angle != null) {
        moveState.current.angle = angle;
      }
      if (force != null) {
        moveState.current.force = force;
      }
    },
    [],
  );

  const setLookState = useCallback(
    ({ angle, force }: Partial<JoystickState>) => {
      if (angle != null) {
        lookState.current.angle = angle;
      }
      if (force != null) {
        lookState.current.force = force;
      }
    },
    [],
  );

  const context: JoystickContextType = useMemo(
    () => ({ moveState, lookState, setMoveState, setLookState }),
    [setMoveState, setLookState],
  );

  return <JoystickContext value={context}>{children}</JoystickContext>;
}
