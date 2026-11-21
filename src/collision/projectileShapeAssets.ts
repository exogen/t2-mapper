import {
  Box3,
  Matrix3,
  Matrix4,
  Quaternion,
  Vector3,
  type Object3D,
  type Plane,
} from "three";
import {
  getDTSCollisionMeshes,
  getDTSHullPlanes,
  updateCollisionWorldMatrix,
} from "../dts/dtsCollision";
import { DTSShape } from "../dts/dtsModel";
import { getDTSNodeLookup } from "../dts/dtsNodeLookup";
import type { DTSShapeData } from "../dts/dtsTypes";
import { threeToTorque, torqueVecToThree } from "../scene/coordinates";
import { shapeKey } from "../stream/shapeSequences";
import type { StreamEntity } from "../stream/types";
import { objectMountSlot, SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { collisionState, type CollisionState } from "./collisionContext";

export interface ProjectileShapeAsset {
  bounds: Box3;
  hulls: readonly {
    inverse: Matrix4;
    normalMatrix: Matrix3;
    planes: readonly Plane[];
  }[];
  mounts: ReadonlyMap<number, Matrix4>;
}

export type ProjectileShapeLoader = (
  name: string,
) => DTSShapeData | Promise<DTSShapeData>;

type ShapeEntry =
  | { status: "ready"; data: DTSShapeData }
  | {
      status: "loading";
      promise: Promise<void>;
      attempted: WeakSet<ProjectileShapeLoader>;
    }
  | { status: "unavailable"; attempted: WeakSet<ProjectileShapeLoader> };

const PROJECTILE_SHAPE_WAIT_MS = 10_000;

interface ShapeCache {
  entries: Map<string, ShapeEntry>;
  aggregate?: { pending: Set<Promise<void>>; promise: Promise<void> };
}

const assetsByWorld = new WeakMap<CollisionState, ShapeCache>();
const derivedAssets = new WeakMap<DTSShapeData, ProjectileShapeAsset>();
const modelRotation = new Matrix4().makeRotationY(SHAPE_MODEL_ROTATION_Y);
const mountRotation = modelRotation.clone().invert();

function worldAssets(): ShapeCache {
  const world = collisionState();
  let assets = assetsByWorld.get(world);
  if (!assets) assetsByWorld.set(world, (assets = { entries: new Map() }));
  return assets;
}

/** Prepare the raw DTS data needed by the next simulation tick. Each session's
 * loader waits once per shape. A later session may retry unavailable data. */
export function prepareProjectileShapes(
  names: Iterable<string>,
  load: ProjectileShapeLoader,
): Promise<void> | undefined {
  const assets = worldAssets();
  let pending: Set<Promise<void>> | undefined;
  for (const name of names) {
    const key = shapeKey(name);
    let entry = assets.entries.get(key);
    if (
      !entry ||
      (entry.status === "unavailable" && !entry.attempted.has(load))
    ) {
      const attempted =
        entry?.attempted ?? new WeakSet<ProjectileShapeLoader>();
      attempted.add(load);
      try {
        const result = load(key);
        if ("then" in result) {
          let timeout: ReturnType<typeof setTimeout>;
          const deadline = new Promise<undefined>((resolve) => {
            timeout = setTimeout(resolve, PROJECTILE_SHAPE_WAIT_MS, undefined);
          });
          const promise = Promise.race([result, deadline])
            .catch(() => undefined)
            .then((data) => {
              clearTimeout(timeout);
              assets.entries.set(
                key,
                data
                  ? { status: "ready", data }
                  : { status: "unavailable", attempted },
              );
            });
          entry = { status: "loading", promise, attempted };
        } else entry = { status: "ready", data: result };
      } catch {
        entry = { status: "unavailable", attempted };
      }
      assets.entries.set(key, entry);
    }
    if (entry.status === "loading") {
      entry.attempted.add(load);
      (pending ??= new Set()).add(entry.promise);
    }
  }
  if (!pending) return;
  if (pending.size === 1) return pending.values().next().value;
  const aggregate = assets.aggregate;
  if (
    aggregate?.pending.size === pending.size &&
    [...pending].every((promise) => aggregate.pending.has(promise))
  )
    return aggregate.promise;
  const promise = Promise.all(pending).then(() => {
    if (assets.aggregate?.promise === promise) assets.aggregate = undefined;
  });
  assets.aggregate = { pending, promise };
  return promise;
}

export function getProjectileShapeData(
  name?: string,
): DTSShapeData | undefined {
  if (!name) return undefined;
  const entry = assetsByWorld
    .get(collisionState())
    ?.entries.get(shapeKey(name));
  if (entry?.status === "ready") return entry.data;
}

export function getProjectileShapeAsset(
  name?: string,
): ProjectileShapeAsset | undefined {
  const data = getProjectileShapeData(name);
  if (!data) return undefined;
  let asset = derivedAssets.get(data);
  if (!asset) derivedAssets.set(data, (asset = buildAsset(data)));
  return asset;
}

function buildAsset(data: DTSShapeData): ProjectileShapeAsset {
  const shape = new DTSShape();
  shape.data = data;
  const updated = new Set<Object3D>();
  const hulls: ProjectileShapeAsset["hulls"][number][] = [];
  for (const mesh of getDTSCollisionMeshes(shape, "ShapeBase")) {
    if (!mesh.updateForCollision(updated)) continue;
    const transform = modelRotation.clone().multiply(mesh.matrixWorld);
    hulls.push({
      inverse: transform.clone().invert(),
      normalMatrix: new Matrix3().getNormalMatrix(transform),
      planes: getDTSHullPlanes(mesh.geometry),
    });
  }
  const mounts = new Map<number, Matrix4>();
  getDTSNodeLookup(data).mounts.forEach((nodeIndex, slot) => {
    if (nodeIndex < 0) return;
    const node = shape.getNode(nodeIndex);
    if (!node) return;
    updateCollisionWorldMatrix(node, updated);
    mounts.set(
      slot,
      modelRotation.clone().multiply(node.matrixWorld).multiply(mountRotation),
    );
  });
  return {
    hulls,
    mounts,
    bounds: new Box3(
      torqueVecToThree(data.bounds.min, new Vector3()),
      torqueVecToThree(data.bounds.max, new Vector3()),
    ),
  };
}

type ShapeEntity = Pick<
  StreamEntity,
  | "id"
  | "type"
  | "position"
  | "rotation"
  | "scale"
  | "dataBlock"
  | "shapeHint"
  | "mountNode"
> & { mountObjectGhostIndex?: number; mountParentId?: string | null };

/** Entity-root transforms at the simulation tick, including vehicle seats. */
export class ProjectileShapePoses {
  private readonly getEntity: (
    index: number,
    parentId?: string | null,
  ) => ShapeEntity | undefined;
  private readonly poses = new WeakMap<ShapeEntity, Matrix4 | undefined>();
  private readonly position = new Vector3();
  private readonly rotation = new Quaternion();
  private readonly scale = new Vector3();
  private readonly turn = new Matrix4();

  constructor(getEntity: ProjectileShapePoses["getEntity"]) {
    this.getEntity = getEntity;
  }

  get(entity: ShapeEntity): Matrix4 | undefined {
    // A muzzle sample can use a packet pose for an entity whose predicted pose
    // is already cached for collision.
    if (this.poses.has(entity)) return this.poses.get(entity);
    // Mark before walking parents so a cyclic mount chain has no usable pose.
    this.poses.set(entity, undefined);
    const pose = this.getPose(entity);
    this.poses.set(entity, pose);
    return pose;
  }

  /** ShapeBase's world box center, including its position in a vehicle seat. */
  getCenter(entity: ShapeEntity, playerHeight?: number) {
    const world = this.get(entity);
    if (!world) return entity.position;
    if (playerHeight != null) {
      this.position.set(0, playerHeight / 2, 0);
    } else {
      const bounds = getProjectileShapeData(
        entity.shapeHint ?? entity.dataBlock,
      )?.bounds;
      if (bounds) {
        const { min, max } = bounds;
        this.position.set(
          (min[1] + max[1]) / 2,
          (min[2] + max[2]) / 2,
          (min[0] + max[0]) / 2,
        );
      } else {
        this.position.set(0, 0, 0);
      }
    }
    return threeToTorque(this.position.applyMatrix4(world));
  }

  private getPose(entity: ShapeEntity): Matrix4 | undefined {
    if (entity.mountObjectGhostIndex == null) {
      if (!entity.position) return undefined;
      torqueVecToThree(entity.position, this.position);
      if (entity.rotation) this.rotation.fromArray(entity.rotation);
      else this.rotation.identity();
      if (entity.scale) this.scale.fromArray(entity.scale);
      else this.scale.setScalar(1);
      return new Matrix4().compose(this.position, this.rotation, this.scale);
    }
    const parent = this.getEntity(
      entity.mountObjectGhostIndex,
      entity.mountParentId,
    );
    if (!parent) return undefined;
    const parentPose = this.get(parent);
    const shape = getProjectileShapeAsset(parent.shapeHint ?? parent.dataBlock);
    if (!parentPose || !shape) return undefined;
    const mount = shape.mounts.get(objectMountSlot(entity.mountNode));
    const pose = parentPose.clone();
    if (mount) pose.multiply(mount);
    if (entity.type === "Player" && entity.rotation) {
      // Player::setPosition supplies the player's yaw in the seat's frame.
      this.rotation.fromArray(entity.rotation);
      pose.multiply(this.turn.makeRotationFromQuaternion(this.rotation));
    }
    return pose;
  }
}
