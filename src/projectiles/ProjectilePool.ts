import { Group, type Camera } from "three";
import type { GameEntity } from "../state/gameEntityTypes";
import {
  isProjectileEntity,
  usesWorldSpaceBeamGeometry,
  type ProjectileEntity,
} from "../state/projectileEntities";
import type { ProjectileFactory, ProjectileView } from "./types";

type Bucket = {
  ready?: ProjectileFactory;
  idle: ProjectileView[];
  failed?: boolean;
};
type LoadFactory = (
  entity: ProjectileEntity,
) => ProjectileFactory | Promise<ProjectileFactory>;
type Entry = {
  entity: ProjectileEntity;
  key: string;
  bucket: Bucket;
  view?: ProjectileView;
  poseVisible: boolean;
};

/** Bounded reusable visuals. Late loads never resurrect removed entities. */
export class ProjectilePool {
  readonly root: Group;
  readonly active = new Map<string, Entry>();
  readonly stats = { created: 0, reused: 0, released: 0 };
  private buckets = new Map<string, Bucket>();
  private keys = new WeakMap<ProjectileEntity, string>();
  private disposed = false;
  private idleCount = 0;
  private maxIdle: number;
  private load: LoadFactory;
  private onError: (error: unknown) => void;
  constructor(
    root: Group,
    load: LoadFactory,
    onError: (error: unknown) => void = console.error,
    maxIdle = 128,
  ) {
    this.root = root;
    this.load = load;
    this.onError = onError;
    this.maxIdle = maxIdle;
  }
  private key(entity: ProjectileEntity): string {
    let key = this.keys.get(entity);
    if (key === undefined) {
      key = JSON.stringify(
        entity.renderType === "Shape"
          ? [
              entity.renderType,
              entity.shapeName,
              entity.skinName,
              entity.dataBlockId,
              entity.lightType,
              entity.lightColor,
              entity.lightTime,
              entity.lightRadius,
              entity.lightDelayMS,
              entity.lightOnlyStatic,
              entity.lightAnchor,
              entity.isStaticItem,
            ]
          : entity.renderType === "Explosion"
            ? [entity.renderType, entity.shapeName, entity.explosionDataBlockId]
            : [
                entity.renderType,
                entity.visual,
                entity.renderType === "ShockLance" ? entity.beamHit : undefined,
              ],
      );
      this.keys.set(entity, key);
    }
    return key;
  }
  private bucket(key: string, entity: ProjectileEntity): Bucket {
    const cached = this.buckets.get(key);
    if (cached) return cached;
    const bucket: Bucket = { idle: [] };
    this.buckets.set(key, bucket);
    const failed = (error: unknown) => {
      bucket.failed = true;
      if (!this.disposed) this.onError(error);
    };
    try {
      const factory = this.load(entity);
      if (typeof factory === "function") bucket.ready = factory;
      else
        void factory.then((ready) => {
          if (!this.disposed) bucket.ready = ready;
        }, failed);
    } catch (error) {
      failed(error);
    }
    return bucket;
  }
  /** Called after the stream publishes membership and before visual updates. */
  sync(entities: ReadonlyMap<string, GameEntity>): void {
    if (this.disposed) return;
    // Release first, so replacements and newly spawned peers can reuse slots immediately.
    for (const [id, entry] of this.active) {
      const entity = entities.get(id);
      if (
        !entity ||
        !isProjectileEntity(entity) ||
        (entity !== entry.entity &&
          (this.key(entity) !== entry.key ||
            entity.spawnTime !== entry.entity.spawnTime ||
            entity.ghostIndex !== entry.entity.ghostIndex))
      ) {
        this.release(entry);
        this.active.delete(id);
      } else entry.entity = entity;
    }
    for (const entity of entities.values()) {
      if (!isProjectileEntity(entity) || this.active.has(entity.id)) continue;
      const key = this.key(entity);
      this.active.set(entity.id, {
        entity,
        key,
        bucket: this.bucket(key, entity),
        poseVisible: true,
      });
    }
  }
  prepare(
    delta: number,
    updatePose?: (root: Group, entity: ProjectileEntity) => void,
  ): void {
    for (const entry of this.active.values()) {
      if (!entry.view && entry.bucket.ready && !entry.bucket.failed) {
        try {
          const recycled = entry.bucket.idle.pop();
          if (recycled) {
            this.idleCount--;
            this.stats.reused++;
          } else this.stats.created++;
          const view = recycled ?? entry.bucket.ready();
          entry.view = view;
          const entity = entry.entity,
            root = view.root;
          root.name = entity.id;
          if (usesWorldSpaceBeamGeometry(entity)) {
            root.position.set(0, 0, 0);
            root.quaternion.identity();
            root.scale.setScalar(1);
          } else {
            root.position.fromArray(entity.position ?? [0, 0, 0]);
            root.quaternion.fromArray(entity.rotation ?? [0, 0, 0, 1]);
            root.scale.fromArray(entity.scale ?? [1, 1, 1]);
          }
          root.visible = true;
          view.reset(entity);
          this.root.add(root);
        } catch (error) {
          entry.view?.root.removeFromParent();
          entry.view?.dispose();
          entry.view = undefined;
          entry.bucket.failed = true;
          this.onError(error);
        }
      }
      const view = entry.view;
      if (view) {
        view.root.visible = true;
        updatePose?.(view.root, entry.entity);
        entry.poseVisible = view.root.visible;
        if (entry.entity.hidden || entry.entity.debugHidden)
          view.root.visible = false;
        view.animate?.(entry.entity, delta);
      }
    }
  }
  update(camera: Camera, delta: number): void {
    for (const { view, entity, poseVisible } of this.active.values())
      if (view) {
        // Update internal lifetime/light state even while the entity wrapper is hidden.
        view.root.visible = true;
        view.update(entity, camera, delta);
        // LinearProjectile::processTick (FUN_0062e010) hides spent projectiles
        // before their network ghosts are deleted. A visual must not undo that.
        if (!poseVisible || entity.hidden || entity.debugHidden)
          view.root.visible = false;
      }
  }
  private release(entry: Entry): void {
    const view = entry.view;
    if (!view) return;
    this.stats.released++;
    view.root.removeFromParent();
    view.release();
    entry.view = undefined;
    if (!this.disposed && this.idleCount < this.maxIdle) {
      entry.bucket.idle.push(view);
      this.idleCount++;
    } else view.dispose();
  }
  reset(): void {
    for (const entry of this.active.values()) this.release(entry);
    this.active.clear();
  }
  dispose(): void {
    this.disposed = true;
    this.reset();
    for (const bucket of this.buckets.values())
      for (const view of bucket.idle) view.dispose();
    this.buckets.clear();
    this.idleCount = 0;
  }
}
