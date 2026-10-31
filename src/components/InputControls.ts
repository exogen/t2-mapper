import { useEffect, useEffectEvent } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import {
  inputControlsStore,
  subscribeAction,
  type ActionState,
} from "../state/inputControls";

export * from "../state/inputControls";

// ── Public hooks ──

/** Reactive selector for input action state. */
export function useInputControls<T>(
  selector: (state: Record<string, ActionState>) => T,
): T {
  return useStoreWithEqualityFn(inputControlsStore, (s) => selector(s.actions));
}

/**
 * Register a callback for a one-shot action (key press, click, etc.).
 * The callback always sees current closure state via useEffectEvent.
 */
export function useInputAction(action: string, callback: () => void) {
  const stableCallback = useEffectEvent(callback);

  useEffect(() => {
    return subscribeAction(action, stableCallback);
  }, [action]);
}
