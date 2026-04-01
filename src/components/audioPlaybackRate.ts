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

/** Get the effective playback rate for a sound, respecting the adjustAudioSpeed setting. */
export function getEffectiveSoundRate(basePitch = 1): number {
  const rate = engineStore.getState().playback.rate;
  return basePitch * (_adjustAudioSpeed ? rate : 1);
}
