import { Audio } from "three";
import { audioToUrl } from "../loaders";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { streamClock } from "../state/streamPlaybackStore";
import { getCachedAudioBuffer } from "./audioBuffers";
import type { AudioGraph } from "./audioGraph";
import { FramePriority } from "./framePriority";
import type { GameEngine } from "./gameEngine";
import { sampleMissileLockView } from "./missileLockView";
import {
  audioContextRunning,
  getEffectiveSoundRate,
  getSoundGeneration,
  stopAndDetachSound,
  trackSound,
} from "./soundEffects";
import { combineCleanups, reaction } from "./storeReaction";

function createLockTone(filename: string, audio: AudioGraph) {
  let buffer: AudioBuffer | undefined;
  let sound: Audio | undefined;
  try {
    getCachedAudioBuffer(audioToUrl(filename), audio.audioLoader, (loaded) => {
      buffer = loaded;
    });
  } catch {
    // An unavailable asset should not prevent stream playback.
  }

  return {
    get playing() {
      return sound?.isPlaying === true;
    },
    update(wanted: boolean) {
      if (!wanted) {
        if (sound?.isPlaying) stopAndDetachSound(sound);
        return;
      }
      if (
        !buffer ||
        sound?.isPlaying ||
        !audioContextRunning(audio.audioListener)
      )
        return;
      try {
        if (!sound) {
          sound = new Audio(audio.audioListener);
          sound.setBuffer(buffer);
          sound.setLoop(true);
        }
        sound.setPlaybackRate(getEffectiveSoundRate());
        sound.play();
        trackSound(sound);
      } catch {
        if (sound) stopAndDetachSound(sound);
      }
    },
    dispose() {
      if (!sound) return;
      stopAndDetachSound(sound);
      sound.gain.disconnect();
    },
  };
}

function startLockAudio(engine: GameEngine, audio: AudioGraph): () => void {
  const searching = createLockTone(
    "fx/weapons/missile_firer_search.wav",
    audio,
  );
  const locked = createLockTone("fx/weapons/missile_firer_lock.wav", audio);
  const warning = createLockTone("fx/weapons/missile_target_lock.wav", audio);
  const homing = createLockTone("fx/weapons/missile_target_inbound.wav", audio);
  const tones = [searching, locked, warning, homing];
  let previousSubject: string | undefined;
  let wasWarned = false;
  let previousGeneration = getSoundGeneration();

  return combineCleanups(
    () => {
      for (const tone of tones) tone.dispose();
    },
    engineStore.subscribe((state, previous) => {
      if (state.playback.seekNonce !== previous.playback.seekNonce) {
        previousSubject = undefined;
        wasWarned = false;
      }
      if (
        state.playback.status !== previous.playback.status &&
        state.playback.status !== "playing"
      )
        for (const tone of tones) tone.update(false);
    }),
    engine.scheduler.add(FramePriority.PostCamera, () => {
      if (engineStore.getState().playback.status !== "playing") return;
      const view = streamClock.worldPaused
        ? undefined
        : sampleMissileLockView(engine);
      const generation = getSoundGeneration();
      // Retail won't start a lock warning under an inbound tone, but an
      // existing warning keeps playing until the lock itself clears.
      const wantWarning =
        !!view?.incomingLock &&
        (!view.inbound ||
          (wasWarned &&
            view.subjectId === previousSubject &&
            generation === previousGeneration));
      previousSubject = view?.subjectId;
      previousGeneration = generation;

      const outgoing = view?.outgoing?.kind;
      searching.update(outgoing === "tracking" || outgoing === "targeting");
      locked.update(outgoing === "locked");
      warning.update(wantWarning);
      wasWarned = warning.playing;
      homing.update(!!view?.inbound);
    }),
  );
}

/** Play the stock client-local missile warnings through the game's audio mix. */
export function installMissileLockAudio(
  engine: GameEngine,
  audio: AudioGraph,
): () => void {
  return reaction(
    settingsStore,
    (state) => state.audioEnabled,
    (enabled) =>
      enabled
        ? reaction(
            engineStore,
            (state) => state.playback.recording,
            (recording) =>
              recording ? startLockAudio(engine, audio) : undefined,
          )
        : undefined,
  );
}
