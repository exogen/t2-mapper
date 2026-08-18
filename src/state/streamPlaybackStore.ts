import { createStore } from "zustand/vanilla";
import type { Group } from "three";
import type { StreamingPlayback } from "../stream/types";
export type DemoCameraMode = "original" | "freeFly" | "orbitOverride";

/**
 * Store for mutable streaming playback state that needs to be shared between
 * the playback controller (writer) and entity rendering components (readers).
 *
 * These values are updated every frame and read imperatively in useFrame
 * callbacks — they intentionally bypass React's render cycle. Use
 * `streamPlaybackStore.getState()` to read current values.
 */
/**
 * Current playback time in seconds, written every frame by the streaming
 * controller and read imperatively in useFrame callbacks. A module-scope
 * mutable (not store state) so per-frame clock updates never notify
 * store subscribers.
 */
export const streamClock = { time: 0 };

export interface StreamPlaybackState {
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
  /**
   * Spectate mode: the entity being followed by the client-side orbit
   * camera (the stream has no orbit target — the relay's server camera
   * never enters follow mode). Drives both the 3D orbit and the command
   * circuit's follow tracking.
   */
  followEntityId: string | null;
  /**
   * The followed player's target id — the per-client identity that
   * survives respawns (each respawn is a brand-new Player ghost/entity,
   * but the client's target outlives them all and is carried in every
   * Player create). Used to re-lock follow onto the replacement entity,
   * like the real observer following a client rather than an object.
   */
  followTargetId: number | null;
}

export const streamPlaybackStore = createStore<StreamPlaybackState>()(() => ({
  playback: null,
  root: null,
  cameraMode: "original",
  orbitOverrideYaw: 0,
  orbitOverridePitch: 0,
  followEntityId: null,
  followTargetId: null,
}));

/** Reset all streaming playback state. Called when streaming ends. */
export function resetStreamPlayback(): void {
  streamClock.time = 0;
  streamPlaybackStore.setState({
    playback: null,
    cameraMode: "original",
    orbitOverrideYaw: 0,
    orbitOverridePitch: 0,
    followEntityId: null,
    followTargetId: null,
  });
  // root is managed by the React ref callback in EntityScene — don't clear it
}
