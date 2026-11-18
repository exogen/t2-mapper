import { Vector3, type Object3D } from "three";
import { castWorldRay } from "../collision/worldCollision";
import { castWaterRay } from "../collision/waterLevel";
import { threeToTorque } from "../scene/coordinates";
import { DEFAULT_EYE_HEIGHT } from "../stream/playbackUtils";
import type { StreamCamera } from "../stream/types";
import { readCameraNodePosition, readEyePosition } from "./eyePositions";

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

/** ShapeBase::getCameraTransform (0x5eb380) offsets along the eye direction. */
export function applyPlayerControlCamera(
  camera: Object3D,
  player: Object3D | undefined,
  entityId: string,
  distance: number,
  blend: number,
): void {
  if (!readEyePosition(entityId, eye)) eye.set(0, DEFAULT_EYE_HEIGHT, 0);
  if (blend > 0 && !readCameraNodePosition(entityId, pivot)) pivot.copy(eye);
  if (player) eye.applyQuaternion(player.quaternion);
  eye.add(camera.position);
  if (blend === 0) {
    camera.position.copy(eye);
    return;
  }
  if (player) pivot.applyQuaternion(player.quaternion);
  pivot.add(camera.position);
  pullback.set(0, 0, 1).applyQuaternion(camera.quaternion);
  const length = distance * blend;
  camera.position.copy(pivot).addScaledVector(pullback, length);
  if (length <= 0) return;
  const hit = castWorldRay(
    threeToTorque(pivot),
    threeToTorque(camera.position),
    { includeStatics: true, includeForceFields: false },
  );
  if (!hit) return;
  const [nx, ny, nz] = hit.normal;
  const clearance =
    -0.1 * (nx * pullback.z + ny * pullback.x + nz * pullback.y);
  const fraction = Math.max(0, hit.t - clearance);
  if (fraction === 0) camera.position.copy(eye);
  else camera.position.copy(pivot).addScaledVector(pullback, length * fraction);
}

/** Camera::validateEyePoint (0x5ccf90) retracts the corpse/observer orbit. */
export function applyObserverOrbit(
  camera: Object3D,
  center: Vector3,
  distance = DEATH_ORBIT_DISTANCE,
): void {
  pullback.set(0, 0, 1).applyQuaternion(camera.quaternion);
  camera.position.copy(center).addScaledVector(pullback, distance * 2.5);
  const start = threeToTorque(center);
  const end = threeToTorque(camera.position);
  const world = castWorldRay(start, end, {
    includeStatics: true,
    includeForceFields: true,
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
