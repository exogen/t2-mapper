import {
  Audio,
  AudioListener,
  Object3D,
  PositionalAudio,
  Vector3,
} from "three";
import { audioToUrl } from "../loaders";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { getCachedAudioBuffer, type AudioBufferLoader } from "./audioBuffers";
import { getEffectiveSoundRate } from "./audioPlaybackRate";
import { PlaybackPositionalAudio } from "./spatialAudio";

export { getCachedAudioBuffer } from "./audioBuffers";

// Track active sounds so their playbackRate can be updated when the playback
// rate changes (e.g. slow-motion or fast-forward). Maps each sound to its
// intrinsic pitch (1.0 for normal, or the voice pitch multiplier for chat).
const _activeSounds = new Map<Audio<GainNode | PannerNode>, number>();
const _managedOneShots = new Set<Audio<GainNode | PannerNode>>();
const _spatialOneShots = new Set<Audio<GainNode | PannerNode>>();
const _pendingOneShots = new Set<() => boolean>();

function updatePlaybackRates() {
  for (const [sound, basePitch] of _activeSounds) {
    try {
      sound.setPlaybackRate(getEffectiveSoundRate(basePitch));
    } catch {
      /* disposed */
    }
  }
}

settingsStore.subscribe((state) => state.adjustAudioSpeed, updatePlaybackRates);
engineStore.subscribe((state) => state.playback.rate, updatePlaybackRates);

function cancelPendingOneShots() {
  for (const cancel of _pendingOneShots) cancel();
}

settingsStore.subscribe(
  (state) => state.audioEnabled,
  (enabled) => {
    if (enabled) return;
    cancelPendingOneShots();
    for (const sound of _managedOneShots) stopAndDetachSound(sound);
  },
);

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

function stopSound(sound: Audio<GainNode | PannerNode>): void {
  try {
    if (sound.isPlaying) sound.stop();
  } catch {
    /* already stopped */
  }
  try {
    sound.disconnect();
  } catch {
    /* already disconnected */
  }
}

/** Stop, untrack and detach a sound from its parent. */
export function stopAndDetachSound(sound: Audio<GainNode | PannerNode>): void {
  untrackSound(sound);
  stopSound(sound);
  _spatialOneShots.delete(sound);
  if (_managedOneShots.delete(sound)) sound.gain.disconnect();
  sound.removeFromParent();
}

/** Start a fresh one-shot and retire it on completion or a failed start. */
export function playManagedOneShot(
  sound: Audio<GainNode | PannerNode>,
  { pitch = 1, onEnd }: { pitch?: number; onEnd?: () => void } = {},
): boolean {
  _managedOneShots.add(sound);
  const baseOnEnded = sound.onEnded.bind(sound);
  sound.onEnded = () => {
    baseOnEnded();
    stopAndDetachSound(sound);
    onEnd?.();
  };
  try {
    sound.setPlaybackRate(getEffectiveSoundRate(pitch));
    sound.play();
    trackSound(sound, pitch);
    return true;
  } catch {
    stopAndDetachSound(sound);
    return false;
  }
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
  cancelPendingOneShots();
  for (const [sound] of _activeSounds) {
    // Loop owners keep their nodes attached so they can restart.
    if (_managedOneShots.has(sound)) stopAndDetachSound(sound);
    else stopSound(sound);
  }
  _activeSounds.clear();
}

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
// World effects quickly lose their connection to the action once triggered.
const ONE_SHOT_START_DEADLINE_MS = 500;
const _listenerPos = new Vector3();
const _soundPos = new Vector3();

interface OneShotOwner {
  /** Retires the pending start when its view is disposed. */
  signal: AbortSignal;
  /** Revalidates the source when a decode completes. */
  canStart?: () => boolean;
}

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
  audioLoader: AudioBufferLoader,
  position?: Vector3,
  parent?: Object3D,
  owner?: OneShotOwner,
): void {
  const signal = owner?.signal;
  if (
    signal?.aborted ||
    !settingsStore.getState().audioEnabled ||
    !audioContextRunning(audioListener)
  )
    return;
  const deadline = performance.now() + ONE_SHOT_START_DEADLINE_MS;
  let url: string;
  try {
    url = audioToUrl(resolved.filename);
  } catch {
    // File not in manifest — skip silently.
    return;
  }
  const spatialParent = resolved.is3D ? parent : undefined;
  const withinBudgetAndRange = () => {
    if (!spatialParent) return true;
    if (_spatialOneShots.size >= MAX_ONE_SHOTS) return false;
    audioListener.getWorldPosition(_listenerPos);
    if (position) spatialParent.localToWorld(_soundPos.copy(position));
    else spatialParent.getWorldPosition(_soundPos);
    return _soundPos.distanceTo(_listenerPos) <= resolved.maxDist;
  };
  if (!withinBudgetAndRange()) return;

  const { recording, seekNonce } = engineStore.getState().playback;
  const revision = recording?.streamingPlayback?.playbackRevision;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined = undefined;
  const settle = () => {
    if (!_pendingOneShots.delete(settle)) return false;
    signal?.removeEventListener("abort", settle);
    clearTimeout(timer);
    unsubscribe?.();
    return true;
  };
  const start = (buffer: AudioBuffer) => {
    if (!settle()) return;
    const current = engineStore.getState().playback;
    if (
      performance.now() >= deadline ||
      signal?.aborted ||
      owner?.canStart?.() === false ||
      !settingsStore.getState().audioEnabled ||
      current.recording !== recording ||
      current.seekNonce !== seekNonce ||
      recording?.streamingPlayback?.playbackRevision !== revision ||
      (recording && current.status !== "playing") ||
      !audioContextRunning(audioListener) ||
      !withinBudgetAndRange()
    )
      return;

    const sound = spatialParent
      ? createPositionalAudio(audioListener, resolved)
      : new Audio(audioListener).setVolume(resolved.volume);
    sound.setBuffer(buffer);
    if (spatialParent) {
      if (position) sound.position.copy(position);
      spatialParent.add(sound);
    }
    if (playManagedOneShot(sound) && spatialParent) _spatialOneShots.add(sound);
  };

  _pendingOneShots.add(settle);
  try {
    unsubscribe = getCachedAudioBuffer(url, audioLoader, start, settle);
  } catch {
    settle();
    return;
  }
  // A cache hit can settle the request before the loader returns.
  if (!_pendingOneShots.has(settle)) {
    unsubscribe?.();
    return;
  }
  if (signal?.aborted) {
    settle();
    return;
  }
  signal?.addEventListener("abort", settle, { once: true });
  timer = setTimeout(settle, Math.max(0, deadline - performance.now()));
}
