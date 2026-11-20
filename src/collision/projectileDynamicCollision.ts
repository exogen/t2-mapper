import { Box3, Matrix3, Matrix4, Vector3 } from "three";
import { castDTSHullRay } from "../dts/dtsCollision";
import { threeToTorque, torqueVecToThree } from "../scene/coordinates";
import { vehicleClassNames } from "../stream/entityClassification";
import type { ProjectileShapeAsset } from "./projectileShapeAssets";
import { segmentBoxEntry } from "./segmentBoxEntry";
import type { Vec3 } from "./terrainCollision";

// DAT_007abf64 in Tribes2.exe. Includes players, vehicles, turrets,
// damageable items, sensors, stations and generators, as used by 0x62dac0.
const DYNAMIC_PROJECTILE_MASK = 0x78214000;

export function isProjectileCollisionTarget(
  className: string,
  dynamicTypeField = 0,
  damageState = 0,
): boolean {
  // Player::castRay only accepts an enabled player, not a corpse.
  if (className === "Player") return damageState === 0;
  return (
    vehicleClassNames.has(className) ||
    className === "Turret" ||
    (dynamicTypeField & DYNAMIC_PROJECTILE_MASK) !== 0
  );
}

/** Vehicle::disableCollision (0x60b0b0) calls each mounted child's virtual.
 * Only vehicle parents propagate the exclusion farther down the mount chain. */
export function getMountedVehicleIds<T extends { id: string; type: string }>(
  entity: T,
  getParent: (entity: T) => T | undefined,
): readonly string[] | undefined {
  let vehicle = getParent(entity);
  if (vehicle?.type !== "Vehicle") return undefined;
  const ids: string[] = [];
  while (
    vehicle?.type === "Vehicle" &&
    vehicle.id !== entity.id &&
    !ids.includes(vehicle.id)
  ) {
    ids.push(vehicle.id);
    vehicle = getParent(vehicle);
  }
  return ids;
}

interface TargetPose {
  id: string;
  /** The entity-root transform for this simulation tick, in Three axes. */
  matrixWorld: Matrix4;
  mountedVehicleIds?: readonly string[];
}

export type ProjectileCollisionTarget = TargetPose &
  (
    | { kind: "player"; boxSize: { x: number; y: number; z: number } }
    | { kind: "shape"; shape: ProjectileShapeAsset }
  );

interface ProjectileCollisionHit {
  id: string;
  /** Parametric distance along the swept interval. */
  t: number;
  point: Vec3;
  normal: Vec3;
}

interface PreparedTarget {
  id: string;
  mountedVehicleIds?: readonly string[];
  worldBounds: Box3;
  inverse: Matrix4;
  volume:
    | { playerBox: Box3; rotation: Matrix4 }
    | { hulls: ProjectileShapeAsset["hulls"]; normalMatrix: Matrix3 };
}

/** One fixed tick's dynamic collision world. Prepare transforms once and
 * reuse them for every dynamic-hit projectile swept during the tick. */
export class ProjectileDynamicCollision {
  private readonly targets: PreparedTarget[] = [];
  private readonly start = new Vector3();
  private readonly end = new Vector3();
  private readonly localStart = new Vector3();
  private readonly localEnd = new Vector3();
  private readonly hullStart = new Vector3();
  private readonly hullEnd = new Vector3();
  private readonly normal = new Vector3();
  private readonly bestNormal = new Vector3();
  private readonly point = new Vector3();
  private readonly bounds = new Box3();

  constructor(targets: Iterable<ProjectileCollisionTarget>) {
    for (const target of targets) {
      const { id, matrixWorld, mountedVehicleIds } = target;
      if (target.kind === "player") {
        // PlayerData::boxSize is in Torque axes.
        const { x, y, z } = target.boxSize;
        const halfX = y * 0.5;
        const halfZ = x * 0.5;
        const playerBox = new Box3(
          new Vector3(-halfX, 0, -halfZ),
          new Vector3(halfX, z, halfZ),
        );
        this.targets.push({
          id,
          mountedVehicleIds,
          worldBounds: playerBox.clone().applyMatrix4(matrixWorld),
          inverse: matrixWorld.clone().invert(),
          volume: {
            playerBox,
            rotation: new Matrix4().extractRotation(matrixWorld),
          },
        });
      } else if (target.shape.hulls.length) {
        this.targets.push({
          id,
          mountedVehicleIds,
          worldBounds: target.shape.bounds.clone().applyMatrix4(matrixWorld),
          inverse: matrixWorld.clone().invert(),
          volume: {
            hulls: target.shape.hulls,
            normalMatrix: new Matrix3().getNormalMatrix(matrixWorld),
          },
        });
      }
    }
  }

  /** LinearProjectile::updatePos (0x62dac0). Caller passes the shooter and
   * its vehicle only while the native source timeout is active. */
  cast(
    start: Vec3,
    end: Vec3,
    sourceId?: string,
    vehicleId?: string,
  ): ProjectileCollisionHit | null {
    torqueVecToThree(start, this.start);
    torqueVecToThree(end, this.end);
    this.bounds.min.copy(this.start).min(this.end);
    this.bounds.max.copy(this.start).max(this.end);
    let best = Infinity;
    let id: string | undefined;
    for (const target of this.targets) {
      const mounts = target.mountedVehicleIds;
      if (
        target.id === sourceId ||
        target.id === vehicleId ||
        (sourceId !== undefined && mounts?.includes(sourceId)) ||
        (vehicleId !== undefined && mounts?.includes(vehicleId)) ||
        !this.bounds.intersectsBox(target.worldBounds)
      )
        continue;
      this.localStart.copy(this.start).applyMatrix4(target.inverse);
      this.localEnd.copy(this.end).applyMatrix4(target.inverse);

      const { volume } = target;
      if ("playerBox" in volume) {
        const t = segmentBoxEntry(
          this.localStart,
          this.localEnd,
          volume.playerBox,
        );
        if (t === null || t >= best) continue;
        // Native Player::castRay points the contact normal back up the ray.
        this.bestNormal
          .subVectors(this.localStart, this.localEnd)
          .transformDirection(volume.rotation);
        best = t;
        id = target.id;
      } else {
        for (const hull of volume.hulls) {
          this.hullStart.copy(this.localStart).applyMatrix4(hull.inverse);
          this.hullEnd.copy(this.localEnd).applyMatrix4(hull.inverse);
          const t = castDTSHullRay(
            hull.planes,
            this.hullStart,
            this.hullEnd,
            this.normal,
          );
          if (t === null || t >= best) continue;
          this.bestNormal
            .copy(this.normal)
            .applyNormalMatrix(hull.normalMatrix)
            .applyNormalMatrix(volume.normalMatrix);
          best = t;
          id = target.id;
        }
      }
    }
    if (id === undefined) return null;
    return {
      id,
      t: best,
      point: threeToTorque(this.point.lerpVectors(this.start, this.end, best)),
      normal: threeToTorque(this.bestNormal),
    };
  }
}
