import { Box3, Matrix4, Vector3 } from "three";
import { DTSShape } from "../dts/dtsModel";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import { DTS_BASIS } from "../dts/dtsGeometry";
import {
  castDTSHullRay,
  getDTSCollisionMeshes,
  getDTSHullPlanes,
} from "../dts/dtsCollision";
import { DTSSequenceFlags } from "../dts/dtsTypes";
import { shapeThreadTime } from "../stream/shapeThreads";
import type {
  GroundActor,
  GroundEffectFrame,
} from "../stream/groundEffectHistory";
import type { StreamingPlayback } from "../stream/types";
import type { Vec3 } from "../collision/terrainCollision";
import { groundActorMatrix } from "../collision/wheelContact";
import { getGroundEffectShape, type GroundShape } from "./groundEffectAssets";

/** Reuse shape geometry/mixers, but sample the historical vehicle transform and
 * threads. Today's rendered vehicle colliders must never leak into a seek. */
class VehicleShape {
  root = new DTSShape();
  mixer: DTSAnimationMixer;
  collision: ReturnType<typeof getDTSCollisionMeshes>;
  ray: ReturnType<typeof getDTSCollisionMeshes>;
  private actor?: GroundActor;
  private timeSec = -Infinity;
  constructor(shape: GroundShape) {
    this.root.data = shape.model.data;
    this.root.prepareAnimationTargets();
    this.root.matrixAutoUpdate = false;
    this.collision = getDTSCollisionMeshes(this.root, "ShapeBase", "collision");
    this.ray = getDTSCollisionMeshes(this.root, "ShapeBase", "ray");
    this.mixer = new DTSAnimationMixer(this.root);
  }
  sample(actor: GroundActor, shape: GroundShape, now: number) {
    // History actors are immutable. A shape is shared by multiple vehicles,
    // so both actor identity and time must match before reusing its pose.
    if (this.actor === actor && this.timeSec === now) return;
    this.actor = actor;
    this.timeSec = now;
    this.mixer.stopAllAction();
    for (const thread of actor.threads ?? []) {
      const clip = shape.model.animations[thread.sequence];
      if (!clip) continue;
      const action = this.mixer.clipAction(clip).play();
      action.paused = true;
      action.time = shapeThreadTime(
        thread,
        now,
        clip.duration,
        !!((clip.sequence?.flags ?? 0) & DTSSequenceFlags.Cyclic),
      );
    }
    this.mixer.update(0);
    groundActorMatrix(
      actor.position,
      actor.rotation,
      this.root.matrix,
    ).multiply(DTS_BASIS);
    if (actor.scale)
      this.root.matrix.scale(
        new Vector3(actor.scale[0], actor.scale[2], actor.scale[1]),
      );
    this.root.updateMatrixWorld(true);
  }
}

export class GroundVehicleCollision {
  private shapes = new Map<GroundShape, VehicleShape>();
  private point = new Vector3();
  private end = new Vector3();
  private normal = new Vector3();
  private inverse = new Matrix4();
  private bounds = new Box3();
  private rayStart = new Vector3();
  private rayEnd = new Vector3();
  private rayBox = new Box3();
  private frame?: GroundEffectFrame;
  private playback: StreamingPlayback;
  constructor(playback: StreamingPlayback) {
    this.playback = playback;
  }
  setFrame(frame: GroundEffectFrame) {
    this.frame = frame;
  }
  private visit(
    box: Box3,
    exclude: string,
    kind: "ray" | "collision",
    fn: (mesh: ReturnType<typeof getDTSCollisionMeshes>[number]) => boolean,
  ): boolean {
    for (const actor of this.frame?.actors ?? []) {
      if (actor.type !== "Vehicle" || actor.key === exclude) continue;
      const name = this.playback.getDataBlockData(actor.dataBlockId)?.shapeName;
      const shape =
        typeof name === "string" ? getGroundEffectShape(name) : undefined;
      if (!shape) continue;
      const data = shape.model.data;
      const radius =
        (data.radius + Math.hypot(...data.center)) *
        Math.max(...(actor.scale ?? [1, 1, 1]));
      this.point.set(actor.position[1], actor.position[2], actor.position[0]);
      if (box.distanceToPoint(this.point) > radius) continue;
      let state = this.shapes.get(shape);
      if (!state) this.shapes.set(shape, (state = new VehicleShape(shape)));
      state.sample(actor, shape, this.frame!.timeSec);
      for (const mesh of state[kind]) {
        if (!mesh.updateForCollision()) continue;
        this.bounds
          .copy(mesh.geometry.boundingBox!)
          .applyMatrix4(mesh.matrixWorld);
        if (this.bounds.intersectsBox(box) && fn(mesh)) return true;
      }
    }
    return false;
  }
  blocksRay(start: Vec3, end: Vec3, before: number, exclude = ""): boolean {
    const a = this.rayStart.set(start[1], start[2], start[0]),
      b = this.rayEnd.set(end[1], end[2], end[0]);
    const box = this.rayBox;
    box.min.copy(a).min(b);
    box.max.copy(a).max(b);
    return this.visit(box, exclude, "ray", (mesh) => {
      this.inverse.copy(mesh.matrixWorld).invert();
      this.point.copy(a).applyMatrix4(this.inverse);
      this.end.copy(b).applyMatrix4(this.inverse);
      const t = castDTSHullRay(
        getDTSHullPlanes(mesh.geometry),
        this.point,
        this.end,
        this.normal,
      );
      return t !== null && t <= before;
    });
  }
  appendTriangles(box: Box3, out: number[], exclude: string): void {
    this.visit(box, exclude, "collision", (mesh) => {
      const position = mesh.geometry.getAttribute("position"),
        indices = mesh.geometry.index;
      const count = indices?.count ?? position.count;
      for (let i = 0; i < count; i++) {
        this.point
          .fromBufferAttribute(position, indices ? indices.getX(i) : i)
          .applyMatrix4(mesh.matrixWorld);
        out.push(this.point.x, this.point.y, this.point.z);
      }
      return false;
    });
  }
}
