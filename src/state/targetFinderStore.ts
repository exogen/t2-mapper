import { createStore } from "zustand/vanilla";

/** Shared with the input bindings so the launcher suspends camera controls. */
export const targetFinderStore = createStore(() => ({ open: false }));
