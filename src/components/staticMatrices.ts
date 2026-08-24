import type { Object3D } from "three";

/**
 * Freeze a static subtree's transforms. While matrixAutoUpdate is true,
 * three recomposes every object's local matrix on every frame — thousands
 * of wasted compose() calls for geometry that never moves (terrain,
 * interiors). This composes each object's matrix once from its current
 * position/quaternion/scale, computes world matrices, and disables
 * auto-update for the whole subtree.
 *
 * Call again (after unfreezing) whenever a transform-affecting input
 * changes. Children that mount later (suspended content, debug helpers)
 * default to auto-update and keep working — they just aren't frozen.
 */
export function freezeStaticMatrices(root: Object3D): void {
  root.traverse((obj) => {
    obj.updateMatrix();
    obj.matrixAutoUpdate = false;
  });
  // updateMatrix marked the world matrices dirty; propagate them once.
  root.updateMatrixWorld(true);
}

/** Undo freezeStaticMatrices so the subtree tracks its props again. */
export function unfreezeStaticMatrices(root: Object3D): void {
  root.traverse((obj) => {
    obj.matrixAutoUpdate = true;
  });
}
