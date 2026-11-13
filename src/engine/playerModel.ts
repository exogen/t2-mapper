import {
  AdditiveAnimationBlendMode,
  type Group,
  type AnimationAction,
  type AnimationMixer,
  type Object3D,
} from "three";
import {
  buildActionAnimMap,
  getPlayerAnimationActions,
} from "../stream/playerActionMap";
import { shapeThreadTime } from "../stream/shapeThreads";
import {
  applyStreamEntityRotation,
  streamRenderFrame,
} from "../stream/interpolateEntity";
import {
  getPlayerHeadAngles,
  playerBodyYawCorrection,
  type PlayerHeadAngles,
} from "../stream/playerView";
import {
  ANIM_TRANSITION_TIME,
  getKeyframeAtTime,
} from "../stream/playbackUtils";
import { samplePlayerPose } from "../stream/playerAnimation";
import type { DTSModel, DTSShape } from "../dts/dtsModel";
import { createDtsDamageThreads } from "../dts/dtsDamage";
import {
  holdDtsAction,
  createDtsThread,
  scrubDtsThread,
  type DtsThread,
} from "../dts/dtsThread";
import { readDtsSequences } from "../dts/dtsSequences";
import { renderShapeRaycast } from "../collision/renderShapeRaycast";
import { createChestPhysics } from "../player/chestPhysics";
import { resolvePlayerBodyType } from "../player/playerBodyType";
import { useJiggle } from "../state/jiggleStore";
import {
  effectDeltaSec,
  engineStore,
  worldDeltaSec,
} from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { streamClock } from "../state/streamPlaybackStore";
import { selectDebugMode, settingsStore } from "../state/settingsStore";
import type { PlayerEntity } from "../state/gameEntityTypes";
import { createShapeLightState, updateShapeLighting } from "../shapeLighting";
import { findOwnNode } from "../sceneNodes";
import { stepFlareThread } from "./jetThreads";
import {
  addNodeEmitter,
  removeNodeEmitter,
  type NodeEmitter,
  type NodeEmitterFrame,
} from "./nodeEmitters";
import { createJetSound } from "./jetSound";
import { createEntitySoundSlots } from "./entitySoundSlots";
import { createFadeAndCloak, type MountedImageRoot } from "./shapeFadeCloak";
import { createShadowCaster } from "./shadowCasters";
import { createDeferredPose } from "./deferredPose";
import { registerEyeNode } from "./eyePositions";
import { showShapeDebugBounds } from "./shapeModel";
import { combineCleanups, type Cleanup } from "./storeReaction";
import { FramePriority } from "./framePriority";
import { createPlayerPresentation } from "./playerPresentation";
import { markTransformChanged } from "../transformChanges";
import type { GameEngine } from "./gameEngine";

/**
 * Debug view of the mixer's live actions (clip, effective weight, time,
 * paused), published on the scene's userData for probes.
 */
function describeMixer(mixer: AnimationMixer): string {
  const actions = (mixer as unknown as { _actions: AnimationAction[] })
    ._actions;
  return actions
    .filter((a) => a.isScheduled())
    .map((a) => {
      const clip = a.getClip();
      const pelvis = clip.tracks.some((t) => /pelvis/i.test(t.name));
      const mode = a.blendMode === AdditiveAnimationBlendMode ? "add" : "";
      return `${clip.name}:w${a.getEffectiveWeight().toFixed(2)}:t${a.time.toFixed(2)}${a.paused ? ":paused" : ""}${mode ? ":" + mode : ""}${pelvis ? ":pelvis" : ""}`;
    })
    .join(" ");
}

/** The jet nozzle emitters of one player. */
function buildJetFlareEmitters(
  scene: Object3D,
  ownerId: string,
  jetEmitterId: number | null,
  frame: NodeEmitterFrame,
): NodeEmitter[] {
  const emitters: NodeEmitter[] = [];
  if (jetEmitterId == null) return emitters;
  // PlayerData resolves "jetNozzle0"/"jetNozzle1" on the player's own
  // shape; the light armours only have the first.
  for (const name of ["jetnozzle0", "jetnozzle1"]) {
    const anchor = findOwnNode(scene, name);
    if (anchor) {
      emitters.push({ dataBlockId: jetEmitterId, anchor, frame, ownerId });
    }
  }
  return emitters;
}

export interface PlayerModelOptions {
  model: DTSModel;
  /** The live entity (mutated in place by the stream). */
  entity: () => PlayerEntity;
  anisotropy: number;
  emap: boolean;
  skinUrl: string | undefined;
  /** Chest physics (the `nc17` feature). */
  jiggle: boolean;
  /** The mounted image roots and whether each is cloakable. */
  mountedImages: () => readonly MountedImageRoot[];
}

/** A player's animated model. */
export interface PlayerModel {
  /** The mount-yaw group holding the 90° rotated model. */
  readonly root: Group;
  /** The cloned DTS scene; mount nodes live in it. */
  readonly scene: DTSShape;
  dispose(): void;
}

/**
 * A player model with skeleton-preserving animation: the native scene is
 * cloned with its skeleton bindings intact, and a per-entity mixer plays
 * the movement animations sampled from the stream (Root, Forward, Back,
 * Side, Fall, actions), the arm and head blends, jet flare and damage.
 */
export function createPlayerModel(
  engine: GameEngine,
  options: PlayerModelOptions,
): PlayerModel {
  const { model: gltf, entity: readEntity } = options;
  const initial = readEntity();
  const entityId = initial.id;
  const shapeName = initial.shapeName!;
  const streamingPlayback = () =>
    engineStore.getState().playback.recording?.streamingPlayback;

  const presentation = createPlayerPresentation({
    model: gltf,
    anisotropy: options.anisotropy,
    emap: options.emap,
    skinUrl: options.skinUrl,
  });
  const { root, rotated, scene: clonedScene, mixer } = presentation;
  const cleanups: Cleanup[] = [];

  const db =
    initial.dataBlockId != null
      ? streamingPlayback()?.getDataBlockData(initial.dataBlockId)
      : undefined;
  const box = db?.boxSize as { x: number; y: number; z: number } | undefined;
  cleanups.push(
    renderShapeRaycast.register(
      entityId,
      clonedScene,
      "Player",
      () =>
        gameEntityStore.getState().streamEntities.has(entityId) &&
        (readEntity().damageState ?? 0) === 0,
      box,
    ),
  );

  // Chest physics (the `nc17` feature).
  let updateChestPhysics: ((time: number, resetKey: number) => void) | null =
    null;
  if (options.jiggle) {
    const sp = streamingPlayback();
    const bodyType = resolvePlayerBodyType(initial, (id) =>
      sp?.getDataBlockData(id),
    );
    const physics = createChestPhysics(clonedScene, shapeName);
    if (physics) {
      updateChestPhysics = (time, resetKey) => {
        const { sizes, firmness } = useJiggle.getState();
        physics.update(time, resetKey, sizes[bodyType], 1 - firmness / 100);
      };
      cleanups.push(() => physics.dispose());
    }
  }

  // Action index → animation clip name, from TSShapeConstructor.
  const sp = streamingPlayback();
  const sequences = sp?.getShapeConstructorSequences(shapeName.toLowerCase());
  const actionAnimMap = sp
    ? buildActionAnimMap(
        sequences ?? [],
        shapeName.toLowerCase().replace(/\.dts$/i, "") + "_",
        gltf.animations,
      )
    : new Map();
  // Read cyclicity from the resolved clip, not its action-table alias.
  // Non-cyclic sequences (fall, jet, jump, land) play once and clamp.
  const cyclicSequences = readDtsSequences(gltf.scene, gltf.animations).cyclic;

  const damageThreads = createDtsDamageThreads(
    mixer,
    gltf.animations,
    "Player",
  );
  damageThreads?.update(initial.health, initial.damageState);
  if (damageThreads) cleanups.push(() => damageThreads.dispose());
  const actions = getPlayerAnimationActions(
    gltf.animations,
    mixer,
    actionAnimMap,
  );

  // Start with root (idle) animation.
  const rootAction = actions.get("root");
  rootAction?.play();
  let bodyActions: AnimationAction[] = rootAction ? [rootAction] : [];

  // Native DTS blend clips already postmultiply the current node pose.
  const blend: Record<"head" | "headside", AnimationAction | null> = {
    head: null,
    headside: null,
  };
  for (const key of ["head", "headside"] as const) {
    const action = actions.get(key);
    if (!action) continue;
    action.timeScale = 0;
    action.weight = 1;
    action.play();
    blend[key] = action;
  }

  // Player has one arm thread, initially the datablock's "look" action.
  // Other aim clips are activated only when the server selects them.
  let activeArm: AnimationAction | null = actions.get("look") ?? null;
  if (activeArm) holdDtsAction(activeArm, 0);

  // Force initial pose evaluation.
  mixer.update(0);

  // Client-side jet effects (Player::updateJet, FUN_005d65e0): the jet
  // sound loops and the jetEmitter runs at the JetNozzle nodes while
  // jetting. PlayerData.Sounds puts the jet sounds first in Tribes 2
  // (index 0 = jetSound, 1 = wetJetSound).
  const sounds = db?.sounds as (number | null)[] | undefined;
  const jetEmitter = db?.jetEmitter;
  const jetSound = createJetSound(clonedScene, sounds?.[0] ?? null);
  cleanups.push(jetSound.dispose);
  // The player's velocity this frame, shared by its nozzle emitters.
  const jetFrame: NodeEmitterFrame = { velocity: [0, 0, 0], dtScale: 1 };
  const jetEmitters = buildJetFlareEmitters(
    clonedScene,
    entityId,
    typeof jetEmitter === "number" ? jetEmitter : null,
    jetFrame,
  );
  cleanups.push(() => {
    for (const emitter of jetEmitters) removeNodeEmitter(emitter);
  });
  const flareAction = actions.get("jetflare");
  const flare: DtsThread | null = flareAction
    ? createDtsThread(flareAction, false)
    : null;
  let jetFlarePos = 0;
  const headAngles: PlayerHeadAngles = { pitch: 0, yaw: 0 };
  // Evaluate the sampled body pose, damage and blends once.
  const bodyPose = createDeferredPose(clonedScene, () => {
    mixer.update(0);
    updateChestPhysics?.(
      streamClock.worldTime,
      engineStore.getState().playback.seekNonce,
    );
  });
  cleanups.push(bodyPose.dispose);

  function animate(delta: number): void {
    const entity = readEntity();
    const time = streamClock.worldTime;
    const current = streamRenderFrame.current?.get(entity.id);

    // Resolve velocity at current playback time.
    const kf = getKeyframeAtTime(entity.keyframes ?? [], time);
    const isDead = kf?.damageState != null && kf.damageState >= 1;
    // Player::setPosition (FUN_005d97c0): a mounted player's transform is
    // the vehicle's mount node transform × RotZ(its own yaw) — the seat
    // places the body and the ghost's yaw turns it (passengers look
    // around; the server zeroes a pilot's yaw on mount).
    const pose = current ?? kf;
    const yaw = root.quaternion;
    const qx = yaw.x,
      qy = yaw.y,
      qz = yaw.z,
      qw = yaw.w;
    if (entity.mountObjectId != null && pose)
      applyStreamEntityRotation(
        yaw,
        pose,
        streamRenderFrame.previous?.get(entity.id),
        streamRenderFrame.interpT,
        // Armor::onMount's zeroed pilot yaw was exact.
        entity.mountNode === 0
          ? 0
          : playerBodyYawCorrection(current, streamRenderFrame.aimCorrection),
      );
    else yaw.identity();
    if (yaw.x !== qx || yaw.y !== qy || yaw.z !== qz || yaw.w !== qw)
      markTransformChanged(root);

    const recorded = current?.clientAnimation;
    if (recorded?.move) {
      const poses = samplePlayerPose(
        recorded.move,
        kf ?? {},
        time,
        ANIM_TRANSITION_TIME,
        (index) => index,
        (name) => {
          const action = actions.get(name);
          return (
            action && {
              duration: action.getClip().duration,
              cyclic: cyclicSequences.has(action.getClip().name.toLowerCase()),
            }
          );
        },
      );
      const selected: AnimationAction[] = [];
      for (const pose of poses) {
        const action = actions.get(pose.name);
        if (!action) continue;
        holdDtsAction(action, pose.position);
        action.setEffectiveWeight(pose.weight);
        selected.push(action);
      }
      for (const action of bodyActions)
        if (!selected.includes(action)) action.stop();
      bodyActions = selected;
    }

    // Switch arm blend animation based on the networked arm action index.
    // The server resolves the weapon datablock's armThread field to an
    // action index and sends it via Player::packUpdate (ActionMask).
    const desiredArm = actions.get(entity.armAction ?? "look");
    if (desiredArm && desiredArm !== activeArm) {
      activeArm?.stop();
      activeArm = desiredArm;
    }

    // Drive the arm and head threads without changing their authored blend mode.
    const blendWeight = isDead ? 0 : 1;
    const look = getPlayerHeadAngles(
      current ?? entity,
      streamRenderFrame.interpT,
      headAngles,
      streamRenderFrame.aimCorrection,
    );
    const pitchPos = (look.pitch + 1) / 2;
    const yawPos = (look.yaw + 1) / 2;
    if (activeArm) {
      holdDtsAction(activeArm, pitchPos);
      activeArm.weight = blendWeight;
    }
    if (blend.head) {
      blend.head.time = pitchPos * blend.head.getClip().duration;
      blend.head.weight = blendWeight;
    }
    if (blend.headside) {
      blend.headside.time = yawPos * blend.headside.getClip().duration;
      blend.headside.weight = blendWeight;
    }

    // Jet flare thread (Player::processTick FUN_005d2d60): the non-cyclic
    // JetFlare sequence runs at time scale +1 while jetting and −1
    // otherwise, so its visibility and mesh frames fade the flare
    // meshes in and back out. The nozzle emitters and jet sound run only
    // while jetting.
    const isJetting = !!entity.jetting && !isDead;
    jetSound.update(isJetting);
    if (flare) {
      const pos =
        recorded?.flare && flare.duration > 0
          ? shapeThreadTime(recorded.flare, time, flare.duration, false) /
            flare.duration
          : stepFlareThread(
              jetFlarePos,
              isJetting,
              effectDeltaSec(delta),
              flare.duration,
            );
      jetFlarePos = pos;
      scrubDtsThread(flare, pos);
    }
    const velocity = kf?.velocity;
    if (velocity) {
      jetFrame.velocity[0] = velocity[0];
      jetFrame.velocity[1] = velocity[1];
      jetFrame.velocity[2] = velocity[2];
    }
    for (const emitter of jetEmitters) {
      if (isJetting) addNodeEmitter(emitter);
      else removeNodeEmitter(emitter);
    }

    damageThreads?.update(entity.health, entity.damageState);
    bodyPose.update(delta, 0);
    if (selectDebugMode(settingsStore.getState()))
      clonedScene.userData.animDebug = describeMixer(mixer);
  }

  // ShapeBase fade (mFadeVal) and cloak (mCloakLevel): the body takes the
  // cloak texture, the mounted weapon/pack/flag only fade (when their
  // image datablock is cloakable) — see shapeFadeCloak.ts.
  const fadeAndCloak = createFadeAndCloak(
    clonedScene,
    readEntity,
    options.mountedImages,
  );
  // ShapeBase sound slots (weapon switch sounds, etc.).
  const soundSlots = createEntitySoundSlots(readEntity, clonedScene);
  cleanups.push(soundSlots.dispose);
  const lightState = createShapeLightState(clonedScene, undefined);
  const shadowCaster = createShadowCaster(clonedScene, shapeName, readEntity);
  cleanups.push(shadowCaster.dispose);
  cleanups.push(
    registerEyeNode(entityId, findOwnNode(clonedScene, "eye"), clonedScene),
  );

  cleanups.push(
    engine.scheduler.add(FramePriority.ShapeAnimation, ({ delta }) =>
      animate(delta),
    ),
    engine.scheduler.add(FramePriority.PostCamera, (frame) => {
      soundSlots.update();
      fadeAndCloak(frame);
      updateShapeLighting(lightState, worldDeltaSec(frame.delta) * 1000);
      shadowCaster.update();
    }),
    showShapeDebugBounds(rotated, entityId, gltf.scene),
  );

  const dispose = combineCleanups(...cleanups);
  return {
    root,
    scene: clonedScene,
    dispose() {
      dispose();
      presentation.dispose();
    },
  };
}
