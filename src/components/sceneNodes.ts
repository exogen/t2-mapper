import type { Object3D } from "three";

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
): void {
  const walk = (node: Object3D): boolean => {
    if (node !== root && isMountedContent(node)) return true;
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
export function collectOwnNodes(root: Object3D): Map<string, Object3D> {
  const nodes = new Map<string, Object3D>();
  forEachOwnNode(root, (node) => {
    const lower = node.name.toLowerCase();
    if (lower && !nodes.has(lower)) nodes.set(lower, node);
  });
  return nodes;
}

/** The shape's own node called `name`, matched case insensitively. */
export function findOwnNode(root: Object3D, name: string): Object3D | null {
  const lower = name.toLowerCase();
  let found: Object3D | null = null;
  forEachOwnNode(root, (node) => {
    if (node.name.toLowerCase() !== lower) return;
    found = node;
    return false;
  });
  return found;
}
