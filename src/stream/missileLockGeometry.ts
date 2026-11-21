import type { Vec3 } from "../collision/terrainCollision";
import { getNumberField } from "./streamHelpers";

export interface MissileSeekerTuning {
  minHeat: number;
  seekTime: number;
  minRange: number;
  maxRange: number;
  halfAngle: number;
  warnTarget: boolean;
}

export function missileTargetAudio(
  imageData: Record<string, unknown> | undefined,
): boolean | undefined {
  const flag = imageData?.useTargetAudio ?? imageData?.isTargetLockRequired;
  return typeof flag === "boolean" ? flag : undefined;
}

export function readMissileSeekerTuning(
  imageData: Record<string, unknown> | undefined,
  lookupProjectile: (id: number) => Record<string, unknown> | undefined,
): MissileSeekerTuning | undefined {
  if (imageData?.isSeeker !== true) return;
  const projectileId = getNumberField(imageData, ["projectile"]);
  if (projectileId === undefined) return;
  const projectile = lookupProjectile(projectileId);
  const speed = getNumberField(projectile, ["maxVelocity"]);
  const lifetime = getNumberField(projectile, ["lifetimeMS"]);
  // Legacy parsers and their checkpoints expose the same wire fields under
  // the second set of names (ShapeBaseImageData::packData).
  const seekRadius = getNumberField(imageData, ["seekRadius", "seekerRadius"]);
  const angle = getNumberField(imageData, ["maxSeekAngle"]);
  const seekTime = getNumberField(imageData, ["seekTime", "seekerLockTime"]);
  const minHeat = getNumberField(imageData, ["minSeekHeat", "seekerFreeTime"]);
  const minRange = getNumberField(imageData, [
    "minTargetingDistance",
    "targetingDist",
    "maxLockRange",
  ]);
  const warnTarget = missileTargetAudio(imageData);
  if (
    speed === undefined ||
    speed <= 0 ||
    lifetime === undefined ||
    lifetime <= 0 ||
    seekRadius === undefined ||
    angle === undefined ||
    angle <= 0 ||
    angle > 180 ||
    seekTime === undefined ||
    seekTime < 0 ||
    minHeat === undefined ||
    minHeat < 0 ||
    minHeat > 1 ||
    minRange === undefined ||
    minRange < 0 ||
    warnTarget === undefined
  )
    return;

  // The retail broad phase is a box built from seekRadius. Restrict the
  // distance to that radius as well as the projectile's actual reach.
  const maxRange = Math.min(seekRadius, (lifetime / 1000) * speed);
  if (maxRange <= minRange) return;
  return {
    minHeat,
    seekTime,
    minRange,
    maxRange,
    halfAngle: (angle * Math.PI) / 360,
    warnTarget,
  };
}

/** The margin allows for packed aim. Pass a negative value to look for
 * additional possible candidates near the edge of the native cone. */
export function isInMissileLockCone(
  muzzle: Readonly<Vec3>,
  direction: Readonly<Vec3>,
  target: Readonly<Vec3>,
  tuning: MissileSeekerTuning,
  angularMargin = Math.PI / 90,
): boolean {
  const angle = tuning.halfAngle - angularMargin;
  if (angle <= 0) return false;
  const x = target[0] - muzzle[0];
  const y = target[1] - muzzle[1];
  const z = target[2] - muzzle[2];
  const distance = Math.hypot(x, y, z);
  if (distance <= tuning.minRange || distance > tuning.maxRange) return false;
  const [dx, dy, dz] = direction;
  const length = Math.hypot(dx, dy, dz);
  const alignment = (x * dx + y * dy + z * dz) / (distance * length);
  return alignment >= Math.cos(angle);
}
