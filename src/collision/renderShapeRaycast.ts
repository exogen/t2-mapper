import { Box3, Matrix4, Vector3, type Object3D } from "three";
import { DTSShape } from "../dts/dtsModel";
import {
  castDTSHullRay,
  getDTSCollisionMeshes,
  getDTSHullPlanes,
  updateCollisionWorldMatrix,
  type DTSCollisionMesh,
} from "../dts/dtsCollision";
import {
  castWorldRay,
  withCollisionQueryBatch,
  type Vec3,
  type WorldRayHit,
} from "./worldCollision";
import { castWaterRay, type WaterRayHit } from "./waterLevel";
import { segmentBoxEntry } from "./segmentBoxEntry";

interface ShapeEntry {
  shape: DTSShape;
  type: string;
  active: () => boolean;
  box: Box3;
  hulls?: DTSCollisionMesh[];
  weaponPose?: { generation: number; inverse: Matrix4 };
}

export type BeamRayHit =
  | { t: number; shapeId: string }
  | { t: number; world: WorldRayHit }
  | { t: number; water: WaterRayHit };

function isStatic(type: string): boolean {
  return type === "StaticShape" || type === "Turret" || type === "TSStatic";
}

const alwaysActive = () => true;

/** Client render-time queries, separate from the fixed-tick simulation world.
 * ShapeBase rays use LOS hulls; Player::castRay uses its datablock box. Images
 * are not container objects and must not register independently of their owner. */
export class RenderShapeRaycast {
  private readonly shapes = new Map<string, ShapeEntry>();
  private readonly start = new Vector3();
  private readonly end = new Vector3();
  private readonly normal = new Vector3();
  private readonly inverse = new Matrix4();
  private readonly worldStart: Vec3 = [0, 0, 0];
  private readonly worldEnd: Vec3 = [0, 0, 0];
  private hitId: string | undefined;
  private readonly flareStart = new Vector3();
  private readonly flareDirection = new Vector3();
  private readonly beamFlareEnd = new Vector3();
  private readonly elfStart = new Vector3();
  private readonly elfEnd = new Vector3();
  private readonly updatedTransforms = new Set<Object3D>();
  private readonly weaponTransforms = new Set<Object3D>();
  private weaponBatch = false;
  private weaponGeneration = 0;

  /** During WeaponPose only the drawn images move. They are not colliders,
   * so each short retraction ray can reuse the same collision root poses. */
  withWeaponRetractionBatch(update: () => void): void {
    if (this.weaponBatch) {
      update();
      return;
    }
    this.weaponBatch = true;
    this.weaponGeneration++;
    try {
      update();
    } finally {
      this.weaponBatch = false;
      this.weaponTransforms.clear();
    }
  }

  register(
    id: string,
    shape: DTSShape,
    type: string,
    active = alwaysActive,
    playerSize = { x: 1, y: 1, z: 2.3 },
  ): () => void {
    const { min, max } = shape.data.bounds;
    const box =
      type === "Player"
        ? new Box3(
            new Vector3(-playerSize.x / 2, 0, -playerSize.y / 2),
            new Vector3(playerSize.x / 2, playerSize.z, playerSize.y / 2),
          )
        : new Box3(
            new Vector3(-max[0], min[2], min[1]),
            new Vector3(-min[0], max[2], max[1]),
          );
    const entry: ShapeEntry = {
      shape,
      type,
      active,
      box,
    };
    this.shapes.set(id, entry);
    return () => {
      if (this.shapes.get(id) === entry) this.shapes.delete(id);
    };
  }

  /** Lightning::strikeRandomPoint (0x628590) casts against every container
   * type and accepts a candidate only when it is the first object hit. The
   * native client/server both use ShapeBase LOS hulls, not visual meshes. */
  lightningTargetExposed(start: Vec3, end: Vec3, targetId: string): boolean {
    if (!this.shapes.get(targetId)?.active()) return false;
    const from = new Vector3(start[1], start[2], start[0]);
    const to = new Vector3(end[1], end[2], end[0]);
    const best = this.castShapes(from, to, "TSStatic");
    if (this.hitId !== targetId) return false;
    const world = castWorldRay(start, end);
    if (world && world.t < best) return false;
    const water = castWaterRay(start, end);
    return !water || water.t >= best;
  }

  /** RepairProjectile::advanceTime accepts only the nearest container hit when
   * it is the repair target. A miss (including an intervening object) leaves out
   * untouched. No visual-mesh traversal, skinning, or BVH construction. */
  repairHit(
    start: Vector3,
    end: Vector3,
    targetId: string,
    out: Vector3,
  ): boolean {
    const target = this.shapes.get(targetId);
    if (!target?.active()) return false;
    const best = this.castShapes(start, end, target.type);
    if (this.hitId !== targetId) return false;
    if (this.worldObstructed(start, end, target.type, best)) return false;
    out.lerpVectors(start, end, best);
    return true;
  }

  /** ELF and repair flares hide from the back and behind other container
   * objects, excluding the target (and the source in first person). */
  linkFlareVisible(
    camera: Vector3,
    muzzle: Vector3,
    end: Vector3,
    targetId: string,
    sourceId: string | undefined,
    firstPerson = true,
  ): boolean {
    const target = this.shapes.get(targetId);
    if (!target?.active()) return false;
    this.flareDirection.subVectors(end, camera).normalize();
    this.flareStart.subVectors(end, muzzle).normalize();
    if (this.flareStart.dot(this.flareDirection) < -0.75) return false;
    this.flareStart.copy(camera).addScaledVector(this.flareDirection, 0.5);
    this.castShapes(
      this.flareStart,
      end,
      target.type,
      targetId,
      firstPerson ? sourceId : undefined,
    );
    return (
      this.hitId === undefined &&
      !this.worldObstructed(this.flareStart, end, target.type, 1)
    );
  }

  /** ELFProjectile::calcSnapPoint targets the object box's center, with
   * a downward LOS-hull test for hollow objects such as inventory stations. */
  elfSnapPoint(targetId: string, out: Vector3): boolean {
    const entry = this.shapes.get(targetId);
    if (!entry?.active()) return false;
    updateCollisionWorldMatrix(entry.shape, this.updatedTransforms);
    const matrix = entry.shape.matrixWorld;
    entry.box.getCenter(this.elfStart);
    out.copy(this.elfStart).applyMatrix4(matrix);
    if (entry.type !== "Player") {
      this.elfStart.y += 1000;
      this.elfEnd.copy(this.elfStart).applyMatrix4(matrix);
      if (this.castHulls(out, this.elfEnd, entry, 1) === undefined) {
        this.elfStart.y -= 2000;
        this.elfEnd.copy(this.elfStart).applyMatrix4(matrix);
        const hit = this.castHulls(out, this.elfEnd, entry, 1);
        if (hit !== undefined) out.lerp(this.elfEnd, hit);
      }
    }
    this.updatedTransforms.clear();
    return true;
  }

  /** ELF tests the first contact along the quadratic curve, not the line
   * from the muzzle to the target. A hit on another object hides the beam. */
  clipElfBeam(
    sample: (t: number, out: Vector3) => Vector3,
    sourceId: string | undefined,
    targetId: string,
    out: Vector3,
  ): boolean {
    return withCollisionQueryBatch(() => {
      sample(0, this.elfStart);
      for (let i = 1; i <= 16; i++) {
        sample(i / 16, this.elfEnd);
        const hit = this.targetBeamHit(this.elfStart, this.elfEnd, sourceId);
        if (hit) {
          out.lerpVectors(this.elfStart, this.elfEnd, hit.t);
          return "shapeId" in hit && hit.shapeId === targetId;
        }
        this.elfStart.copy(this.elfEnd);
      }
      return true;
    });
  }

  /** TargetProjectile casts against the scene, water and ShapeBase LOS hulls. */
  targetBeamHit(
    start: Vector3,
    end: Vector3,
    sourceId: string | undefined,
    exclude?: BeamRayHit,
  ): BeamRayHit | undefined {
    return this.containerRayHit(start, end, sourceId, exclude, true, false);
  }

  private containerRayHit(
    start: Vector3,
    end: Vector3,
    sourceId: string | undefined,
    exclude: BeamRayHit | undefined,
    includeWater: boolean,
    weaponPose: boolean,
  ): BeamRayHit | undefined {
    const shapeT = this.castShapes(
      start,
      end,
      "TSStatic",
      sourceId,
      exclude && "shapeId" in exclude ? exclude.shapeId : undefined,
      weaponPose,
    );
    this.setRayEndpoints(start, end);
    const world = castWorldRay(
      this.worldStart,
      this.worldEnd,
      exclude && "world" in exclude ? { excludeHit: exclude.world } : undefined,
    );
    const water = includeWater
      ? castWaterRay(
          this.worldStart,
          this.worldEnd,
          exclude && "water" in exclude ? exclude.water.info : undefined,
        )
      : null;
    const worldT = world?.t ?? Infinity;
    const waterT = water?.t ?? Infinity;
    if (this.hitId !== undefined && shapeT <= Math.min(worldT, waterT))
      return { t: shapeT, shapeId: this.hitId };
    if (water && waterT < worldT) return { t: waterT, water };
    if (world) return { t: worldT, world };
  }

  /** Player disables its own collision for the retraction segment. The
   * mounted model excludes water, while the logical muzzle includes it. */
  weaponRetractionHit(
    start: Vector3,
    end: Vector3,
    sourceId: string,
    includeWater: boolean,
  ): number | undefined {
    if (start.equals(end)) return;
    return this.containerRayHit(
      start,
      end,
      sourceId,
      undefined,
      includeWater,
      this.weaponBatch,
    )?.t;
  }

  /** TargetProjectile::canRenderEndFlare excludes the struck object from
   * the camera ray so the flare remains visible on the impact surface. */
  targetBeamFlareVisible(
    camera: Vector3,
    start: Vector3,
    end: Vector3,
    direction: Vector3,
    sourceId: string | undefined,
    impact?: BeamRayHit,
  ): boolean {
    this.beamFlareEnd.copy(end).addScaledVector(direction, 0.2);
    const hit =
      impact ?? this.targetBeamHit(start, this.beamFlareEnd, sourceId);
    if (!hit) return true;
    this.flareDirection.subVectors(this.beamFlareEnd, camera).normalize();
    this.flareStart.copy(camera).addScaledVector(this.flareDirection, 0.5);
    return !this.targetBeamHit(
      this.flareStart,
      this.beamFlareEnd,
      sourceId,
      hit,
    );
  }

  private castShapes(
    start: Vector3,
    end: Vector3,
    type: string,
    excludeA?: string,
    excludeB?: string,
    weaponPose = false,
  ): number {
    let best = 1;
    this.hitId = undefined;
    for (const [id, entry] of this.shapes) {
      if (id === excludeA || id === excludeB) continue;
      // All ShapeBases share GameBase/ShapeBase bits. TSStatic shares only the
      // StaticObject bit with static targets. Terrain/interiors work likewise.
      if (entry.type === "TSStatic" && !isStatic(type)) continue;
      if (!entry.active()) continue;
      const t = this.castShape(start, end, entry, best, weaponPose);
      if (t === undefined) continue;
      best = t;
      this.hitId = id;
    }
    this.updatedTransforms.clear();
    return best;
  }

  private castShape(
    start: Vector3,
    end: Vector3,
    entry: ShapeEntry,
    limit: number,
    weaponPose: boolean,
  ): number | undefined {
    // Frozen mounts can move with their parents. Use current ancestry
    // for the broad-phase box and each animated LOS hull.
    let inverse = this.inverse;
    if (weaponPose) {
      const cached = (entry.weaponPose ??= {
        generation: 0,
        inverse: new Matrix4(),
      });
      if (cached.generation !== this.weaponGeneration) {
        updateCollisionWorldMatrix(entry.shape, this.weaponTransforms);
        cached.inverse.copy(entry.shape.matrixWorld).invert();
        cached.generation = this.weaponGeneration;
      }
      inverse = cached.inverse;
    } else {
      updateCollisionWorldMatrix(entry.shape, this.updatedTransforms);
      inverse.copy(entry.shape.matrixWorld).invert();
    }
    this.start.copy(start).applyMatrix4(inverse);
    this.end.copy(end).applyMatrix4(inverse);
    const tBox = segmentBoxEntry(this.start, this.end, entry.box);
    if (tBox === null || tBox > limit) return;
    if (entry.type === "Player") return tBox;
    return this.castHulls(start, end, entry, limit);
  }

  private castHulls(
    start: Vector3,
    end: Vector3,
    entry: ShapeEntry,
    limit: number,
  ): number | undefined {
    entry.shape.catchUpPose?.();
    entry.hulls ??= getDTSCollisionMeshes(
      entry.shape,
      entry.type === "TSStatic" ? "TSStatic" : "ShapeBase",
    );
    let best: number | undefined;
    for (const hull of entry.hulls) {
      if (!hull.updateForCollision(this.updatedTransforms)) continue;
      this.inverse.copy(hull.matrixWorld).invert();
      this.start.copy(start).applyMatrix4(this.inverse);
      this.end.copy(end).applyMatrix4(this.inverse);
      const t = castDTSHullRay(
        getDTSHullPlanes(hull.geometry),
        this.start,
        this.end,
        this.normal,
      );
      if (t !== null && t <= (best ?? limit)) best = t;
    }
    return best;
  }

  private worldObstructed(
    start: Vector3,
    end: Vector3,
    type: string,
    limit: number,
  ): boolean {
    // ForceFieldBare shares GameBase with every repair target. Terrain and
    // interiors share StaticObject only with static targets (including turrets).
    this.setRayEndpoints(start, end);
    const obstruction = castWorldRay(this.worldStart, this.worldEnd, {
      includeTerrain: isStatic(type),
      includeInteriors: isStatic(type),
    });
    return obstruction != null && obstruction.t < limit;
  }

  private setRayEndpoints(start: Vector3, end: Vector3): void {
    this.worldStart[0] = start.z;
    this.worldStart[1] = start.x;
    this.worldStart[2] = start.y;
    this.worldEnd[0] = end.z;
    this.worldEnd[1] = end.x;
    this.worldEnd[2] = end.y;
  }
}

export const renderShapeRaycast = new RenderShapeRaycast();
