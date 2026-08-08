import type { OrthographicCamera, PerspectiveCamera } from "three";

/**
 * Explicit handles to the app's cameras, registered by the components that
 * own them. Code that positions a specific camera (mission camera snaps,
 * view-hash restores, coordinate links) should target it here instead of
 * going through r3f's "current default camera", which changes identity when
 * command circuit mode toggles and invites stale-closure bugs. The r3f
 * default camera remains the source of truth only for render-follower
 * concerns (what's on screen, raycasting, terrain tiling, fog).
 */
export const cameraRegistry: {
  perspective: PerspectiveCamera | null;
  ortho: OrthographicCamera | null;
} = {
  perspective: null,
  ortho: null,
};
