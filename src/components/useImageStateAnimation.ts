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
import { engineStore } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { audioToUrl } from "../loaders";
import { requestShockwave } from "./shockwaveRequests";
import { findOwnNode } from "../sceneNodes";
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
import { holdDtsAction } from "../dts/dtsThread";
import { readDtsSequences } from "../dts/dtsSequences";
import { FramePriority } from "./framePriority";

/** What the hook drives on the mounted image's own model. */
export interface ImageStateAnimationTarget {
  /** Lower-cased sequence name → action on the image's mixer. */
  actions: RefObject<Map<string, AnimationAction>>;
  /** Sets the looping "spin" action's speed as the spin state changes. */
  setSpinTimeScale: (timeScale: number) => void;
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

/** One engine image thread, represented by a native Three action. */
interface ImageThread {
  sequence: string;
  action: AnimationAction;
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

  const stateMachineRef = useRef<WeaponImageStateMachine | null>(null);
  const animThreadRef = useRef<ImageThread | null>(null);
  const flashThreadRef = useRef<ImageThread | null>(null);
  const ambientThreadRef = useRef<ImageThread | null>(null);
  const seatPendingRef = useRef<false | "enter" | "seat">(false);
  const lastActionsRef = useRef<Map<string, AnimationAction> | null>(null);
  const lastStatesRef = useRef(readSlot()?.imageStates);
  const loopingSoundRef = useRef<PositionalAudio | null>(null);
  const loopingSoundStateRef = useRef<number>(-1);

  useEffect(
    () => () => stopLoopingSound(loopingSoundRef, loopingSoundStateRef),
    [],
  );

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
      animThreadRef.current?.action.stop();
      flashThreadRef.current?.action.stop();
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
      ambientThreadRef.current = startAmbientThread(actions);
    }

    // "enter": a fresh image plays its first state's sequence and sound.
    // "seat": a fast-forwarded machine (or rebuilt actions) shows its
    // current state's pose held at the end — no sound, no flash, no
    // replay of the activation it went through long ago.
    const seat = seatPendingRef.current;
    if (seat) {
      seatPendingRef.current = false;
      const snapshot = sm.snapshot(seat === "enter");
      enterState(snapshot, actions, target, animThreadRef, flashThreadRef);
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

    if (!isPlaying) return;

    const dt = delta * playback.rate;
    const animState = sm.tick(dt, imageState);

    if (animState.entered) {
      enterState(animState, actions, target, animThreadRef, flashThreadRef);
    } else if (animState.transitioned && animState.flashSequence) {
      // A flash state timing out into itself (the chaingun's Fire → Fire)
      // takes setImageState's self-transition path: no sound or restart,
      // but the anim thread is re-randomized and the flash replayed.
      const anim = animThreadRef.current;
      if (anim) freezeThread(anim, Math.random());
      const flash = flashThreadRef.current;
      if (flash) {
        flash.action.reset().play();
      }
    }

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
): void {
  const anim = animThreadRef.current;
  if (anim && target.cyclicSequences.has(anim.sequence)) {
    freezeThread(anim, 0);
  }
  const flash = flashThreadRef.current;
  if (flash) freezeThread(flash, 0);

  const targetName = animState.sequenceName;
  if (!targetName) return;

  const action = actions.get(targetName);
  if (!action) return;
  const duration = action.getClip().duration;
  const timeScale =
    animState.scaleAnimation && animState.timeoutValue > 0 && duration > 0
      ? duration / animState.timeoutValue
      : 1;

  if (anim && anim.action !== action) anim.action.stop();
  const cyclic = target.cyclicSequences.has(targetName);
  configureAction(action, cyclic, animState.reverse ? -timeScale : timeScale);
  action.reset().play();
  if (animState.reverse) action.time = duration;
  const thread: ImageThread = { sequence: targetName, action };
  animThreadRef.current = thread;

  if (animState.flashSequence && animState.visSequenceName) {
    freezeThread(thread, Math.random());
    const flashAction = actions.get(animState.visSequenceName);
    if (flash && flash.action !== flashAction) flash.action.stop();
    if (flashAction) {
      configureAction(flashAction, false, timeScale);
      flashAction.reset().play();
      flashThreadRef.current = {
        sequence: animState.visSequenceName,
        action: flashAction,
      };
    } else flashThreadRef.current = null;
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

/** Hold all native outputs, including visibility and IFL state. */
function freezeThread(thread: ImageThread, position: number): void {
  holdDtsAction(thread.action, position);
}

/** ShapeBase::setImage starts the image's ambient thread once. */
function startAmbientThread(
  actions: Map<string, AnimationAction>,
): ImageThread | null {
  const action = actions.get("ambient");
  if (!action) return null;
  configureAction(action, true, 1);
  action.reset().play();
  return { sequence: "ambient", action };
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
