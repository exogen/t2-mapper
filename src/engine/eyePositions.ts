import type { Object3D, Vector3 } from "three";
import type { DTSShape } from "../dts/dtsModel";
import { getOwnNodePosition } from "../sceneNodes";

const eyeNodes = new Map<
  string,
  { root: DTSShape; eye: Object3D | null; cam: Object3D | null }
>();

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
  return readViewNode(entityId, target, "eye");
}

/** ShapeBase uses the animated cam node at any nonzero pullback. */
export function readCameraNodePosition(
  entityId: string,
  target: Vector3,
): Vector3 | null {
  return readViewNode(entityId, target, "cam");
}

function readViewNode(
  entityId: string,
  target: Vector3,
  key: "eye" | "cam",
): Vector3 | null {
  const view = eyeNodes.get(entityId);
  const node = view?.[key];
  if (!view || !node) return null;
  // The first frame following a dormant shape needs its new pose before draw.
  view.root.catchUpPose?.();
  if (!getOwnNodePosition(view.root, node, target)) return null;
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
  root: DTSShape,
): () => void {
  if (!entityId) return () => {};
  const view = {
    root,
    eye: eyeBone,
    cam: root.getNodeByName("cam") ?? eyeBone,
  };
  eyeNodes.set(entityId, view);
  return () => {
    if (eyeNodes.get(entityId) === view) eyeNodes.delete(entityId);
  };
}
