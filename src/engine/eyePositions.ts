import { Matrix4, Quaternion, Vector3, type Object3D } from "three";
import { updateCollisionWorldMatrix } from "../dts/dtsCollision";
import type { DTSShape } from "../dts/dtsModel";
import { getOwnNodePosition } from "../sceneNodes";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";

const eyeNodes = new Map<
  string,
  { root: DTSShape; eye: Object3D | null; cam: Object3D | null }
>();
const rotationMatrix = new Matrix4();
const updatedTransforms = new Set<Object3D>();
const up = new Vector3(0, 1, 0);
const undoModelRotation = new Quaternion().setFromAxisAngle(
  up,
  -SHAPE_MODEL_ROTATION_Y,
);
const dtsEyeToCamera = new Quaternion().setFromAxisAngle(up, Math.PI);

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

/** Read the rendered Eye and optional Cam through the mount hierarchy. ShapeBase
 * uses the entire Eye transform. Player uses its animated translation and
 * supplies its own head rotation in the mounted body's coordinate frame. */
export function readWorldCameraNodes(
  entityId: string,
  eyePosition: Vector3,
  eyeRotation: Quaternion,
  cameraPosition?: Vector3,
  playerLook?: Quaternion,
): boolean {
  const view = eyeNodes.get(entityId);
  if (!view || (!cameraPosition && !view.eye)) return false;
  view.root.catchUpPose?.();
  const eye = view.eye ?? view.root;
  updatedTransforms.clear();
  updateCollisionWorldMatrix(eye, updatedTransforms);
  if (cameraPosition) {
    const cam = view.cam ?? view.root;
    updateCollisionWorldMatrix(cam, updatedTransforms);
    cameraPosition.setFromMatrixPosition(cam.matrixWorld);
  }
  updatedTransforms.clear();
  eyePosition.setFromMatrixPosition(eye.matrixWorld);
  if (playerLook) {
    eyeRotation
      .setFromRotationMatrix(
        rotationMatrix.extractRotation(view.root.matrixWorld),
      )
      .multiply(undoModelRotation)
      .multiply(playerLook);
  } else {
    eyeRotation
      .setFromRotationMatrix(rotationMatrix.extractRotation(eye.matrixWorld))
      .multiply(dtsEyeToCamera);
  }
  return true;
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
