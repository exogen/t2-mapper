import { Matrix4 } from "three";
import { EmitterInstance, resolveEmitterData } from "./ParticleSystem";
import { GroundVehicleCollision } from "./groundVehicleCollision";
import { terrainParticleColors } from "./terrainProperties";
import {
  clearGroundActionMaps,
  getGroundEffectShape,
  groundActionName,
  groundClipInfo,
  groundWheels,
  type GroundShape,
} from "./groundEffectAssets";
import { advanceDTSTriggers } from "../dts/dtsTriggers";
import { samplePlayerPose } from "../stream/playerAnimation";
import { TABLE_ACTION_NAMES } from "../stream/playerActionMap";
import type {
  GroundActor,
  GroundEffectFrame,
} from "../stream/groundEffectHistory";
import type { StreamingPlayback } from "../stream/types";
import { timelineRandom } from "../stream/timelineRandom";
import { collisionState } from "../collision/collisionContext";
import { castTerrainRay, type Vec3 } from "../collision/terrainCollision";
import {
  castInteriorRay,
  withCollisionQueryBatch,
} from "../collision/worldCollision";
import { waterLevelAt } from "../collision/waterLevel";
import {
  groundActorMatrix,
  torqueWorldPoint,
  WheelContactQuery,
} from "../collision/wheelContact";
import type { EmitterDataResolved } from "./types";

export interface GroundDecal {
  id: number;
  timeSec: number;
  dataBlockId: number;
  point: Vec3;
  normal: Vec3;
  forward: Vec3;
}
interface ActiveGroundEmitter {
  emitter: EmitterInstance;
  origin?: Vec3;
  active: boolean;
  touched: boolean;
  owner?: string;
}
const UP: Vec3 = [0, 0, 1],
  ZERO: Vec3 = [0, 0, 0];
const n = (db: Record<string, unknown>, key: string, fallback = 0): number =>
  typeof db[key] === "number" ? (db[key] as number) : fallback;

/** Ground effects consume simulation time, never wall time. The retained input
 * history also supplies the short warm-up after seeks and late asset loads. */
export class GroundEffectSimulation {
  readonly emitters = new Map<string, ActiveGroundEmitter>();
  readonly decals: GroundDecal[] = [];
  readonly decalTimeoutSec = 5;
  readonly maxDecals = 256;
  timeSec = -Infinity;
  private nextDecal = 0;
  private poses = new Map<string, { timeSec: number; state: number }>();
  private emitterData = new Map<number, EmitterDataResolved | null>();
  private wheelQuery = new WheelContactQuery();
  private matrix = new Matrix4();
  private gravity = -9.81;
  private missingShapes = new Set<string>();
  private terrainColors: ReturnType<typeof terrainParticleColors>;

  hasNewShapeAssets(): boolean {
    for (const name of this.missingShapes)
      if (getGroundEffectShape(name)) return true;
    return false;
  }
  private readonly playback: StreamingPlayback;
  private vehicles: GroundVehicleCollision;
  constructor(playback: StreamingPlayback) {
    this.playback = playback;
    this.vehicles = new GroundVehicleCollision(playback);
  }

  clear(): void {
    this.emitters.clear();
    // Live mission changes can reuse this playback and its datablock IDs.
    this.emitterData.clear();
    clearGroundActionMaps(this.playback);
    this.decals.length = 0;
    this.poses.clear();
    this.missingShapes.clear();
    this.timeSec = -Infinity;
    this.nextDecal = 0;
  }
  private data(id: number): EmitterDataResolved | null {
    if (this.emitterData.has(id)) return this.emitterData.get(id)!;
    const raw = this.playback.getDataBlockData(id);
    if (!raw) return null;
    const data = resolveEmitterData(raw, (i) =>
      this.playback.getDataBlockData(i),
    );
    if (data) this.emitterData.set(id, data);
    return data;
  }
  private emitter(
    key: string,
    id: number,
    actor: GroundActor,
    burst = false,
  ): ActiveGroundEmitter | undefined {
    let active = this.emitters.get(key);
    if (active) return active;
    const data = this.data(id);
    if (!data) return;
    active = {
      emitter: new EmitterInstance(
        data,
        burst ? 4096 : 512,
        timelineRandom(actor.ghostIndex, actor.spawnTick, id, this.timeSec),
      ),
      active: false,
      touched: false,
      owner: burst ? undefined : actor.key,
    };
    active.emitter.worldGravity = this.gravity;
    this.emitters.set(key, active);
    return active;
  }
  private emit(
    actor: GroundActor,
    kind: string,
    id: unknown,
    point: Vec3,
    axis: Vec3,
    dtMS: number,
    velocity: Vec3,
    trail = false,
  ): void {
    if (typeof id !== "number" || !(dtMS > 0)) return;
    const entry = this.emitter(`${actor.key}:${kind}`, id, actor);
    if (!entry) return;
    const colors = this.terrainColors;
    if (colors) entry.emitter.setColors(colors);
    entry.emitter.emitPeriodic(
      trail && entry.active && entry.origin ? entry.origin : point,
      point,
      Math.floor(dtMS + 1e-6),
      axis,
      velocity,
    );
    entry.origin = point;
    entry.active = true;
    entry.touched = true;
  }
  private footstep(
    actor: GroundActor,
    shape: GroundShape,
    db: Record<string, unknown>,
    now: number,
  ): void {
    const move = actor.clientAnimation?.move;
    if (!move) return;
    const shapeName = String(db.shapeName ?? "");
    const clipName = (key: string | number) =>
      groundActionName(
        this.playback,
        shape,
        shapeName,
        typeof key === "number" ? key : TABLE_ACTION_NAMES.indexOf(key),
      );
    const sample = (time: number) =>
      samplePlayerPose(
        move,
        actor,
        actor.mounted,
        time,
        0,
        (i) => i,
        (key) => groundClipInfo(shape, clipName(key)),
      )[0];
    const pose = sample(now);
    const previous = this.poses.get(actor.key);
    let state = previous?.state ?? 0;
    const name = clipName(pose.name);
    const clip = name != null ? shape.clips.get(name) : undefined;
    if (clip && previous) {
      const before = sample(previous.timeSec);
      const from =
        before.name === pose.name ? (before.phase ?? before.position) : 0;
      state = advanceDTSTriggers(
        clip.triggers,
        from,
        pose.phase ?? pose.position,
        groundClipInfo(shape, name)?.cyclic ?? false,
        state,
      );
    }
    this.poses.set(actor.key, { timeSec: now, state });
    const foot = state & 1 ? 1 : state & 2 ? 2 : 0;
    if (!foot) return;
    this.poses.get(actor.key)!.state &= ~foot;
    const colors = this.terrainColors;
    if (!colors) return;
    const offset = (foot === 1 ? -1 : 1) * n(db, "decalOffset");
    const point = torqueWorldPoint([offset, 0, 0], this.matrix);
    const start: Vec3 = [point[0], point[1], point[2] + 0.01],
      end: Vec3 = [point[0], point[1], point[2] - 2];
    const hit = castTerrainRay(start, end);
    if (
      !hit ||
      hit.t > 0.5 ||
      (waterLevelAt(actor.position[0], actor.position[1]) ?? -Infinity) >
        actor.position[2]
    )
      return;
    const interior = castInteriorRay(start, end);
    if (
      (interior && interior.dist <= hit.t * 2.01) ||
      this.vehicles.blocksRay(start, end, hit.t)
    )
      return;
    const emitterId = db.footPuffEmitter;
    if (typeof emitterId === "number") {
      const entry = this.emitter(`foot:${emitterId}`, emitterId, actor, true);
      if (entry) {
        entry.emitter.setColors(colors);
        // The engine creates an emitter for each step. Pool its storage, but
        // keep each burst independent of which earlier steps were replayed.
        entry.emitter.emitRadial(
          point,
          n(db, "footPuffRadius"),
          n(db, "footPuffNumParts"),
          UP,
          ZERO,
          timelineRandom(
            actor.ghostIndex,
            actor.spawnTick,
            emitterId,
            now,
            foot,
          ),
        );
        entry.touched = true;
      }
    }
    if (typeof db.decalData === "number") {
      const forwardPoint = torqueWorldPoint([0, 1, 0], this.matrix);
      const forward = forwardPoint.map((v, i) => v - actor.position[i]) as Vec3;
      if (forward.reduce((v, x, i) => v + x * hit.normal[i], 0) < 0.98) {
        if (this.decals.length >= this.maxDecals) this.decals.shift();
        this.decals.push({
          id: this.nextDecal++,
          timeSec: now,
          dataBlockId: db.decalData,
          point: hit.point,
          normal: hit.normal,
          forward,
        });
      }
    }
  }
  step(frame: GroundEffectFrame): void {
    if (frame.timeSec <= this.timeSec) return;
    const dtMS = Number.isFinite(this.timeSec)
      ? (frame.timeSec - this.timeSec) * 1000
      : 0;
    this.timeSec = frame.timeSec;
    this.gravity = frame.gravity;
    this.terrainColors = terrainParticleColors(
      collisionState().terrain?.textureName,
    );
    this.vehicles.setFrame(frame);
    for (const entry of this.emitters.values()) {
      entry.touched = false;
      entry.emitter.worldGravity = frame.gravity;
      entry.emitter.update(dtMS);
    }
    while (
      this.decals.length &&
      frame.timeSec - this.decals[0].timeSec > this.decalTimeoutSec
    )
      this.decals.shift();
    const seen = new Set<string>();
    withCollisionQueryBatch(() => {
      for (const actor of frame.actors) {
        seen.add(actor.key);
        const db = this.playback.getDataBlockData(actor.dataBlockId);
        if (!db) continue;
        const name = String(db.shapeName ?? "");
        const shape = getGroundEffectShape(name);
        // Hover/flying vehicle collision shapes also affect nearby footsteps.
        if (!shape && name) this.missingShapes.add(name);
        groundActorMatrix(actor.position, actor.rotation, this.matrix);
        if (actor.type === "Player") {
          if (shape) this.footstep(actor, shape, db, frame.timeSec);
          if (actor.jetting && typeof db.dustEmitter === "number") {
            // Released binary 0x005d6980: horizontal offset -0.3 along +Y,
            // terrain-only 2m ray, hit +0.3Z, no inherited velocity.
            const p = torqueWorldPoint([0, -0.3, 0], this.matrix);
            p[2] = actor.position[2];
            const hit = castTerrainRay(p, [p[0], p[1], p[2] - 2]);
            if (hit)
              this.emit(
                actor,
                "jetDust",
                db.dustEmitter,
                [hit.point[0], hit.point[1], hit.point[2] + 0.3],
                hit.normal,
                dtMS,
                ZERO,
              );
          }
        } else {
          const p = actor.position;
          if (typeof db.dustEmitter === "number") {
            const hit = castTerrainRay(p, [
              p[0],
              p[1],
              p[2] - n(db, "triggerDustHeight"),
            ]);
            if (hit)
              this.emit(
                actor,
                "wash",
                db.dustEmitter,
                [
                  hit.point[0],
                  hit.point[1],
                  hit.point[2] + n(db, "dustHeight"),
                ],
                hit.normal,
                dtMS,
                actor.velocity,
              );
          }
          const speed = Math.hypot(...actor.velocity);
          const axis: Vec3 =
            speed > 0 ? (actor.velocity.map((v) => v / speed) as Vec3) : UP;
          if (
            actor.className === "HoverVehicle" &&
            speed > 2 &&
            typeof db.dustTrailEmitter === "number" &&
            this.terrainColors
          ) {
            const hit = castTerrainRay(p, [
              p[0],
              p[1],
              p[2] - n(db, "triggerTrailHeight"),
            ]);
            const divisor = n(db, "dustTrailFreqMod");
            if (hit && divisor > 0) {
              const offset = (db.dustTrailOffset ?? { x: 0, y: 0, z: 0 }) as {
                x: number;
                y: number;
                z: number;
              };
              this.emit(
                actor,
                "trail",
                db.dustTrailEmitter,
                [
                  hit.point[0] + offset.x,
                  hit.point[1] + offset.y,
                  hit.point[2] + offset.z,
                ],
                axis,
                (dtMS * speed) / divisor,
                actor.velocity,
                true,
              );
            }
          }
          if (
            actor.className === "WheeledVehicle" &&
            !actor.frozen &&
            speed > 1 &&
            typeof db.tireEmitter === "number" &&
            shape
          ) {
            groundWheels(shape).forEach((wheel, i) => {
              const hit = this.wheelQuery.contact(
                wheel,
                n(db, "tireRadius"),
                this.matrix,
                (box, out) =>
                  this.vehicles.appendTriangles(box, out, actor.key),
                (start, end, t) =>
                  this.vehicles.blocksRay(start, end, t, actor.key),
              );
              if (hit)
                this.emit(
                  actor,
                  `wheel${i}`,
                  db.tireEmitter,
                  [hit[0], hit[1], hit[2] + 0.5],
                  axis,
                  (dtMS * speed) / 15,
                  actor.velocity,
                  true,
                );
            });
          }
        }
      }
    });
    for (const [key, entry] of this.emitters) {
      if (!entry.touched) entry.active = false;
      if (
        !entry.touched &&
        !entry.emitter.particles.length &&
        (!entry.owner || !seen.has(entry.owner))
      )
        this.emitters.delete(key);
    }
    for (const key of this.poses.keys())
      if (!seen.has(key)) this.poses.delete(key);
  }
}
