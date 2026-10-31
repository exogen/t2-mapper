import {
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Object3D,
} from "three";
import { createLogger } from "../logger";
import type { DTSModel } from "../dts/dtsModel";
import {
  applyStreamEntityPose,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import { entityTypeColor } from "../stream/playbackUtils";
import { gameEntityStore, isStreamingSource } from "../state/gameEntityStore";
import { engineStore } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import { flagLabel } from "../state/flagTeam";
import type {
  GameEntity,
  PlayerEntity,
  PositionedEntity,
  ShapeEntity,
} from "../state/gameEntityTypes";
import type { TorqueObject } from "../torqueScript";
import { MOUNTED_OBJECT_ROTATION } from "../world/placement";
import {
  resolveCloakableFromImageSlot,
  resolveEmapFromDatablock,
} from "./resolveEmap";
import { loadShape, peekShape } from "./shapeCache";
import {
  createShapeModel,
  type ShapeLightConfig,
  type ShapeModel,
  type StaticShapeType,
} from "./shapeModel";
import { createPlayerModel, type PlayerModel } from "./playerModel";
import { ImageMounts, MountPoints } from "./shapeMounts";
import { loadSkinManifest, resolvePlayerSkinUrl } from "./playerSkins";
import { createFlagMarkerSlot } from "./flagMarker";
import { createPlayerNameplate } from "./playerNameplate";
import { createCommandCircuitPlayerMarker } from "./commandCircuitPlayerMarker";
import { createPositionedRoot, type EntityView } from "./entityViews";
import { combineCleanups, reaction, type Cleanup } from "./storeReaction";
import { FramePriority } from "./framePriority";
import { attachFrozen } from "./staticMatrices";
import { markTransformChanged } from "../transformChanges";
import { WorldLabel } from "./worldLabel";
import {
  createPlaceholder,
  disposeMesh,
  showDebugPlaceholder,
} from "./placeholders";
import type { GameEngine } from "./gameEngine";

const log = createLogger("ShapeViews");

function isStreaming(): boolean {
  return isStreamingSource(gameEntityStore.getState().dataSource);
}

/** A wireframe sphere in the entity type's color, in debug mode. */
function showDebugSphere(
  parent: Object3D,
  className: string | undefined,
  radius: number,
  segments: [number, number],
): () => void {
  return reaction(settingsStore, selectDebugMode, (debugMode) => {
    if (!debugMode) return;
    const mesh = new Mesh(
      new SphereGeometry(radius, ...segments),
      new MeshBasicMaterial({
        color: entityTypeColor(className ?? ""),
        wireframe: true,
      }),
    );
    parent.add(mesh);
    return () => disposeMesh(mesh);
  });
}

/**
 * Build with a shape now if it's cached (and the renderer is connected),
 * otherwise once both are ready.
 */
function withShape(
  engine: GameEngine,
  shapeName: string,
  onLoad: (model: DTSModel) => void,
  onError: (error: unknown) => void,
): () => void {
  const loaded = peekShape(shapeName);
  if (loaded && engine.currentHost) {
    onLoad(loaded);
    return () => {};
  }
  let cancelled = false;
  void Promise.all([loadShape(shapeName), engine.whenHost()]).then(
    ([model]) => {
      if (!cancelled) onLoad(model);
    },
    (error: unknown) => {
      if (!cancelled) onError(error);
    },
  );
  return () => {
    cancelled = true;
  };
}

/**
 * The view's container: a positioned root (named by id for the pose pass,
 * posed from the entity in map mode) with its "model" group, or — for an
 * object mounted on another — a group at the parent's mount node, shown
 * only while the stream still has the object.
 */
interface Container {
  root: Group;
  /** Where the entity's content goes. */
  content: Group;
  /** Re-pose from a replaced entity object. */
  pose(entity: GameEntity): void;
  dispose(): void;
}

function createContainer(
  entity: GameEntity,
  engine: GameEngine,
  mounted: boolean,
): Container {
  if (mounted) {
    const root = new Group();
    root.name = entity.id;
    root.rotation.set(...MOUNTED_OBJECT_ROTATION);
    root.matrixAutoUpdate = false;
    markTransformChanged(root);
    root.userData.objectMount = true;
    const id = entity.id;
    // Mounted objects bypass the root's pose pass, but still obey ghost
    // deletion immediately.
    const stop = engine.scheduler.add(FramePriority.ShapeAnimation, () => {
      if (!isStreaming()) return;
      const current = streamRenderFrame.current?.get(id);
      root.visible = !!current && !current.destroyedHidden;
    });
    return { root, content: root, pose() {}, dispose: stop };
  }
  const { root, model } = createPositionedRoot(entity as PositionedEntity);
  const pose = (next: GameEntity) => {
    const positioned = next as PositionedEntity;
    if (isStreaming()) {
      // A rebuilt view can land after this frame's pose pass: place it
      // at the current render pose before it's drawn.
      applyStreamEntityPose(
        root,
        next,
        streamRenderFrame.current?.get(next.id),
        streamRenderFrame.previous?.get(next.id),
        streamRenderFrame.interpT,
        engine.frame?.camera ?? engine.cameras.active,
        streamRenderFrame.aimCorrection,
      );
      return;
    }
    if (positioned.position) root.position.fromArray(positioned.position);
    if (positioned.rotation) root.quaternion.fromArray(positioned.rotation);
    else root.quaternion.identity();
    if (positioned.scale) root.scale.fromArray(positioned.scale);
    markTransformChanged(root);
  };
  if (isStreaming()) pose(entity);
  return { root, content: model, pose, dispose() {} };
}

function maxAnisotropy(engine: GameEngine): number {
  return engine.currentHost?.renderer.capabilities.getMaxAnisotropy() ?? 1;
}

/** Y-axis spinning for Items with rotate=true. */
function spin(group: Group): void {
  if (!settingsStore.getState().animationEnabled) return;
  const t = engineStore.getState().playback.recording
    ? streamClock.worldTime
    : performance.now() / 1000;
  const y = (t / 3.0) * Math.PI * 2;
  if (y === group.rotation.y) return;
  group.rotation.y = y;
  markTransformChanged(group);
}

/** What makes a shape entity a different model. */
function shapeModelKey(entity: ShapeEntity): string {
  return JSON.stringify([
    entity.shapeName,
    entity.shapeType,
    entity.skinName,
    entity.dataBlockId,
    entity.dataBlock,
    entity.lightType,
    entity.lightColor,
    entity.lightTime,
    entity.lightRadius,
    entity.lightDelayMS,
    entity.lightOnlyStatic,
    entity.isStaticItem,
    entity.lightAnchor,
  ]);
}

function shapeLightConfig(entity: ShapeEntity): ShapeLightConfig | undefined {
  if (!entity.lightType) return undefined;
  return {
    type: entity.lightType,
    color: (entity.lightColor ?? [1, 1, 1, 1]) as [
      number,
      number,
      number,
      number,
    ],
    time: entity.lightTime ?? 1000,
    radius: entity.lightRadius ?? 10,
    delayMS: entity.lightDelayMS,
    onlyStatic: !!entity.lightOnlyStatic,
    isStatic: !!entity.isStaticItem,
    anchor: entity.lightAnchor ?? "boxCenter",
  };
}

/** The flag item's team name over it, at the item. */
function createFlagName(
  parent: Object3D,
  readEntity: () => ShapeEntity,
): { update(): void; dispose(): void } {
  let label: WorldLabel | null = null;
  let text = "";
  return {
    update() {
      const next = flagLabel(readEntity(), "original");
      if (next === text) return;
      text = next;
      if (!next) {
        label?.dispose();
        label = null;
      } else if (label) label.set(next, { opacity: 0.6 });
      else label = new WorldLabel(parent, next, { opacity: 0.6 });
    },
    dispose() {
      label?.dispose();
      label = null;
    },
  };
}

/**
 * A ShapeBase entity (static shapes, items, turrets, vehicles): its model
 * with mounted images, item rotation, flag name and flag marker. The
 * model is rebuilt in place when its shape, skin or datablock changes;
 * the mounts carry over to the new model.
 */
export function createShapeView(
  initial: ShapeEntity,
  engine: GameEngine,
  mounted: boolean,
): EntityView {
  let entity = initial;
  const readEntity = () => entity;
  const container = createContainer(entity, engine, mounted);
  const cleanups: Cleanup[] = [container.dispose];

  // A positioned entity without a resolved shape gets a wireframe sphere
  // in debug mode: a real object with no shape draws nothing.
  if (!entity.shapeName) {
    if (!mounted) {
      cleanups.push(
        showDebugSphere(container.root, entity.className, 0.3, [6, 4]),
      );
      const flag = createFlagMarkerSlot(container.root, readEntity);
      cleanups.push(
        engine.scheduler.add(FramePriority.PostCamera, flag.update),
        flag.dispose,
      );
    }
    const dispose = combineCleanups(...cleanups);
    return {
      root: container.root,
      update(next) {
        if (next.renderType !== "Shape" || next.shapeName) return false;
        entity = next;
        container.pose(next);
        return true;
      },
      dispose,
    };
  }

  const spinner = new Group();
  spinner.matrixAutoUpdate = false;
  container.content.add(spinner);
  const mounts = new MountPoints();
  const images = new ImageMounts(engine, mounts, entity.id, () =>
    maxAnisotropy(engine),
  );
  const isFlag = entity.dataBlock?.toLowerCase() === "flag";

  let modelKey = "";
  let stopModel: (() => void) | null = null;

  const buildModel = () => {
    stopModel?.();
    modelKey = shapeModelKey(entity);
    const shapeName = entity.shapeName!;
    const loadingColor =
      entity.shapeType === "Item"
        ? "pink"
        : entity.threads
          ? "#00ff88"
          : "yellow";
    const loading = createPlaceholder(loadingColor);
    spinner.add(loading);
    let model: ShapeModel | null = null;
    let stopExtras: Cleanup;
    const cancel = withShape(
      engine,
      shapeName,
      (shape) => {
        disposeMesh(loading);
        const streaming = isStreaming();
        model = createShapeModel(engine, {
          model: shape,
          shapeName,
          type: (entity.shapeType ?? "StaticShape") as StaticShapeType,
          anisotropy: maxAnisotropy(engine),
          object: entity.runtimeObject as TorqueObject | undefined,
          streamEntity: streaming ? readEntity : undefined,
          emap: resolveEmapFromDatablock(entity.dataBlockId, entity.dataBlock),
          entityId: entity.id,
          skinName: entity.skinName,
          lightConfig: shapeLightConfig(entity),
        });
        attachFrozen(spinner, model.root);
        mounts.setScene(model.scene);
        if (isFlag) {
          const flagName = createFlagName(model.root, readEntity);
          stopExtras = combineCleanups(
            engine.scheduler.add(FramePriority.PostCamera, flagName.update),
            flagName.dispose,
          );
        }
        engine.invalidate();
      },
      (error) => {
        disposeMesh(loading);
        log.error("Shape error: %s: %o", shapeName, error);
        stopExtras = showDebugPlaceholder(
          spinner,
          "red",
          `${entity.id}: ${shapeName}`,
        );
      },
    );
    stopModel = () => {
      cancel();
      stopExtras?.();
      if (loading.parent) disposeMesh(loading);
      if (model) {
        mounts.setScene(null);
        spinner.remove(model.root);
        model.dispose();
        model = null;
      }
    };
  };
  buildModel();

  cleanups.push(
    () => stopModel?.(),
    () => images.dispose(),
    engine.scheduler.add(FramePriority.ShapeAnimation, () => {
      images.sync(entity.imageSlots);
      if (entity.rotate) spin(spinner);
    }),
  );
  if (!mounted) {
    const flag = createFlagMarkerSlot(container.content, readEntity);
    cleanups.push(
      engine.scheduler.add(FramePriority.PostCamera, flag.update),
      flag.dispose,
    );
  }
  images.sync(entity.imageSlots);

  const dispose = combineCleanups(...cleanups);
  return {
    root: container.root,
    mounts,
    update(next) {
      if (next.renderType !== "Shape" || !next.shapeName) return false;
      if (
        next.runtimeObject !== entity.runtimeObject ||
        (next.dataBlock?.toLowerCase() === "flag") !== isFlag
      )
        return false;
      entity = next;
      container.pose(next);
      if (shapeModelKey(next) !== modelKey) buildModel();
      images.sync(next.imageSlots);
      return true;
    },
    dispose,
  };
}

/** What makes a player a different model. */
function playerModelKey(entity: PlayerEntity): string {
  return JSON.stringify([
    entity.shapeName,
    resolvePlayerSkinUrl(
      entity.shapeName ?? "",
      entity.skinPrefName ?? entity.skinName,
    ),
    entity.dataBlockId,
    entity.dataBlock,
  ]);
}

/**
 * A player: the animated model with its mounted images (weapon, pack,
 * flag), the nameplate and the command circuit's marker. The model is
 * rebuilt in place on an armor or skin change; mounted images and objects
 * carry over to the new model, as Tribes2.exe keeps every mounted image
 * across onNewDataBlock.
 */
export function createPlayerView(
  initial: PlayerEntity,
  engine: GameEngine,
  mounted: boolean,
): EntityView {
  let entity = initial;
  const readEntity = () => entity;
  const container = createContainer(entity, engine, mounted);
  const mounts = new MountPoints();
  const images = new ImageMounts(engine, mounts, entity.id, () =>
    maxAnisotropy(engine),
  );
  let disposed = false;

  let modelKey = "";
  let stopModel: (() => void) | null = null;

  const buildModel = () => {
    stopModel?.();
    modelKey = playerModelKey(entity);
    const shapeName = entity.shapeName;
    if (!shapeName) {
      stopModel = null;
      return;
    }
    let model: PlayerModel | null = null;
    let stopExtras: Cleanup;
    const cancel = withShape(
      engine,
      shapeName,
      (shape) => {
        model = createPlayerModel(engine, {
          model: shape,
          entity: readEntity,
          anisotropy: maxAnisotropy(engine),
          emap: resolveEmapFromDatablock(entity.dataBlockId, entity.dataBlock),
          skinUrl: resolvePlayerSkinUrl(
            shapeName,
            entity.skinPrefName ?? entity.skinName,
          ),
          jiggle: engine.features.jiggle,
          mountedImages: () =>
            images.roots().map(([slot, root]) => ({
              root,
              cloakable: resolveCloakableFromImageSlot(
                entity.imageSlots?.[slot]?.dataBlockId,
              ),
            })),
        });
        attachFrozen(container.content, model.root);
        mounts.setScene(model.scene);
        const nameplate = createPlayerNameplate(
          container.content,
          readEntity,
          shape,
        );
        stopExtras = combineCleanups(
          engine.scheduler.add(FramePriority.PostCamera, ({ camera }) =>
            nameplate.update(camera),
          ),
          nameplate.dispose,
        );
        engine.invalidate();
      },
      (error) => {
        log.error("Player shape error: %s: %o", shapeName, error);
        if (!mounted)
          stopExtras = showDebugSphere(
            container.content,
            entity.className,
            0.5,
            [8, 6],
          );
      },
    );
    stopModel = () => {
      cancel();
      stopExtras?.();
      if (model) {
        mounts.setScene(null);
        container.content.remove(model.root);
        model.dispose();
        model = null;
      }
    };
  };
  buildModel();
  // The custom skin manifest may arrive after the model was built.
  void loadSkinManifest().then(() => {
    if (!disposed && playerModelKey(entity) !== modelKey) buildModel();
  });

  const dispose = combineCleanups(
    container.dispose,
    () => stopModel?.(),
    () => images.dispose(),
    // StreamEngine replaces the image array (in place on the entity) only
    // when an image's visual identity changes.
    engine.scheduler.add(FramePriority.ShapeAnimation, () =>
      images.sync(entity.imageSlots),
    ),
    // On the command circuit map every player (including the control
    // player) gets a radar-style marker instead of the nameplate.
    reaction(
      commandCircuitStore,
      (state) => state.active,
      (active) =>
        active
          ? createCommandCircuitPlayerMarker(container.content, readEntity)
          : undefined,
    ),
    mounted
      ? undefined
      : (() => {
          const flag = createFlagMarkerSlot(container.content, readEntity);
          return combineCleanups(
            engine.scheduler.add(FramePriority.PostCamera, flag.update),
            flag.dispose,
          );
        })(),
    () => {
      disposed = true;
    },
  );
  images.sync(entity.imageSlots);

  return {
    root: container.root,
    mounts,
    update(next) {
      if (next.renderType !== "Player") return false;
      entity = next;
      container.pose(next);
      if (playerModelKey(next) !== modelKey) buildModel();
      images.sync(next.imageSlots);
      return true;
    },
    dispose,
  };
}
