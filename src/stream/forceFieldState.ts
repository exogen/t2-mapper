/**
 * ForceFieldBare open/close state, verified against Tribes2.exe
 * (build 25034). The server ghosts a state and a position along the
 * fade (FUN_00676d30: Closed → 0, Open → fadeMS, Opening/Closing → the
 * wire value); the client then walks the position one tick at a time
 * (FUN_006769a0) and renders alpha = 1 − position / fadeMS
 * (FUN_00676b70), blending color → powerOffColor and baseTranslucency →
 * powerOffTranslucency as the field opens (FUN_00676050). Anything but
 * Open collides (castRay FUN_00676900).
 */

export const ForceFieldState = {
  Open: 0,
  Opening: 1,
  Closing: 2,
  Closed: 3,
} as const;

const FORCE_FIELD_TICK_MS = 32;

export interface ForceFieldMotion {
  state: number;
  position: number;
}

/**
 * The fade position implied by a ghosted state: the wire only carries
 * one while the field is moving.
 */
export function forceFieldPositionForState(
  state: number,
  wirePosition: number | undefined,
  fadeMS: number,
): number {
  if (state === ForceFieldState.Closed) return 0;
  if (state === ForceFieldState.Open) return fadeMS;
  return wirePosition ?? 0;
}

/**
 * `fieldOpen` for a ghosted state: only a fully open field stops
 * colliding and shows its power-off look.
 */
export function fieldOpenFromState(state: number | undefined) {
  return state === ForceFieldState.Open || undefined;
}

/** One client tick of ForceFieldBare::processTick. */
export function advanceForceField(
  motion: ForceFieldMotion,
  fadeMS: number,
): ForceFieldMotion {
  switch (motion.state) {
    case ForceFieldState.Opening: {
      const position = motion.position + FORCE_FIELD_TICK_MS;
      return position >= fadeMS
        ? { state: ForceFieldState.Open, position: fadeMS }
        : { state: motion.state, position };
    }
    case ForceFieldState.Closing: {
      const position = motion.position - FORCE_FIELD_TICK_MS;
      return position <= 0
        ? { state: ForceFieldState.Closed, position: 0 }
        : { state: motion.state, position };
    }
    default:
      return motion;
  }
}

/** Render alpha: 1 fully closed, 0 fully open. */
export function forceFieldAlpha(motion: ForceFieldMotion, fadeMS: number) {
  if (fadeMS <= 0) {
    return motion.state === ForceFieldState.Open ||
      motion.state === ForceFieldState.Opening
      ? 0
      : 1;
  }
  return Math.max(0, 1 - motion.position / fadeMS);
}
