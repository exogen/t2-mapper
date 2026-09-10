import { MathUtils, type AnimationClip, type AnimationMixer } from "three";
import { createDtsThread, destroyDtsThread, scrubDtsThread } from "./dtsThread";

export interface DtsDamageThreads {
  update(health?: number, damageState?: number): void;
  dispose(): void;
}

/** ShapeBase's position-controlled Damage and Visibility (hulk) threads. */
export function createDtsDamageThreads(
  mixer: AnimationMixer,
  clips: Iterable<AnimationClip>,
  kind: "ShapeBase" | "Player" = "ShapeBase",
): DtsDamageThreads | undefined {
  let damageClip: AnimationClip | undefined;
  let hulkClip: AnimationClip | undefined;
  for (const clip of clips) {
    const name = clip.name.toLowerCase();
    if (name === "damage") damageClip = clip;
    else if (name === "visibility") hulkClip = clip;
  }
  if (!damageClip && !hulkClip) return;
  // onNewDataBlock creates Damage before Visibility. Creation order breaks
  // ties when equally prioritized native sequences address the same decal.
  const damage = damageClip
    ? createDtsThread(mixer.clipAction(damageClip), false)
    : undefined;
  const hulk = hulkClip
    ? createDtsThread(mixer.clipAction(hulkClip), false)
    : undefined;
  return {
    update(health = 1, damageState = 0) {
      // Ghost damage is normalized; maxDamage and destroyedLevel are not
      // networked and retain their client defaults of 1. ShapeBase's
      // updateDamageLevel (005ea7d0) clears full damage on destruction;
      // Player's override (005d4c40) retains it on corpses.
      const level = MathUtils.clamp(1 - health, 0, 1);
      if (damage)
        scrubDtsThread(
          damage,
          kind !== "Player" && level >= 1 && damageState === 2 ? 0 : level,
        );
      if (hulk) scrubDtsThread(hulk, damageState === 2 ? 1 : 0);
    },
    dispose() {
      if (damage) destroyDtsThread(damage);
      if (hulk) destroyDtsThread(hulk);
    },
  };
}
