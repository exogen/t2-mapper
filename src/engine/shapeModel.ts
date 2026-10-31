import {
  AnimationClip,
  Box3,
  Color,
  Group,
  LoopOnce,
  LoopRepeat,
  Vector3,
  type AnimationAction,
  type Object3D,
} from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { getDTSCollisionMeshes } from "../dts/dtsCollision";
import type { DTSModel, DTSShape } from "../dts/dtsModel";
import { DTSAnimationMixer } from "../dts/dtsAnimationMixer";
import {
  createDtsDamageThreads,
  type DtsDamageThreads,
} from "../dts/dtsDamage";
import { applyDtsThreadState, holdDtsAction } from "../dts/dtsThread";
import { readDtsSequences } from "../dts/dtsSequences";
import type { LightAnchor } from "../stream/types";
import type {
  ImageSlot,
  StreamEntity,
  ThreadState as StreamThreadState,
  TurretAim,
} from "../stream/types";
import { shapeThreadTime } from "../stream/shapeThreads";
import {
  wheelRotationAt,
  wheelSteeringPosition,
  type WheelState,
} from "../stream/vehicleWheels";
import { processShapeScene, disposeClonedScene } from "../stream/playbackUtils";
import {
  effectDeltaSec,
  engineStore,
  worldDeltaSec,
} from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { streamClock } from "../state/streamPlaybackStore";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import type { GameEntity } from "../state/gameEntityTypes";
import type { TorqueObject, TorqueRuntime } from "../torqueScript";
import {
  createShapeLightState,
  shapeBoxCenter,
  updateShapeLighting,
} from "../shapeLighting";
import { findOwnNode } from "../sceneNodes";
import { computeObjectBounds } from "../sceneBounds";
import {
  registerPlayerShapeCollider,
  unregisterPlayerShapeCollider,
  registerStaticShapeCollider,
  unregisterStaticShapeCollider,
} from "../collision/worldCollision";
import { staticShapeColliderMeshes } from "../world/colliderPolicy";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import { SHAPE_MODEL_ROTATION_Y } from "../world/placement";
import { driveTurretAim, type TurretAnimActions } from "./turretAim";
import { registerImageMuzzle } from "./linkBeamSource";
import { createFadeAndCloak } from "./shapeFadeCloak";
import { createShadowCaster } from "./shadowCasters";
import { createDeferredPose } from "./deferredPose";
import { registerEyeNode } from "./eyePositions";
import { createEffectLight } from "./effectLights";
import { createImageLight, type ImageLightConfig } from "./imageLight";
import { createEntitySoundSlots } from "./entitySoundSlots";
import { createImageStateAnimation } from "./imageStateAnimation";
import { createVehicleJets } from "./vehicleJets";
import { createDebugBounds, showWhileDebugTourTarget } from "./debugVisuals";
import { combineCleanups, reaction, type Cleanup } from "./storeReaction";
import { FramePriority } from "./framePriority";
import { freezeModelTransforms } from "./staticMatrices";
import { WorldLabel } from "./worldLabel";
import type { GameEngine } from "./gameEngine";

export type StaticShapeType = "TSStatic" | "StaticShape" | "Item" | "Turret";

/** Item/ShapeBase built-in light config from datablock. */
export interface ShapeLightConfig {
  type: number;
  color: [number, number, number, number];
  time: number;
  radius: number;
  /** Projectile light withheld until this age (missile flechette phase). */
  delayMS?: number;
  onlyStatic: boolean;
  isStatic: boolean;
  anchor: LightAnchor;
}

/** Shape entity data read every frame in streaming mode. */
export interface StreamShapeEntity {
  id: string;
  /** The game's identity for this object, used to key its collider so
   *  world dumps stay comparable across stacks. */
  ghostIndex?: number;
  threads?: StreamThreadState[];
  health?: number;
  damageState?: number;
  turretAim?: TurretAim;
  wheels?: WheelState[];
  steeringYaw?: number;
  frozen?: boolean;
  maxSteeringAngle?: number;
  className?: string;
  /** Vehicle jets on (Vehicle::unpackUpdate flag). */
  jetting?: boolean;
  /** Vehicle jet direction (0 forward, 1 backward, 2 down). */
  thrustDirection?: number;
  keyframes?: Array<{
    rotation: [number, number, number, number];
    velocity?: [number, number, number];
  }>;
  soundSlots?: StreamEntity["soundSlots"];
  fadeVal?: number;
  cloakLevel?: number;
  dataBlockId?: number;
  projectileAgeMS?: number;
}

export interface ShapeModelOptions {
  model: DTSModel;
  shapeName: string;
  type: StaticShapeType;
  /** Max texture anisotropy of the renderer. */
  anisotropy: number;
  /** The mission's script object (map mode), whose threads scripts drive. */
  object?: TorqueObject;
  /** The live stream entity (mutated in place), read every frame. */
  streamEntity?: () => StreamShapeEntity;
  /** Datablock enables environment map reflections. */
  emap?: boolean;
  entityId?: string;
  /** Skip the 90° Y rotation (for shapes mounted inside a rotated parent). */
  noRotation?: boolean;
  /** Skin texture (Torque reSkin: replaces "base." textures). */
  skinName?: string;
  /** Item/ShapeBase built-in light config (from datablock). */
  lightConfig?: ShapeLightConfig;
  /** Mounted image datablock light and the owner slot that fires it. */
  imageLight?: ImageLightConfig;
  imageSlot?: number;
}

/** A loaded, animated DTS shape instance. */
export interface ShapeModel {
  /** The model's root: the 90° Y rotation unless `noRotation`. */
  readonly root: Group;
  /** The cloned DTS scene; mount nodes live in it. */
  readonly scene: DTSShape;
  dispose(): void;
}

/** Active animation thread state, keyed by thread slot number. */
interface ThreadState {
  sequence: string;
  action?: AnimationAction;
}

/** WheeledVehicle per-wheel animation state (position-controlled, not threaded). */
interface WheelAnimState {
  wheelAction?: AnimationAction;
  springAction?: AnimationAction;
  turnAction?: AnimationAction;
}

let fallbackColliderCount = 0;

/** The light's anchor-local position: the engine's box centre, or the origin. */
function shapeLightOffset(
  anchor: LightAnchor,
  shapeName: string,
  scene: Object3D,
): Vector3 {
  if (anchor === "origin") return new Vector3();
  return shapeBoxCenter(shapeName, scene);
}

/** The owner's image slot, if the owner is a shape with image slots. */
export function ownerImageSlot(
  owner: GameEntity | undefined,
  slot: number,
): ImageSlot | undefined {
  return owner && "imageSlots" in owner ? owner.imageSlots?.[slot] : undefined;
}

/** Returns pausable time in seconds for demo mode, real time otherwise. */
function shapeNowSec(): number {
  const { recording } = engineStore.getState().playback;
  return recording != null ? streamClock.worldTime : performance.now() / 1000;
}

/**
 * The shape's bounding box under `parent` while it is the debug tour's
 * target (the unrotated source model's bounds).
 */
export function showShapeDebugBounds(
  parent: Object3D,
  entityId: string,
  source: Object3D,
): () => void {
  return showWhileDebugTourTarget(parent, entityId, () => {
    const box = new Box3();
    computeObjectBounds(source, box);
    const lines = createDebugBounds(
      box.isEmpty()
        ? [0, 0, 0]
        : (box.getSize(new Vector3()).toArray() as [number, number, number]),
    );
    if (!box.isEmpty()) lines.position.copy(box.getCenter(new Vector3()));
    return lines;
  });
}

/**
 * Unified shape model. Clones the full scene graph (preserving skeleton
 * bindings), applies Tribes 2 materials via processShapeScene, and drives
 * animation threads either through TorqueScript (map mode shapes with a
 * runtime) or from the ghost's thread state (demo/live).
 */
export function createShapeModel(
  engine: GameEngine,
  options: ShapeModelOptions,
): ShapeModel {
  const {
    model,
    shapeName,
    type,
    object,
    streamEntity: readStream,
    emap,
    entityId,
    noRotation,
    skinName,
    imageLight,
    imageSlot,
  } = options;
  const gltf = model;
  const clonedScene = SkeletonUtils.clone(gltf.scene) as DTSShape;
  processShapeScene(clonedScene, shapeName, {
    anisotropy: options.anisotropy,
    emap,
    skinName,
  });

  // Clips by name (case-insensitive). Native blend clips already contain
  // local deltas and additive mode.
  const clipsByName = new Map<string, AnimationClip>();
  for (const clip of gltf.animations)
    clipsByName.set(clip.name.toLowerCase(), clip);
  // Only create a mixer if there are skeleton animation clips.
  const mixer =
    clipsByName.size > 0 ? new DTSAnimationMixer(clonedScene) : null;

  const root = new Group();
  if (!noRotation) root.rotation.set(0, SHAPE_MODEL_ROTATION_Y, 0);
  root.updateMatrix();
  root.matrixAutoUpdate = false;
  const unfreezeModel = freezeModelTransforms(clonedScene);
  root.add(clonedScene);

  const isStreamShape = readStream != null;
  const readEntity = () => readStream?.();
  const sequences = readDtsSequences(gltf.scene, gltf.animations);
  const seqCyclicByName = new Map(
    sequences.names.map((name) => [name, sequences.cyclic.has(name)]),
  );
  // Ghost ThreadMask indices address the native DTS sequence order.
  const seqIndexToName = sequences.names;

  const cleanups: Cleanup[] = [unfreezeModel];

  if (entityId != null && imageSlot != null)
    cleanups.push(registerImageMuzzle(entityId, imageSlot, clonedScene));
  if (entityId != null && imageSlot == null)
    cleanups.push(
      renderShapeRaycast.register(
        entityId,
        clonedScene,
        type,
        () =>
          !isStreamShape ||
          gameEntityStore.getState().streamEntities.has(entityId),
      ),
    );

  // Mission-placed statics (a generator, a bunker prop) occlude a camera
  // exactly like interior walls, so register their meshes as CAMERA
  // occluders — a separate collider class, so projectile physics keeps
  // colliding with exactly what it always did. DTS collision/LOS details
  // select the authored hulls, including tree trunks without leaf planes.
  // Keyed on the GHOST index, not `entity.id` (a per-session counter that
  // differs between stacks), so a dump of this world is comparable with a
  // headless build's.
  const ghostIndex = readEntity()?.ghostIndex;
  const colliderId =
    ghostIndex != null
      ? `ghost:${ghostIndex}`
      : `shape:${++fallbackColliderCount}`;
  const staticMeshes = staticShapeColliderMeshes({ root: clonedScene, type });
  if (staticMeshes) {
    registerStaticShapeCollider(colliderId, staticMeshes);
    cleanups.push(() => unregisterStaticShapeCollider(colliderId));
  }
  if (type !== "Item") {
    registerPlayerShapeCollider(
      colliderId,
      getDTSCollisionMeshes(
        clonedScene,
        type === "TSStatic" ? "TSStatic" : "ShapeBase",
        "collision",
      ),
    );
    cleanups.push(() => unregisterPlayerShapeCollider(colliderId));
  }

  // ── Threads ──

  const threads = new Map<number, ThreadState>();
  let damageThreads: DtsDamageThreads | undefined;
  let wheelAnims: WheelAnimState[] | null = null;
  let turretAnim: TurretAnimActions | null = null;
  let playThread:
    ((slot: number, seq: string, forward?: boolean) => void) | null = null;
  let destroyThreadSlot: ((slot: number) => void) | null = null;
  let prevDemoThreads: StreamThreadState[] | undefined;

  // Mission mode (no stream entity): seed threads from script state
  //   (object._threads), then fall back to default looping sequences
  //   (ambient always; power only when scripts didn't manage the object).
  //   Live TorqueScript playThread/stopThread/pauseThread calls override.
  //
  // Demo/live mode: no auto-play. The frame update reads ghost ThreadMask
  //   data and drives everything.
  const startThreads = (runtime: TorqueRuntime | null | undefined) => {
    // Match binary's updateThread (FUN_005ebf00): direction is implemented
    // via timeScale (+1 forward, -1 backward). State 0=Play, 1=Stop, 2=Pause.
    function handlePlayThread(
      slot: number,
      sequenceName: string,
      forward = true,
    ) {
      const seqLower = sequenceName.toLowerCase();
      destroyThread(slot);

      const clip = clipsByName.get(seqLower);
      const thread: ThreadState = { sequence: seqLower };

      if (clip && mixer) {
        const action = mixer.clipAction(clip);
        const cyclic = seqCyclicByName.get(seqLower) ?? true;
        if (cyclic) {
          action.setLoop(LoopRepeat, Infinity);
        } else {
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        action.timeScale = forward ? 1 : -1;
        action.reset();
        // For backward playback, start at the end of the clip.
        if (!forward) action.time = clip.duration;
        action.play();
        thread.action = action;
      }

      threads.set(slot, thread);
    }

    function handleStopThread(slot: number) {
      const action = threads.get(slot)?.action;
      if (action) holdDtsAction(action, 0);
    }
    function destroyThread(slot: number) {
      threads.get(slot)?.action?.stop();
      threads.delete(slot);
    }

    playThread = handlePlayThread;
    destroyThreadSlot = destroyThread;
    // Mounted images have their own state machine, not ShapeBase damage
    // threads. Mounted ShapeBase objects receive their own ghost's health.
    const damage =
      mixer && type !== "TSStatic" && imageSlot === undefined
        ? createDtsDamageThreads(mixer, clipsByName.values())
        : undefined;
    damageThreads = damage;
    damage?.update(readEntity()?.health, readEntity()?.damageState);

    // WheeledVehicle wheel/spring/turn animations are position-controlled
    // (setPos), not thread-controlled, in both mission and demo/live modes.
    if (mixer && clipsByName.has("wheel0")) {
      const wheels: WheelAnimState[] = [];
      for (let i = 0; i < 6; i++) {
        const state: WheelAnimState = {};
        const wheelClip = clipsByName.get(`wheel${i}`);
        if (wheelClip) {
          const action = mixer.clipAction(wheelClip);
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
          action.paused = true;
          action.play();
          state.wheelAction = action;
        }
        const springClip = clipsByName.get(`spring${i}`);
        if (springClip) {
          const action = mixer.clipAction(springClip);
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
          action.paused = true;
          action.play();
          // Rest position: springs at full extension (pos=0 in Torque).
          action.time = 0;
          state.springAction = action;
        }
        const turnClip = clipsByName.get(`turn${i}`);
        if (turnClip) {
          const action = mixer.clipAction(turnClip);
          action.setLoop(LoopOnce, 1);
          action.clampWhenFinished = true;
          action.paused = true;
          action.play();
          // Center (straight ahead).
          action.time = turnClip.duration * 0.5;
          state.turnAction = action;
        }
        wheels.push(state);
      }
      wheelAnims = wheels;
    } else {
      wheelAnims = null;
    }

    // Turret aim: the engine scrubs "activate" to the activation level and
    // "turn"/"elevate" to the aim (TurretData requires all three sequences,
    // though a deployable's activate is empty and has no clip). The threads
    // exist only while aiming, so the actions start stopped.
    const activateClip = clipsByName.get("activate");
    const elevateClip = clipsByName.get("elevate");
    const turnClip = clipsByName.get("turn");
    if (mixer && elevateClip && turnClip) {
      const positional = (clip: AnimationClip) => {
        const action = mixer.clipAction(clip);
        action.setLoop(LoopOnce, 1);
        action.clampWhenFinished = true;
        return action;
      };
      turretAnim = {
        activate: activateClip ? positional(activateClip) : undefined,
        elevate: positional(elevateClip),
        turn: positional(turnClip),
      };
    } else {
      turretAnim = null;
    }

    const stop = () => {
      playThread = null;
      destroyThreadSlot = null;
      damage?.dispose();
      damageThreads = undefined;
      prevDemoThreads = undefined;
      wheelAnims = null;
      turretAnim = null;
      for (const slot of [...threads.keys()]) destroyThread(slot);
    };

    // Demo/live mode: the ghost thread handler drives everything.
    if (isStreamShape) return stop;

    // ── Mission mode ──
    const unsubs: (() => void)[] = [];

    // Subscribe to TorqueScript playThread/stopThread/pauseThread so
    // scripts can control animations at runtime.
    if (runtime) {
      unsubs.push(
        runtime.$.onMethodCalled(
          "ShapeBase",
          "playThread",
          (thisObj, slot, sequence) => {
            if (thisObj._id !== object?._id) return;
            handlePlayThread(Number(slot), String(sequence));
          },
        ),
      );
      unsubs.push(
        runtime.$.onMethodCalled("ShapeBase", "stopThread", (thisObj, slot) => {
          if (thisObj._id !== object?._id) return;
          handleStopThread(Number(slot));
        }),
      );
      unsubs.push(
        runtime.$.onMethodCalled(
          "ShapeBase",
          "pauseThread",
          (thisObj, slot) => {
            if (thisObj._id !== object?._id) return;
            const thread = threads.get(Number(slot));
            if (thread?.action) thread.action.paused = true;
          },
        ),
      );
    }

    // Seed threads that scripts started before this model was built
    // (power.cs playThread during mission init, etc.).
    const scriptThreads = object?._threads as
      | Record<
          number,
          { sequence: string; playing: boolean; direction: boolean }
        >
      | undefined;
    const seededSlots = new Set<number>();
    if (scriptThreads) {
      for (const [slotStr, thread] of Object.entries(scriptThreads)) {
        if (!thread.playing) continue;
        const slot = Number(slotStr);
        seededSlots.add(slot);
        handlePlayThread(slot, thread.sequence, thread.direction);
      }
    }

    // Fallback default sequences. Thread slots match power.cs globals:
    // $PowerThread=0, $AmbientThread=1. The ambient thread is client-side
    // in the real engine (never script-driven), so it always autoplays;
    // the power thread is script truth when any script threads were
    // recorded, and only autoplays when scripts didn't manage this object.
    // A streamed mounted image gets its ambient thread from the image
    // state animation, as ShapeBase::setImage gives it one.
    const streamedImage =
      imageSlot != null &&
      entityId != null &&
      gameEntityStore.getState().streamEntities.has(entityId);
    const defaults: Array<[number, string]> = streamedImage
      ? []
      : scriptThreads
        ? [[1, "ambient"]]
        : [
            [0, "power"],
            [1, "ambient"],
          ];
    for (const [slot, seqName] of defaults) {
      if (seededSlots.has(slot)) continue;
      if (clipsByName.has(seqName)) handlePlayThread(slot, seqName);
    }

    return () => {
      unsubs.forEach((fn) => fn());
      stop();
    };
  };
  cleanups.push(
    reaction(engineStore, (state) => state.runtime.runtime, startThreads),
  );

  // A mounted image (turret barrel, vehicle turret) runs its datablock's
  // state machine off the owner's ghosted image state, like a player's
  // weapon: fire, reload and activate sequences, spin and state sounds.
  const imageActions = new Map<string, AnimationAction>();
  let imageState: ReturnType<typeof createImageStateAnimation> | null = null;
  if (mixer && imageSlot != null) {
    for (const [name, clip] of clipsByName)
      imageActions.set(name, mixer.clipAction(clip));
    const spin = imageActions.get("spin");
    if (spin) {
      spin.setLoop(LoopRepeat, Infinity);
      spin.timeScale = 0;
      spin.play();
      cleanups.push(() => spin.stop());
    }
  }
  if (imageSlot != null) {
    const state = createImageStateAnimation(
      () =>
        entityId != null
          ? ownerImageSlot(
              gameEntityStore.getState().streamEntities.get(entityId),
              imageSlot,
            )
          : undefined,
      {
        actions: imageActions,
        imageRoot: clonedScene,
        ownerId: entityId,
        seqIndexToName,
        cyclicSequences: sequences.cyclic,
      },
    );
    imageState = state;
    cleanups.push(() => state.dispose());
  }

  // Turret::setImage on the client (Tribes2.exe FUN_00654e60) adds a
  // "deploy" thread to a mounted barrel that advanceTime (FUN_00655b50)
  // runs at half speed, so a base turret's barrel extends once on mount —
  // in map mode too, where the mission script mounts the barrel. A model
  // mounted after the image was set (a seek) starts the thread where it
  // would be by now, or holds its end.
  let barrelDeploy: AnimationAction | null = null;
  const deployClip = clipsByName.get("deploy");
  if (mixer && imageSlot != null && entityId != null && deployClip) {
    const store = gameEntityStore.getState();
    const owner =
      store.streamEntities.get(entityId) ?? store.missionEntities.get(entityId);
    if (owner?.className === "Turret") {
      const action = mixer.clipAction(deployClip);
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.timeScale = 0.5;
      action.reset().play();
      barrelDeploy = action;
      cleanups.push(() => action.stop());
    }
  }

  // Vehicle jet flares and nozzle/contrail emitters (FlyingVehicle and
  // HoverVehicle ghosts only).
  const stream = readEntity();
  const vehicleJets = createVehicleJets(
    () => readEntity(),
    stream?.id,
    { scene: clonedScene, mixer, clipsByName },
    stream?.className,
    stream?.dataBlockId,
  );
  if (vehicleJets) cleanups.push(() => vehicleJets.dispose());

  // A mounted image is posed with its owner's view, not its own culling.
  const deferredPose =
    mixer && imageSlot == null
      ? createDeferredPose(clonedScene, (delta) => mixer.update(delta))
      : null;
  if (deferredPose) cleanups.push(deferredPose.dispose);

  function animate(delta: number): void {
    const { animationEnabled } = settingsStore.getState();
    const entity = readEntity();
    // In demo/live mode, scale animation by playback rate; freeze when
    // paused. Shapes without thread data (e.g. Items) freeze too. A mounted
    // image has no stream entity of its own but belongs to one.
    const inDemo =
      entity != null ||
      (entityId != null &&
        gameEntityStore.getState().streamEntities.has(entityId));
    const effectDelta = !inDemo ? delta : effectDeltaSec(delta);

    // React to demo thread state changes. The ghost ThreadMask data tells
    // us exactly which DTS sequences are playing/stopped on each of 4
    // thread slots.
    const currentDemoThreads = entity?.threads;
    if (currentDemoThreads !== prevDemoThreads) {
      const play = playThread;
      // Don't consume thread data until handlers are ready — leave
      // prevDemoThreads unchanged so the change is re-detected next frame.
      if (play) {
        const previous = prevDemoThreads;
        prevDemoThreads = currentDemoThreads;
        // Sparse arrays instead of Maps — thread indices are 0-3.
        const currentBySlot: Array<StreamThreadState | undefined> = [];
        if (currentDemoThreads)
          for (const t of currentDemoThreads) currentBySlot[t.index] = t;
        const prevBySlot: Array<StreamThreadState | undefined> = [];
        if (previous) for (const t of previous) prevBySlot[t.index] = t;
        const maxSlot = Math.max(currentBySlot.length, prevBySlot.length);
        for (let slot = 0; slot < maxSlot; slot++) {
          const t = currentBySlot[slot];
          const prev = prevBySlot[slot];
          if (t) {
            const changed =
              !prev ||
              prev.timeline !== t.timeline ||
              prev.sequence !== t.sequence ||
              prev.state !== t.state ||
              prev.forward !== t.forward ||
              prev.atEnd !== t.atEnd;
            if (!changed) continue;

            const seqName = seqIndexToName[t.sequence];
            if (!seqName) continue;

            let thread = threads.get(slot);
            if (!thread || thread.sequence !== seqName) {
              play(slot, seqName, t.forward);
              thread = threads.get(slot);
            }
            if (thread?.action)
              applyDtsThreadState(
                thread.action,
                t,
                seqCyclicByName.get(seqName) ?? false,
              );
          } else if (prev) {
            // Deleting a thread restores properties no remaining thread owns.
            destroyThreadSlot?.(slot);
          }
        }
      }
    }

    // Stream threads belong to demo time, not the lifetime of this model.
    // This also seats completed deploys while paused or after an asset loads.
    if (currentDemoThreads && animationEnabled) {
      for (const state of currentDemoThreads) {
        if (!state.timeline) continue;
        const thread = threads.get(state.index);
        const action = thread?.action;
        if (!action) continue;
        const duration = action.getClip().duration;
        const time = shapeThreadTime(
          state,
          streamClock.worldTime,
          duration,
          seqCyclicByName.get(thread.sequence) ?? false,
        );
        holdDtsAction(action, duration > 0 ? time / duration : 0);
      }
    }

    if (animationEnabled) vehicleJets?.update(effectDelta);

    damageThreads?.update(entity?.health, entity?.damageState);

    // WheeledVehicle wheel/spring/turn animations from ghost state.
    if (wheelAnims && animationEnabled) {
      const wheels = entity?.wheels;
      const steeringPosition = wheelSteeringPosition(
        entity?.steeringYaw ?? 0,
        entity?.maxSteeringAngle,
      );
      for (let i = 0; i < wheelAnims.length; i++) {
        const wa = wheelAnims[i];
        const wheel = wheels?.[i];
        if (wa.wheelAction && wheel) {
          const rotation = wheelRotationAt(
            wheel,
            streamClock.worldTime,
            entity?.frozen,
          );
          holdDtsAction(wa.wheelAction, rotation);
        }
        // Spring: ghost vehicles stay at rest (fully extended = pos 0).
        // The server already accounts for spring height in the ghost
        // position. (Spring animation would only change with client-side
        // raycasts.)
        if (wa.turnAction) holdDtsAction(wa.turnAction, steeringPosition);
      }
    }

    if (turretAnim && animationEnabled)
      driveTurretAim(turretAnim, entity?.turretAim);

    if (barrelDeploy && inDemo && imageSlot != null && entityId != null) {
      const mountedAt = ownerImageSlot(
        gameEntityStore.getState().streamEntities.get(entityId),
        imageSlot,
      )?.mountedAtSec;
      const duration = barrelDeploy.getClip().duration;
      holdDtsAction(
        barrelDeploy,
        animationEnabled && mountedAt != null && duration > 0
          ? Math.min(
              1,
              (Math.max(0, streamClock.worldTime - mountedAt) * 0.5) / duration,
            )
          : 0,
      );
    }

    // Evaluate once after every controller has set its action's time/state.
    const animationDelta = animationEnabled ? effectDelta : 0;
    if (deferredPose) deferredPose.update(delta, animationDelta);
    else mixer?.update(animationDelta);

    // Native tracks drive sequence-controlled IFLs. Only unbound viewer IFLs
    // use this pausable clock; disabling animation holds their first frame.
    clonedScene.setImageAnimationTime(
      inDemo ? streamClock.worldTime : (clonedScene.time ?? 0) + effectDelta,
      animationEnabled,
    );
  }

  // Item/ShapeBase built-in dynamic light. Item::registerLights
  // (FUN_00603de0) skips lightOnlyStatic items that are not static and
  // places the light at the world box centre; the light pool turns it into
  // a GL-style point light for shapes and a projected falloff disc for
  // terrain and interiors. Only the intensity is animated here.
  const lightConfig = options.lightConfig;
  const itemLight =
    lightConfig && !(lightConfig.onlyStatic && !lightConfig.isStatic)
      ? createEffectLight(
          clonedScene,
          {
            color: new Color(
              lightConfig.color[0],
              lightConfig.color[1],
              lightConfig.color[2],
            ),
            radius: lightConfig.radius,
            offset: shapeLightOffset(lightConfig.anchor, shapeName, gltf.scene),
          },
          0,
        )
      : null;
  if (itemLight) cleanups.push(itemLight.dispose);
  const updateItemLight = () => {
    if (!itemLight || !lightConfig) return;
    const entity = readEntity();
    const fadeVal = entity?.fadeVal ?? 1;
    const elapsed = shapeNowSec() * 1000; // ms
    let intensity: number;
    if (lightConfig.type === 2) {
      // PulsingLight (binary-verified): sin(PI * t / lightTime), period = 2 * lightTime
      const sinVal = Math.sin((Math.PI * elapsed) / lightConfig.time);
      const raw = 0.5 + 0.5 * sinVal;
      intensity = (0.15 + raw * 0.85) * fadeVal;
    } else {
      // ConstantLight
      intensity = fadeVal;
    }
    if (
      lightConfig.delayMS != null &&
      (entity?.projectileAgeMS ?? 0) < lightConfig.delayMS
    ) {
      intensity = 0;
    }
    // The colour × intensity clamp to [0,1] in Item::registerLights never
    // binds for datablock colours ≤ 1.
    itemLight.light.intensity = intensity;
  };

  // ShapeBase fade (mFadeVal) and cloak (mCloakLevel) — see shapeFadeCloak.ts.
  const fadeAndCloak = createFadeAndCloak(clonedScene, readEntity);
  // The per-object lighting probe; its uniforms exist before the first
  // render, so the materials compile with them.
  const lightState = createShapeLightState(clonedScene, shapeName);
  // Map mode has no stream entity; the mission object's class decides.
  const shadowCaster = createShadowCaster(
    clonedScene,
    shapeName,
    () => readEntity() ?? { className: type },
  );
  cleanups.push(shadowCaster.dispose);
  // ShapeImageData light (turret barrel fire flashes), driven by the
  // owner's ghosted image slot.
  const imageLightDriver = imageLight
    ? createImageLight(clonedScene, imageLight, entityId, imageSlot)
    : null;
  if (imageLightDriver) cleanups.push(imageLightDriver.dispose);
  // ShapeBase sound slots — managed as PositionalAudio, not entities.
  const soundSlots = isStreamShape
    ? createEntitySoundSlots(readEntity, clonedScene)
    : null;
  if (soundSlots) cleanups.push(soundSlots.dispose);
  // A mounted image's nodes aren't its owner's eye.
  if (imageSlot == null)
    cleanups.push(
      registerEyeNode(entityId, findOwnNode(clonedScene, "eye"), clonedScene),
    );

  cleanups.push(
    engine.scheduler.add(FramePriority.ShapeAnimation, ({ delta }) => {
      imageState?.update();
      animate(delta);
      updateItemLight();
    }),
    engine.scheduler.add(FramePriority.PostCamera, (frame) => {
      fadeAndCloak(frame);
      updateShapeLighting(lightState, worldDeltaSec(frame.delta) * 1000);
      shadowCaster.update();
      imageLightDriver?.update();
      soundSlots?.update();
    }),
    reaction(settingsStore, selectDebugMode, (debugMode) => {
      if (!debugMode) return;
      const label = new WorldLabel(root, `${entityId}: ${shapeName}`);
      return () => label.dispose();
    }),
  );
  if (entityId) cleanups.push(showShapeDebugBounds(root, entityId, gltf.scene));

  const dispose = combineCleanups(...cleanups);
  return {
    root,
    scene: clonedScene,
    dispose() {
      dispose();
      root.remove(clonedScene);
      // Dispose cloned geometries and materials to prevent GPU memory from
      // accumulating.
      disposeClonedScene(clonedScene);
      mixer?.uncacheRoot(clonedScene);
    },
  };
}
