import type { Object3D } from "three";

const changed = new Set<Object3D>();

/**
 * Note that a frozen object (matrixAutoUpdate off) moved, or was attached
 * somewhere new: recompose its local matrix (unless `recompose` is false)
 * and have the next scene update refresh its subtree. Setting
 * matrixWorldNeedsUpdate alone isn't enough: any world-matrix query in
 * between (getWorldPosition and friends call updateWorldMatrix) clears it
 * without updating the children.
 */
export function markTransformChanged(object: Object3D, recompose = true): void {
  if (recompose) object.updateMatrix();
  object.matrixWorldNeedsUpdate = true;
  changed.add(object);
}

/** Re-mark every changed object right before the scene's matrix update. */
export function flushTransformChanges(): void {
  for (const object of changed) object.matrixWorldNeedsUpdate = true;
  changed.clear();
}
