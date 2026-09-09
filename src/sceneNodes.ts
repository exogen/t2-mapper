import type { Object3D, Vector3 } from "three";
import { DTSAnimationTransform, DTSShape } from "./dts/dtsModel";
import { getDTSNodeLookup } from "./dts/dtsNodeLookup";

/** Current node position in its owning shape's coordinates. No world-matrix
 * traversal or inverse is needed: the shape's ancestors cancel out. */
export function getOwnNodePosition(
  root: Object3D,
  node: Object3D,
  target: Vector3,
): Vector3 | null {
  target.set(0, 0, 0);
  let current: Object3D | null = node;
  while (current !== root) {
    if (!current || current instanceof DTSShape || isMountedContent(current))
      return null;
    if (
      current.matrixAutoUpdate ||
      (current instanceof DTSAnimationTransform &&
        current.matrixWorldNeedsUpdate)
    )
      current.updateMatrix();
    target.applyMatrix4(current.matrix);
    current = current.parent;
  }
  return target;
}

/**
 * Whether `node` starts content portaled into one of the shape's mount
 * bones: a mounted image (weapon, barrel) or a mounted object (a pilot).
 * The engine resolves a shape's nodes on its own TSShape, so lookups on
 * a cloned scene must stop here — a pilot carries his own Jetnozzle0.
 */
function isMountedContent(node: Object3D): boolean {
  return !!(node.userData.imageMount || node.userData.objectMount);
}

/**
 * Visit the shape's own nodes, skipping mounted content. Returning false
 * from the callback stops the walk.
 */
function forEachOwnNode(
  root: Object3D,
  callback: (node: Object3D) => boolean | void,
  accept: (name: string) => boolean,
): void {
  const walk = (node: Object3D): boolean => {
    if (node !== root && isMountedContent(node)) return true;
    if (node instanceof DTSShape) {
      for (const [name, index] of getDTSNodeLookup(node.data).names)
        if (accept(name) && callback(node.getNode(index)!) === false)
          return false;
      return true;
    }
    if (callback(node) === false) return false;
    for (const child of node.children) if (!walk(child)) return false;
    return true;
  };
  walk(root);
}

/**
 * The shape's own nodes by lower-cased name (DTS node lookups are case
 * insensitive: the tank turret's mount bones are `mount0`, the belly
 * barrels' grip is `mountPoint`). The first of duplicate names wins.
 */
export function collectOwnNodes(
  root: Object3D,
  accept: (name: string) => boolean = () => true,
): Map<string, Object3D> {
  const nodes = new Map<string, Object3D>();
  forEachOwnNode(
    root,
    (node) => {
      const lower = node.name.toLowerCase();
      if (lower && accept(lower) && !nodes.has(lower)) nodes.set(lower, node);
    },
    accept,
  );
  return nodes;
}

/** The shape's own node called `name`, matched case insensitively. */
export function findOwnNode(root: Object3D, name: string): Object3D | null {
  if (root instanceof DTSShape) return root.getNodeByName(name) ?? null;
  const lower = name.toLowerCase();
  let found: Object3D | null = null;
  forEachOwnNode(
    root,
    (node) => {
      if (node.name.toLowerCase() !== lower) return;
      found = node;
      return false;
    },
    (name) => name === lower,
  );
  return found;
}

/** ShapeBase::getMountTransform: a missing/out-of-range mount uses the owner. */
export function getMountNode(root: Object3D, mountPoint: number): Object3D {
  if (root instanceof DTSShape) {
    const index = getDTSNodeLookup(root.data).mounts[mountPoint] ?? -1;
    return index >= 0 ? root.getNode(index)! : root;
  }
  return mountPoint >= 0 && mountPoint < 32
    ? (findOwnNode(
        root,
        mountPoint === 31 ? "AIRepairNode" : `mount${mountPoint}`,
      ) ?? root)
    : root;
}
