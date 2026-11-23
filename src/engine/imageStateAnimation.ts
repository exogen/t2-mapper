import type {
  AnimationAction,
  AudioListener,
  Object3D,
  PositionalAudio,
} from "three";
import type { WeaponAnimState } from "../stream/weaponStateMachine";
import type { ImageSlot } from "../stream/types";
import { engineStore, type PlaybackStatus } from "../state/engineStore";
import { streamClock } from "../state/streamPlaybackStore";
import { audioToUrl } from "../loaders";
import type { AudioBufferLoader } from "./audioBuffers";
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
import { streamRenderFrame } from "../stream/interpolateEntity";

export interface ImageStateEffects {
  dataBlockId: number;
  shellCount: number;
  shockwave: boolean;
}

/** What the hook drives on the mounted image's own model. */
export interface ImageStateAnimationTarget {
  /** Lower-cased sequence name → action on the image's mixer. */
  actions: ReadonlyMap<string, AnimationAction>;
  /**
   * The image's model root, placed where the engine's image transform
   * is: state sounds attach here and the muzzle flash spawns here.
   */
  imageRoot: Object3D;
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

function playingWeaponAnimation(status: PlaybackStatus): boolean {
  return (
    status === "playing" &&
    !streamClock.worldPaused &&
    !streamRenderFrame.reconstructing
  );
}

/**
 * Sample the stream's reconstructed image threads on this model. Only new
 * state entries emit one-shot effects; seeks restore poses and looping audio.
 * The caller evaluates the image's mixer after `update`.
 */
export function createImageStateAnimation(
  readSlot: () => ImageSlot | undefined,
  target: ImageStateAnimationTarget,
) {
  const { audioLoader, audioListener } = getAudioGraph();

  const animThreadRef: Box<ImageThread | null> = { current: null };
  const flashThreadRef: Box<ImageThread | null> = { current: null };
  let lastSeek = engineStore.getState().playback.seekNonce;
  const loopingSoundRef: Box<PositionalAudio | null> = { current: null };
  const loopingSoundStateRef: Box<number> = { current: -1 };
  let recordedState: ImageAnimationState | null = null;
  let previousMountTime: number | undefined;
  let disposed = false;
  const soundLifetime = new AbortController();
  let lastSoundAttempt = {
    revision: -1,
    audioEnabled: false,
    playing: false,
    seekNonce: -1,
    generation: -1,
  };

  function update(): ImageStateEffects | undefined {
    if (disposed) return;
    const { audioEnabled, animationEnabled } = settingsStore.getState();
    const playback = engineStore.getState().playback;
    if (playback.status === "seeking") {
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
      return;
    }
    const isPlaying = playingWeaponAnimation(playback.status);
    const actions = target.actions;

    const imageSlot = readSlot();
    const seeking = playback.seekNonce !== lastSeek;
    lastSeek = playback.seekNonce;

    if (imageSlot?.animation) {
      const recorded = imageSlot.animation;
      const previous = recordedState;
      const sameMount = previousMountTime === imageSlot.mountedAtSec;
      previousMountTime = imageSlot.mountedAtSec;
      recordedState = recorded;
      const now = streamClock.worldTime;
      const continuingMount = previous && sameMount;
      const freshMount =
        !continuingMount &&
        imageSlot.mountedAtSec != null &&
        Math.abs(now - imageSlot.mountedAtSec) < 0.1;
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
          !sameMount ||
          streamClock.worldPaused ||
          !loopingSoundRef.current.isPlaying ||
          loopingSoundStateRef.current !== recorded.state.stateIndex)
      )
        stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
      // State-entry effects are emitted only while crossing that event during
      // playback. A seek/late model applies the pose without replaying sounds.
      const entered =
        !seeking &&
        (continuingMount
          ? previous.revision !== recorded.revision
          : freshMount) &&
        isPlaying &&
        Math.abs(now - recorded.changedAtSec) < 0.1;
      const attempted = lastSoundAttempt;
      const generation = getSoundGeneration();
      const retrySound =
        !sameMount ||
        attempted.revision !== recorded.revision ||
        attempted.audioEnabled !== audioEnabled ||
        attempted.playing !== isPlaying ||
        attempted.seekNonce !== playback.seekNonce ||
        attempted.generation !== generation;
      if (isPlaying && audioEnabled && audioLoader && audioListener) {
        const stateIndex = recorded.state.stateIndex;
        const fallbackSound =
          retrySound && !loopingSoundRef.current
            ? (imageSlot.imageStates?.[stateIndex]?.soundDataBlockId ?? -1)
            : -1;
        if (entered || fallbackSound >= 0) {
          const { recording, seekNonce } = playback;
          const { mountedAtSec, dataBlockId } = imageSlot;
          const canStartSound = (requiredState?: number) => {
            const current = engineStore.getState().playback;
            const slot = readSlot();
            return (
              !disposed &&
              settingsStore.getState().audioEnabled &&
              playingWeaponAnimation(current.status) &&
              current.recording === recording &&
              current.seekNonce === seekNonce &&
              slot?.dataBlockId === dataBlockId &&
              slot.mountedAtSec === mountedAtSec &&
              (requiredState === undefined ||
                slot.animation?.state.stateIndex === requiredState)
            );
          };
          playStateSounds(
            entered
              ? recorded.state
              : { ...recorded.state, soundDataBlockIds: [fallbackSound] },
            { signal: soundLifetime.signal, canStart: canStartSound },
            target,
            playback,
            {
              audioLoader,
              audioListener,
              loopingSoundRef,
              loopingSoundStateRef,
            },
            entered,
          );
        }
      }
      if (retrySound)
        lastSoundAttempt = {
          revision: recorded.revision,
          audioEnabled,
          playing: isPlaying,
          seekNonce: playback.seekNonce,
          generation,
        };
      // A fresh mount can already be firing on its initial ghost update.
      // A seek or late model load only establishes the count baseline.
      if (!seeking && isPlaying && (continuingMount || freshMount)) {
        const shellCount = Math.max(
          0,
          (recorded.shellEjections ?? 0) -
            (continuingMount ? (previous.shellEjections ?? 0) : 0),
        );
        const shockwave = entered && recorded.state.shockwave === true;
        if (shellCount || shockwave)
          return { dataBlockId: imageSlot.dataBlockId, shellCount, shockwave };
      }
      return;
    }

    recordedState = null;
    stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
  }

  return {
    update,
    dispose() {
      disposed = true;
      soundLifetime.abort();
      stopLoopingSound(loopingSoundRef, loopingSoundStateRef);
    },
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
  owner: { signal: AbortSignal; canStart: (requiredState?: number) => boolean },
  target: ImageStateAnimationTarget,
  playback: ReturnType<typeof engineStore.getState>["playback"],
  audio: {
    audioLoader: AudioBufferLoader;
    audioListener: AudioListener;
    loopingSoundRef: Box<PositionalAudio | null>;
    loopingSoundStateRef: Box<number>;
  },
  oneShots: boolean,
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
        owner,
      );
      continue;
    }
    if (loopingSoundRef.current) continue;
    try {
      const url = audioToUrl(resolved.filename);
      const gen = getSoundGeneration();
      getCachedAudioBuffer(url, audioLoader, (buffer) => {
        if (
          gen !== getSoundGeneration() ||
          loopingSoundRef.current ||
          !owner.canStart(animState.stateIndex)
        )
          return;
        const sound = createPositionalAudio(audioListener, resolved);
        sound.setBuffer(buffer);
        sound.setPlaybackRate(getEffectiveSoundRate());
        sound.setLoop(true);
        target.imageRoot.add(sound);
        trackSound(sound);
        sound.play();
        loopingSoundRef.current = sound;
        loopingSoundStateRef.current = animState.stateIndex;
      });
    } catch {
      /* expected */
    }
  }
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
