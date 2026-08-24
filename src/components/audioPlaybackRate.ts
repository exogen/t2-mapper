import { engineStore } from "../state/engineStore";

/** Whether to adjust audio pitch to match playback speed. When false, sounds
 * play at their original pitch regardless of fast-forward/slow-motion. */
let _adjustAudioSpeed = true;

type FlagChangeListener = (value: boolean) => void;
const _listeners: FlagChangeListener[] = [];

export function setAdjustAudioSpeedFlag(value: boolean): void {
  _adjustAudioSpeed = value;
  for (const listener of _listeners) {
    listener(value);
  }
}

export function getAdjustAudioSpeed(): boolean {
  return _adjustAudioSpeed;
}

/** Register a callback for when the adjustAudioSpeed flag changes. */
export function onAdjustAudioSpeedChange(listener: FlagChangeListener): void {
  _listeners.push(listener);
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
  const shift = _adjustAudioSpeed
    ? Math.min(MAX_PITCH_RATE, Math.max(MIN_PITCH_RATE, rate))
    : 1;
  return basePitch * shift;
}
