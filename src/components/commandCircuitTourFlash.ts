/**
 * Imperative per-frame channel from the command circuit rig (which owns
 * the tour clock) to the tour visuals: the flash highlight applies
 * `opacity`, and the callout watches `idleTime` to expire itself after
 * the flash ends.
 */
export const tourFlash = {
  opacity: 0,
  /**
   * Seconds since the current target's flash window ended; 0 while the
   * flash is still running (or no tour is active).
   */
  idleTime: 0,
};
