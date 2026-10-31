import type { AudioLoader } from "three";
import { audioToUrl } from "../loaders";
import { createLogger } from "../logger";
import { getCachedAudioBuffer } from "./audioBuffers";

const log = createLogger("preloadMatchSounds");
const PRELOAD_CONCURRENCY = 4;

// Flag events, Storm/Inferno scores and wins, and generic game over. Other
// sounds stay on demand. Resolve through the manifest just like playback.
export const MATCH_SOUND_PATHS = [
  "fx/misc/flag_snatch.wav",
  "fx/misc/flag_taken.wav",
  "fx/misc/flag_drop.wav",
  "fx/misc/flag_return.wav",
  "fx/misc/flag_capture.wav",
  "fx/misc/flag_lost.wav",
  "fx/misc/hunters_flag_snatch.wav",
  "voice/announcer/ann.stoscores.wav",
  "voice/announcer/ann.infscores.wav",
  "voice/announcer/ann.gameover.wav",
  "voice/announcer/ann.stowins.wav",
  "voice/announcer/ann.infwins.wav",
] as const;

/** Warm the shared decoded cache without blocking rendering or playing audio. */
export function preloadMatchSounds(audioLoader: AudioLoader): () => void {
  let next = 0;
  let cancelled = false;

  const loadNext = () => {
    if (cancelled || next === MATCH_SOUND_PATHS.length) return;
    const path = MATCH_SOUND_PATHS[next++];
    try {
      getCachedAudioBuffer(audioToUrl(path), audioLoader, loadNext, loadNext);
    } catch (error) {
      log.warn("Could not preload %s: %o", path, error);
      loadNext();
    }
  };
  for (let i = 0; i < PRELOAD_CONCURRENCY; i++) loadNext();

  return () => {
    // In-flight loads still populate the shared cache and serve other owners.
    cancelled = true;
  };
}
