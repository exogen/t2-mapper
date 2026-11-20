/**
 * Pure projectile physics helpers mirroring Tribes 2's client-side
 * prediction (tribes2-engine/game/linearProjectile.cc, projGrenade.cc).
 * Kept as standalone functions so the formulas are unit-testable without
 * the stream engine.
 */
import { castWorldRay, type Vec3, type WorldRayHit } from "./worldCollision";
import { castWaterRay, isWaterType, projectileWaterAt } from "./waterLevel";
import { TICK_DURATION_MS } from "../stream/streamHelpers";

/** Torque clamps projectile lifetime to at most 511 living ticks. */
const MAX_LIVING_TICKS = 511;

/** LinearProjectile::onAdd (0x62d630) uses five local ticks to join the flight. */
export const LINEAR_LAUNCH_WARP_TICKS = 5;

/** Round milliseconds up to a whole tick, as ProjectileData::onAdd does. */
function roundUpToTick(ms: number): number {
  return (ms + TICK_DURATION_MS - 1) & ~(TICK_DURATION_MS - 1);
}

function linearLifetimeMS(lifetimeMS: number): number {
  return roundUpToTick(
    Math.max(
      TICK_DURATION_MS,
      Math.min(lifetimeMS, MAX_LIVING_TICKS * TICK_DURATION_MS),
    ),
  );
}

/** LinearProjectile::calcSplash uses the original full-lifetime ray, even
 * when the flight itself has a shorter or second segment. */
export function predictLinearSplash(
  start: Vec3,
  velocity: Vec3,
  lifetimeMS: number,
): { ageTick: number; position: Vec3 } | undefined {
  const lifeMS = linearLifetimeMS(lifetimeMS);
  const seconds = lifeMS / 1000;
  const end: Vec3 = [
    start[0] + velocity[0] * seconds,
    start[1] + velocity[1] * seconds,
    start[2] + velocity[2] * seconds,
  ];
  const startsWet = projectileWaterAt(...start) !== null;
  if (startsWet && projectileWaterAt(...end)) return;
  const hit = startsWet ? castWaterRay(end, start) : castWaterRay(start, end);
  if (hit)
    return {
      ageTick: Math.floor(
        ((startsWet ? 1 - hit.t : hit.t) * lifeMS) / TICK_DURATION_MS,
      ),
      position: hit.point,
    };
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
  // Retail clamps and transmits fizzleUnderwaterMS and
  // deflectionOnWaterImpact, but flight simulation does not read them.
}): LinearSegment {
  const { start, vel } = options;
  const lifeMs = linearLifetimeMS(options.lifetimeMS);
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
        endNormal: reverseFlightNormal(vel),
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

  if (!options.explodeOnWaterImpact) {
    // Passes through and keeps going, but SLOWER: the engine rebuilds
    // segment 1 at the weapon's wet velocity.
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
  const speed = Math.hypot(vel[0], vel[1], vel[2]);
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
    endNormal: hit ? hit.normal : reverseFlightNormal(vel),
    explodeAtEnd: hit ? true : explodeOnDeath,
  };
}

/** Lifetime expiry uses the opposite of the flight direction as its normal. */
function reverseFlightNormal(velocity: Vec3): Vec3 {
  const speed = Math.hypot(...velocity);
  return speed > 0
    ? [-velocity[0] / speed, -velocity[1] / speed, -velocity[2] / speed]
    : [0, 0, 1];
}

/** Sample the flight at a given age and return its current velocity. */
export function sampleLinearSegment(
  seg: LinearSegment,
  ms: number,
  out: Vec3,
): Vec3 {
  const leg = ms >= seg.msEnd && seg.next ? seg.next : seg;
  if (ms >= leg.msEnd) {
    [out[0], out[1], out[2]] = leg.endPoint;
  } else {
    const t = (ms - (leg === seg ? 0 : seg.msEnd)) / 1000;
    out[0] = leg.start[0] + leg.vel[0] * t;
    out[1] = leg.start[1] + leg.vel[1] * t;
    out[2] = leg.start[2] + leg.vel[2] * t;
  }
  return leg.vel;
}

export interface LinearLaunchWarp {
  start: Vec3;
  end: Vec3;
}

export function createLinearLaunchWarp(
  segment: LinearSegment,
  ageTicks: number,
  start: Vec3,
): LinearLaunchWarp {
  const end: Vec3 = [0, 0, 0];
  sampleLinearSegment(
    segment,
    (ageTicks + LINEAR_LAUNCH_WARP_TICKS) * TICK_DURATION_MS,
    end,
  );
  return { start, end };
}

/** The same interval drives the fixed-tick collision sweep and render pose. */
export function sampleLinearTick(
  segment: LinearSegment,
  ageTicks: number,
  scopeTick: number,
  warp: LinearLaunchWarp | undefined,
  start: Vec3,
  end: Vec3,
): Vec3 {
  const ageMs = ageTicks * TICK_DURATION_MS;
  const velocity = sampleLinearSegment(segment, ageMs, end);
  if (warp) {
    const phase = scopeTick / LINEAR_LAUNCH_WARP_TICKS;
    for (let axis = 0; axis < 3; axis++) {
      const delta =
        (warp.end[axis] - warp.start[axis]) / LINEAR_LAUNCH_WARP_TICKS;
      start[axis] = warp.start[axis] + delta * (scopeTick - 1);
      end[axis] =
        phase === 1 ? warp.end[axis] : warp.start[axis] + delta * scopeTick;
    }
  } else {
    sampleLinearSegment(segment, ageMs - TICK_DURATION_MS, start);
  }
  return velocity;
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

interface BallisticStepResult {
  /** Hit that should explode the projectile (armed contact), if any. */
  explodeAt: WorldRayHit | null;
  splash?: Vec3;
}

/** GrenadeProjectile::determineSplash tests a wetness change, then
 * extends the final sweep by a meter at each end before casting. */
function grenadeWaterCrossing(start: Vec3, end: Vec3): Vec3 | undefined {
  if (
    Boolean(projectileWaterAt(...start)) === Boolean(projectileWaterAt(...end))
  )
    return;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const dz = end[2] - start[2];
  const length = Math.hypot(dx, dy, dz);
  if (!length) return;
  return castWaterRay(
    [start[0] - dx / length, start[1] - dy / length, start[2] - dz / length],
    [end[0] + dx / length, end[1] + dy / length, end[2] + dz / length],
  )?.point;
}

export function grenadeQuickSplash(
  position: Vec3,
  velocity: Vec3,
): Vec3 | undefined {
  const speed = Math.hypot(...velocity);
  if (!speed) return;
  const back = 10 / speed;
  return grenadeWaterCrossing(
    [
      position[0] - velocity[0] * back,
      position[1] - velocity[1] * back,
      position[2] - velocity[2] * back,
    ],
    position,
  );
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
    /** Vertical acceleration in m/s² (negative is down): world gravity ×
     *  the datablock's gravityMod. */
    gravity: number;
    elasticity: number;
    friction: number;
    armed: boolean;
    /** GrenadeProjectileData drag, applied only for submerged ticks. */
    submergedDrag?: number;
    detectSplash?: boolean;
    /** When false (e.g. seekers), any contact explodes regardless of arming. */
    bounces?: boolean;
  },
): BallisticStepResult {
  const dt = TICK_DURATION_MS / 1000;
  if (options.submergedDrag) {
    const retainedSpeed = 1 - 15 * options.submergedDrag * dt;
    vel[0] *= retainedSpeed;
    vel[1] *= retainedSpeed;
    vel[2] *= retainedSpeed;
  }
  vel[2] += options.gravity * dt;

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
      const splash = options.detectSplash
        ? grenadeWaterCrossing([sx, sy, sz], pos)
        : undefined;
      return { explodeAt: null, splash };
    }
    if (options.armed || options.bounces === false) {
      pos[0] = hit.point[0];
      pos[1] = hit.point[1];
      pos[2] = hit.point[2];
      vel[0] = vel[1] = vel[2] = 0;
      const splash = options.detectSplash
        ? grenadeWaterCrossing([sx, sy, sz], pos)
        : undefined;
      return { explodeAt: hit, splash };
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
