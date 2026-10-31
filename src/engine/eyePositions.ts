import type { Object3D, Vector3 } from "three";
import { getOwnNodePosition } from "../sceneNodes";

const eyeNodes = new Map<string, { root: Object3D; node: Object3D }>();

/**
 * The entity's animated "Eye" node position in entity-local Three.js
 * space: what the camera system reads for first-person views (a player's
 * eye, a vehicle's cockpit eye). Read it after the ShapeAnimation stage
 * to see this frame's pose. Null when the entity's shape has no eye node.
 */
export function readEyePosition(
  entityId: string,
  target: Vector3,
): Vector3 | null {
  const eye = eyeNodes.get(entityId);
  if (!eye || !getOwnNodePosition(eye.root, eye.node, target)) return null;
  // DTS model-local position → entity-local Three.js space through the
  // shape's 90° Y rotation (same swizzle as the static eye extraction).
  return target.set(target.z, target.y, -target.x);
}

/**
 * Make `eyeBone` the entity's eye node until the returned cleanup runs.
 * Torque's getEyeTransform reads only the node's position from the
 * animated skeleton (rotation comes from the head pitch/yaw instead).
 */
export function registerEyeNode(
  entityId: string | undefined,
  eyeBone: Object3D | null,
  root: Object3D,
): () => void {
  if (!eyeBone || !entityId) return () => {};
  const eye = { root, node: eyeBone };
  eyeNodes.set(entityId, eye);
  return () => {
    if (eyeNodes.get(entityId) === eye) eyeNodes.delete(entityId);
  };
}
