import { Euler, Quaternion, Vector3 } from "three";
import type { Vec3 } from "../collision/terrainCollision";
import {
  castWorldRay,
  withCollisionQueryBatch,
} from "../collision/worldCollision";
import { castWaterRay } from "../collision/waterLevel";
import type { DebrisEvent } from "../stream/debrisHistory";
import { timelineRandom } from "../stream/timelineRandom";
import {
  explosionExplodeTicks,
  explosionLifetimeTicks,
  resolveExplosionTiming,
} from "../stream/explosionLifetime";
import { getShapeSequenceDurationSec } from "../stream/shapeSequences";
import type { StreamEntity } from "../stream/types";
import { EmitterInstance, resolveEmitterData } from "./ParticleSystem";
import type { DebrisPart } from "./debrisAssets";

type Data = Record<string, unknown>;
const n = (data: Data, key: string, fallback: number) =>
  typeof data[key] === "number" && Number.isFinite(data[key])
    ? (data[key] as number)
    : fallback;
const UP: Vec3 = [0, 0, 1],
  ZERO: Vec3 = [0, 0, 0];
const DT = 0.032;
const axis = new Vector3(),
  perpendicular = new Vector3(),
  direction = new Vector3();
const spin = new Quaternion(),
  euler = new Euler();

/** MathUtils::randomDir: uniform theta/phi angles, not uniform solid angle. */
export function debrisDirection(
  normal: Vec3,
  thetaMin: number,
  thetaMax: number,
  phiMin: number,
  phiMax: number,
  random: () => number,
): Vec3 {
  axis.fromArray(normal).normalize();
  if (!axis.lengthSq()) axis.set(0, 0, 1);
  perpendicular
    .set(0, Math.abs(axis.z) < 0.999 ? 0 : 1, Math.abs(axis.z) < 0.999 ? 1 : 0)
    .crossVectors(axis, perpendicular)
    .normalize();
  direction
    .copy(axis)
    .applyAxisAngle(
      perpendicular,
      ((thetaMin + random() * (thetaMax - thetaMin)) * Math.PI) / 180,
    );
  direction.applyAxisAngle(
    axis,
    ((phiMin + random() * (phiMax - phiMin)) * Math.PI) / 180,
  );
  return direction.toArray();
}

/** Parser field names predate their identification in FUN_0061f7a0:
 * the two ranged integers are COUNT/variance; the 14-bit field is speed×10. */
export function explosionDebris(data: Data) {
  return {
    count: n(data, "debrisMinVelocity", 1),
    variance: n(data, "debrisMaxVelocity", 0),
    speed: n(data, "debrisNum", 20) / 10,
    speedVariance: n(data, "debrisVariance", 0) / 10,
  };
}

export interface DebrisBody {
  id: string;
  data: Data;
  shape?: string;
  part?: DebrisPart;
  position: Vec3;
  previous: Vec3;
  velocity: Vec3;
  rotation: Quaternion;
  previousRotation: Quaternion;
  spinX: number;
  spinZ: number;
  radius: number;
  elasticity: number;
  friction: number;
  bounces: number;
  end: number;
  gravity: number;
  stationary: boolean;
  emitters: EmitterInstance[];
  depth: number;
}
export interface DebrisImpact {
  entity: StreamEntity;
  end: number;
  emitters: EmitterInstance[];
}
type Pending = {
  id: string;
  db: number;
  position: Vec3;
  normal: Vec3;
  gravity: number;
  add: number;
  start: number;
  end: number;
  lifetimeMS: number;
  depth: number;
};
export type DebrisHit = { t: number; normal: Vec3 };
export function castDebrisRay(
  start: Vec3,
  end: Vec3,
  water: boolean,
): DebrisHit | null {
  let hit: DebrisHit | null = castWorldRay(start, end, {
    includeForceFields: false,
  });
  if (water) {
    const wet = castWaterRay(start, end);
    if (wet && (!hit || wet.t < hit.t)) hit = wet;
  }
  return hit;
}

/** Cosmetic simulation in playback time. No React, GPU objects, wall clocks,
 * or mutations of the authoritative stream/ghost state. */
export class DebrisSimulation {
  readonly bodies = new Map<string, DebrisBody>();
  readonly emitters = new Set<EmitterInstance>();
  readonly impacts = new Map<string, DebrisImpact>();
  readonly newImpacts: StreamEntity[] = [];
  readonly missingShapes = new Set<string>();
  time = -Infinity;
  private lastEventId = -1;
  private pending: Pending[] = [];
  private get: (id: number) => Data | undefined;
  private parts: (shape: string) => DebrisPart[] | undefined;
  private cast: typeof castDebrisRay;
  constructor(
    get: (id: number) => Data | undefined,
    parts: (shape: string) => DebrisPart[] | undefined,
    cast = castDebrisRay,
  ) {
    this.get = get;
    this.parts = parts;
    this.cast = cast;
  }

  clear(): void {
    this.bodies.clear();
    this.emitters.clear();
    this.impacts.clear();
    this.newImpacts.length = 0;
    this.missingShapes.clear();
    this.lastEventId = -1;
    this.pending.length = 0;
    this.time = -Infinity;
  }

  private emitter(
    id: unknown,
    random: () => number,
    gravity: number,
  ): EmitterInstance | undefined {
    if (typeof id !== "number") return;
    const raw = this.get(id),
      data = raw && resolveEmitterData(raw, this.get);
    if (!data) return;
    const emitter = new EmitterInstance(data, 256, random);
    emitter.worldGravity = gravity;
    this.emitters.add(emitter);
    return emitter;
  }

  private body(
    id: string,
    db: number,
    pos: Vec3,
    vel: Vec3,
    rotation: Quaternion,
    gravity: number,
    random: () => number,
    depth: number,
    shape?: string,
    part?: DebrisPart,
  ): void {
    const data = this.get(db) ?? {};
    const variance = n(data, "bounceVariance", 0);
    const bounces =
      n(data, "numBounces", 0) +
      Math.floor(random() * (2 * variance + 1)) -
      variance;
    // Retail onAdd retains V12's asymmetric lifetime variance expression.
    const lifeVariance = n(data, "lifetimeVariance", 0);
    const life = n(data, "lifetime", 3) + lifeVariance * (4 * random() - 3);
    let spinX =
      n(data, "minSpinSpeed", 0) +
      random() * (n(data, "maxSpinSpeed", 0) - n(data, "minSpinSpeed", 0));
    let spinZ =
      (n(data, "minSpinSpeed", 0) +
        random() * (n(data, "maxSpinSpeed", 0) - n(data, "minSpinSpeed", 0))) *
      (0.1 + random() * 0.4);
    let radius = part?.radius ?? 0.2;
    let elasticity = n(data, "elasticity", 0.3),
      friction = n(data, "friction", 0.2);
    if (n(data, "velocity", 0) !== 0) {
      const speed =
        n(data, "velocity", 0) +
        (random() * 2 - 1) * n(data, "velocityVariance", 0);
      const length = Math.hypot(...vel) || 1;
      vel = vel.map((v) => (v / length) * speed) as Vec3;
    }
    if (data.useRadiusMass) {
      radius = Math.max(radius, n(data, "baseRadius", 1));
      const factor = n(data, "baseRadius", 1) / radius;
      elasticity *= factor;
      friction *= factor;
      spinX *= factor;
      spinZ *= factor;
    }
    const emitters: EmitterInstance[] = [];
    for (const [slot, ref] of [data.emitter0, data.emitter1].entries()) {
      const emitter = this.emitter(ref, random, gravity);
      if (emitter) {
        emitter.setSizes(slot === 0 ? [1, 2, 3] : [0, 1, 2]);
        emitters.push(emitter);
      }
    }
    this.bodies.set(id, {
      id,
      data,
      shape:
        shape ??
        (typeof data.shapeName === "string" ? data.shapeName : undefined),
      part,
      position: [...pos],
      previous: [...pos],
      velocity: vel,
      rotation,
      previousRotation: rotation.clone(),
      spinX,
      spinZ,
      radius,
      elasticity,
      friction,
      bounces,
      end: this.time + Math.max(0, life),
      gravity,
      stationary: false,
      emitters,
      depth,
    });
  }

  private launch(event: DebrisEvent): void {
    const random = timelineRandom(
      event.id,
      event.dataBlockId,
      event.time,
      ...event.position,
    );
    if (event.kind === "shape") {
      const parts = this.parts(event.shape!);
      if (!parts) {
        this.missingShapes.add(event.shape!);
        return;
      }
      for (const part of parts)
        this.body(
          `debris_${event.id}_${part.index}`,
          event.dataBlockId,
          event.position,
          debrisDirection(event.normal, 0, 50, 0, 360, random),
          new Quaternion().fromArray(event.rotation),
          event.gravity,
          random,
          0,
          event.shape,
          part,
        );
    } else
      this.launchExplosion(
        event.dataBlockId,
        event.position,
        event.normal,
        event.gravity,
        `debris_${event.id}`,
        random,
        0,
      );
  }

  private launchExplosion(
    db: number,
    pos: Vec3,
    normal: Vec3,
    gravity: number,
    id: string,
    random: () => number,
    depth: number,
  ): void {
    const data = this.get(db);
    if (!data || typeof data.debris !== "number") return;
    const config = explosionDebris(data);
    const count = Math.max(
      0,
      config.count +
        Math.floor(random() * (config.variance * 2 + 1)) -
        config.variance,
    );
    for (let i = 0; i < count; i++) {
      const dir = debrisDirection(
        normal,
        n(data, "debrisThetaMin", 0),
        n(data, "debrisThetaMax", 90),
        n(data, "debrisPhiMin", 0),
        n(data, "debrisPhiMax", 360),
        random,
      );
      const speed = config.speed + (random() * 2 - 1) * config.speedVariance;
      this.body(
        `${id}_${i}`,
        data.debris,
        [pos[0], pos[1], pos[2] + 0.5],
        dir.map((v) => v * speed) as Vec3,
        new Quaternion(),
        gravity,
        random,
        depth,
      );
    }
  }

  private addExplosion(
    db: number,
    pos: Vec3,
    gravity: number,
    id: string,
    depth: number,
  ): void {
    const data = this.get(db);
    if (!data || depth > 8) return;
    const shape =
      typeof data.dtsFileName === "string" ? data.dtsFileName : undefined;
    const ambient = getShapeSequenceDurationSec(shape, "ambient");
    const timing = resolveExplosionTiming(
      data,
      ambient,
      timelineRandom(db, this.time, ...pos),
    );
    const delay = explosionExplodeTicks(timing.delayMS);
    if (delay && delay >= explosionLifetimeTicks(timing.armedLifetimeMS))
      return;
    this.pending.push({
      id,
      db,
      position: [...pos],
      normal: UP,
      gravity,
      add: this.time,
      start: this.time + delay * DT,
      end:
        this.time +
        Math.max(delay + 1, explosionLifetimeTicks(timing.lifetimeMS)) * DT,
      lifetimeMS: timing.lifetimeMS,
      depth,
    });
  }

  private explode(p: Pending): void {
    const data = this.get(p.db)!;
    const random = timelineRandom(p.db, p.start, ...p.position);
    const entity: StreamEntity = {
      id: p.id,
      type: "Explosion",
      ghostIndex: -1,
      position: p.position,
      rotation: [0, 0, 0, 1],
      dataBlock: data.dtsFileName as string | undefined,
      explosionDataBlockId: p.db,
      faceViewer: data.faceViewer !== false,
      spawnTimeSec: p.start,
      explosionLifetimeMS: p.lifetimeMS,
      explosionStartAgeMS: (p.start - p.add) * 1000,
    };
    const emitters: EmitterInstance[] = [];
    const burst = this.emitter(data.particleEmitter, random, p.gravity);
    if (burst) {
      // Explosion::explode (0x00621570) uses the radius/count overload.
      burst.emitRadial(
        p.position,
        n(data, "particleRadius", 1),
        n(data, "particleDensity", 10),
        p.normal,
      );
      burst.kill();
    }
    for (const ref of (data.emitters as unknown[] | undefined) ?? []) {
      const emitter = this.emitter(ref, random, p.gravity);
      if (emitter) emitters.push(emitter);
    }
    this.impacts.set(p.id, { entity, end: p.end, emitters });
    this.newImpacts.push(entity);
    this.launchExplosion(
      p.db,
      p.position,
      p.normal,
      p.gravity,
      p.id,
      random,
      p.depth,
    );
    for (const [index, sub] of (
      (data.subExplosions as unknown[] | undefined) ?? []
    ).entries())
      if (typeof sub === "number") {
        const offset = n(this.get(sub) ?? {}, "offset", 0);
        const dir = [random() * 2 - 1, random() * 2 - 1, random()];
        const len = Math.hypot(...dir) || 1;
        this.addExplosion(
          sub,
          p.position.map((v, i) => v + (dir[i] / len) * offset) as Vec3,
          p.gravity,
          `${p.id}_${index}`,
          p.depth + 1,
        );
      }
  }

  private advance(body: DebrisBody): void {
    const { position: pos, velocity: vel, data } = body;
    body.previous[0] = pos[0];
    body.previous[1] = pos[1];
    body.previous[2] = pos[2];
    body.previousRotation.copy(body.rotation);
    if (!body.stationary) {
      spin.setFromEuler(
        euler.set(
          0,
          (-body.spinZ * DT * Math.PI) / 180,
          (-body.spinX * DT * Math.PI) / 180,
          "YZX",
        ),
      );
      body.rotation.multiply(spin).normalize();
      const terminal = n(data, "terminalVelocity", 0),
        speed = Math.hypot(...vel);
      if (terminal > 0.0001 && speed > terminal)
        for (let i = 0; i < 3; i++) vel[i] *= terminal / speed;
      else vel[2] += body.gravity * n(data, "gravModifier", 1) * DT;
      const next: Vec3 = [
        pos[0] + vel[0] * DT,
        pos[1] + vel[1] * DT,
        pos[2] + vel[2] * DT,
      ];
      const distance = Math.hypot(
        next[0] - pos[0],
        next[1] - pos[1],
        next[2] - pos[2],
      );
      const dir = next.map((v, i) =>
        distance ? (v - pos[i]) / distance : 0,
      ) as Vec3;
      const extent = next.map((v, i) => v + dir[i] * body.radius) as Vec3;
      const hit = distance
        ? this.cast(pos, extent, data.ignoreWater === false)
        : null;
      if (hit) {
        const normal = hit.normal;
        const dot =
          vel[0] * normal[0] + vel[1] * normal[1] + vel[2] * normal[2];
        for (let i = 0; i < 3; i++) vel[i] -= 2 * dot * normal[i];
        const reflectedDot =
          vel[0] * normal[0] + vel[1] * normal[1] + vel[2] * normal[2];
        for (let i = 0; i < 3; i++) {
          vel[i] =
            (vel[i] - (vel[i] - normal[i] * reflectedDot) * body.friction) *
            body.elasticity;
          // Retail Debris::bounce uses this radius-adjusted fraction, not a swept sphere.
          pos[i] +=
            (dir[i] * hit.t * distance) / (distance + body.radius) +
            vel[i] * DT;
        }
        body.spinX *= body.elasticity;
        body.spinZ *= body.elasticity;
        if (--body.bounces <= 0) {
          if (data.explodeOnMaxBounce) {
            if (typeof data.explosion === "number")
              this.addExplosion(
                data.explosion,
                pos,
                body.gravity,
                `${body.id}_impact`,
                body.depth + 1,
              );
            body.end = this.time;
          }
          if (data.staticOnMaxBounce) body.stationary = true;
          if (data.snapOnMaxBounce) {
            const forward = direction
              .set(1, 0, 0)
              .applyQuaternion(body.rotation);
            body.rotation.setFromAxisAngle(
              axis.set(0, 1, 0),
              -Math.atan2(forward.z, forward.x),
            );
            pos[2] += 0.1;
          }
        }
      } else {
        pos[0] = next[0];
        pos[1] = next[1];
        pos[2] = next[2];
      }
    }
    const length = Math.hypot(...vel);
    const normal: Vec3 = length
      ? [-vel[0] / length, -vel[1] / length, -vel[2] / length]
      : UP;
    for (const emitter of body.emitters)
      emitter.emitPeriodic(body.previous, pos, DT * 1000, normal, vel);
  }

  /** Returns false while a long reconstruction is yielding to later frames. */
  update(
    now: number,
    events: readonly DebrisEvent[],
    maxSteps = 256,
    gravityChanges: readonly { time: number; gravity: number }[] = [],
  ): boolean {
    this.newImpacts.length = 0;
    if (!Number.isFinite(this.time))
      this.time =
        Math.floor(Math.min(events[0]?.time ?? Infinity, now) / DT) * DT;
    // History appends events in time/ID order, but pruning can remove any
    // expired entry. Locate the unseen suffix once, not on every replay tick.
    let nextEvent = 0;
    let endEvent = events.length;
    while (nextEvent < endEvent) {
      const mid = (nextEvent + endEvent) >>> 1;
      if (events[mid].id <= this.lastEventId) nextEvent = mid + 1;
      else endEvent = mid;
    }
    if (
      nextEvent === events.length &&
      !this.bodies.size &&
      !this.emitters.size &&
      !this.impacts.size &&
      !this.pending.length
    ) {
      this.time = Math.floor(now / DT) * DT;
      return true;
    }
    let steps = 0;
    return withCollisionQueryBatch(() => {
      while (this.time <= now + 1e-8) {
        while (
          nextEvent < events.length &&
          events[nextEvent].time <= this.time + 1e-8
        ) {
          const event = events[nextEvent++];
          this.lastEventId = event.id;
          this.launch(event);
        }
        for (let i = 0; i < this.pending.length;) {
          const p = this.pending[i];
          if (p.start <= this.time + 1e-8) {
            this.pending.splice(i, 1);
            this.explode(p);
          } else i++;
        }
        if (
          !this.bodies.size &&
          !this.emitters.size &&
          !this.impacts.size &&
          !this.pending.length
        ) {
          const next = events[nextEvent];
          const target =
            Math.min(
              Math.floor(now / DT),
              next ? Math.ceil(next.time / DT - 1e-8) : Infinity,
            ) * DT;
          if (target > this.time + 1e-8) {
            this.time = target;
            continue;
          }
        }
        if (this.time + DT > now + 1e-8) return true;
        if (++steps > maxSteps) return false;
        this.time += DT;
        const gravity = gravityChanges.findLast(
          (change) => change.time <= this.time + 1e-8,
        )?.gravity;
        if (gravity != null) {
          for (const body of this.bodies.values()) body.gravity = gravity;
          for (const emitter of this.emitters) emitter.worldGravity = gravity;
        }
        for (const emitter of this.emitters) {
          emitter.update(DT * 1000);
          if (emitter.isDead()) this.emitters.delete(emitter);
        }
        for (const [id, body] of this.bodies) {
          if (body.end > this.time) this.advance(body);
          if (body.end <= this.time) {
            for (const emitter of body.emitters) emitter.kill();
            this.bodies.delete(id);
          }
        }
        for (const [id, impact] of this.impacts) {
          if (impact.end <= this.time) {
            for (const emitter of impact.emitters) emitter.kill();
            this.impacts.delete(id);
          } else
            for (const emitter of impact.emitters)
              emitter.emitPeriodic(
                impact.entity.position!,
                impact.entity.position!,
                DT * 1000,
                UP,
                ZERO,
              );
        }
      }
      return true;
    });
  }
}
