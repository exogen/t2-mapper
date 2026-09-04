/**
 * Resolving a planned shot to the live thing it is about.
 *
 * The planner names subjects by flag slot and target id, which survive
 * respawns and flag hand-offs; these helpers turn those into the scene
 * object present right now, and read its motion. Everything is
 * best-effort: a subject that has left scope simply returns null and the
 * caller keeps the shot it has.
 */
import { shotSubjectOf } from "./shotPath";
import { Vector3 } from "three";
import type { Object3D } from "three";
import { gameEntityStore } from "../state/gameEntityStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import {
  findLivingEntityByTargetId,
  resolveFlagEntityId,
} from "../state/watchFollow";
import { threeForwardHeading } from "../stream/streamHelpers";
import type { Shot, ShotSubject } from "./types";
import { AIM_MIN_SPEED } from "./cameraRig";

export function shotContains(shot: Shot, t: number): boolean {
  return t >= shot.startSec && t < shot.endSec;
}

/** The subject's velocity in Three space (Torque [x,y,z] → (y,z,x)),
 *  or null when it isn't being replicated this frame. */
export function subjectVelocity(
  entityId: string,
  out: Vector3,
): Vector3 | null {
  const entity = gameEntityStore.getState().streamEntities.get(entityId);
  const velocity =
    entity && "keyframes" in entity ? entity.keyframes?.[0]?.velocity : null;
  if (!velocity) return null;
  return out.set(velocity[1], velocity[2], velocity[0]);
}

/**
 * The followed subject's heading in the orbit-yaw convention: movement
 * direction while they're actually moving, body facing otherwise.
 * Null when the entity (or any usable signal) is missing this frame.
 */
export function subjectHeading(entityId: string | null): number | null {
  if (!entityId) return null;
  const entity = gameEntityStore.getState().streamEntities.get(entityId);
  if (!entity) return null;
  const velocity =
    "keyframes" in entity ? entity.keyframes?.[0]?.velocity : undefined;
  // Torque velocity [x, y, z]; orbit yaw forward is (cos, 0, sin) in
  // Three (x, z) = Torque (y, x), so heading = atan2(vx, vy).
  if (velocity && Math.hypot(velocity[0], velocity[1]) >= AIM_MIN_SPEED) {
    return Math.atan2(velocity[0], velocity[1]);
  }
  const rotation = "rotation" in entity ? entity.rotation : undefined;
  if (rotation) {
    const [x, y, z, w] = rotation;
    return threeForwardHeading({ x, y, z, w });
  }
  return null;
}

/**
 * The scene group a subject entity renders at, walking mount chains
 * (a carrier in a vehicle portals into the vehicle's group) — the
 * group position is already frame-interpolated by StreamingController.
 */
export function resolveSubjectGroup(entityId: string): Object3D | null {
  const root = streamPlaybackStore.getState().root;
  if (!root) return null;
  const entities = gameEntityStore.getState().streamEntities;
  let id = entityId;
  for (let hops = 0; hops < 4; hops++) {
    const group = root.children.find((child) => child.name === id);
    if (group) return group;
    const entity = entities.get(id);
    const mountId =
      entity && "mountObjectId" in entity ? entity.mountObjectId : undefined;
    if (!mountId) return null;
    id = mountId;
  }
  return null;
}

/**
 * Live player positions within `range` of a point (both Three-space) —
 * probe origins for doorway detection: people fighting over a turtled
 * flag stand in the doorways and corridors, so their positions sample
 * exactly the space a straight ray from the hold cannot reach.
 */
export function livingPlayerPositionsNear(
  center: Vector3,
  range: number,
  limit: number,
): Vector3[] {
  const root = streamPlaybackStore.getState().root;
  if (!root) return [];
  const entities = gameEntityStore.getState().streamEntities;
  const out: Vector3[] = [];
  for (const child of root.children) {
    const entity = entities.get(child.name);
    if (entity?.renderType !== "Player") continue;
    if ((entity.keyframes?.[0]?.damageState ?? 0) !== 0) continue;
    if (child.position.distanceTo(center) > range) continue;
    out.push(child.position.clone());
    if (out.length >= limit) break;
  }
  return out;
}

/** The scene group for a planned shot subject, if it's in scope now. */
export function resolveShotSubjectGroup(subject: ShotSubject): Object3D | null {
  const entityId =
    subject.type === "flag"
      ? resolveFlagEntityId(subject.slot)
      : findLivingEntityByTargetId(subject.targetId);
  return entityId ? resolveSubjectGroup(entityId) : null;
}

/** Index of the shot containing `t`, or -1 when past the plan's end. */
export function findShotIndex(shots: Shot[], t: number): number {
  if (t < shots[0].startSec) return 0;
  let lo = 0;
  let hi = shots.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (shots[mid].startSec <= t) lo = mid;
    else hi = mid - 1;
  }
  return t < shots[lo].endSec ? lo : -1;
}

// Re-exported for the browser-side callers that already import it from
// here. It LIVES in shotPath because it is pure — this module reaches
// into the live entity store, and planner code cannot follow it there.
export { shotSubjectOf };
