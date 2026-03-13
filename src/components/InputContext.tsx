import { createContext, useContext } from "react";

export type InputMode = "local" | "fly" | "follow";

export interface InputFrame {
  /** Look rotation deltas (radians). */
  deltaYaw: number;
  deltaPitch: number;
  /** Movement axes [-1, 1], pre-scaled by speedMultiplier. */
  x: number;
  y: number;
  z: number;
  /** Trigger states. OR'd by consumer between ticks. */
  triggers: boolean[];
  /** Frame delta time (seconds). */
  delta: number;
}

export type OnInput = (frame: InputFrame) => void;

export interface InputContextValue {
  /** Ref to accumulated input frames. Consumer reads and clears. */
  moveQueue: React.RefObject<InputFrame[]>;
  /** Callback for producers to report input each frame. */
  onInput: OnInput;
  /** Current input mode. Set by InputConsumer, read by producers. */
  mode: InputMode;
  /** Setter for mode (called by InputConsumer). */
  setMode: (mode: InputMode) => void;
}

export const InputContext = createContext<InputContextValue | null>(null);

export function useInputContext(): InputContextValue {
  const ctx = useContext(InputContext);
  if (!ctx) {
    throw new Error("useInputContext must be used within an InputProvider");
  }
  return ctx;
}

export function useOnInput(): OnInput {
  return useInputContext().onInput;
}

export function useInputMode(): InputMode {
  return useInputContext().mode;
}
