/**
 * Pure projectile physics helpers mirroring Tribes 2's client-side
 * prediction (tribes2-engine/game/linearProjectile.cc, projGrenade.cc).
 * Kept as standalone functions so the formulas are unit-testable without
 * the stream engine.
 */
import { castWorldRay, type Vec3, type WorldRayHit } from "./worldCollision";
import { getWaterLevel } from "./waterLevel";

export const TICK_MS = 32;
/** Torque clamps projectile lifetime to at most 511 living ticks. */
const MAX_LIVING_TICKS = 511;

/** Round milliseconds up to a whole tick, as ProjectileData::onAdd does. */
export function roundUpToTick(ms: number): number {
  return (ms + TICK_MS - 1) & ~(TICK_MS - 1);
}

export interface LinearSegment {
  start: Vec3;
  /** Velocity in m/s (already includes the quantized excess velocity). */
  vel: Vec3;
  /** Flight time in ms at which the segment ends (hit or lifetime). */
  msEnd: number;
  endPoint: Vec3;
  endNormal: Vec3;
  /** Whether reaching msEnd should produce an explosion. */
  explodeAtEnd: boolean;
}

/**
 * Precompute a LinearProjectile's flight segment, exactly like
 * LinearProjectile::createSegments: one static-world raycast covering the
 * entire lifetime, cut short at the first hit. Water is a separate test
 * (Torque never puts WaterObjectType in the static mask).
 */
export function buildLinearSegment(options: {
  start: Vec3;
  vel: Vec3;
  lifetimeMS: number;
  explodeOnDeath: boolean;
  explodeOnWaterImpact: boolean;
}): LinearSegment {
  const { start, vel } = options;
  const lifeMs = roundUpToTick(
    Math.max(TICK_MS, Math.min(options.lifetimeMS, MAX_LIVING_TICKS * TICK_MS)),
  );
  const lifeSec = lifeMs / 1000;
  const end: Vec3 = [
    start[0] + vel[0] * lifeSec,
    start[1] + vel[1] * lifeSec,
    start[2] + vel[2] * lifeSec,
  ];

  let hit: WorldRayHit | null = castWorldRay(start, end);

  // Water impact: plane test at the registered water level, only when the
  // projectile explodes on water (Phase 1: no wet-segment continuation).
  if (options.explodeOnWaterImpact) {
    const waterZ = getWaterLevel();
    if (waterZ != null && start[2] > waterZ && end[2] < waterZ) {
      const tWater = (start[2] - waterZ) / (start[2] - end[2]);
      if (!hit || tWater < hit.t) {
        hit = {
          t: tWater,
          point: [
            start[0] + (end[0] - start[0]) * tWater,
            start[1] + (end[1] - start[1]) * tWater,
            waterZ,
          ],
          normal: [0, 0, 1],
          source: "terrain",
        };
      }
    }
  }

  if (hit) {
    return {
      start: [...start],
      vel: [...vel],
      msEnd: Math.floor(lifeMs * hit.t),
      endPoint: hit.point,
      endNormal: hit.normal,
      explodeAtEnd: true,
    };
  }
  return {
    start: [...start],
    vel: [...vel],
    msEnd: lifeMs,
    endPoint: end,
    endNormal: [0, 0, 1],
    explodeAtEnd: options.explodeOnDeath,
  };
}

/** Closed-form segment position at a flight time, clamped to the end. */
export function linearSegmentPosition(
  seg: LinearSegment,
  ms: number,
  out: Vec3,
): Vec3 {
  const t = Math.min(ms, seg.msEnd) / 1000;
  out[0] = seg.start[0] + seg.vel[0] * t;
  out[1] = seg.start[1] + seg.vel[1] * t;
  out[2] = seg.start[2] + seg.vel[2] * t;
  if (ms >= seg.msEnd) {
    out[0] = seg.endPoint[0];
    out[1] = seg.endPoint[1];
    out[2] = seg.endPoint[2];
  }
  return out;
}

/**
 * GrenadeProjectile's bounce response (projGrenade.cc:597-607): mirror
 * reflection, minus friction times the tangential component, all scaled
 * by elasticity. Mutates and returns `v`.
 */
export function bounceVelocity(
  v: Vec3,
  normal: Vec3,
  friction: number,
  elasticity: number,
): Vec3 {
  const dot = v[0] * normal[0] + v[1] * normal[1] + v[2] * normal[2];
  const bx = v[0] - normal[0] * (dot * 2);
  const by = v[1] - normal[1] * (dot * 2);
  const bz = v[2] - normal[2] * (dot * 2);
  const bDot = bx * normal[0] + by * normal[1] + bz * normal[2];
  const tx = bx - normal[0] * bDot;
  const ty = by - normal[1] * bDot;
  const tz = bz - normal[2] * bDot;
  v[0] = (bx - tx * friction) * elasticity;
  v[1] = (by - ty * friction) * elasticity;
  v[2] = (bz - tz * friction) * elasticity;
  return v;
}

export interface BallisticStepResult {
  /** Hit that should explode the projectile (armed contact), if any. */
  explodeAt: WorldRayHit | null;
}

/** Max bounce resolutions within one tick (projGrenade.cc sMaxBounceCount). */
const MAX_BOUNCES_PER_TICK = 5;
/** Surface backoff after a bounce, in meters. */
const BOUNCE_BACKOFF = 0.05;

/**
 * Advance a ballistic projectile by one tick with swept collision,
 * mirroring GrenadeProjectile::processTick: bounce while unarmed, explode
 * on the first contact once armed. Mutates `pos` and `vel` in place.
 */
export function stepBallistic(
  pos: Vec3,
  vel: Vec3,
  options: {
    gravityMod: number;
    elasticity: number;
    friction: number;
    armed: boolean;
    /** When false (e.g. seekers), any contact explodes regardless of arming. */
    bounces?: boolean;
  },
): BallisticStepResult {
  const dt = TICK_MS / 1000;
  vel[2] += -9.81 * options.gravityMod * dt;

  let sx = pos[0];
  let sy = pos[1];
  let sz = pos[2];
  let timeLeft = 1;
  let ex = sx + vel[0] * dt;
  let ey = sy + vel[1] * dt;
  let ez = sz + vel[2] * dt;

  for (let i = 0; i < MAX_BOUNCES_PER_TICK; i++) {
    const hit = castWorldRay([sx, sy, sz], [ex, ey, ez]);
    if (!hit) {
      pos[0] = ex;
      pos[1] = ey;
      pos[2] = ez;
      return { explodeAt: null };
    }
    if (options.armed || options.bounces === false) {
      pos[0] = hit.point[0];
      pos[1] = hit.point[1];
      pos[2] = hit.point[2];
      vel[0] = vel[1] = vel[2] = 0;
      return { explodeAt: hit };
    }
    bounceVelocity(vel, hit.normal, options.friction, options.elasticity);
    timeLeft *= 1 - hit.t;
    sx = hit.point[0] + hit.normal[0] * BOUNCE_BACKOFF;
    sy = hit.point[1] + hit.normal[1] * BOUNCE_BACKOFF;
    sz = hit.point[2] + hit.normal[2] * BOUNCE_BACKOFF;
    ex = sx + vel[0] * (timeLeft * dt);
    ey = sy + vel[1] * (timeLeft * dt);
    ez = sz + vel[2] * (timeLeft * dt);
  }
  pos[0] = sx;
  pos[1] = sy;
  pos[2] = sz;
  return { explodeAt: null };
}
