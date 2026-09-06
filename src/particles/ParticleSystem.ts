import type {
  EmitterDataResolved,
  Particle,
  ParticleDataResolved,
  ParticleKey,
} from "./types";

const DEG_TO_RAD = Math.PI / 180;
/** World gravity at the T2 default (setGravity −20 × 0.4905). */
const DEFAULT_GRAVITY_Z = -9.81;
const ZERO_VELOCITY: [number, number, number] = [0, 0, 0];
/** Converts (degrees/sec * ms) to radians. */
const SPIN_FACTOR = Math.PI / (180 * 1000);

// V12 bit-packing scaling constants. The demo parser reads raw bit-packed
// integers/floats without applying the scaling the V12 client does on read.
// See particleEngine.cc lines 205-257, 471-550.
const VELOCITY_SCALE = 1 / 100; // ejectionVelocity, velocityVariance, ejectionOffset
const SPIN_RANDOM_OFFSET = -1000; // spinRandomMin, spinRandomMax
const MAX_PARTICLE_SIZE = 50; // sizes[] packed as size/MaxParticleSize
const LIFETIME_SHIFT = 5; // lifetimeMS packed as ms >> 5; unpack with << 5
const DRAG_SCALE = 5; // dragCoefficient packed as drag/5
const GRAVITY_SCALE = 10; // gravityCoefficient packed as gravity/10

// ── Datablock resolution ──

function getNumber(
  raw: Record<string, unknown>,
  key: string,
  def: number,
): number {
  const v = raw[key];
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

function getBool(
  raw: Record<string, unknown>,
  key: string,
  def: boolean,
): boolean {
  const v = raw[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return def;
}

function resolveParticleData(
  raw: Record<string, unknown>,
): ParticleDataResolved {
  // The demo parser packs keyframes into a `keys` array of {r,g,b,a,size,time}.
  const rawKeys = raw.keys as
    | Array<{
        r?: number;
        g?: number;
        b?: number;
        a?: number;
        size?: number;
        time?: number;
      }>
    | undefined;

  const keys: ParticleKey[] = [];
  if (Array.isArray(rawKeys) && rawKeys.length > 0) {
    for (let i = 0; i < rawKeys.length && i < 4; i++) {
      const k = rawKeys[i];
      keys.push({
        r: k.r ?? 1,
        g: k.g ?? 1,
        b: k.b ?? 1,
        a: k.a ?? 1,
        // V12 packs size as size/MaxParticleSize; parser returns [0,1].
        size: (k.size ?? 1 / MAX_PARTICLE_SIZE) * MAX_PARTICLE_SIZE,
        time: i === 0 ? 0 : (k.time ?? 1),
      });
    }
  }
  // Ensure at least two keyframes for interpolation.
  if (keys.length === 0) {
    keys.push({ r: 1, g: 1, b: 1, a: 1, size: 1, time: 0 });
  }
  if (keys.length < 2) {
    keys.push({ ...keys[0], time: 1 });
  }

  // Resolve texture name. The parser stores `textures` as string[].
  let textureName = "";
  if (typeof raw.textureName === "string" && raw.textureName) {
    textureName = raw.textureName;
  } else {
    const names = raw.textures as string[] | undefined;
    if (Array.isArray(names) && names.length > 0 && names[0]) {
      textureName = names[0];
    }
  }

  return {
    dragCoefficient: getNumber(raw, "dragCoefficient", 0) * DRAG_SCALE,
    windCoefficient: getNumber(raw, "windCoefficient", 1),
    gravityCoefficient: getNumber(raw, "gravityCoefficient", 0) * GRAVITY_SCALE,
    inheritedVelFactor: getNumber(raw, "inheritedVelFactor", 0),
    constantAcceleration: getNumber(raw, "constantAcceleration", 0),
    lifetimeMS: getNumber(raw, "lifetimeMS", 31) << LIFETIME_SHIFT,
    lifetimeVarianceMS:
      getNumber(raw, "lifetimeVarianceMS", 0) << LIFETIME_SHIFT,
    spinSpeed: getNumber(raw, "spinSpeed", 0),
    // V12 packs spinRandom as value+1000; parser returns raw integer.
    spinRandomMin: getNumber(raw, "spinRandomMin", 1000) + SPIN_RANDOM_OFFSET,
    spinRandomMax: getNumber(raw, "spinRandomMax", 1000) + SPIN_RANDOM_OFFSET,
    useInvAlpha: getBool(raw, "useInvAlpha", false),
    keys,
    textureName,
  };
}

export function resolveEmitterData(
  raw: Record<string, unknown>,
  getDataBlockData: (id: number) => Record<string, unknown> | undefined,
): EmitterDataResolved | null {
  // The demo parser stores `particles` as (number | null)[] — an array of
  // datablock ref IDs. Resolve the first valid one.
  let particleRaw: Record<string, unknown> | undefined;
  const particleRefs = raw.particles as (number | null)[] | undefined;
  if (Array.isArray(particleRefs)) {
    for (const ref of particleRefs) {
      if (typeof ref === "number") {
        particleRaw = getDataBlockData(ref);
        if (particleRaw) break;
      }
    }
  }
  if (!particleRaw) return null;

  return {
    ejectionPeriodMS: getNumber(raw, "ejectionPeriodMS", 100),
    periodVarianceMS: getNumber(raw, "periodVarianceMS", 0),
    // V12 packs velocity/offset as value*100; parser returns raw integer.
    ejectionVelocity: getNumber(raw, "ejectionVelocity", 200) * VELOCITY_SCALE,
    velocityVariance: getNumber(raw, "velocityVariance", 100) * VELOCITY_SCALE,
    ejectionOffset: getNumber(raw, "ejectionOffset", 0) * VELOCITY_SCALE,
    thetaMin: getNumber(raw, "thetaMin", 0),
    thetaMax: getNumber(raw, "thetaMax", 90),
    phiReferenceVel: getNumber(raw, "phiReferenceVel", 0),
    phiVariance: getNumber(raw, "phiVariance", 360),
    overrideAdvances: getBool(raw, "overrideAdvances", false),
    orientParticles: getBool(raw, "orientParticles", false),
    orientOnVelocity: getBool(raw, "orientOnVelocity", true),
    lifetimeMS: getNumber(raw, "lifetimeMS", 0) << LIFETIME_SHIFT,
    lifetimeVarianceMS:
      getNumber(raw, "lifetimeVarianceMS", 0) << LIFETIME_SHIFT,
    particles: resolveParticleData(particleRaw),
  };
}

// ── Emitter instance (owns particles, runs simulation) ──

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomVariance(base: number, variance: number): number {
  return base + (Math.random() * 2 - 1) * variance;
}

/**
 * Compute perpendicular axis (`axisx`) for theta rotation, matching V12's
 * `emitParticles` which uses: if |axis.z| < 0.9 cross with (0,0,1) else (0,1,0).
 */
function computeAxisX(
  ax: number,
  ay: number,
  az: number,
): [number, number, number] {
  let cx: number, cy: number, cz: number;
  if (Math.abs(az) < 0.9) {
    // cross(axis, (0,0,1))
    cx = ay;
    cy = -ax;
    cz = 0;
  } else {
    // cross(axis, (0,1,0))
    cx = -az;
    cy = 0;
    cz = ax;
  }
  const len = Math.sqrt(cx * cx + cy * cy + cz * cz);
  if (len < 1e-8) return [1, 0, 0];
  return [cx / len, cy / len, cz / len];
}

/**
 * Rotate vector `v` around arbitrary axis `a` (unit vector) by `angle` radians.
 * Uses Rodrigues' rotation formula.
 */
function rotateAroundAxis(
  vx: number,
  vy: number,
  vz: number,
  ax: number,
  ay: number,
  az: number,
  angle: number,
): [number, number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dot = vx * ax + vy * ay + vz * az;
  // cross(a, v)
  const crossX = ay * vz - az * vy;
  const crossY = az * vx - ax * vz;
  const crossZ = ax * vy - ay * vx;
  return [
    vx * c + crossX * s + ax * dot * (1 - c),
    vy * c + crossY * s + ay * dot * (1 - c),
    vz * c + crossZ * s + az * dot * (1 - c),
  ];
}

function interpolateKeys(
  keys: ParticleKey[],
  t: number,
): { r: number; g: number; b: number; a: number; size: number } {
  for (let i = 1; i < keys.length; i++) {
    if (keys[i].time >= t) {
      const prev = keys[i - 1];
      const curr = keys[i];
      const span = curr.time - prev.time;
      const f = span > 0 ? (t - prev.time) / span : 0;
      return {
        r: prev.r + (curr.r - prev.r) * f,
        g: prev.g + (curr.g - prev.g) * f,
        b: prev.b + (curr.b - prev.b) * f,
        a: prev.a + (curr.a - prev.a) * f,
        size: prev.size + (curr.size - prev.size) * f,
      };
    }
  }
  const last = keys[keys.length - 1];
  return { r: last.r, g: last.g, b: last.b, a: last.a, size: last.size };
}

/** lerp(a, b, t) as a new vector. */
function lerp3(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

export class EmitterInstance {
  readonly data: EmitterDataResolved;
  readonly particles: Particle[] = [];
  readonly maxParticles: number;

  private internalClock = 0;
  private nextParticleTime = 0;
  private elapsedMS = 0;
  private lifetimeMS: number;
  private killed = false;
  /** World gravity in m/s² (negative is down); the owner keeps it current. */
  worldGravity = DEFAULT_GRAVITY_Z;

  constructor(data: EmitterDataResolved, maxParticles = 256) {
    this.data = data;
    this.maxParticles = maxParticles;

    // ParticleEmitter::onAdd: lifetimeMS ± integer variance (0 = unlimited).
    let lifetime = data.lifetimeMS;
    if (data.lifetimeVarianceMS > 0) {
      lifetime += Math.round(randomVariance(0, data.lifetimeVarianceMS));
    }
    this.lifetimeMS = lifetime;
  }

  /**
   * Burst-emit a fixed number of particles (for explosion particleDensity).
   * The axis defaults to straight up in Torque space (0,0,1).
   */
  emitBurst(
    pos: [number, number, number],
    count: number,
    axis: [number, number, number] = [0, 0, 1],
  ): void {
    for (
      let i = 0;
      i < count && this.particles.length < this.maxParticles;
      i++
    ) {
      this.addParticle(pos, axis, ZERO_VELOCITY);
    }
  }

  /**
   * Periodic emission over `dtMS` along the segment the emitter travelled,
   * faithful to ParticleEmitter::emitParticles(start, end, axis, velocity,
   * numMS): each particle spawns at lerp(start, end, emitTime / numMS), so a
   * moving projectile leaves an evenly spaced trail (ejectionPeriodMS × speed
   * apart) regardless of frame rate, and `velocity` feeds inheritedVelFactor.
   * Time is whole milliseconds like the engine.
   */
  emitPeriodic(
    start: [number, number, number],
    end: [number, number, number],
    dtMS: number,
    axis: [number, number, number] = [0, 0, 1],
    velocity: [number, number, number] = ZERO_VELOCITY,
  ): void {
    if (this.killed || this.lifetimeExpired()) return;
    const numMS = Math.round(dtMS);
    if (numMS <= 0) return;

    let currTime = 0;
    if (this.nextParticleTime > 0) {
      if (this.nextParticleTime > numMS) {
        this.nextParticleTime -= numMS;
        this.internalClock += numMS;
        return;
      }
      currTime = this.nextParticleTime;
      this.nextParticleTime = 0;
      this.internalClock += currTime;
      // The engine always ages this carried-over particle, regardless of
      // overrideAdvances.
      this.emitAlong(start, end, currTime, numMS, axis, velocity, true);
    }

    while (currTime < numMS) {
      let period = this.data.ejectionPeriodMS;
      if (this.data.periodVarianceMS > 0) {
        period += Math.round(randomVariance(0, this.data.periodVarianceMS));
      }
      period = Math.max(1, period);
      if (currTime + period > numMS) {
        this.nextParticleTime = currTime + period - numMS;
        this.internalClock += numMS - currTime;
        break;
      }
      this.internalClock += period;
      currTime += period;
      this.emitAlong(
        start,
        end,
        currTime,
        numMS,
        axis,
        velocity,
        !this.data.overrideAdvances,
      );
    }
  }

  /** Advance all live particles by dtMS (ParticleEmitter::advanceTime). */
  update(dtMS: number): void {
    const numMS = Math.round(dtMS);
    if (numMS <= 0) return;
    this.elapsedMS += numMS;

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.currentAge += numMS;
      if (p.currentAge >= p.totalLifetime) {
        // Remove dead particle (swap with last for O(1) removal).
        this.particles[i] = this.particles[this.particles.length - 1];
        this.particles.pop();
        continue;
      }
      this.updateParticle(p, numMS);
    }
  }

  /** No more emission and no live particles (deleteWhenEmpty + lifetime). */
  isDead(): boolean {
    return (
      (this.killed || this.lifetimeExpired()) && this.particles.length === 0
    );
  }

  /** Stop emitting (deleteWhenEmpty); existing particles live out their lifetime. */
  kill(): void {
    this.killed = true;
  }

  private lifetimeExpired(): boolean {
    return this.lifetimeMS > 0 && this.elapsedMS > this.lifetimeMS;
  }

  /**
   * Spawn one particle at its point along the frame's segment, then move it
   * through the remainder of the frame. The engine only integrates physics
   * here — the age stays 0 until advanceTime — and drops the particle
   * outright if the remainder exceeds its lifetime.
   */
  private emitAlong(
    start: [number, number, number],
    end: [number, number, number],
    emitTime: number,
    numMS: number,
    axis: [number, number, number],
    velocity: [number, number, number],
    advance: boolean,
  ): void {
    if (this.particles.length >= this.maxParticles) return;
    const p = this.addParticle(
      lerp3(start, end, emitTime / numMS),
      axis,
      velocity,
    );
    const remaining = numMS - emitTime;
    if (!advance || remaining <= 0) return;
    if (p.totalLifetime < remaining) {
      this.particles.pop();
      return;
    }
    this.updateParticle(p, remaining);
  }

  /** Physics integration + keyframe interpolation (V12 updateSingleParticle). */
  private updateParticle(p: Particle, dtMS: number): void {
    const dt = dtMS / 1000;
    const pData = this.data.particles;
    const drag = pData.dragCoefficient;
    const gravCoeff = pData.gravityCoefficient;

    // a = acc - vel*drag - wind*windCoeff + gravity*gravCoeff
    // We skip wind for now (no wind system yet).
    const ax = p.acc[0] - p.vel[0] * drag;
    const ay = p.acc[1] - p.vel[1] * drag;
    const az = p.acc[2] - p.vel[2] * drag + this.worldGravity * gravCoeff;

    // Symplectic Euler: update vel first, then pos with new vel.
    p.vel[0] += ax * dt;
    p.vel[1] += ay * dt;
    p.vel[2] += az * dt;

    p.pos[0] += p.vel[0] * dt;
    p.pos[1] += p.vel[1] * dt;
    p.pos[2] += p.vel[2] * dt;

    const interp = interpolateKeys(pData.keys, p.currentAge / p.totalLifetime);
    p.r = interp.r;
    p.g = interp.g;
    p.b = interp.b;
    p.a = interp.a;
    p.size = interp.size;
    p.currentSpin = p.spinSpeed * p.currentAge * SPIN_FACTOR;
  }

  private addParticle(
    pos: [number, number, number],
    axis: [number, number, number],
    inheritedVelocity: [number, number, number],
  ): Particle {
    const d = this.data;
    const pData = d.particles;

    // Compute ejection direction from theta/phi (V12 addParticle).
    let ejX = axis[0];
    let ejY = axis[1];
    let ejZ = axis[2];

    const axisx = computeAxisX(ejX, ejY, ejZ);

    // Theta: angle off main axis.
    const theta =
      (d.thetaMin + Math.random() * (d.thetaMax - d.thetaMin)) * DEG_TO_RAD;

    // Phi: rotation around main axis.
    const phiRef = (this.internalClock / 1000) * d.phiReferenceVel;
    const phi = (phiRef + Math.random() * d.phiVariance) * DEG_TO_RAD;

    // Rotate axis by theta around axisx, then by phi around original axis.
    [ejX, ejY, ejZ] = rotateAroundAxis(
      ejX,
      ejY,
      ejZ,
      axisx[0],
      axisx[1],
      axisx[2],
      theta,
    );
    [ejX, ejY, ejZ] = rotateAroundAxis(
      ejX,
      ejY,
      ejZ,
      axis[0],
      axis[1],
      axis[2],
      phi,
    );

    // Normalize ejection direction.
    const ejLen = Math.sqrt(ejX * ejX + ejY * ejY + ejZ * ejZ);
    if (ejLen > 1e-8) {
      ejX /= ejLen;
      ejY /= ejLen;
      ejZ /= ejLen;
    }

    // Velocity with variance.
    const speed = randomVariance(d.ejectionVelocity, d.velocityVariance);

    const spawnPos: [number, number, number] = [
      pos[0] + ejX * d.ejectionOffset,
      pos[1] + ejY * d.ejectionOffset,
      pos[2] + ejZ * d.ejectionOffset,
    ];

    // ParticleData::initializeParticle: vel += inherited × inheritedVelFactor,
    // then acc = vel × constantAcceleration, set once and applied every frame.
    const ivf = pData.inheritedVelFactor;
    const vel: [number, number, number] = [
      ejX * speed + inheritedVelocity[0] * ivf,
      ejY * speed + inheritedVelocity[1] * ivf,
      ejZ * speed + inheritedVelocity[2] * ivf,
    ];
    const ca = pData.constantAcceleration;
    const acc: [number, number, number] = [
      vel[0] * ca,
      vel[1] * ca,
      vel[2] * ca,
    ];

    // Particle lifetime with variance.
    let lifetime = pData.lifetimeMS;
    if (pData.lifetimeVarianceMS > 0) {
      lifetime += Math.round(randomVariance(0, pData.lifetimeVarianceMS));
    }
    lifetime = Math.max(1, lifetime);

    // Spin speed.
    const spin =
      pData.spinSpeed + randomRange(pData.spinRandomMin, pData.spinRandomMax);

    // Initial color/size from first keyframe.
    const k0 = pData.keys[0];

    const particle: Particle = {
      pos: spawnPos,
      vel,
      acc,
      orientDir: [ejX, ejY, ejZ],
      currentAge: 0,
      totalLifetime: lifetime,
      dataIndex: 0,
      spinSpeed: spin,
      currentSpin: 0,
      r: k0.r,
      g: k0.g,
      b: k0.b,
      a: k0.a,
      size: k0.size,
    };
    this.particles.push(particle);
    return particle;
  }
}
