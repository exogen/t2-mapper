import type { Object3D } from "three";
import { markTransformChanged } from "../transformChanges";
import {
  DTSAnimationTransform,
  DTSNode,
  DTSObject,
  type DTSShape,
} from "../dts/dtsModel";

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

/**
 * Freeze the parts of a DTS model that never move relative to their
 * parents — the shape root, detail groups, meshes and batches — so its
 * matrices update only when a node moves. Nodes and objects stay
 * auto-updated (hosts may edit them) but recompose only when their pose
 * changes (see DTSNode). Meshes the shape realizes later are frozen as
 * they're added.
 */
export function freezeModelTransforms(shape: DTSShape): () => void {
  shape.traverse((object) => {
    if (isPoseNode(object)) return;
    object.updateMatrix();
    object.matrixAutoUpdate = false;
  });
  shape.updateMatrixWorld(true);
  return shape.onMeshAdded((mesh) => {
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
  });
}

function isPoseNode(object: Object3D): boolean {
  return (
    object instanceof DTSNode ||
    object instanceof DTSObject ||
    object instanceof DTSAnimationTransform
  );
}

/**
 * Attach a frozen subtree under `parent`. A frozen parent doesn't refresh
 * its children's world matrices on its own, so mark the subtree for the
 * next update.
 */
export function attachFrozen(parent: Object3D, object: Object3D): void {
  parent.add(object);
  markTransformChanged(object, false);
}
