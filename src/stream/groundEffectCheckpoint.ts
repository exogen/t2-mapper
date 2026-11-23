import type { GroundEffectFrame } from "./groundEffectQueue";

/** Kept in v24 checkpoints so older clients can read newly generated anchors.
 * Ground effects are forward-only presentation; saved actor frames are ignored.
 * Debris, projectile trails and lightning have separate replay policies. */
export const emptyGroundEffectState: {
  frames: readonly GroundEffectFrame[];
  retentionSec: number;
} = Object.freeze({ frames: Object.freeze([]), retentionSec: 8 });
