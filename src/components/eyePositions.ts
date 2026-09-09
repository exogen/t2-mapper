import { useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Object3D } from "three";
import { FramePriority } from "./framePriority";
import { getOwnNodePosition } from "../sceneNodes";

/**
 * Each shape's animated "Eye" node position in entity-local Three.js
 * space, by entity id: what the camera system reads for first-person
 * views (a player's eye, a vehicle's cockpit eye). Written every frame
 * by the shape that owns the node, after its animation has run.
 */
export const eyePositions = new Map<string, Vector3>();

/**
 * Publish `eyeBone`'s animated position to eyePositions for as long as
 * the shape is mounted. Torque's getEyeTransform reads only the node's
 * position from the animated skeleton (rotation comes from the head
 * pitch/yaw instead). Call after the component's own animation useFrame
 * so the frame reads the updated pose.
 */
export function useEyePosition(
  entityId: string | undefined,
  eyeBone: Object3D | null,
  root: Object3D,
): void {
  useEffect(() => {
    if (!eyeBone || !entityId) return;
    return () => {
      eyePositions.delete(entityId);
    };
  }, [eyeBone, entityId]);

  useFrame(() => {
    if (!eyeBone || !entityId) return;
    let eyePos = eyePositions.get(entityId);
    if (!eyePos) {
      eyePos = new Vector3();
      eyePositions.set(entityId, eyePos);
    }
    // DTS model-local position → entity-local Three.js space through the
    // shape's 90° Y rotation (same swizzle as the static eye extraction).
    if (!getOwnNodePosition(root, eyeBone, eyePos)) return;
    const gx = eyePos.x;
    const gy = eyePos.y;
    const gz = eyePos.z;
    eyePos.set(gz, gy, -gx);
  }, FramePriority.EyePosition);
}
