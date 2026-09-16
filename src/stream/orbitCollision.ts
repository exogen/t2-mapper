import { type PerspectiveCamera, Vector3 } from "three";
import {
  castWorldRay,
  pointObstructed,
  withCollisionQueryBatch,
  type Vec3,
} from "../collision/worldCollision";

const MIN_CLEARANCE = 0.3;
const SURFACE_MARGIN = 0.02;
const SEARCH_STEPS = 10;
const clearanceOptions = {
  includeStatics: true,
  includeForceFields: true,
  terrainSurfaceOnly: true,
} as const;
const _direction = new Vector3();
const _point = new Vector3();
const _start: Vec3 = [0, 0, 0];
const _end: Vec3 = [0, 0, 0];

/** Enclose the near plane so wide FOVs don't let its corners enter a wall. */
export function orbitCameraClearance(camera: PerspectiveCamera): number {
  const halfHeight =
    camera.near * Math.tan((camera.getEffectiveFOV() * Math.PI) / 360);
  return Math.max(
    MIN_CLEARANCE,
    Math.hypot(camera.near, halfHeight, halfHeight * camera.aspect) +
      SURFACE_MARGIN,
  );
}

/** Find a clear destination along the orbit arm, optionally choosing a closer
 * point for a buffer. Coordinates are Three world space; position is updated. */
export function constrainOrbitCamera(
  target: Vector3,
  position: Vector3,
  clearance = MIN_CLEARANCE,
  chooseDistance?: (rayDistance: number) => number,
): number {
  const desired = _direction.subVectors(position, target).length();
  if (desired === 0) return 0;
  _direction.divideScalar(desired);
  _start[0] = target.z;
  _start[1] = target.x;
  _start[2] = target.y;
  _end[0] = position.z;
  _end[1] = position.x;
  _end[2] = position.y;

  return withCollisionQueryBatch(() => {
    const hit = castWorldRay(_start, _end, { includeStatics: true });
    let distance = desired;
    if (hit) {
      // Account for grazing angles, not just distance along the ray.
      const incidence = Math.abs(
        hit.normal[0] * _direction.z +
          hit.normal[1] * _direction.x +
          hit.normal[2] * _direction.y,
      );
      distance = Math.max(
        0,
        hit.t * desired -
          clearance / Math.max(incidence, 1e-6) -
          SURFACE_MARGIN,
      );
    }
    if (chooseDistance) {
      distance = Math.max(0, Math.min(distance, chooseDistance(distance)));
    }
    // Shortening preserves the sightline. Check the near plane at the chosen
    // destination only; testing an unused farther endpoint can over-retract.
    distance = clearCameraDistance(target, distance, clearance);
    position.copy(target).addScaledVector(_direction, distance);
    return distance;
  });
}

function clearCameraDistance(
  target: Vector3,
  distance: number,
  clearance: number,
): number {
  if (distance === 0 || !obstructedAt(target, distance, clearance))
    return distance;
  // A clear centre ray can still put the near plane through a side wall.
  // Bound the work; every nonzero result below has passed the sphere test.
  let clear = 0;
  let blocked = distance;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (clear + blocked) / 2;
    if (obstructedAt(target, mid, clearance)) blocked = mid;
    else clear = mid;
  }
  return clear;
}

function obstructedAt(
  target: Vector3,
  distance: number,
  clearance: number,
): boolean {
  _point.copy(target).addScaledVector(_direction, distance);
  _end[0] = _point.z;
  _end[1] = _point.x;
  _end[2] = _point.y;
  return pointObstructed(_end, clearance, clearanceOptions);
}
