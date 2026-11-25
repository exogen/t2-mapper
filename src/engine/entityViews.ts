import { Group, type Object3D } from "three";
import { gameEntityStore, selectSceneEntities } from "../state/gameEntityStore";
import type {
  GameEntity,
  PositionedEntity,
  RenderType,
} from "../state/gameEntityTypes";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { combineCleanups, reaction } from "./storeReaction";
import { markTransformChanged } from "../transformChanges";
import { objectMountSlot } from "../world/placement";
import type { MountPoints } from "./shapeMounts";
import type { GameEngine } from "./gameEngine";
import { runOwnedCleanups } from "./runOwnedCleanups";

export type EntityViewDisposalReason =
  "removed" | "replaced" | "hidden" | "shutdown";

/** One entity's three.js objects, owned by the engine. */
export interface EntityView {
  /** Added to the entity root; named by entity id for the pose pass. */
  readonly root: Object3D;
  /**
   * The store replaced this entity's object (an identity rebuild, or a
   * deliberate clone to signal a change). Apply it and return true to
   * keep this view, or return false to have it recreated.
   */
  update?(entity: GameEntity): boolean;
  /** Where objects mounted on this entity attach (players in seats,
   *  turrets on vehicles), once its model has loaded. */
  readonly mounts?: MountPoints;
  /** Only a removed world object may leave transient effects behind. */
  dispose(reason?: EntityViewDisposalReason): void;
}

/**
 * How the engine draws each render type it handles. `mounted` views are
 * attached to their parent's mount node instead of the entity root, so
 * they aren't posed by the playback pose pass.
 */
export type EntityViewFactories = {
  [K in RenderType]?: (
    entity: Extract<GameEntity, { renderType: K }>,
    engine: GameEngine,
    mounted: boolean,
  ) => EntityView;
};

type EntityViewFactory = (
  entity: GameEntity,
  engine: GameEngine,
  mounted: boolean,
) => EntityView;

/** The render types that can ride on another object's mount node. */
const MOUNTABLE: ReadonlySet<RenderType> = new Set(["Shape", "Player"]);

interface ViewEntry {
  entity: GameEntity;
  view: EntityView;
  /** The view this one is attached to (and its id), for a mounted object. */
  parent: EntityView | null;
  parentId: string | null;
  mountPoint?: number;
  detach?: () => void;
}

/**
 * A positioned entity's root group: named by entity id so the playback
 * pose pass can place it, posed from the entity (mission mode), with a
 * "model" group for what's drawn.
 */
export function createPositionedRoot(entity: PositionedEntity): {
  root: Group;
  model: Group;
} {
  const root = new Group();
  root.name = entity.id;
  if (entity.position) root.position.fromArray(entity.position);
  if (entity.rotation) root.quaternion.fromArray(entity.rotation);
  if (entity.scale) root.scale.fromArray(entity.scale);
  // Frozen: whoever poses the root (the playback pose pass, a view on
  // entity changes) marks the change, so an unmoved entity's subtree keeps
  // its world matrices instead of recomputing them every frame.
  root.matrixAutoUpdate = false;
  markTransformChanged(root);
  const model = new Group();
  model.name = "model";
  model.matrixAutoUpdate = false;
  root.add(model);
  return { root, model };
}

function sameEntities(a: readonly GameEntity[], b: readonly GameEntity[]) {
  return a.length === b.length && a.every((entity, i) => entity === b[i]);
}

/**
 * The game's entities as engine-owned views: created, replaced on a new
 * identity (the store swaps the object), and disposed as the store's
 * scene entities change. An entity mounted on another (ShapeBase
 * mountObject: a player in a vehicle seat) is attached to its parent's
 * mount node instead of the entity root, and only while its parent shows.
 */
export class EntityViewRegistry {
  /** Every unmounted entity's root group lives under this. */
  readonly root = new Group();
  private readonly factories: EntityViewFactories;
  private readonly views = new Map<string, ViewEntry>();

  constructor(factories: EntityViewFactories) {
    this.factories = factories;
    // Never moves; see the scene's matrixAutoUpdate (mountEngineCanvas).
    this.root.matrixAutoUpdate = false;
  }

  /** Whether the engine (not React) draws this render type. */
  handles(renderType: RenderType): boolean {
    return this.factories[renderType] != null;
  }

  sync(entities: readonly GameEntity[], engine: GameEngine): void {
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    // Each shown entity's parent id, or null for the entity root.
    const placement = new Map<string, string | null>();
    for (const entity of entities) {
      if (
        this.factories[entity.renderType] == null ||
        entity.hidden ||
        entity.debugHidden
      )
        continue;
      const mountId = entity.mountObjectId;
      const parentId = mountId && byId.has(mountId) ? mountId : null;
      if (parentId != null && !MOUNTABLE.has(entity.renderType)) continue;
      placement.set(entity.id, parentId);
    }

    // Remove before creating: views of scene-wide state (the sky's fog and
    // background) clear it on dispose, and a replacement under a new id
    // must not have its state cleared by its predecessor.
    for (const [id, entry] of this.views) {
      const parentId = placement.get(id);
      if (parentId === undefined || parentId !== entry.parentId) {
        const next = byId.get(id);
        this.remove(
          id,
          !next
            ? "removed"
            : next.hidden || next.debugHidden
              ? "hidden"
              : "replaced",
        );
      }
    }

    // Parents before the objects mounted on them.
    const done = new Set<string>();
    const ensure = (entity: GameEntity): void => {
      if (done.has(entity.id)) return;
      done.add(entity.id);
      const parentId = placement.get(entity.id);
      if (parentId === undefined) return;
      if (parentId != null) ensure(byId.get(parentId)!);
      const parent =
        parentId == null ? null : (this.views.get(parentId)?.view ?? null);
      const mounts = parent?.mounts;
      if (parentId != null && !mounts) {
        // The parent draws nothing to mount on (hidden, or no shape).
        this.remove(entity.id, "hidden");
        return;
      }
      let entry = this.views.get(entity.id);
      if (
        entry &&
        entry.parent === parent &&
        (entry.entity === entity || entry.view.update?.(entity))
      ) {
        entry.entity = entity;
      } else {
        if (entry) this.remove(entity.id, "replaced");
        const factory = this.factories[entity.renderType] as EntityViewFactory;
        const view = factory(entity, engine, mounts !== undefined);
        entry = { entity, view, parent, parentId };
        if (!mounts) this.root.add(view.root);
        this.views.set(entity.id, entry);
      }
      if (mounts) {
        const mountPoint = objectMountSlot(entity.mountNode);
        // The stream can mutate the old entity before publishing a new one.
        if (entry.mountPoint !== mountPoint) {
          entry.detach?.();
          entry.detach = mounts.attach(mountPoint, entry.view.root);
          entry.mountPoint = mountPoint;
        }
      }
    };
    for (const entity of entities) ensure(entity);
  }

  get(id: string): EntityView | undefined {
    return this.views.get(id)?.view;
  }

  private remove(id: string, reason: EntityViewDisposalReason): void {
    const current = this.views.get(id);
    if (!current) return;
    this.views.delete(id);
    if (current.detach) current.detach();
    else this.root.remove(current.view.root);
    current.view.dispose(reason);
  }

  dispose(): void {
    runOwnedCleanups(
      [...this.views.keys()].map((id) => () => this.remove(id, "shutdown")),
    );
  }
}

/** Keep the engine's entity views in step with the store. */
export function installEntityViews(engine: GameEngine): () => void {
  const { entities } = engine;
  let sceneRevision = gameEntityStore.getState().sceneRevision;
  const releaseScene = () =>
    runOwnedCleanups([
      () => entities.dispose(),
      () => engine.releaseSceneAssets(),
    ]);
  streamPlaybackStore.setState({ root: entities.root });
  return combineCleanups(
    releaseScene,
    engine.withHost(({ scene }) => {
      scene.add(entities.root);
      return () => scene.remove(entities.root);
    }),
    reaction(
      gameEntityStore,
      (state) => ({
        list: selectSceneEntities(state),
        revision: state.sceneRevision,
      }),
      ({ list, revision }) => {
        if (sceneRevision !== revision) {
          sceneRevision = revision;
          releaseScene();
        }
        entities.sync(list, engine);
      },
      (a, b) => a.revision === b.revision && sameEntities(a.list, b.list),
    ),
  );
}
