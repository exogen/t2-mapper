import {
  Audio,
  AudioListener,
  AudioLoader,
  Object3D,
  PositionalAudio,
  Vector3,
} from "three";
import { audioToUrl } from "../loaders";
import { engineStore } from "../state/engineStore";
import { getCachedAudioBuffer } from "./audioBuffers";
import {
  getEffectiveSoundRate,
  onAdjustAudioSpeedChange,
} from "./audioPlaybackRate";
import { PlaybackPositionalAudio } from "./spatialAudio";

export { audioBufferCache, getCachedAudioBuffer } from "./audioBuffers";

// Track active sounds so their playbackRate can be updated when the playback
// rate changes (e.g. slow-motion or fast-forward). Maps each sound to its
// intrinsic pitch (1.0 for normal, or the voice pitch multiplier for chat).
const _activeSounds = new Map<Audio<GainNode | PannerNode>, number>();

// Re-apply playback rate to all active sounds when the setting changes.
// (The store is updated before listeners fire, so getEffectiveSoundRate —
// which also applies the pitch-shift clamp — reads the new value.)
onAdjustAudioSpeedChange(() => {
  for (const [sound, basePitch] of _activeSounds) {
    try {
      sound.setPlaybackRate(getEffectiveSoundRate(basePitch));
    } catch {
      /* disposed */
    }
  }
});

/** Register a sound for automatic playback rate tracking during streaming. */
export function trackSound(
  sound: Audio<GainNode | PannerNode>,
  basePitch = 1,
): void {
  _activeSounds.set(sound, basePitch);
}

/** Unregister a tracked sound. */
export function untrackSound(sound: Audio<GainNode | PannerNode>): void {
  _activeSounds.delete(sound);
}

/**
 * Stop a sound and fully discard it: untrack, stop, disconnect, and remove
 * from its parent. For sounds being thrown away — not ones whose node will
 * be reused (the jet loop, for example, keeps its node parented so it can
 * restart).
 */
export function stopAndDetachSound(sound: Audio<GainNode | PannerNode>): void {
  untrackSound(sound);
  try {
    sound.stop();
  } catch {
    /* already stopped */
  }
  try {
    sound.disconnect();
  } catch {
    /* already disconnected */
  }
  sound.removeFromParent();
}

/**
 * Generation counter incremented on each stopAllTrackedSounds() call.
 * Async sound callbacks check this to avoid playing after teardown.
 */
let _soundGeneration = 0;

/** Current sound generation — capture before async work, check on completion. */
export function getSoundGeneration(): number {
  return _soundGeneration;
}

// Re-export for convenience (canonical definition in audioPlaybackRate.ts).
export { getEffectiveSoundRate } from "./audioPlaybackRate";

/** Stop and unregister all tracked sounds. Called on recording change. */
export function stopAllTrackedSounds(): void {
  _soundGeneration++;
  for (const [sound] of _activeSounds) {
    try {
      sound.stop();
    } catch {
      /* already stopped */
    }
    try {
      sound.disconnect();
    } catch {
      /* already disconnected */
    }
  }
  // One-shots parent themselves into the scene and stop() suppresses their
  // self-cleanup (three nulls source.onended), so detach them here. Looping
  // sounds stay parented — their owning components manage them.
  for (const sound of _oneShotSounds) {
    sound.removeFromParent();
  }
  _activeSounds.clear();
  _oneShotSounds.clear();
}

engineStore.subscribe(
  (state) => state.playback.rate,
  () => {
    for (const [sound, basePitch] of _activeSounds) {
      try {
        sound.setPlaybackRate(getEffectiveSoundRate(basePitch));
      } catch {
        // Sound may have been disposed.
      }
    }
  },
);

export interface ResolvedAudioProfile {
  filename: string;
  is3D: boolean;
  isLooping: boolean;
  refDist: number;
  maxDist: number;
  volume: number;
}

/**
 * Resolve an AudioProfile datablock ID to its playback parameters by following
 * the AudioProfile → AudioDescription chain.
 */
export function resolveAudioProfile(
  audioProfileId: number,
  getDb: (id: number) => Record<string, unknown> | undefined,
): ResolvedAudioProfile | null {
  const profileBlock = getDb(audioProfileId);
  const rawFilename = profileBlock?.filename as string | undefined;
  if (!rawFilename) return null;

  const filename = rawFilename.endsWith(".wav")
    ? rawFilename
    : `${rawFilename}.wav`;

  const descId = profileBlock!.description as number | null;
  const descBlock = descId != null ? getDb(descId) : undefined;
  const is3D = (descBlock?.is3D as boolean) ?? true;
  const isLooping = (descBlock?.isLooping as boolean) ?? false;
  const refDist = (descBlock?.referenceDistance as number) ?? 20;
  const maxDist = (descBlock?.maxDistance as number) ?? 100;
  const volume = (descBlock?.volume as number) ?? 1;

  return { filename, is3D, isLooping, refDist, maxDist, volume };
}

/**
 * Create a PositionalAudio with the panner configured for this app.
 * three defaults panningModel to "HRTF" — per-source convolution, the
 * expensive mode. Torque used simple stereo attenuation; "equalpower"
 * matches it and costs a fraction as much on the audio thread, which is
 * what matters at dozens of concurrent sources (audio-thread overload is
 * audible as crackling).
 *
 * With `attenuation`, also applies the shared Torque distance model:
 * "inverse" with rolloff 1 is exactly Torque's refDist/d curve. Web
 * Audio's maxDistance param is a no-op for this model — Torque's hard
 * cutoff at maxDist is the callers' range culling.
 */
export function createPositionalAudio(
  audioListener: AudioListener,
  attenuation?: { refDist: number; maxDist: number; volume: number },
): PositionalAudio {
  const sound = new PlaybackPositionalAudio(audioListener);
  sound.panner.panningModel = "equalpower";
  if (attenuation) {
    sound.setDistanceModel("inverse");
    sound.setRefDistance(attenuation.refDist);
    sound.setMaxDistance(attenuation.maxDist);
    sound.setRolloffFactor(1);
    sound.setVolume(attenuation.volume);
  }
  return sound;
}

/**
 * One-shots must never be scheduled against a non-running context: a
 * suspended context's currentTime is frozen, so every sound started
 * while it waits for the first user gesture queues at the SAME instant
 * and detonates simultaneously on resume (minutes of background
 * playback arriving as one speaker-blowing burst). Skipping the effect
 * is strictly better — it was inaudible at its moment anyway. Looping
 * ambients are exempt: they're meant to be playing continuously, and
 * entity cleanup stops queued sources before they ever sound.
 */
export function audioContextRunning(audioListener: AudioListener): boolean {
  return audioListener.context.state === "running";
}

// Cap on simultaneous one-shot effects. Beyond this the mix is
// indistinguishable chaos, but every extra source still costs audio-thread
// CPU. The distance cull runs first, so budget goes to audible sounds.
const MAX_ONE_SHOTS = 32;
const _oneShotSounds = new Set<Audio<GainNode | PannerNode>>();
const _listenerPos = new Vector3();
const _soundPos = new Vector3();

/**
 * Play a one-shot sound effect. For 3D sounds, creates a PositionalAudio
 * attached to `parent` (at `position` if given, otherwise at the parent's
 * origin); for 2D, creates a non-positional Audio. Self-cleans on end.
 *
 * 3D one-shots past the profile's maxDistance are skipped entirely: Torque
 * hard-stops sounds at maxDistance, but Web Audio's "inverse" model never
 * reaches zero gain (its maxDistance param only applies to the "linear"
 * model), so without this every shot anywhere on the map would be an
 * actively-processed source.
 */
export function playOneShotSound(
  resolved: ResolvedAudioProfile,
  audioListener: AudioListener,
  audioLoader: AudioLoader,
  position?: Vector3,
  parent?: Object3D,
): void {
  if (!audioContextRunning(audioListener)) return;
  let url: string;
  try {
    url = audioToUrl(resolved.filename);
  } catch {
    // File not in manifest — skip silently.
    return;
  }
  const is3D = resolved.is3D && !!parent;
  if (is3D) {
    if (_oneShotSounds.size >= MAX_ONE_SHOTS) return;
    audioListener.getWorldPosition(_listenerPos);
    if (position) {
      parent!.updateWorldMatrix(true, false);
      _soundPos.copy(position);
      parent!.localToWorld(_soundPos);
    } else {
      parent!.getWorldPosition(_soundPos);
    }
    if (_soundPos.distanceTo(_listenerPos) > resolved.maxDist) return;
  }
  const gen = _soundGeneration;
  getCachedAudioBuffer(url, audioLoader, (buffer) => {
    if (gen !== _soundGeneration) return;
    // Re-check after the async load: the context may have suspended
    // (or never resumed) between the call and the buffer arriving.
    if (!audioContextRunning(audioListener)) return;
    try {
      if (is3D) {
        // Re-check the cap: the check above ran at call time, but a burst
        // of first plays of a not-yet-cached file all pass it before any
        // of their async loads land here.
        if (_oneShotSounds.size >= MAX_ONE_SHOTS) return;
        const sound = createPositionalAudio(audioListener, resolved);
        sound.setBuffer(buffer);
        sound.setPlaybackRate(getEffectiveSoundRate());
        if (position) {
          sound.position.copy(position);
        }
        parent!.add(sound);
        trackSound(sound);
        _oneShotSounds.add(sound);
        // Chain (not replace) three's onEnded so isPlaying bookkeeping —
        // which also gates the panner's per-frame updates — stays correct.
        const baseOnEnded = sound.onEnded.bind(sound);
        sound.onEnded = () => {
          baseOnEnded();
          _oneShotSounds.delete(sound);
          stopAndDetachSound(sound);
        };
        sound.play();
      } else {
        const sound = new Audio(audioListener);
        sound.setBuffer(buffer);
        sound.setVolume(resolved.volume);
        sound.setPlaybackRate(getEffectiveSoundRate());
        trackSound(sound);
        const baseOnEnded = sound.onEnded.bind(sound);
        sound.onEnded = () => {
          baseOnEnded();
          stopAndDetachSound(sound);
        };
        sound.play();
      }
    } catch {
      // Playback failure (e.g. suspended AudioContext) — skip silently.
    }
  });
}
