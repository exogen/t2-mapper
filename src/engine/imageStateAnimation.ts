import { Vector3 } from "three";
import type {
  AnimationAction,
  AudioListener,
  AudioLoader,
  Object3D,
  PositionalAudio,
} from "three";
import type {
  WeaponImageStateMachine,
  WeaponAnimState,
} from "../stream/weaponStateMachine";
import type { ImageSlot } from "../stream/types";
import { engineStore } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { audioToUrl } from "../loaders";
import { requestShockwave } from "./shockwaveRequests";
import { findOwnNode } from "../sceneNodes";
import { getAudioGraph } from "./audioGraph";
import { settingsStore } from "../state/settingsStore";
import {
  createPositionalAudio,
  getCachedAudioBuffer,
  getEffectiveSoundRate,
  getSoundGeneration,
  playOneShotSound,
  resolveAudioProfile,
  stopAndDetachSound,
  trackSound,
} from "./soundEffects";
import { holdDtsAction } from "../dts/dtsThread";
import {
  imageThreadPosition,
  type ImageAnimationState,
  type ImageAnimationThread,
} from "../stream/imageAnimation";
import { threeToTorque } from "../scene/coordinates";

/** What the hook drives on the mounted image's own model. */
export interface ImageStateAnimationTarget {
  /** Lower-cased sequence name → action on the image's mixer. */
  actions: ReadonlyMap<string, AnimationAction>;
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

/** One engine image thread, represented by a native Three action. */
interface ImageThread {
  sequence: string;
  action: AnimationAction;
}

/** A mutable slot, as the looping-sound helpers share it. */
interface Box<T> {
  current: T;
}

/**
 * Sample the stream's reconstructed image threads on this model. Only new
 * state entries emit one-shot effects; seeks restore poses and looping audio.
 * The caller evaluates the image's mixer after `update`.
 */
export function createImageStateAnimation(
  readSlot: () => ImageSlot | undefined,
  target: ImageStateAnimationTarget,
): { update(): void; dispose(): void } {
  const { audioLoader, audioListener } = getAudioGraph();

  const animThreadRef: Box<ImageThread | null> = { current: null };
  const flashThreadRef: Box<ImageThread | null> = { current: null };
  let lastActions: ReadonlyMap<string, AnimationAction> | null = null;
  let lastSeek = engineStore.getState().playback.seekNonce;
  const loopingSoundRef: Box<PositionalAudio | null> = { current: null };
  const loopingSoundStateRef: Box<number> = { current: -1 };
  let recordedState: ImageAnimationState | null = null;
  let lastSoundAttempt = {
    revision: -1,
    audioEnabled: false,
    playing: false,
    seekNonce: -1,
    generation: -1,
    actions: null as ReadonlyMap<string, AnimationAction> | null,
  };

  function update(): void {
    const { audioEnabled, animationEnabled } = settingsStore.getState();
    const playback = engineStore.getState().playback;
    if (playback.status === "seeking") {
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
      return;
    }
    const isPlaying = playback.status === "playing" && !streamClock.worldPaused;
    const actions = target.actions;

    const imageSlot = readSlot();
    const seeking = playback.seekNonce !== lastSeek;
    lastSeek = playback.seekNonce;

    if (imageSlot?.animation) {
      const recorded = imageSlot.animation;
      const previous = recordedState;
      const rebuilt = actions !== lastActions;
      lastActions = actions;
      recordedState = recorded;
      const now = streamClock.worldTime;
      const apply = (
        thread: ImageAnimationThread | undefined,
        ref: Box<ImageThread | null>,
        flash = false,
      ) => {
        const name = thread && target.seqIndexToName[thread.sequence];
        const action = name ? actions.get(name) : undefined;
        if (!thread || !name || !action) {
          ref.current?.action.stop();
          ref.current = null;
          return;
        }
        if (ref.current?.action !== action) ref.current?.action.stop();
        if (ref.current?.action !== action)
          ref.current = { sequence: name, action };
        const scaleName =
          thread.scaleSequence != null
            ? target.seqIndexToName[thread.scaleSequence]
            : undefined;
        holdDtsAction(
          action,
          !animationEnabled
            ? 0
            : imageThreadPosition(
                thread,
                now,
                action.getClip().duration,
                !flash && target.cyclicSequences.has(name),
                scaleName
                  ? actions.get(scaleName)?.getClip().duration
                  : undefined,
              ),
        );
      };
      apply(recorded.anim, animThreadRef);
      apply(recorded.flash, flashThreadRef, true);
      const ambient = actions.get("ambient");
      if (ambient) {
        const duration = ambient.getClip().duration;
        holdDtsAction(
          ambient,
          animationEnabled && duration > 0
            ? (Math.max(0, now - (imageSlot.mountedAtSec ?? now)) % duration) /
                duration
            : 0,
        );
      }
      const spin = actions.get("spin");
      if (spin) {
        const time =
          recorded.spinTime +
          (now - recorded.spinTimeSec) * recorded.state.spinTimeScale;
        const duration = spin.getClip().duration;
        holdDtsAction(
          spin,
          animationEnabled && duration > 0
            ? (((time % duration) + duration) % duration) / duration
            : 0,
        );
      }
      if (
        loopingSoundRef.current &&
        (!audioEnabled ||
          streamClock.worldPaused ||
          !loopingSoundRef.current.isPlaying ||
          loopingSoundStateRef.current !== recorded.state.stateIndex)
      )
        stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
      // State-entry effects are emitted only while crossing that event during
      // playback. A seek/late model applies the pose without replaying sounds.
      const entered =
        !seeking &&
        (rebuilt || !previous
          ? imageSlot.mountedAtSec != null &&
            Math.abs(now - imageSlot.mountedAtSec) < 0.1
          : previous.revision !== recorded.revision) &&
        isPlaying &&
        Math.abs(now - recorded.changedAtSec) < 0.1;
      const currentState = {
        get stateIndex() {
          return readSlot()?.animation?.state.stateIndex ?? -1;
        },
      };
      if (entered && audioEnabled && audioLoader && audioListener)
        playStateSounds(recorded.state, currentState, target, playback, {
          audioLoader,
          audioListener,
          loopingSoundRef,
          loopingSoundStateRef,
        });
      const attempted = lastSoundAttempt;
      const generation = getSoundGeneration();
      const retrySound =
        attempted.revision !== recorded.revision ||
        attempted.audioEnabled !== audioEnabled ||
        attempted.playing !== isPlaying ||
        attempted.seekNonce !== playback.seekNonce ||
        attempted.generation !== generation ||
        attempted.actions !== actions;
      if (
        !entered &&
        retrySound &&
        isPlaying &&
        audioEnabled &&
        audioLoader &&
        audioListener &&
        !loopingSoundRef.current
      ) {
        const sound =
          imageSlot.imageStates?.[recorded.state.stateIndex]
            ?.soundDataBlockId ?? -1;
        if (sound >= 0)
          playStateSounds(
            { ...recorded.state, soundDataBlockIds: [sound] },
            currentState,
            target,
            playback,
            {
              audioLoader,
              audioListener,
              loopingSoundRef,
              loopingSoundStateRef,
            },
            false,
          );
      }
      if (retrySound)
        lastSoundAttempt = {
          revision: recorded.revision,
          audioEnabled,
          playing: isPlaying,
          seekNonce: playback.seekNonce,
          generation,
          actions,
        };
      if (entered && recorded.state.transitioned && recorded.state.isFiring)
        emitMuzzleFlash(imageSlot, target);
      return;
    }

    stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
  }

  return {
    update,
    dispose: () => stopLoopingSound(loopingSoundRef, loopingSoundStateRef),
  };
}

/**
 * State-entry sounds as positional audio: the engine plays a sound for
 * every state entered during a transition chain, so a tick may carry
 * several. A looping sound (the chaingun's fire) persists while in its
 * state and stops on the next state change.
 */
function playStateSounds(
  animState: WeaponAnimState,
  sm: Pick<WeaponImageStateMachine, "stateIndex">,
  target: ImageStateAnimationTarget,
  playback: ReturnType<typeof engineStore.getState>["playback"],
  audio: {
    audioLoader: AudioLoader;
    audioListener: AudioListener;
    loopingSoundRef: Box<PositionalAudio | null>;
    loopingSoundStateRef: Box<number>;
  },
  oneShots = true,
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
      if (!oneShots) continue;
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
        if (gen !== getSoundGeneration() || streamClock.worldPaused) return;
        if (loopingSoundRef.current) return;
        const currentIdx = sm.stateIndex;
        if (currentIdx !== animState.stateIndex) return;
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

const _flashPos = new Vector3();
const _flashDir = new Vector3();
function emitMuzzleFlash(
  slot: ImageSlot,
  target: ImageStateAnimationTarget,
): void {
  const flashId = resolveMuzzleFlash(slot.dataBlockId);
  if (flashId == null) return;
  imageFlashTransform(target.imageRoot, _flashPos, _flashDir);
  requestShockwave({
    dataBlockId: flashId,
    origin: threeToTorque(_flashPos),
    normal: threeToTorque(_flashDir),
    ownerId: target.ownerId ?? "",
  });
}
/** Per recording, since datablock ids are reused between recordings. */
const _flashNodeCache = new WeakMap<Object3D, Object3D>();

/** ShapeBase muzzle flash (FUN_005f9a80): own mount0 position and +Y axis,
 * which is +Z in native DTS model coordinates, including the root fallback. */
export function imageFlashTransform(
  imageRoot: Object3D,
  position: Vector3,
  direction: Vector3,
): void {
  let node = _flashNodeCache.get(imageRoot);
  if (!node) {
    node = findOwnNode(imageRoot, "mount0") ?? imageRoot;
    _flashNodeCache.set(imageRoot, node);
  }
  node.updateWorldMatrix(true, false);
  position.setFromMatrixPosition(node.matrixWorld);
  direction.set(0, 0, 1).transformDirection(node.matrixWorld);
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
  soundRef: Box<PositionalAudio | null>,
  stateRef: Box<number>,
): void {
  const sound = soundRef.current;
  if (!sound) return;
  stopAndDetachSound(sound);
  soundRef.current = null;
  stateRef.current = -1;
}
