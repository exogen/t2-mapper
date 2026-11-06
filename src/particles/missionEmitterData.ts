import type { TorqueObject, TorqueRuntime } from "../torqueScript/types";
import { resolveDatablock } from "../torqueScript/datablocks";
import type {
  EmitterDataResolved,
  ParticleDataResolved,
  ParticleKey,
} from "./types";

const resolvedEmitters = new WeakMap<
  TorqueObject,
  { key: string; data: EmitterDataResolved }
>();

function number(object: TorqueObject, field: string, fallback: number): number {
  const value = object[field];
  if (value == null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function integer(
  object: TorqueObject,
  field: string,
  fallback: number,
): number {
  return Math.trunc(number(object, field, fallback));
}

function bool(object: TorqueObject, field: string, fallback: boolean): boolean {
  const value = object[field];
  if (value == null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  const text = String(value).trim().toLowerCase();
  if (text === "true") return true;
  if (text === "false") return false;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed !== 0 : fallback;
}

function resolveParticleData(
  object: TorqueObject,
): ParticleDataResolved | null {
  const spinSpeed = number(object, "spinspeed", 0);
  const spinRandomMin = number(object, "spinrandommin", 0);
  const spinRandomMax = number(object, "spinrandommax", 0);
  // ParticleData::onAdd rejects these datablocks rather than registering them.
  if (
    Math.abs(spinSpeed) > 10000 ||
    Math.abs(spinRandomMin) > 10000 ||
    Math.abs(spinRandomMax) > 10000 ||
    spinRandomMin > spinRandomMax
  ) {
    return null;
  }

  const keys: ParticleKey[] = [];
  for (let i = 0; i < 4; i++) {
    const color = String(object[`colors${i}`] ?? "1 1 1 1")
      .trim()
      .split(/\s+/)
      .map(Number);
    const channel = (index: number): number =>
      Number.isFinite(color[index]) ? color[index] : 1;
    // Native onAdd forces time[0] to zero, then fixes descending times.
    const time =
      i === 0
        ? 0
        : Math.max(
            keys[i - 1].time,
            number(object, `times${i}`, i === 1 ? 1 : 2),
          );
    keys.push({
      r: channel(0),
      g: channel(1),
      b: channel(2),
      a: channel(3),
      size: number(object, `sizes${i}`, 1),
      time,
    });
  }

  const lifetimeMS = Math.max(1, integer(object, "lifetimems", 1000));
  return {
    dragCoefficient: Math.max(0, number(object, "dragcoefficient", 0)),
    windCoefficient: number(object, "windcoefficient", 1),
    gravityCoefficient: number(object, "gravitycoefficient", 0),
    inheritedVelFactor: number(object, "inheritedvelfactor", 0),
    constantAcceleration: number(object, "constantacceleration", 0),
    lifetimeMS,
    lifetimeVarianceMS: Math.min(
      lifetimeMS - 1,
      Math.max(0, integer(object, "lifetimevariancems", 0)),
    ),
    spinSpeed,
    spinRandomMin,
    spinRandomMax,
    useInvAlpha: bool(object, "useinvalpha", false),
    keys,
    textureName: String(object.texturename ?? object.animtexname0 ?? ""),
  };
}

/**
 * Resolve script-native datablocks, whose fields retain their authored units.
 * Unlike resolveEmitterData's demo wire format, the runtime stores lowercase
 * field names, named particle references, and colors0/sizes0/times0 fields.
 * Datablock inheritance has already been copied by the TorqueScript runtime.
 */
export function resolveMissionEmitterData(
  emitter: TorqueObject,
  runtime: TorqueRuntime,
): EmitterDataResolved | null {
  // The simulator currently supports one particle datablock per emitter, like
  // the demo adapter. Skip unresolved/invalid names and use the first valid one.
  const references =
    typeof emitter.particles === "object"
      ? [emitter.particles]
      : String(emitter.particles ?? "")
          .trim()
          .split(/\s+/);
  let particles: ParticleDataResolved | null = null;
  for (const reference of references) {
    const object = resolveDatablock(reference, runtime);
    if (object?._class.toLowerCase() !== "particledata") continue;
    particles = resolveParticleData(object);
    if (particles) break;
  }
  if (!particles) return null;

  // Match ParticleEmitterData::onAdd validation, without mutating shared
  // runtime objects. Nonnegative variances also keep malformed scripts safe.
  const ejectionPeriodMS = Math.max(
    1,
    integer(emitter, "ejectionperiodms", 100),
  );
  const ejectionVelocity = Math.max(0, number(emitter, "ejectionvelocity", 2));
  const lifetimeMS = Math.max(0, integer(emitter, "lifetimems", 0));
  const thetaMax = Math.min(180, Math.max(0, number(emitter, "thetamax", 90)));
  const data: EmitterDataResolved = {
    ejectionPeriodMS,
    periodVarianceMS: Math.min(
      ejectionPeriodMS - 1,
      Math.max(0, integer(emitter, "periodvariancems", 0)),
    ),
    ejectionVelocity,
    velocityVariance: Math.min(
      ejectionVelocity,
      Math.max(0, number(emitter, "velocityvariance", 1)),
    ),
    ejectionOffset: Math.max(0, number(emitter, "ejectionoffset", 0)),
    thetaMin: Math.min(thetaMax, Math.max(0, number(emitter, "thetamin", 0))),
    thetaMax,
    phiReferenceVel: number(emitter, "phireferencevel", 0),
    phiVariance: Math.min(
      360,
      Math.max(0, number(emitter, "phivariance", 360)),
    ),
    overrideAdvances: bool(emitter, "overrideadvance", false),
    orientParticles: bool(emitter, "orientparticles", false),
    orientOnVelocity: bool(emitter, "orientonvelocity", true),
    useEmitterColors: bool(emitter, "useemittercolors", false),
    useEmitterSizes: bool(emitter, "useemittersizes", false),
    lifetimeMS,
    lifetimeVarianceMS: Math.min(
      lifetimeMS,
      Math.max(0, integer(emitter, "lifetimevariancems", 0)),
    ),
    particles,
  };
  // Mission entity rebuilds also happen for transforms and scalar velocity.
  // Retain the canonical data identity so those changes keep emission timing
  // and finite emitter lifetimes intact. Hash only during harvest/rebuild,
  // including resolved particle fields so datablock edits invalidate it.
  const key = JSON.stringify(data);
  const cached = resolvedEmitters.get(emitter);
  if (cached?.key === key) return cached.data;
  resolvedEmitters.set(emitter, { key, data });
  return data;
}
