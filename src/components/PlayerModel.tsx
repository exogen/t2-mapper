import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveAnimationBlendMode,
  AnimationMixer,
  AnimationUtils,
  FrontSide,
  Group,
  LoopOnce,
  LoopRepeat,
  Object3D,
  PositionalAudio,
  Vector3,
} from "three";
import type { AnimationAction, AnimationClip } from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  ANIM_TRANSITION_TIME,
  DEFAULT_EYE_HEIGHT,
  getKeyframeAtTime,
  getPosedNodeTransform,
  processShapeScene,
} from "../stream/playbackUtils";
import { pickMoveAnimation } from "../stream/playerAnimation";
import { WeaponImageStateMachine } from "../stream/weaponStateMachine";
import type { WeaponAnimState } from "../stream/weaponStateMachine";
import { getAliasedActions } from "../torqueScript/shapeConstructor";
import { useStaticShape } from "./GenericShape";
import { ShapeErrorBoundary } from "./EntityScene";
import { useAudio } from "./AudioContext";
import {
  resolveAudioProfile,
  playOneShotSound,
  getCachedAudioBuffer,
  getSoundGeneration,
  trackSound,
  untrackSound,
} from "./AudioEmitter";
import { audioToUrl } from "../loaders";
import { useSettings } from "./SettingsProvider";
import { useEngineStoreApi, useEngineSelector } from "../state";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import type { PlayerEntity } from "../state/gameEntityTypes";

/**
 * Map weapon shape to the arm blend animation (armThread).
 * Only missile launcher and sniper rifle have custom arm poses; all others
 * use the default `lookde`.
 */
function getArmThread(weaponShape: string | undefined): string {
  if (!weaponShape) return "lookde";
  const lower = weaponShape.toLowerCase();
  if (lower.includes("missile")) return "lookms";
  if (lower.includes("sniper")) return "looksn";
  return "lookde";
}

/** Number of table actions in the engine's ActionAnimationList (Tribes2.exe build 25034). */
const NUM_TABLE_ACTION_ANIMS = 8;

/** Table action names in engine order (indices 0-7). */
const TABLE_ACTION_NAMES = ["root", "run", "back", "side", "fall", "jet", "jump", "land"];


interface ActionAnimEntry {
  /** GLB clip name (lowercase, e.g. "diehead"). */
  clipName: string;
  /** Engine alias (lowercase, e.g. "death1"). */
  alias: string;
}

/**
 * Build the engine's action index -> animation entry mapping from a
 * TSShapeConstructor's sequence entries (e.g. `"heavy_male_root.dsq root"`).
 *
 * The engine builds its action list as:
 * 1. Table actions (0-7): found by searching for aliased names (root, run, etc.)
 * 2. Non-table actions (8+): remaining sequences in TSShapeConstructor order.
 */
function buildActionAnimMap(
  sequences: string[],
  shapePrefix: string,
): Map<number, ActionAnimEntry> {
  const result = new Map<number, ActionAnimEntry>();

  // Parse each sequence entry into { clipName, alias }.
  const parsed: Array<{ clipName: string; alias: string }> = [];
  for (const entry of sequences) {
    const spaceIdx = entry.indexOf(" ");
    if (spaceIdx === -1) continue;
    const dsqFile = entry.slice(0, spaceIdx).toLowerCase();
    const alias = entry.slice(spaceIdx + 1).trim().toLowerCase();
    if (!alias || !dsqFile.startsWith(shapePrefix) || !dsqFile.endsWith(".dsq"))
      continue;
    const clipName = dsqFile.slice(shapePrefix.length, -4);
    if (clipName) parsed.push({ clipName, alias });
  }

  // Find which parsed entries are table actions (by alias name).
  const tableEntryIndices = new Set<number>();
  for (let i = 0; i < TABLE_ACTION_NAMES.length; i++) {
    const name = TABLE_ACTION_NAMES[i];
    for (let pi = 0; pi < parsed.length; pi++) {
      if (parsed[pi].alias === name) {
        tableEntryIndices.add(pi);
        result.set(i, parsed[pi]);
        break;
      }
    }
  }

  // Non-table actions: remaining entries in TSShapeConstructor order.
  let actionIdx = NUM_TABLE_ACTION_ANIMS;
  for (let pi = 0; pi < parsed.length; pi++) {
    if (!tableEntryIndices.has(pi)) {
      result.set(actionIdx, parsed[pi]);
      actionIdx++;
    }
  }

  return result;
}

/** Stop, disconnect, and remove a looping PositionalAudio from its parent. */
function stopLoopingSound(
  soundRef: React.MutableRefObject<PositionalAudio | null>,
  stateRef: React.MutableRefObject<number>,
  parent?: Object3D,
) {
  const sound = soundRef.current;
  if (!sound) return;
  untrackSound(sound);
  try { sound.stop(); } catch { /* already stopped */ }
  try { sound.disconnect(); } catch { /* already disconnected */ }
  parent?.remove(sound);
  soundRef.current = null;
  stateRef.current = -1;
}

/**
 * Renders a player model with skeleton-preserving animation.
 *
 * Uses SkeletonUtils.clone to deep-clone the GLTF scene with skeleton bindings
 * intact, then drives a per-entity AnimationMixer to play movement animations
 * (Root, Forward, Back, Side, Fall) selected from the keyframe velocity data.
 * Weapon is attached to the animated Mount0 bone.
 */
export function PlayerModel({ entity }: { entity: PlayerEntity }) {
  const engineStore = useEngineStoreApi();
  const shapeName = entity.shapeName ?? entity.dataBlock;
  const gltf = useStaticShape(shapeName!);
  const shapeAliases = useEngineSelector((state) => {
    const sn = shapeName?.toLowerCase();
    return sn
      ? state.runtime.sequenceAliases.get(sn)
      : undefined;
  });

  // Clone scene preserving skeleton bindings, create mixer, find mount bones.
  const { clonedScene, mixer, mount0, mount1, iflInitializers } = useMemo(() => {
    const scene = SkeletonUtils.clone(gltf.scene) as Group;
    const iflInits = processShapeScene(scene);

    // Use front-face-only rendering so the camera can see out from inside the
    // model in first-person (backface culling hides interior faces).
    scene.traverse((n: any) => {
      if (n.isMesh && n.material) {
        const mats = Array.isArray(n.material) ? n.material : [n.material];
        for (const m of mats) m.side = FrontSide;
      }
    });

    const mix = new AnimationMixer(scene);

    let m0: Object3D | null = null;
    let m1: Object3D | null = null;
    scene.traverse((n) => {
      if (!m0 && n.name === "Mount0") m0 = n;
      if (!m1 && n.name === "Mount1") m1 = n;
    });

    return { clonedScene: scene, mixer: mix, mount0: m0, mount1: m1, iflInitializers: iflInits };
  }, [gltf]);

  // Build case-insensitive clip lookup with alias support.
  const animActionsRef = useRef(new Map<string, AnimationAction>());
  const blendActionsRef = useRef<{
    head: AnimationAction | null;
    headside: AnimationAction | null;
  }>({ head: null, headside: null });
  // Arm pose blend actions keyed by animation name (lookde, lookms, looksn).
  const armActionsRef = useRef(new Map<string, AnimationAction>());
  const activeArmRef = useRef<string | null>(null);
  const currentAnimRef = useRef({ name: "root", timeScale: 1 });
  const isDeadRef = useRef(false);
  // Action animation (taunts, celebrations, etc.) tracking.
  const actionAnimRef = useRef<number | undefined>(undefined);

  // Build action index -> animation clip name mapping from TSShapeConstructor.
  const actionAnimMap = useMemo(() => {
    const playback = engineStore.getState().playback;
    const sp = playback.recording?.streamingPlayback;
    const sn = shapeName?.toLowerCase();
    if (!sp || !sn) return new Map<number, ActionAnimEntry>();
    const sequences = sp.getShapeConstructorSequences(sn);
    if (!sequences) return new Map<number, ActionAnimEntry>();
    // Derive prefix: "heavy_male.dts" -> "heavy_male_"
    const stem = sn.replace(/\.dts$/i, "");
    return buildActionAnimMap(sequences, stem + "_");
  }, [engineStore, shapeName]);

  useEffect(() => {
    const actions = getAliasedActions(gltf.animations, mixer, shapeAliases);
    animActionsRef.current = actions;

    // Start with root (idle) animation.
    const rootAction = actions.get("root");
    if (rootAction) {
      rootAction.play();
    }
    currentAnimRef.current = { name: "root", timeScale: 1 };

    // Set up additive blend animations for aim/head articulation.
    // These clips must be cloned before makeClipAdditive (which mutates in
    // place) since multiple player entities share the same GLTF cache.

    // Head blend actions.
    const blendRefs: typeof blendActionsRef.current = { head: null, headside: null };
    for (const { key, names } of [
      { key: "head" as const, names: ["head"] },
      { key: "headside" as const, names: ["headside"] },
    ]) {
      const clip = gltf.animations.find((c) =>
        names.includes(c.name.toLowerCase()),
      );
      if (!clip) continue;
      const cloned = clip.clone();
      const fps = 30;
      const neutralFrame = Math.round((clip.duration * fps) / 2);
      AnimationUtils.makeClipAdditive(cloned, neutralFrame, clip, fps);
      const action = mixer.clipAction(cloned);
      action.blendMode = AdditiveAnimationBlendMode;
      action.timeScale = 0;
      action.weight = 1;
      action.play();
      blendRefs[key] = action;
    }
    blendActionsRef.current = blendRefs;

    // Arm pose blend actions: create one per available arm animation so we
    // can switch between them when the equipped weapon changes.
    // All arm clips use the lookde midpoint as the additive reference, so
    // switching from lookde to lookms captures the shoulder repositioning.
    const armActions = new Map<string, AnimationAction>();
    const lookdeClip = gltf.animations.find(
      (c) => c.name.toLowerCase() === "lookde",
    );
    const fps = 30;
    const lookdeRefFrame = lookdeClip
      ? Math.round((lookdeClip.duration * fps) / 2)
      : 0;
    for (const armName of ["lookde", "lookms", "looksn"]) {
      const clip = gltf.animations.find(
        (c) => c.name.toLowerCase() === armName,
      );
      if (!clip) continue;
      const cloned = clip.clone();
      // Use lookde's midpoint as reference for all arm clips so that
      // lookms/looksn capture the absolute shoulder offset.
      const refClip = lookdeClip ?? clip;
      AnimationUtils.makeClipAdditive(cloned, lookdeRefFrame, refClip, fps);
      const action = mixer.clipAction(cloned);
      action.blendMode = AdditiveAnimationBlendMode;
      action.timeScale = 0;
      action.weight = 0;
      action.play();
      armActions.set(armName, action);
    }
    armActionsRef.current = armActions;

    // Start with default arm pose.
    const defaultArm = armActions.get("lookde");
    if (defaultArm) {
      defaultArm.weight = 1;
      activeArmRef.current = "lookde";
    }

    // Force initial pose evaluation.
    mixer.update(0);

    return () => {
      mixer.stopAllAction();
      animActionsRef.current = new Map();
      blendActionsRef.current = { head: null, headside: null };
      armActionsRef.current = new Map();
      activeArmRef.current = null;
    };
  }, [mixer, gltf.animations, shapeAliases]);

  // Initialize IFL materials: load atlas textures and set up onBeforeRender
  // callbacks that animate texture offsets based on the current playback time.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const { mesh, initialize } of iflInitializers) {
      initialize(mesh, () => streamPlaybackStore.getState().time)
        .then((dispose) => cleanups.push(dispose))
        .catch(() => {});
    }
    return () => cleanups.forEach((fn) => fn());
  }, [iflInitializers]);

  // Track weaponShape changes. The entity is mutated in-place by the
  // streaming layer (no React re-render), so we sync it in useFrame.
  const weaponShapeRef = useRef(entity.weaponShape);
  const [currentWeaponShape, setCurrentWeaponShape] = useState(
    entity.weaponShape,
  );
  const packShapeRef = useRef(entity.packShape);
  const [currentPackShape, setCurrentPackShape] = useState(entity.packShape);

  // Per-frame animation selection and mixer update.
  useFrame((_, delta) => {
    if (entity.weaponShape !== weaponShapeRef.current) {
      weaponShapeRef.current = entity.weaponShape;
      setCurrentWeaponShape(entity.weaponShape);
    }
    if (entity.packShape !== packShapeRef.current) {
      packShapeRef.current = entity.packShape;
      setCurrentPackShape(entity.packShape);
    }
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";
    const time = streamPlaybackStore.getState().time;

    // Resolve velocity at current playback time.
    const kf = getKeyframeAtTime(entity.keyframes ?? [], time);
    const isDead = kf?.damageState != null && kf.damageState >= 1;
    const actions = animActionsRef.current;

    // Alive->Dead transition: play the server-specified death animation.
    if (isDead && !isDeadRef.current) {
      isDeadRef.current = true;

      // The server sends the death animation as an actionAnim index.
      const deathEntry = kf.actionAnim != null
        ? actionAnimMap.get(kf.actionAnim)
        : undefined;
      if (deathEntry) {
        const deathAction = actions.get(deathEntry.clipName);
        if (deathAction) {
          const prevAction = actions.get(
            currentAnimRef.current.name.toLowerCase(),
          );
          if (prevAction) prevAction.fadeOut(ANIM_TRANSITION_TIME);

          deathAction.setLoop(LoopOnce, 1);
          deathAction.clampWhenFinished = true;
          deathAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
          currentAnimRef.current = { name: deathEntry.clipName, timeScale: 1 };
          actionAnimRef.current = kf.actionAnim;
        }
      }
    }

    // Dead->Alive transition: stop death animation, let movement resume.
    if (!isDead && isDeadRef.current) {
      isDeadRef.current = false;
      actionAnimRef.current = undefined;

      const deathAction = actions.get(currentAnimRef.current.name.toLowerCase());
      if (deathAction) {
        deathAction.stop();
        deathAction.setLoop(LoopRepeat, Infinity);
        deathAction.clampWhenFinished = false;
      }
      // Reset to root so movement selection picks up on next iteration.
      currentAnimRef.current = { name: "root", timeScale: 1 };
      const rootAction = actions.get("root");
      if (rootAction) rootAction.reset().play();
    }

    // Action animation (taunts, celebrations, etc.).
    // Non-table actions (index >= 7) override movement animation.
    const actionAnim = kf?.actionAnim;
    const prevActionAnim = actionAnimRef.current;
    if (!isDeadRef.current && actionAnim !== prevActionAnim) {
      actionAnimRef.current = actionAnim;
      const isNonTableAction = actionAnim != null && actionAnim >= NUM_TABLE_ACTION_ANIMS;
      const wasNonTableAction = prevActionAnim != null && prevActionAnim >= NUM_TABLE_ACTION_ANIMS;

      if (isNonTableAction) {
        // Start or change action animation.
        const entry = actionAnimMap.get(actionAnim);
        if (entry) {
          const actionAction = actions.get(entry.clipName);
          if (actionAction) {
            const prevAction = actions.get(currentAnimRef.current.name.toLowerCase());
            if (prevAction) prevAction.fadeOut(ANIM_TRANSITION_TIME);
            actionAction.setLoop(LoopOnce, 1);
            actionAction.clampWhenFinished = true;
            actionAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
            currentAnimRef.current = { name: entry.clipName, timeScale: 1 };
          }
        }
      } else if (wasNonTableAction) {
        // Action ended -- stop the action clip and resume movement.
        const prevEntry = actionAnimMap.get(prevActionAnim);
        if (prevEntry) {
          const prevAction = actions.get(prevEntry.clipName);
          if (prevAction) {
            prevAction.fadeOut(ANIM_TRANSITION_TIME);
            prevAction.setLoop(LoopRepeat, Infinity);
            prevAction.clampWhenFinished = false;
          }
        }
        currentAnimRef.current = { name: "root", timeScale: 1 };
        const rootAction = actions.get("root");
        if (rootAction) rootAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
      }
    }

    // If atEnd, clamp the action animation at its final frame.
    if (actionAnim != null && actionAnim >= NUM_TABLE_ACTION_ANIMS && kf?.actionAtEnd) {
      const entry = actionAnimMap.get(actionAnim);
      if (entry) {
        const actionAction = actions.get(entry.clipName);
        if (actionAction) {
          actionAction.paused = true;
        }
      }
    }

    // Movement animation selection (skip while dead or playing action anim).
    const playingActionAnim = actionAnimRef.current != null &&
      actionAnimRef.current >= NUM_TABLE_ACTION_ANIMS;
    if (!isDeadRef.current && !playingActionAnim) {
      const anim = pickMoveAnimation(
        kf?.velocity,
        kf?.rotation ?? [0, 0, 0, 1],
        entity.falling,
        entity.jetting,
      );

      const prev = currentAnimRef.current;
      if (anim.animation !== prev.name || anim.timeScale !== prev.timeScale) {
        const prevAction = actions.get(prev.name.toLowerCase());
        const nextAction = actions.get(anim.animation.toLowerCase());

        if (nextAction) {
          if (isPlaying && prevAction && prevAction !== nextAction) {
            prevAction.fadeOut(ANIM_TRANSITION_TIME);
            nextAction.reset().fadeIn(ANIM_TRANSITION_TIME).play();
          } else {
            if (prevAction && prevAction !== nextAction) prevAction.stop();
            nextAction.reset().play();
          }
          nextAction.timeScale = anim.timeScale;
          currentAnimRef.current = {
            name: anim.animation,
            timeScale: anim.timeScale,
          };
        }
      }
    }

    // Switch arm blend animation based on equipped weapon.
    const desiredArm = getArmThread(entity.weaponShape);
    if (desiredArm !== activeArmRef.current) {
      const armActions = armActionsRef.current;
      const prev = activeArmRef.current
        ? armActions.get(activeArmRef.current)
        : null;
      const next = armActions.get(desiredArm);
      if (next) {
        if (prev) prev.weight = 0;
        next.weight = isDead ? 0 : 1;
        activeArmRef.current = desiredArm;
      }
    }

    // Drive additive blend animations for aim/head articulation.
    const { head, headside } = blendActionsRef.current;
    const armAction = activeArmRef.current
      ? armActionsRef.current.get(activeArmRef.current)
      : null;
    const blendWeight = isDead ? 0 : 1;

    const headPitch = entity.headPitch ?? 0;
    const headYaw = entity.headYaw ?? 0;
    const pitchPos = (headPitch + 1) / 2;
    const yawPos = (headYaw + 1) / 2;

    if (armAction) {
      armAction.time = pitchPos * armAction.getClip().duration;
      armAction.weight = blendWeight;
    }
    if (head) {
      head.time = pitchPos * head.getClip().duration;
      head.weight = blendWeight;
    }
    if (headside) {
      headside.time = yawPos * headside.getClip().duration;
      headside.weight = blendWeight;
    }

    // Advance or evaluate the body animation mixer.
    if (isPlaying) {
      mixer.update(delta * playback.rate);
    } else {
      mixer.update(0);
    }
  });

  return (
    <>
      <group rotation={[0, Math.PI / 2, 0]}>
        <primitive object={clonedScene} />
      </group>
      {currentWeaponShape && mount0 && (
        <ShapeErrorBoundary key={currentWeaponShape} fallback={null}>
          <Suspense fallback={null}>
            <AnimatedWeaponModel
              entity={entity}
              weaponShape={currentWeaponShape}
              mount0={mount0}
            />
          </Suspense>
        </ShapeErrorBoundary>
      )}
      {currentPackShape && mount1 && (
        <ShapeErrorBoundary key={currentPackShape} fallback={null}>
          <Suspense fallback={null}>
            <MountedPackModel
              packShape={currentPackShape}
              mountBone={mount1}
            />
          </Suspense>
        </ShapeErrorBoundary>
      )}
    </>
  );
}

/**
 * Build a DTS sequence-index -> name lookup from GLB metadata.
 * Weapon GLBs include `dts_sequence_names` in scene extras, providing the
 * original DTS sequence ordering that datablock state indices reference.
 */
function buildSeqIndexToName(
  scene: Group,
  animations: AnimationClip[],
): string[] {
  const raw = scene.userData?.dts_sequence_names;
  if (typeof raw === "string") {
    try {
      const names: string[] = JSON.parse(raw);
      return names.map((n) => n.toLowerCase());
    } catch { /* fall through */ }
  }
  return animations.map((a) => a.name.toLowerCase());
}

/**
 * Attaches an animated weapon model to the player's Mount0 bone.
 * Drives a weapon-specific AnimationMixer using the WeaponImageStateMachine
 * to play fire, reload, spin, and other weapon animations based on the
 * server-replicated condition flags.
 *
 * Reads `entity.weaponImageState` and `entity.weaponImageStates` directly
 * from the entity inside useFrame, since these fields are mutated per-tick
 * without triggering React re-renders.
 */
function AnimatedWeaponModel({
  entity,
  weaponShape,
  mount0,
}: {
  entity: PlayerEntity;
  weaponShape: string;
  mount0: Object3D;
}) {
  const engineStore = useEngineStoreApi();
  const weaponGltf = useStaticShape(weaponShape);

  // Clone weapon with skeleton bindings, create dedicated mixer.
  const { weaponClone, weaponMixer, seqIndexToName, visNodesBySequence, weaponIflInitializers } =
    useMemo(() => {
      const clone = SkeletonUtils.clone(weaponGltf.scene) as Group;
      const iflInits = processShapeScene(clone);

      // Compute Mountpoint inverse offset so the weapon's grip aligns to Mount0.
      const mp = getPosedNodeTransform(
        weaponGltf.scene,
        weaponGltf.animations,
        "Mountpoint",
      );
      if (mp) {
        const invQuat = mp.quaternion.clone().invert();
        const invPos = mp.position.clone().negate().applyQuaternion(invQuat);
        clone.position.copy(invPos);
        clone.quaternion.copy(invQuat);
      }

      // Collect vis-animated meshes grouped by controlling sequence name.
      // E.g. the disc launcher's Disc mesh has vis_sequence="discSpin" and is
      // hidden by default (vis=0). When "discSpin" plays, the mesh becomes
      // visible; when a different sequence plays, it hides again.
      const visBySeq = new Map<string, Object3D[]>();
      clone.traverse((node: any) => {
        if (!node.isMesh) return;
        const ud = node.userData;
        const seqName = (ud?.vis_sequence ?? "").toLowerCase();
        if (!seqName) return;
        let list = visBySeq.get(seqName);
        if (!list) {
          list = [];
          visBySeq.set(seqName, list);
        }
        list.push(node);
      });

      const mix = new AnimationMixer(clone);
      const seq = buildSeqIndexToName(
        weaponGltf.scene as Group,
        weaponGltf.animations,
      );
      return {
        weaponClone: clone,
        weaponMixer: mix,
        seqIndexToName: seq,
        visNodesBySequence: visBySeq,
        weaponIflInitializers: iflInits,
      };
    }, [weaponGltf]);

  // Build case-insensitive action map for weapon animations.
  const weaponActionsRef = useRef(new Map<string, AnimationAction>());
  const spinActionRef = useRef<AnimationAction | null>(null);
  useEffect(() => {
    const actions = new Map<string, AnimationAction>();
    for (const clip of weaponGltf.animations) {
      actions.set(clip.name.toLowerCase(), weaponMixer.clipAction(clip));
    }
    weaponActionsRef.current = actions;

    // Set up the spin thread: a looping "spin" animation with variable timeScale.
    const spinAction = actions.get("spin");
    if (spinAction) {
      spinAction.setLoop(LoopRepeat, Infinity);
      spinAction.timeScale = 0;
      spinAction.play();
    }
    spinActionRef.current = spinAction ?? null;

    // Force initial pose.
    weaponMixer.update(0);
    return () => {
      weaponMixer.stopAllAction();
      weaponActionsRef.current = new Map();
      spinActionRef.current = null;
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
    };
  }, [weaponMixer, weaponGltf.animations]);

  // Initialize IFL materials on the weapon model.
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const { mesh, initialize } of weaponIflInitializers) {
      initialize(mesh, () => streamPlaybackStore.getState().time)
        .then((dispose) => cleanups.push(dispose))
        .catch(() => {});
    }
    return () => cleanups.forEach((fn) => fn());
  }, [weaponIflInitializers]);

  // Audio context for weapon sounds.
  const { audioLoader, audioListener } = useAudio();
  const settings = useSettings();
  const audioEnabled = settings?.audioEnabled ?? false;

  // Weapon state machine, lazily initialized on first tick with data.
  const stateMachineRef = useRef<WeaponImageStateMachine | null>(null);
  const currentWeaponAnimRef = useRef<string | null>(null);
  const lastWeaponStatesRef = useRef(entity.weaponImageStates);

  // Track active looping weapon sound (e.g. chaingun fire).
  const loopingSoundRef = useRef<PositionalAudio | null>(null);
  const loopingSoundStateRef = useRef<number>(-1);

  // Imperatively attach/detach weapon clone to Mount0.
  useEffect(() => {
    mount0.add(weaponClone);
    return () => {
      mount0.remove(weaponClone);
    };
  }, [weaponClone, mount0]);

  // Per-frame: tick state machine and drive weapon animation mixer.
  useFrame((_, delta) => {
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";
    const actions = weaponActionsRef.current;

    // Read weapon state directly from entity (mutated per-tick, not via props).
    const imageState = entity.weaponImageState;
    const imageStates = entity.weaponImageStates;

    // Lazily create or recreate the state machine when the datablock states
    // become available or change (e.g. weapon switch within same shape).
    if (imageStates !== lastWeaponStatesRef.current) {
      lastWeaponStatesRef.current = imageStates;
      if (imageStates && imageStates.length > 0) {
        stateMachineRef.current = new WeaponImageStateMachine(
          imageStates,
          seqIndexToName,
        );
      } else {
        stateMachineRef.current = null;
      }
      currentWeaponAnimRef.current = null;
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef, weaponClone);
    }

    // Initialize state machine if we have states but haven't created it yet.
    if (!stateMachineRef.current && imageStates && imageStates.length > 0) {
      stateMachineRef.current = new WeaponImageStateMachine(
        imageStates,
        seqIndexToName,
      );
    }

    const sm = stateMachineRef.current;

    if (sm && imageState && isPlaying) {
      const effectiveDelta = delta * playback.rate;
      const animState = sm.tick(effectiveDelta, imageState);

      applyWeaponAnim(
        animState,
        actions,
        currentWeaponAnimRef,
        visNodesBySequence,
      );

      // Stop active looping sound when the state changes.
      if (
        loopingSoundRef.current &&
        animState.stateIndex !== loopingSoundStateRef.current
      ) {
        stopLoopingSound(loopingSoundRef, loopingSoundStateRef, weaponClone);
      }

      // Play weapon state-entry sounds as positional audio on transitions.
      // The engine plays a sound for every state entered during a transition
      // chain, so there may be multiple sounds per tick.
      if (
        audioEnabled &&
        audioLoader &&
        audioListener &&
        animState.soundDataBlockIds.length > 0
      ) {
        const getDb = playback.recording?.streamingPlayback.getDataBlockData
          .bind(playback.recording.streamingPlayback);
        if (getDb) {
          for (const soundDbId of animState.soundDataBlockIds) {
            const resolved = resolveAudioProfile(soundDbId, getDb);
            if (!resolved) continue;

            if (resolved.isLooping) {
              // Looping sounds (e.g. chaingun fire) persist while in this
              // state and stop on transition to a different state.
              if (!loopingSoundRef.current) {
                try {
                  const url = audioToUrl(resolved.filename);
                  const gen = getSoundGeneration();
                  getCachedAudioBuffer(url, audioLoader, (buffer) => {
                    // Guard: state may have changed by the time buffer loads.
                    if (gen !== getSoundGeneration()) return;
                    if (loopingSoundRef.current) return;
                    // Read live state index (not the closure-captured one).
                    const currentIdx = sm.stateIndex;
                    const sound = new PositionalAudio(audioListener);
                    sound.setBuffer(buffer);
                    sound.setDistanceModel("inverse");
                    sound.setRefDistance(resolved.refDist);
                    sound.setMaxDistance(resolved.maxDist);
                    sound.setRolloffFactor(1);
                    sound.setVolume(resolved.volume);
                    sound.setPlaybackRate(playback.rate);
                    sound.setLoop(true);
                    weaponClone.add(sound);
                    trackSound(sound);
                    sound.play();
                    loopingSoundRef.current = sound;
                    loopingSoundStateRef.current = currentIdx;
                  });
                } catch  { /* expected */ }
              }
            } else {
              playOneShotSound(
                resolved,
                audioListener,
                audioLoader,
                undefined,
                weaponClone,
              );
            }
          }
        }
      }

      // Drive the spin thread (e.g. chaingun barrel rotation).
      if (spinActionRef.current) {
        spinActionRef.current.timeScale = animState.spinTimeScale;
      }

    }

    // Advance the weapon mixer.
    if (isPlaying) {
      weaponMixer.update(delta * playback.rate);
    } else {
      weaponMixer.update(0);
    }
  });

  return null;
}

/**
 * Applies the weapon state machine output to the weapon's AnimationMixer.
 * Handles crossfading between sequences, configuring loop/timeScale, and
 * toggling DTS vis-node visibility (e.g. disc launcher's disc mesh).
 */
function applyWeaponAnim(
  animState: WeaponAnimState,
  actions: Map<string, AnimationAction>,
  currentAnimRef: MutableRefObject<string | null>,
  visNodesBySequence: Map<string, Object3D[]>,
): void {
  const targetName = animState.sequenceName;
  const currentName = currentAnimRef.current;

  if (targetName === currentName && !animState.transitioned) {
    return;
  }

  // Toggle vis-node visibility when the active sequence changes.
  // Meshes with vis_sequence are hidden by default (processShapeScene sets
  // visible=false for vis<0.01). They become visible only when their
  // controlling sequence is the active one. E.g. the disc launcher's Disc
  // mesh has vis_sequence="discspin" and appears only during the discSpin
  // (Ready) state.
  if (targetName !== currentName) {
    // Hide vis nodes from the previous sequence.
    if (currentName) {
      const prevVis = visNodesBySequence.get(currentName);
      if (prevVis) {
        for (const node of prevVis) node.visible = false;
      }
    }
    // Show vis nodes for the new sequence.
    if (targetName) {
      const nextVis = visNodesBySequence.get(targetName);
      if (nextVis) {
        for (const node of nextVis) node.visible = true;
      }
    }
  }

  if (!targetName) {
    // No sequence for this state -- stop current animation.
    if (currentName) {
      const prev = actions.get(currentName);
      if (prev) prev.fadeOut(ANIM_TRANSITION_TIME);
      currentAnimRef.current = null;
    }
    return;
  }

  const action = actions.get(targetName);
  if (!action) return;

  // On state transition, restart the animation.
  if (animState.transitioned || targetName !== currentName) {
    const prevAction = currentName ? actions.get(currentName) : null;

    // Fire/reload animations play once; others loop.
    if (animState.isFiring || animState.timeoutValue > 0) {
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }

    // Scale animation to fit the state timeout if requested.
    if (animState.scaleAnimation && animState.timeoutValue > 0) {
      const clipDuration = action.getClip().duration;
      action.timeScale = clipDuration > 0
        ? clipDuration / animState.timeoutValue
        : 1;
    } else {
      action.timeScale = animState.reverse ? -1 : 1;
    }

    if (prevAction && prevAction !== action) {
      prevAction.fadeOut(ANIM_TRANSITION_TIME);
      action.reset().fadeIn(ANIM_TRANSITION_TIME).play();
    } else {
      action.reset().play();
    }

    currentAnimRef.current = targetName;
  }
}

/**
 * Attaches a pack shape to the player's Mount1 bone. Packs are static
 * mounted images (no state machine or animation) — just positioned via
 * the pack shape's Mountpoint node inverse offset, same as weapons.
 */
function MountedPackModel({
  packShape,
  mountBone,
}: {
  packShape: string;
  mountBone: Object3D;
}) {
  const packGltf = useStaticShape(packShape);

  const { packClone, packIflInitializers } = useMemo(() => {
    const clone = SkeletonUtils.clone(packGltf.scene) as Group;
    const iflInits = processShapeScene(clone);

    // Compute Mountpoint inverse offset so the pack aligns to Mount1.
    const mp = getPosedNodeTransform(
      packGltf.scene,
      packGltf.animations,
      "Mountpoint",
    );
    if (mp) {
      const invQuat = mp.quaternion.clone().invert();
      const invPos = mp.position.clone().negate().applyQuaternion(invQuat);
      clone.position.copy(invPos);
      clone.quaternion.copy(invQuat);
    }

    return { packClone: clone, packIflInitializers: iflInits };
  }, [packGltf]);

  useEffect(() => {
    mountBone.add(packClone);
    return () => {
      mountBone.remove(packClone);
    };
  }, [packClone, mountBone]);

  // Initialize IFL materials (animated texture sequences).
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const { mesh, initialize } of packIflInitializers) {
      initialize(mesh, () => streamPlaybackStore.getState().time)
        .then((dispose) => cleanups.push(dispose))
        .catch(() => {});
    }
    return () => cleanups.forEach((fn) => fn());
  }, [packIflInitializers]);

  return null;
}

/**
 * Extracts the eye offset from a player model's Eye bone in the idle ("Root"
 * animation) pose. The Eye node is a child of "Bip01 Head" in the skeleton
 * hierarchy. Its world Y in GLB Y-up space gives the height above the player's
 * feet, which we use as the first-person camera offset.
 */
export function PlayerEyeOffset({
  shapeName,
  eyeOffsetRef,
}: {
  shapeName: string;
  eyeOffsetRef: MutableRefObject<Vector3>;
}) {
  const gltf = useStaticShape(shapeName);

  useEffect(() => {
    // Get Eye node position from the posed (Root animation) skeleton.
    const eye = getPosedNodeTransform(gltf.scene, gltf.animations, "Eye");
    if (eye) {
      // Convert from GLB space to entity space via ShapeRenderer's R90:
      // R90 maps GLB (x,y,z) -> entity (z, y, -x).
      // This gives ~(0.169, 2.122, 0.0) -- 17cm forward and 2.12m up.
      eyeOffsetRef.current.set(eye.position.z, eye.position.y, -eye.position.x);
    } else {
      eyeOffsetRef.current.set(0, DEFAULT_EYE_HEIGHT, 0);
    }
  }, [gltf, eyeOffsetRef]);

  return null;
}
