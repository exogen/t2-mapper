/**
 * Pure projectile physics helpers mirroring Tribes 2's client-side
 * prediction (tribes2-engine/game/linearProjectile.cc, projGrenade.cc).
 * Kept as standalone functions so the formulas are unit-testable without
 * the stream engine.
 */
import { castWorldRay, type Vec3, type WorldRayHit } from "./worldCollision";
import { castWaterRay, isWaterType } from "./waterLevel";

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
  /**
   * The leg after a water interaction, when there is one.
   *
   * `LinearProjectile` allows at most two segments, and water is the
   * only thing that creates the second: a shallow-angle skip off the
   * surface (reflected velocity), or a pass-through that continues
   * underwater at `wetVelocity`. Its `msEnd` is absolute flight time,
   * like the first segment's.
   */
  next?: LinearSegment;
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
  /** Whether the FIRE POINT was submerged (LinearProjectile::mWetStart).
   *  A wet start skips water collision entirely and selects
   *  `wetVelocity` for the muzzle speed. */
  wetStart?: boolean;
  /** The velocity a round continues at once it passes through the
   *  surface, ALREADY composed the way the caller composed `vel`:
   *  `direction * wetVelocity + excess`. The engine rebuilds it from
   *  the direction rather than rescaling the dry velocity, so passing a
   *  bare speed here would drop the excess (inherited shooter) term. */
  wetVel?: Vec3;
  /** Datablock `reflectOnWaterImpactAngle` (degrees): arrivals shallower
   *  than this skip off the surface instead of detonating. The disc
   *  ships with 15. */
  reflectOnWaterImpactAngle?: number;
  // Not modelled, deliberately: `fizzleUnderwaterMS` kills a round that
  // has been submerged that long, but the engine clamps it to -1 when it
  // exceeds the lifetime and every datablock we see sets it EQUAL to the
  // lifetime (disc 5024/5024, chaingun 3008/3008) or leaves it unset, so
  // it never truncates a flight. `deflectionOnWaterImpact` is parsed,
  // clamped and networked by the engine but never actually read.
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

  const hit: WorldRayHit | null = castWorldRay(start, end);

  const dry: LinearSegment = hit
    ? {
        start: [...start],
        vel: [...vel],
        msEnd: Math.floor(lifeMs * hit.t),
        endPoint: hit.point,
        endNormal: hit.normal,
        explodeAtEnd: true,
      }
    : {
        start: [...start],
        vel: [...vel],
        msEnd: lifeMs,
        endPoint: end,
        endNormal: [0, 0, 1],
        explodeAtEnd: options.explodeOnDeath,
      };

  // Water is tested SEPARATELY from the static mask, and only for a shot
  // that started dry. LinearProjectile::createSegments guards the whole
  // block with `if (mWetStart == false)`, which is why a projectile
  // fired from underwater sails out through the surface untouched.
  if (options.wetStart) return dry;

  const water = castWaterRay(dry.start, dry.endPoint);
  if (!water) return dry;

  const waterMsEnd = Math.floor(dry.msEnd * water.t);
  const speed = Math.hypot(vel[0], vel[1], vel[2]);

  if (!options.explodeOnWaterImpact) {
    // Passes through and keeps going, but SLOWER: the engine rebuilds
    // segment 1 at wetVelocity. Without this a chaingun round carries
    // on underwater at 750 u/s instead of 280.
    const wetVel = options.wetVel;
    if (!wetVel) return dry;
    return {
      ...dry,
      msEnd: waterMsEnd,
      endPoint: water.point,
      endNormal: water.normal,
      explodeAtEnd: false,
      next: legFrom(
        water.point,
        wetVel,
        waterMsEnd,
        lifeMs,
        options.explodeOnDeath,
      ),
    };
  }

  // explodeOnWaterImpact: skip off the surface, or detonate on it.
  //
  //   if (|dot(normVel, normal)| >= cos(90 - reflectOnWaterImpactAngle)
  //       || !hitWater) -> explode, else reflect
  //
  // Two things fall out of that. A steep enough arrival always
  // detonates; and `hitWater` is `WaterBlock::isWater(liquidType)`, so
  // LAVA never skips — a disc that would stone-skip across water
  // explodes on contact with lava.
  const hitWater = isWaterType(water.info.liquidType);
  const reflectAngle = options.reflectOnWaterImpactAngle ?? 0;
  const cosLimit = Math.cos(((90 - reflectAngle) * Math.PI) / 180);
  const n0 = water.normal;
  const dot =
    speed > 0 ? (vel[0] * n0[0] + vel[1] * n0[1] + vel[2] * n0[2]) / speed : -1;

  if (Math.abs(dot) >= cosLimit || !hitWater) {
    return {
      ...dry,
      msEnd: waterMsEnd,
      endPoint: water.point,
      endNormal: water.normal,
      explodeAtEnd: true,
    };
  }

  // Mirror the velocity about the surface normal and fly on.
  const n = water.normal;
  const d2 = 2 * (vel[0] * n[0] + vel[1] * n[1] + vel[2] * n[2]);
  const refVel: Vec3 = [
    vel[0] - n[0] * d2,
    vel[1] - n[1] * d2,
    vel[2] - n[2] * d2,
  ];
  return {
    ...dry,
    msEnd: waterMsEnd,
    endPoint: water.point,
    endNormal: water.normal,
    explodeAtEnd: false,
    next: legFrom(
      water.point,
      refVel,
      waterMsEnd,
      lifeMs,
      options.explodeOnDeath,
    ),
  };
}

/**
 * Build the leg that follows a water interaction — a skip or a slowed
 * pass-through. BOTH are re-cast against the static world by the
 * engine, which is what stops a round that entered the water from
 * sailing on through the lake bed.
 */
function legFrom(
  start: Vec3,
  vel: Vec3,
  msStart: number,
  lifeMs: number,
  explodeOnDeath: boolean,
): LinearSegment {
  const remainingSec = (lifeMs - msStart) / 1000;
  const end: Vec3 = [
    start[0] + vel[0] * remainingSec,
    start[1] + vel[1] * remainingSec,
    start[2] + vel[2] * remainingSec,
  ];
  const hit = castWorldRay(start, end);
  return {
    start: [...start],
    vel: [...vel],
    msEnd: hit ? msStart + Math.floor((lifeMs - msStart) * hit.t) : lifeMs,
    endPoint: hit ? hit.point : end,
    endNormal: hit ? hit.normal : [0, 0, 1],
    explodeAtEnd: hit ? true : explodeOnDeath,
  };
}

/** Closed-form segment position at a flight time, clamped to the end. */
export function linearSegmentPosition(
  seg: LinearSegment,
  ms: number,
  out: Vec3,
): Vec3 {
  // Past the first leg's end, the round is on its water leg (a skip or
  // a slowed pass-through) — follow it rather than freezing at the
  // surface.
  if (seg.next && ms > seg.msEnd) {
    const legMs = Math.min(ms, seg.next.msEnd) - seg.msEnd;
    const legSec = Math.max(0, legMs) / 1000;
    out[0] = seg.next.start[0] + seg.next.vel[0] * legSec;
    out[1] = seg.next.start[1] + seg.next.vel[1] * legSec;
    out[2] = seg.next.start[2] + seg.next.vel[2] * legSec;
    if (ms >= seg.next.msEnd) {
      out[0] = seg.next.endPoint[0];
      out[1] = seg.next.endPoint[1];
      out[2] = seg.next.endPoint[2];
    }
    return out;
  }
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
