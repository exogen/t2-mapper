import { createStore } from "zustand/vanilla";
import { useStoreWithEqualityFn } from "zustand/traditional";
import type { StreamSnapshot } from "../stream/types";

/**
 * The latest stream snapshot, published once per Torque tick (~31 Hz)
 * during demo/live playback. Kept in its own store — separate from
 * engineStore — so the high-frequency publish only wakes components that
 * actually display tick data (HUD, chat, scores), not the hundreds of
 * scene components subscribed to engineStore for rare runtime changes.
 */
interface StreamSnapshotState {
  snapshot: StreamSnapshot | null;
}

export const streamSnapshotStore = createStore<StreamSnapshotState>()(() => ({
  snapshot: null,
}));

export function setStreamSnapshot(snapshot: StreamSnapshot | null): void {
  streamSnapshotStore.setState({ snapshot });
}

export function useStreamSnapshot<T>(
  selector: (snapshot: StreamSnapshot | null) => T,
  equality?: (a: T, b: T) => boolean,
): T {
  return useStoreWithEqualityFn(
    streamSnapshotStore,
    (state) => selector(state.snapshot),
    equality,
  );
}
