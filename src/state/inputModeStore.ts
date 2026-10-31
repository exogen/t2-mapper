import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";

/**
 * Which camera input applies: free-look on a local camera, a live fly
 * camera (input becomes moves), or an orbit follow (drags orbit the
 * target, so their direction flips). Set by the input consumer; read by
 * input producers and the key binding UI.
 */
export type InputMode = "local" | "fly" | "follow";

export const inputModeStore = createStore<{ mode: InputMode }>()(() => ({
  mode: "local",
}));

export function setInputMode(mode: InputMode): void {
  if (inputModeStore.getState().mode !== mode) inputModeStore.setState({ mode });
}

export function useInputMode(): InputMode {
  return useStore(inputModeStore, (state) => state.mode);
}
