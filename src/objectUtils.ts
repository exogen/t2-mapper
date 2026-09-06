import type { Object3D } from "three";

/**
 * Whether an object would be drawn: it and every ancestor are visible.
 */
export function isVisibleInHierarchy(object: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}
