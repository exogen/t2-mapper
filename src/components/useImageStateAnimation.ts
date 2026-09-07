import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { type AnimationClip, LoopOnce, LoopRepeat, Vector3 } from "three";
import type {
  AnimationAction,
  AudioListener,
  AudioLoader,
  Object3D,
  PositionalAudio,
} from "three";
import {
  WeaponImageStateMachine,
  type WeaponAnimState,
} from "../stream/weaponStateMachine";
import type { ImageSlot } from "../stream/types";
import { ANIM_TRANSITION_TIME } from "../stream/playbackUtils";
import { engineStore } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { audioToUrl } from "../loaders";
import { requestShockwave } from "./shockwaveRequests";
import { findOwnNode } from "./sceneNodes";
import { useAudio } from "./AudioContext";
import { useSettings } from "./SettingsProvider";
import {
  createPositionalAudio,
  getCachedAudioBuffer,
  getEffectiveSoundRate,
  getSoundGeneration,
  playOneShotSound,
  resolveAudioProfile,
  stopAndDetachSound,
  trackSound,
} from "./AudioEmitter";
import {
  applyVisAt,
  prepareVisMaterial,
  resetVisNode,
  restoreDefaultVis,
  visThreadPosition,
  type VisNode,
} from "./visSequences";
import { driveIflFrames, type IflMaterialInstance } from "../iflAtlas";
import { readDtsSequences } from "../dtsSequences";
import { FramePriority } from "./framePriority";

/** What the hook drives on the mounted image's own model. */
export interface ImageStateAnimationTarget {
  /** Lower-cased sequence name → action on the image's mixer. */
  actions: RefObject<Map<string, AnimationAction>>;
  /** Mesh frame ("_frame") actions that play alongside each sequence. */
  morphActions?: RefObject<Map<string, AnimationAction[]>>;
  /** Sets the looping "spin" action's speed as the spin state changes. */
  setSpinTimeScale: (timeScale: number) => void;
  /** Vis-keyframed meshes by lower-cased sequence (collectVisNodes). */
  visNodesBySequence: Map<string, VisNode[]>;
  /**
   * The image's model root, placed where the engine's image transform
   * is: state sounds attach here and the muzzle flash spawns here.
   */
  imageRoot: Object3D;
  /** The owner entity id, for effect bookkeeping. */
  ownerId?: string;
  /** DTS sequence index → lower-cased name, as the state table indexes. */
  seqIndexToName: readonly string[];
  /** Lower-cased names of the shape's cyclic sequences. */
  cyclicSequences: ReadonlySet<string>;
  /** The model's live IFL materials, driven by the image's threads. */
  iflInstances?: RefObject<readonly IflMaterialInstance[]>;
}

/**
 * The shape's cyclic sequences by lower-cased name (readDtsSequences).
 */
export function readCyclicSequences(
  scene: Object3D,
  animations: readonly AnimationClip[],
): ReadonlySet<string> {
  return readDtsSequences(scene, animations).cyclic;
}

/**
 * One of the image's animation threads as TSShapeInstance keeps it: a
 * sequence, a position source (the mixer action when the sequence has
 * node tracks, else the image clock), and the time scale it advances at.
 */
interface ImageThread {
  sequence: string;
  action: AnimationAction | null;
  morphActions: AnimationAction[];
  /** Image clock at which the thread (re)started, for clock-driven threads. */
  startClock: number;
  timeScale: number;
  /** A frozen thread holds this normalized position. */
  frozenAt: number | null;
  duration: number;
}

/**
 * Run a mounted image's state machine (ShapeBase::updateImageState) off the
 * owner's ghosted condition flags and play the resulting sequences, spin,
 * state-entry sounds, vis keyframes and muzzle flashes on the image's own
 * model. `readSlot` is read every frame: the owner's image slots are
 * mutated per tick, not re-rendered. The caller advances the image's
 * mixer itself.
 */
export function useImageStateAnimation(
  readSlot: () => ImageSlot | undefined,
  target: ImageStateAnimationTarget,
): void {
  const { audioLoader, audioListener } = useAudio();
  const settings = useSettings();
  const audioEnabled = settings?.audioEnabled ?? false;

  const animationEnabled = settings?.animationEnabled ?? true;

  const stateMachineRef = useRef<WeaponImageStateMachine | null>(null);
  const animThreadRef = useRef<ImageThread | null>(null);
  const flashThreadRef = useRef<ImageThread | null>(null);
  const ambientThreadRef = useRef<ImageThread | null>(null);
  const clockRef = useRef(0);
  const seatPendingRef = useRef<false | "enter" | "seat">(false);
  const lastActionsRef = useRef<Map<string, AnimationAction> | null>(null);
  const lastStatesRef = useRef(readSlot()?.imageStates);
  const loopingSoundRef = useRef<PositionalAudio | null>(null);
  const loopingSoundStateRef = useRef<number>(-1);

  useEffect(
    () => () => stopLoopingSound(loopingSoundRef, loopingSoundStateRef),
    [],
  );

  const threadsOf = () =>
    [
      animThreadRef.current,
      flashThreadRef.current,
      ambientThreadRef.current,
    ].filter((thread): thread is ImageThread => thread != null);

  useFrame((_, delta) => {
    const playback = engineStore.getState().playback;
    const isPlaying = playback.status === "playing";
    const actions = target.actions.current;

    const imageSlot = readSlot();
    const imageState = imageSlot?.imageState;
    const imageStates = imageSlot?.imageStates;

    // Lazily create or recreate the state machine when the datablock states
    // become available or change (e.g. weapon switch within same shape).
    if (imageStates !== lastStatesRef.current) {
      lastStatesRef.current = imageStates;
      stateMachineRef.current = null;
      animThreadRef.current = null;
      flashThreadRef.current = null;
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
    }
    if (!stateMachineRef.current && imageSlot?.imageStates?.length) {
      const created = createMachine(imageSlot, target);
      stateMachineRef.current = created.machine;
      // A fresh image enters its first state now (ShapeBase::setImage →
      // setImageState(0)); a fast-forwarded one is seated where it got to.
      seatPendingRef.current = created.machine
        ? created.fastForwarded
          ? "seat"
          : "enter"
        : false;
    }
    const sm = stateMachineRef.current;

    // A rebuilt action map (new mixer or model) orphans the threads'
    // actions; the state machine keeps its state and re-enters on the
    // next transition.
    if (actions !== lastActionsRef.current) {
      lastActionsRef.current = actions;
      animThreadRef.current = null;
      flashThreadRef.current = null;
      ambientThreadRef.current = null;
      if (sm) seatPendingRef.current = "seat";
    }

    // The state-change stop below only runs while the state machine is
    // ticking — an image that loses its state (holstered, owner died,
    // ghost stopped sending) or audio being disabled must also kill an
    // active fire loop, or it plays until the component unmounts. A loop
    // that is no longer playing was stopped externally (global stop on
    // seek) — clear it so the next state entry can re-trigger. (Pause is
    // deliberately not a stop condition: the suspended AudioContext
    // silences the loop, and it must survive to resume.)
    if (
      loopingSoundRef.current &&
      (!sm ||
        !imageState ||
        !audioEnabled ||
        !loopingSoundRef.current.isPlaying)
    ) {
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
    }

    if (!sm || !imageState || !actions) return;

    // ShapeBase::setImage gives every image an ambient thread looping its
    // "ambient" sequence (the plasma rifle's core glow, a pack's lights).
    if (!ambientThreadRef.current) {
      ambientThreadRef.current = startAmbientThread(
        actions,
        target,
        clockRef.current,
      );
    }

    // "enter": a fresh image plays its first state's sequence and sound.
    // "seat": a fast-forwarded machine (or rebuilt actions) shows its
    // current state's pose held at the end — no sound, no flash, no
    // replay of the activation it went through long ago.
    const seat = seatPendingRef.current;
    if (seat) {
      seatPendingRef.current = false;
      const snapshot = sm.snapshot(seat === "enter");
      enterState(
        snapshot,
        actions,
        target,
        animThreadRef,
        flashThreadRef,
        clockRef.current,
      );
      const anim = animThreadRef.current;
      if (
        seat === "seat" &&
        anim &&
        !target.cyclicSequences.has(anim.sequence)
      ) {
        freezeThread(anim, 1);
      }
      target.setSpinTimeScale(snapshot.spinTimeScale);
      if (audioEnabled && audioLoader && audioListener) {
        playStateSounds(snapshot, sm, target, playback, {
          audioLoader,
          audioListener,
          loopingSoundRef,
          loopingSoundStateRef,
        });
      }
    }

    if (!isPlaying) {
      driveThreadOutputs(
        target,
        animationEnabled,
        threadsOf(),
        clockRef.current,
      );
      return;
    }

    const dt = delta * playback.rate;
    clockRef.current += dt;
    const animState = sm.tick(dt, imageState);

    if (animState.entered) {
      enterState(
        animState,
        actions,
        target,
        animThreadRef,
        flashThreadRef,
        clockRef.current,
      );
    } else if (animState.transitioned && animState.flashSequence) {
      // A flash state timing out into itself (the chaingun's Fire → Fire)
      // takes setImageState's self-transition path: no sound or restart,
      // but the anim thread is re-randomized and the flash replayed.
      const anim = animThreadRef.current;
      if (anim) freezeThread(anim, Math.random());
      const flash = flashThreadRef.current;
      if (flash) {
        flash.frozenAt = null;
        flash.startClock = clockRef.current;
      }
    }
    driveThreadOutputs(target, animationEnabled, threadsOf(), clockRef.current);

    // Stop active looping sound when the state changes.
    if (
      loopingSoundRef.current &&
      animState.stateIndex !== loopingSoundStateRef.current
    ) {
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
    }

    if (audioEnabled && audioLoader && audioListener) {
      playStateSounds(animState, sm, target, playback, {
        audioLoader,
        audioListener,
        loopingSoundRef,
        loopingSoundStateRef,
      });
    }

    // Drive the spin thread (e.g. chaingun barrel rotation).
    target.setSpinTimeScale(animState.spinTimeScale);

    // Entering a fire state on the client spawns the datablock's
    // muzzleFlash Shockwave (ShapeBase::setImageState FUN_005f8860 →
    // FUN_005f9a80) at getRenderImageTransform(slot, "mount0"): the
    // image's own mount0 node when it has one (the chaingun), else the
    // image transform; the ring's axis is that transform's +Y. A GLB bone
    // carries the DTS frame turned −90° about X, so a node's +Y is the
    // bone's −Y column; the image root is a plain group whose +Z is DTS +Y.
    if (animState.transitioned && animState.isFiring && imageSlot) {
      const flashId = resolveMuzzleFlash(imageSlot.dataBlockId);
      if (flashId != null) {
        const node = imageFlashNode(target.imageRoot);
        node.updateWorldMatrix(true, false);
        _flashPos.setFromMatrixPosition(node.matrixWorld);
        if (node === target.imageRoot) {
          _flashDir.set(0, 0, 1).transformDirection(node.matrixWorld);
        } else {
          _flashDir.set(0, -1, 0).transformDirection(node.matrixWorld);
        }
        requestShockwave({
          dataBlockId: flashId,
          origin: [_flashPos.z, _flashPos.x, _flashPos.y],
          normal: [_flashDir.z, _flashDir.x, _flashDir.y],
          ownerId: target.ownerId ?? "",
        });
      }
    }
  }, FramePriority.ShapeAnimation);
}

/** How far past a late mount the machine is run to catch up, at most. */
const FAST_FORWARD_CAP_SEC = 10;

/**
 * A state machine for the slot's datablock. When the model mounts long
 * after the image was set (a seek, a remount), the machine is run ahead
 * under the current flags so it shows the state the engine reached
 * rather than replaying the activation chain.
 */
function createMachine(
  slot: ImageSlot,
  target: ImageStateAnimationTarget,
): { machine: WeaponImageStateMachine | null; fastForwarded: boolean } {
  if (!slot.imageStates || slot.imageStates.length === 0) {
    return { machine: null, fastForwarded: false };
  }
  const machine = new WeaponImageStateMachine(
    slot.imageStates,
    target.seqIndexToName,
  );
  let fastForwarded = false;
  if (slot.mountedAtSec != null && slot.imageState) {
    const elapsed = streamClock.time - slot.mountedAtSec;
    if (elapsed > 0.1) {
      machine.fastForward(
        Math.min(elapsed, FAST_FORWARD_CAP_SEC),
        slot.imageState,
      );
      fastForwarded = true;
    }
  }
  return { machine, fastForwarded };
}

/**
 * State-entry sounds as positional audio: the engine plays a sound for
 * every state entered during a transition chain, so a tick may carry
 * several. A looping sound (the chaingun's fire) persists while in its
 * state and stops on the next state change.
 */
function playStateSounds(
  animState: WeaponAnimState,
  sm: WeaponImageStateMachine,
  target: ImageStateAnimationTarget,
  playback: ReturnType<typeof engineStore.getState>["playback"],
  audio: {
    audioLoader: AudioLoader;
    audioListener: AudioListener;
    loopingSoundRef: RefObject<PositionalAudio | null>;
    loopingSoundStateRef: RefObject<number>;
  },
): void {
  if (animState.soundDataBlockIds.length === 0) return;
  const sp = playback.recording?.streamingPlayback;
  if (!sp) return;
  const getDb = sp.getDataBlockData.bind(sp);
  const { audioLoader, audioListener, loopingSoundRef, loopingSoundStateRef } =
    audio;
  for (const soundDbId of animState.soundDataBlockIds) {
    const resolved = resolveAudioProfile(soundDbId, getDb);
    if (!resolved) continue;
    if (!resolved.isLooping) {
      playOneShotSound(
        resolved,
        audioListener,
        audioLoader,
        undefined,
        target.imageRoot,
      );
      continue;
    }
    if (loopingSoundRef.current) continue;
    try {
      const url = audioToUrl(resolved.filename);
      const gen = getSoundGeneration();
      getCachedAudioBuffer(url, audioLoader, (buffer) => {
        // The state may have moved on by the time the buffer loads.
        if (gen !== getSoundGeneration()) return;
        if (loopingSoundRef.current) return;
        const currentIdx = sm.stateIndex;
        const sound = createPositionalAudio(audioListener, resolved);
        sound.setBuffer(buffer);
        sound.setPlaybackRate(getEffectiveSoundRate());
        sound.setLoop(true);
        target.imageRoot.add(sound);
        trackSound(sound);
        sound.play();
        loopingSoundRef.current = sound;
        loopingSoundStateRef.current = currentIdx;
      });
    } catch {
      /* expected */
    }
  }
}

/**
 * ShapeBase::setImageState's thread work on entering a state. First a
 * cyclic sequence on the anim thread is frozen at its first frame (its
 * "off" pose) and the flash thread is frozen at its start; a non-cyclic
 * anim sequence holds its last pose. A state with a sequence then
 * restarts the anim thread — looping only if the DTS marks the sequence
 * cyclic, from the end when the state runs it backwards, time-scaled to
 * the timeout when asked. A flash state instead freezes that sequence at
 * a random frame (the chaingun's random flash orientation) and plays the
 * "_vis" companion once on the flash thread, whose time scale is the anim
 * sequence's duration over the timeout.
 */
function enterState(
  animState: WeaponAnimState,
  actions: Map<string, AnimationAction>,
  target: ImageStateAnimationTarget,
  animThreadRef: RefObject<ImageThread | null>,
  flashThreadRef: RefObject<ImageThread | null>,
  clock: number,
): void {
  const anim = animThreadRef.current;
  if (anim && target.cyclicSequences.has(anim.sequence)) {
    freezeThread(anim, 0);
  }
  const flash = flashThreadRef.current;
  if (flash) freezeThread(flash, 0);

  const targetName = animState.sequenceName;
  if (!targetName) return;

  const duration = sequenceDuration(target, actions, targetName);
  const timeScale =
    animState.scaleAnimation && animState.timeoutValue > 0 && duration > 0
      ? duration / animState.timeoutValue
      : 1;

  if (anim && anim.sequence !== targetName) {
    // Meshes only the old sequence animated fall back to the shape's
    // default visibility once no thread drives them, and their frames to
    // the first.
    const prevVis = target.visNodesBySequence.get(anim.sequence);
    if (prevVis) for (const node of prevVis) restoreDefaultVis(node);
    for (const morph of anim.morphActions) morph.stop();
  }

  const cyclic = target.cyclicSequences.has(targetName);
  const signedScale = animState.reverse ? -timeScale : timeScale;
  const action = actions.get(targetName) ?? null;
  if (action) {
    const prevAction =
      anim && anim.sequence !== targetName ? actions.get(anim.sequence) : null;
    configureAction(action, cyclic, signedScale);
    if (prevAction && prevAction !== action) {
      prevAction.fadeOut(ANIM_TRANSITION_TIME);
      action.reset().fadeIn(ANIM_TRANSITION_TIME).play();
    } else {
      action.reset().play();
    }
    if (animState.reverse) action.time = action.getClip().duration;
  }
  const morphActions = target.morphActions?.current.get(targetName) ?? [];
  for (const morph of morphActions) {
    configureAction(morph, cyclic, signedScale);
    morph.reset().play();
    if (animState.reverse) morph.time = morph.getClip().duration;
  }

  const thread: ImageThread = {
    sequence: targetName,
    action,
    morphActions,
    startClock: clock,
    timeScale: animState.reverse ? -timeScale : timeScale,
    frozenAt: null,
    duration,
  };
  animThreadRef.current = thread;

  if (animState.flashSequence && animState.visSequenceName) {
    freezeThread(thread, Math.random());
    flashThreadRef.current = {
      sequence: animState.visSequenceName,
      action: null,
      morphActions: [],
      startClock: clock,
      timeScale,
      frozenAt: null,
      duration: sequenceDuration(target, actions, animState.visSequenceName),
    };
  }
}

function configureAction(
  action: AnimationAction,
  cyclic: boolean,
  timeScale: number,
): void {
  if (cyclic) {
    action.setLoop(LoopRepeat, Infinity);
    action.clampWhenFinished = false;
  } else {
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
  }
  action.timeScale = timeScale;
}

/** Hold the thread at normalized position `t`. */
function freezeThread(thread: ImageThread, t: number): void {
  thread.frozenAt = t;
  for (const action of thread.action
    ? [thread.action, ...thread.morphActions]
    : thread.morphActions) {
    action.paused = true;
    action.time = t * action.getClip().duration;
  }
}

/** The thread's normalized position now. */
function threadPosition(
  thread: ImageThread,
  cyclic: boolean,
  clock: number,
): number {
  if (thread.frozenAt != null) return thread.frozenAt;
  if (thread.action) {
    const d = thread.action.getClip().duration;
    return d > 0 ? thread.action.time / d : 0;
  }
  return visThreadPosition(
    (clock - thread.startClock) * Math.abs(thread.timeScale),
    thread.duration,
    cyclic,
    thread.timeScale >= 0,
  );
}

/**
 * Apply every thread to the model's outputs: vis-keyframed meshes at the
 * thread's position (animateVisibility) and IFL frames for the sequence
 * the thread plays (animateIfls).
 */
function driveThreadOutputs(
  target: ImageStateAnimationTarget,
  animationEnabled: boolean,
  threads: ImageThread[],
  clock: number,
): void {
  const positions = new Map<string, number>();
  for (const thread of threads) {
    const t = threadPosition(
      thread,
      target.cyclicSequences.has(thread.sequence),
      clock,
    );
    positions.set(thread.sequence, t);
    const nodes = target.visNodesBySequence.get(thread.sequence);
    if (!nodes) continue;
    for (const node of nodes) {
      prepareVisMaterial(node);
      if (animationEnabled) applyVisAt(node, t);
      else resetVisNode(node);
    }
  }
  const ifl = target.iflInstances?.current;
  if (ifl && ifl.length > 0) {
    driveIflFrames(
      ifl,
      (sequence) => {
        const t = positions.get(sequence);
        if (t == null) return null;
        const thread = threads.find((th) => th.sequence === sequence);
        return t * (thread?.duration ?? 0);
      },
      clock,
      animationEnabled,
    );
  }
}

/**
 * The image's ambient thread, if the shape has an "ambient" sequence:
 * cyclic, from the image clock, never stopped.
 */
function startAmbientThread(
  actions: Map<string, AnimationAction>,
  target: ImageStateAnimationTarget,
  clock: number,
): ImageThread | null {
  const name = "ambient";
  const action = actions.get(name) ?? null;
  const duration = sequenceDuration(target, actions, name);
  const drivesIfl = target.iflInstances?.current?.some(
    (inst) => inst.info.sequenceName === name,
  );
  if (!action && !target.visNodesBySequence.has(name) && !drivesIfl) {
    return null;
  }
  if (action) {
    action.setLoop(LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.timeScale = 1;
    action.reset().play();
  }
  const morphActions = target.morphActions?.current.get(name) ?? [];
  for (const morph of morphActions) {
    configureAction(morph, true, 1);
    morph.reset().play();
  }
  return {
    sequence: name,
    action,
    morphActions,
    startClock: clock,
    timeScale: 1,
    frozenAt: null,
    duration,
  };
}

/**
 * A sequence's length: its clip's when it has node tracks, else its vis
 * keyframes' (a "_vis" sequence may animate visibility only).
 */
function sequenceDuration(
  target: ImageStateAnimationTarget,
  actions: Map<string, AnimationAction>,
  sequence: string,
): number {
  const clipDuration = actions.get(sequence)?.getClip().duration;
  if (clipDuration != null && clipDuration > 0) return clipDuration;
  const vis = target.visNodesBySequence.get(sequence);
  return vis?.[0]?.duration ?? 0;
}

const _flashPos = new Vector3();
const _flashDir = new Vector3();
/** Per recording, since datablock ids are reused between recordings. */
const _flashNodeCache = new WeakMap<Object3D, Object3D>();

/** The image's own "mount0" node, or the image root without one. */
function imageFlashNode(imageRoot: Object3D): Object3D {
  let node = _flashNodeCache.get(imageRoot);
  if (!node) {
    node = findOwnNode(imageRoot, "mount0") ?? imageRoot;
    _flashNodeCache.set(imageRoot, node);
  }
  return node;
}

const _muzzleFlashCache = new WeakMap<object, Map<number, number | null>>();

/**
 * The image datablock's muzzleFlash ShockwaveData id (a Tribes 2 field
 * at ShapeBaseImageData+0xce4), cached per datablock.
 */
function resolveMuzzleFlash(imageDataBlockId: number): number | null {
  const sp = engineStore.getState().playback.recording?.streamingPlayback;
  if (!sp) return null;
  let cache = _muzzleFlashCache.get(sp);
  if (!cache) {
    cache = new Map();
    _muzzleFlashCache.set(sp, cache);
  }
  const cached = cache.get(imageDataBlockId);
  if (cached !== undefined) return cached;
  const raw = sp.getDataBlockData(imageDataBlockId)?.muzzleFlash;
  const id = typeof raw === "number" && raw > 0 ? raw : null;
  cache.set(imageDataBlockId, id);
  return id;
}

function stopLoopingSound(
  soundRef: RefObject<PositionalAudio | null>,
  stateRef: RefObject<number>,
): void {
  const sound = soundRef.current;
  if (!sound) return;
  stopAndDetachSound(sound);
  soundRef.current = null;
  stateRef.current = -1;
}
