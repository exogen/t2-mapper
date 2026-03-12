import { createStore } from "zustand/vanilla";
import type { Group } from "three";
import type { StreamingPlayback } from "../stream/types";
import type { GameEntity } from "./gameEntityTypes";

/**
 * Store for mutable streaming playback state that needs to be shared between
 * the playback controller (writer) and entity rendering components (readers).
 *
 * These values are updated every frame and read imperatively in useFrame
 * callbacks — they intentionally bypass React's render cycle. Use
 * `streamPlaybackStore.getState()` to read current values.
 */
export interface StreamPlaybackState {
  /** Current playback time in seconds, updated every frame. */
  time: number;
  /** The active streaming playback source (demo or live). */
  playback: StreamingPlayback | null;
  /** The Three.js group node containing all entity children. */
  root: Group | null;
  /**
   * When true, ObserverControls drives the camera instead of the stream.
   * Toggled by 'O' key during live observation.
   */
  freeFlyCamera: boolean;
  /** Live entity map, updated every frame. Components read from this in
   * useFrame to get the latest render fields (threads, weapons, etc.)
   * without triggering React re-renders. */
  entities: Map<string, GameEntity>;
}

export const streamPlaybackStore = createStore<StreamPlaybackState>()(() => ({
  time: 0,
  playback: null,
  root: null,
  freeFlyCamera: false,
  entities: new Map(),
}));

/** Reset all streaming playback state. Called when streaming ends. */
export function resetStreamPlayback(): void {
  streamPlaybackStore.setState({
    time: 0,
    playback: null,
    freeFlyCamera: false,
  });
  // root is managed by the React ref callback in EntityScene — don't clear it
}
