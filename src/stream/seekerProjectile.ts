import { Quaternion, Vector3 } from "three";
import type { SeekerProjectileDataBlock } from "t2-demo-parser";
import { castTerrainRay, type Vec3 } from "../collision/terrainCollision";
import { threeToTorque, torqueVecToThree } from "../scene/coordinates";
import {
  orientationAlongDirection,
  STREAM_TICK_SEC,
  TICK_DURATION_MS,
} from "./streamHelpers";

const WARP_TICKS = 5;
const DEGREES_PER_TICK = (Math.PI / 180) * STREAM_TICK_SEC;
const UP: Vec3 = [0, 0, 1];
const tuningByBlock = new WeakMap<SeekerProjectileDataBlock, SeekerTuning>();

export interface SeekerTuning {
  maxVelocity: number;
  acceleration: number;
  turningSpeed: number;
  terrainAvoidanceSpeed: number;
  terrainScanAhead: number;
  terrainHeightFail: number;
  terrainAvoidanceRadius: number;
  flechette: boolean;
  ignitionTick: number;
  casingSplitTick: number;
  explodeOnWaterImpact: boolean;
}

export function seekerTuning(data: SeekerProjectileDataBlock): SeekerTuning {
  const cached = tuningByBlock.get(data);
  if (cached) return cached;
  const delay = Math.max(0, data.flechetteDelayMs ?? 0) / TICK_DURATION_MS;
  const tuning = {
    maxVelocity: data.maxVelocity ?? Infinity,
    acceleration: data.acceleration ?? 0,
    turningSpeed: data.turningSpeed ?? 0,
    terrainAvoidanceSpeed: data.terrainAvoidanceSpeed ?? 0,
    terrainScanAhead: data.terrainScanAhead ?? 0,
    terrainHeightFail: data.terrainHeightFail ?? 0,
    terrainAvoidanceRadius: data.terrainAvoidanceRadius ?? 0,
    flechette: data.useFlechette === true,
    ignitionTick: Math.floor(delay),
    casingSplitTick: Math.floor(delay / 2),
    explodeOnWaterImpact: !!data.explodeOnWaterImpact,
  };
  tuningByBlock.set(data, tuning);
  return tuning;
}

export interface SeekerTarget {
  position: Vec3;
  heat?: number;
}

function offset(position: Vec3, velocity: Vec3, seconds: number): Vec3 {
  return [
    position[0] + velocity[0] * seconds,
    position[1] + velocity[1] * seconds,
    position[2] + velocity[2] * seconds,
  ];
}

function normalized([x, y, z]: Vec3, speed = Math.hypot(x, y, z)): Vec3 {
  return speed > 1e-9 ? [x / speed, y / speed, z / speed] : UP;
}

function dot(a: Vec3, b: Vec3): number {
  return Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
}

/** Keep flight speed while turning toward the target by at most `angle`. */
function turn(
  speed: number,
  direction: Vec3,
  target: Vec3,
  alignment: number,
  angle: number,
): Vec3 | undefined {
  const lateral = Math.sqrt(1 - alignment * alignment);
  if (angle <= 0 || lateral < 1e-9) return;
  const along = Math.cos(angle) * speed;
  const across = (Math.sin(angle) * speed) / lateral;
  return offset(
    [target[0] * across, target[1] * across, target[2] * across],
    direction,
    along - alignment * across,
  );
}

/** Retail getNewVelocity (0x6397a0). It applies this turn even on the
 * tick where the target passes behind the missile and guidance drops out. */
export function steerSeeker(
  position: Vec3,
  velocity: Vec3,
  target: SeekerTarget,
  tuning: SeekerTuning,
): { velocity: Vec3; passedTarget: boolean } {
  const delta: Vec3 = [
    target.position[0] - position[0],
    target.position[1] - position[1],
    target.position[2] - position[2],
  ];
  const distance = Math.hypot(...delta);
  const speed = Math.hypot(...velocity);
  const towards = normalized(delta, distance);
  const heading = normalized(velocity, speed);
  const alignment = dot(towards, heading);
  const passedTarget = alignment < 0;
  if (alignment < 0.99985) {
    const angle = Math.min(
      Math.acos(alignment),
      tuning.turningSpeed * DEGREES_PER_TICK,
      target.heat === undefined ? Infinity : tuning.turningSpeed * target.heat,
    );
    if (angle === 0 && target.heat !== undefined)
      return { velocity, passedTarget };
    velocity = turn(speed, heading, towards, alignment, angle) ?? velocity;
  }
  if (tuning.terrainScanAhead <= 0 || speed <= 1e-9)
    return { velocity, passedTarget };
  if (
    distance < tuning.terrainAvoidanceRadius &&
    !castTerrainRay(position, target.position)
  )
    return { velocity, passedTarget };

  const direction = normalized(velocity, speed);
  const below: Vec3 = [
    position[0],
    position[1],
    position[2] - tuning.terrainHeightFail,
  ];
  if (
    castTerrainRay(
      position,
      offset(below, direction, tuning.terrainScanAhead),
    ) ||
    castTerrainRay(position, below)
  ) {
    const upAlignment = dot(direction, UP);
    const angle = Math.min(
      Math.acos(upAlignment),
      tuning.terrainAvoidanceSpeed * DEGREES_PER_TICK,
    );
    velocity = turn(speed, direction, UP, upAlignment, angle) ?? velocity;
  }
  return { velocity, passedTarget };
}

/** Acceleration changes the missile's own velocity. Keep the inherited
 * player velocity outside that calculation, as in processTick (0x63a430). */
export function accelerateSeeker(
  velocity: Vec3,
  inherited: Vec3,
  tuning: SeekerTuning,
  ageTick: number,
): Vec3 {
  if (
    ageTick < tuning.ignitionTick ||
    !tuning.acceleration ||
    Math.hypot(...velocity) >= tuning.maxVelocity
  )
    return velocity;
  const ownVelocity: Vec3 = [
    velocity[0] - inherited[0],
    velocity[1] - inherited[1],
    velocity[2] - inherited[2],
  ];
  const speed = Math.hypot(...ownVelocity);
  return speed > 1e-9
    ? offset(
        velocity,
        ownVelocity,
        (tuning.acceleration * STREAM_TICK_SEC) / speed,
      )
    : velocity;
}

export interface SeekerWarp {
  start: Vec3;
  end: Vec3;
  velocity: Vec3;
  endVelocity: Vec3;
  ticksLeft: number;
}

/** Update corrections extrapolate for five ticks by steering only. The
 * client's actual path interpolates from its previous pose to that endpoint. */
export function createSeekerWarp(
  start: Vec3,
  position: Vec3,
  velocity: Vec3,
  target: SeekerTarget | undefined,
  tuning: SeekerTuning,
): { warp: SeekerWarp; passedTarget: boolean } {
  let passedTarget = false;
  for (let tick = 0; tick < WARP_TICKS; tick++) {
    if (target && !passedTarget) {
      const next = steerSeeker(position, velocity, target, tuning);
      velocity = next.velocity;
      passedTarget = next.passedTarget;
    }
    position = offset(position, velocity, STREAM_TICK_SEC);
  }
  const seconds = WARP_TICKS * STREAM_TICK_SEC;
  return {
    warp: {
      start: [...start],
      end: position,
      velocity: [
        (position[0] - start[0]) / seconds,
        (position[1] - start[1]) / seconds,
        (position[2] - start[2]) / seconds,
      ],
      endVelocity: velocity,
      ticksLeft: WARP_TICKS,
    },
    passedTarget,
  };
}

export function advanceSeekerWarp(warp: SeekerWarp): {
  position: Vec3;
  velocity: Vec3;
} {
  const elapsed = WARP_TICKS - --warp.ticksLeft;
  return {
    position:
      elapsed === WARP_TICKS
        ? warp.end
        : offset(warp.start, warp.velocity, elapsed * STREAM_TICK_SEC),
    velocity: warp.ticksLeft ? warp.velocity : warp.endVelocity,
  };
}

const fragmentDirections = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const;

/** SeekerProjectile::updateFlechette (0x63c840) throws four casing pieces
 * at 8 m/s in the missile's frame with alternating ±450°/s spin. */
export function seekerCasingFragments(direction: Vec3, random: () => number) {
  const rotation =
    orientationAlongDirection(direction) ?? ([0, 0, 0, 1] as const);
  const basis = new Quaternion().fromArray(rotation);
  const velocity = new Vector3();
  return fragmentDirections.map(([right, up]) => {
    const local: Vec3 = [right * (1 + random()), 5, up * (1 + random())];
    torqueVecToThree(local, velocity)
      .normalize()
      .multiplyScalar(8)
      .applyQuaternion(basis);
    return {
      rotation: [...rotation] as [number, number, number, number],
      velocity: threeToTorque(velocity),
      spin: [-up * 450, right * 450] as [number, number],
    };
  });
}
