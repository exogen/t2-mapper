import { Scene, type Object3D } from "three";

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

/** Re-mark changed objects right before their scene's matrix update.
 * A separate renderer must leave other scenes' pending changes intact. */
export function flushTransformChanges(root?: Object3D): void {
  for (const object of changed) {
    if (root) {
      let ancestor = object;
      while (ancestor !== root && ancestor.parent) ancestor = ancestor.parent;
      if (ancestor !== root) {
        // Detached subtrees have no renderer left to consume this entry.
        // Keep their dirty flag; attachFrozen re-queues them if reused.
        if (!(ancestor instanceof Scene)) {
          object.matrixWorldNeedsUpdate = true;
          changed.delete(object);
        }
        continue;
      }
    }
    object.matrixWorldNeedsUpdate = true;
    changed.delete(object);
  }
}
