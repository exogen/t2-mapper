import { Vector3, type Object3D, type Quaternion } from "three";
import { castWorldRay } from "../collision/worldCollision";
import { castWaterRay } from "../collision/waterLevel";
import { threeToTorque } from "../scene/coordinates";
import { DEFAULT_EYE_HEIGHT } from "../stream/playbackUtils";
import { yawPitchToQuaternion } from "../stream/streamHelpers";
import type { StreamCamera } from "../stream/types";
import {
  readCameraNodePosition,
  readEyePosition,
  readWorldCameraNodes,
} from "./eyePositions";

const eye = new Vector3();
const pivot = new Vector3();
const pullback = new Vector3();
const DEATH_ORBIT_DISTANCE = 4;

export function recordedCameraBlend(
  camera: StreamCamera,
  interpT: number,
): number {
  const end =
    camera.controlCameraBlend ?? (camera.mode === "first-person" ? 0 : 1);
  const start = camera.previousControlCameraBlend ?? end;
  return start + (end - start) * interpT;
}

/** Camera::interpolateTick blends the observer's two Euler angles. */
export function recordedObserverRotation(
  previous: StreamCamera,
  current: StreamCamera,
  interpT: number,
): StreamCamera["rotation"] | undefined {
  if (
    previous.yaw === undefined ||
    previous.pitch === undefined ||
    current.yaw === undefined ||
    current.pitch === undefined
  )
    return;
  const turn = current.yaw - previous.yaw;
  return yawPitchToQuaternion(
    previous.yaw + Math.atan2(Math.sin(turn), Math.cos(turn)) * interpT,
    previous.pitch + (current.pitch - previous.pitch) * interpT,
  );
}

/** ShapeBase::getCameraTransform (0x5eb380) offsets along the eye direction. */
export function applyPlayerControlCamera(
  camera: Object3D,
  player: Object3D | undefined,
  entityId: string,
  distance: number,
  blend: number,
  options?: {
    cameraOffset?: number;
    colliderId?: string;
    mountColliderId?: string;
    mountedPlayerLook?: Quaternion;
    shapeEye?: boolean;
  },
): void {
  const useWorldPose =
    options?.mountedPlayerLook !== undefined || options?.shapeEye;
  if (
    !useWorldPose ||
    !readWorldCameraNodes(
      entityId,
      eye,
      camera.quaternion,
      pivot,
      options?.mountedPlayerLook,
    )
  ) {
    if (!readEyePosition(entityId, eye))
      eye.set(0, options?.shapeEye ? 0 : DEFAULT_EYE_HEIGHT, 0);
    if (!readCameraNodePosition(entityId, pivot)) pivot.set(0, 0, 0);
    if (player) {
      eye.applyQuaternion(player.quaternion);
      pivot.applyQuaternion(player.quaternion);
    }
    eye.add(camera.position);
    pivot.add(camera.position);
  }
  if (blend === 0) {
    camera.position.copy(eye);
    return;
  }
  pullback.set(0, 0, 1).applyQuaternion(camera.quaternion);
  const length = distance * blend;
  const offset = options?.cameraOffset ?? 0;
  camera.position.copy(pivot).addScaledVector(pullback, length);
  camera.position.y += offset;
  if (length === 0 && offset === 0) return;
  const hit = castWorldRay(
    threeToTorque(pivot),
    threeToTorque(camera.position),
    {
      includeStatics: true,
      includeForceFields: false,
      excludeStaticColliders:
        options?.mountColliderId === undefined
          ? options?.colliderId
          : [options.colliderId, options.mountColliderId],
    },
  );
  if (!hit) return;
  const [nx, ny, nz] = hit.normal;
  const clearance =
    -0.1 * (nx * pullback.z + ny * pullback.x + nz * pullback.y);
  const fraction = Math.max(0, hit.t - clearance);
  if (fraction === 0) camera.position.copy(eye);
  else {
    camera.position.copy(pivot).addScaledVector(pullback, length * fraction);
    camera.position.y += offset;
  }
}

/** Camera::validateEyePoint (0x5ccf90) retracts the corpse/observer orbit. */
export function applyObserverOrbit(
  camera: Object3D,
  center: Vector3,
  distance = DEATH_ORBIT_DISTANCE,
  excludeStaticColliderId?: string,
): void {
  pullback.set(0, 0, 1).applyQuaternion(camera.quaternion);
  camera.position.copy(center).addScaledVector(pullback, distance * 2.5);
  const start = threeToTorque(center);
  const end = threeToTorque(camera.position);
  const world = castWorldRay(start, end, {
    includeStatics: true,
    includeForceFields: true,
    excludeStaticColliders: excludeStaticColliderId,
  });
  const water = castWaterRay(start, end);
  const hit = water && (!world || water.t < world.t) ? water : world;
  if (hit) {
    const [nx, ny, nz] = hit.normal;
    const incidence = -(nx * pullback.z + ny * pullback.x + nz * pullback.y);
    if (incidence > 0.01)
      distance = Math.max(
        0,
        Math.min(distance, hit.t * distance * 2.5 - 0.05 / incidence),
      );
  }
  camera.position.copy(center).addScaledVector(pullback, distance);
}
