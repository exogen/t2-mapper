import { createStore } from "zustand/vanilla";

export const cameraZoomPreviewStore = createStore<{ scale: number | null }>(
  () => ({ scale: null }),
);
