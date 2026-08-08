import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { gameEntityStore } from "./gameEntityStore";

export interface CommandCircuitState {
  active: boolean;
  /**
   * Enters command circuit mode. No-op outside static map viewing.
   */
  activate(): void;
  deactivate(): void;
  toggle(): void;
}

export const commandCircuitStore = createStore<CommandCircuitState>(
  (set, get) => ({
    active: false,
    activate() {
      if (gameEntityStore.getState().dataSource !== "map") return;
      set({ active: true });
    },
    deactivate() {
      set({ active: false });
    },
    toggle() {
      if (get().active) {
        get().deactivate();
      } else {
        get().activate();
      }
    },
  }),
);

export function useCommandCircuit<T>(
  selector: (state: CommandCircuitState) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(commandCircuitStore, selector, equality);
}
