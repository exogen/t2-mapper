import { createStore } from "zustand/vanilla";
import type { Group } from "three";
import type { StreamingPlayback } from "../stream/types";
export type DemoCameraMode =
  "original" | "freeFly" | "orbitOverride" | "firstPersonOverride";

/** Default follow orbit distance, and the scroll-zoom clamp range. */
export const DEFAULT_ORBIT_DISTANCE = 8;
export const MIN_ORBIT_DISTANCE = 2;
export const MAX_ORBIT_DISTANCE = 45;

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

/**
 * Whether the CastGenius commentary track is audibly playing right now,
 * and where the broadcast intends to begin (the first cue's demo time
 * from the `.commentary.json` sidecar — the intro may start before the
 * plan's first scene, so the director starts playback there). Written
 * by CommentaryAudio (same module-scope-mutable pattern as
 * streamClock); read at trigger time by in-game sound players — the
 * booth replaces the game announcer and ducks voice binds while it's
 * on air — and by the director when it seeks past dead air.
 */
export const commentaryPlayback = {
  active: false,
  startSec: null as number | null,
};

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
  /** User-controlled orbit distance (world units), used when cameraMode
   *  is "orbitOverride". The scroll wheel zooms this in/out in follow mode
   *  (in free-fly the wheel adjusts fly speed instead). */
  orbitOverrideDistance: number;
  /**
   * Damping rate (per second) applied to the orbit camera's TARGET
   * point, or null for the default rigid attachment. The auto-director
   * sets this while it drives: a follow target teleports on every flag
   * drop, pass and pickup (carrier → item → new carrier), and a rigidly
   * attached camera jumps with it. A damped target reads as a
   * human-operated camera catching up instead. Manual follow keeps the
   * rigid feel (null).
   */
  orbitTargetDamping: number | null;
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
  /**
   * Which camera the spectate follow uses: the observer orbit or a
   * first-person view from the followed player's eyes. Enforced as
   * cameraMode each frame while the follow target resolves.
   */
  followCameraMode: "orbitOverride" | "firstPersonOverride";
  /**
   * The last-followed player's target id and list position, remembered
   * across free-fly / pan so re-entering follow resumes the same player.
   * Persist through exit (only reset on stream end); if that player is
   * gone, the ghost index picks the next one in the list.
   */
  lastFollowTargetId: number | null;
  lastFollowGhostIndex: number | null;
  /**
   * Flag-follow mode: the number key held as the follow target. While
   * set, the follow target re-resolves every frame to the flag that slot
   * selects (the matching team's flag, or the slot-th flag in teamless
   * games — see resolveFlagSlot) — the item on its stand / on the
   * ground, or the carrying player while held — so the camera hands off
   * as the flag changes hands. Cleared by any player follow or follow
   * exit.
   */
  followFlagSlot: number | null;
}

export const streamPlaybackStore = createStore<StreamPlaybackState>()(() => ({
  playback: null,
  root: null,
  cameraMode: "original",
  orbitOverrideYaw: 0,
  orbitOverridePitch: 0,
  orbitOverrideDistance: DEFAULT_ORBIT_DISTANCE,
  orbitTargetDamping: null,
  followEntityId: null,
  followTargetId: null,
  followCameraMode: "orbitOverride",
  lastFollowTargetId: null,
  lastFollowGhostIndex: null,
  followFlagSlot: null,
}));

/** Reset all streaming playback state. Called when streaming ends. */
export function resetStreamPlayback(): void {
  streamClock.time = 0;
  streamPlaybackStore.setState({
    playback: null,
    cameraMode: "original",
    orbitOverrideYaw: 0,
    orbitOverridePitch: 0,
    orbitOverrideDistance: DEFAULT_ORBIT_DISTANCE,
    followEntityId: null,
    followTargetId: null,
    followCameraMode: "orbitOverride",
    lastFollowTargetId: null,
    lastFollowGhostIndex: null,
    followFlagSlot: null,
  });
  // root is managed by the React ref callback in EntityScene — don't clear it
}
