import { createStore } from "zustand/vanilla";
import type { Group } from "three";
import type { StreamingPlayback } from "../stream/types";
import type { GameEntity } from "./gameEntityTypes";

export type DemoCameraMode = "original" | "freeFly" | "orbitOverride";

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
  /** Camera mode override for demo playback. */
  cameraMode: DemoCameraMode;
  /** User-controlled orbit yaw (radians), used when cameraMode is "orbitOverride". */
  orbitOverrideYaw: number;
  /** User-controlled orbit pitch (radians), used when cameraMode is "orbitOverride". */
  orbitOverridePitch: number;
  /** Live entity map, updated every frame. Components read from this in
   * useFrame to get the latest render fields (threads, weapons, etc.)
   * without triggering React re-renders. */
  entities: Map<string, GameEntity>;
}

export const streamPlaybackStore = createStore<StreamPlaybackState>()(() => ({
  time: 0,
  playback: null,
  root: null,
  cameraMode: "original",
  orbitOverrideYaw: 0,
  orbitOverridePitch: 0,
  entities: new Map(),
}));

/** Reset all streaming playback state. Called when streaming ends. */
export function resetStreamPlayback(): void {
  streamPlaybackStore.setState({
    time: 0,
    playback: null,
    cameraMode: "original",
    orbitOverrideYaw: 0,
    orbitOverridePitch: 0,
  });
  // root is managed by the React ref callback in EntityScene — don't clear it
}
