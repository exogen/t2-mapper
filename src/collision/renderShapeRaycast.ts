import { Box3, Matrix4, Ray, Vector3 } from "three";
import { DTSShape } from "../dts/dtsModel";
import {
  castDTSHullRay,
  getDTSCollisionMeshes,
  getDTSHullPlanes,
  type DTSCollisionMesh,
} from "../dts/dtsCollision";
import { castWorldRay, type Vec3 } from "./worldCollision";

interface ShapeEntry {
  shape: DTSShape;
  type: string;
  active: () => boolean;
  box: Box3;
  hulls?: DTSCollisionMesh[];
}

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
  private readonly point = new Vector3();
  private readonly normal = new Vector3();
  private readonly inverse = new Matrix4();
  private readonly ray = new Ray();
  private readonly worldStart: Vec3 = [0, 0, 0];
  private readonly worldEnd: Vec3 = [0, 0, 0];
  private hitId: string | undefined;
  private readonly flareStart = new Vector3();
  private readonly flareDirection = new Vector3();

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

  getShape(id: string): DTSShape | undefined {
    const entry = this.shapes.get(id);
    return entry?.active() ? entry.shape : undefined;
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

  /** RepairProjectile::canRenderFlare: hide from the back and behind other
   * container objects, excluding the target (and the source in first person). */
  repairFlareVisible(
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

  private castShapes(
    start: Vector3,
    end: Vector3,
    type: string,
    excludeA?: string,
    excludeB?: string,
  ): number {
    let best = 1;
    this.hitId = undefined;
    for (const [id, entry] of this.shapes) {
      if (id === excludeA || id === excludeB) continue;
      // All ShapeBases share GameBase/ShapeBase bits. TSStatic shares only the
      // StaticObject bit with static targets. Terrain/interiors work likewise.
      if (entry.type === "TSStatic" && !isStatic(type)) continue;
      if (!entry.active()) continue;
      entry.shape.updateWorldMatrix(true, false);
      this.inverse.copy(entry.shape.matrixWorld).invert();
      this.start.copy(start).applyMatrix4(this.inverse);
      this.end.copy(end).applyMatrix4(this.inverse);
      const tBox = this.boxEntry(entry.box);
      if (tBox === null || tBox > best) continue;
      if (entry.type === "Player") {
        best = tBox;
        this.hitId = id;
        continue;
      }
      entry.hulls ??= getDTSCollisionMeshes(
        entry.shape,
        entry.type === "TSStatic" ? "TSStatic" : "ShapeBase",
      );
      for (const hull of entry.hulls) {
        if (!hull.updateForCollision()) continue;
        this.inverse.copy(hull.matrixWorld).invert();
        this.start.copy(start).applyMatrix4(this.inverse);
        this.end.copy(end).applyMatrix4(this.inverse);
        const t = castDTSHullRay(
          getDTSHullPlanes(hull.geometry),
          this.start,
          this.end,
          this.normal,
        );
        if (t === null || t > best) continue;
        best = t;
        this.hitId = id;
      }
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
    this.worldStart[0] = start.z;
    this.worldStart[1] = start.x;
    this.worldStart[2] = start.y;
    this.worldEnd[0] = end.z;
    this.worldEnd[1] = end.x;
    this.worldEnd[2] = end.y;
    const obstruction = castWorldRay(this.worldStart, this.worldEnd, {
      includeTerrain: isStatic(type),
      includeInteriors: isStatic(type),
    });
    return obstruction != null && obstruction.t < limit;
  }

  private boxEntry(box: Box3): number | null {
    // Ray.intersectBox returns the exit for an inside start. Player::castRay
    // reports t=0 instead; the DTS narrow phase has its own inside-ray rule.
    if (box.containsPoint(this.start)) return 0;
    this.ray.origin.copy(this.start);
    this.ray.direction.subVectors(this.end, this.start);
    const length = this.ray.direction.length();
    if (!length) return null;
    this.ray.direction.multiplyScalar(1 / length);
    if (!this.ray.intersectBox(box, this.point)) return null;
    const t = this.point.distanceTo(this.start) / length;
    return t <= 1 ? t : null;
  }
}

export const renderShapeRaycast = new RenderShapeRaycast();
