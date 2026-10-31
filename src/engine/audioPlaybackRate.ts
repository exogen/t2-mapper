import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";

/** Register a callback for when the adjustAudioSpeed setting changes. */
export function onAdjustAudioSpeedChange(
  listener: (value: boolean) => void,
): () => void {
  return settingsStore.subscribe((state) => state.adjustAudioSpeed, listener);
}

/**
 * Pitch-shift clamp for demo speed. The game's WAVs are low-sample-rate
 * (11–22 kHz); resampling them up 3–4× at fast-forward aliases audibly
 * ("sandpaper"), and below 0.5× they turn to growl. Cap the shift while
 * playback speed continues past it.
 */
const MIN_PITCH_RATE = 0.5;
const MAX_PITCH_RATE = 2;

/** Get the effective playback rate for a sound, respecting the adjustAudioSpeed setting. */
export function getEffectiveSoundRate(basePitch = 1): number {
  const rate = engineStore.getState().playback.rate;
  const shift = settingsStore.getState().adjustAudioSpeed
    ? Math.min(MAX_PITCH_RATE, Math.max(MIN_PITCH_RATE, rate))
    : 1;
  return basePitch * shift;
}
