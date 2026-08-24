import type { Color, Vector3 } from "three";

/**
 * A dynamic point light contributed by a shape (glowing items, plasma,
 * pulsing flags, …). The owning shape mutates `position` (world space) and
 * `intensity` every frame; LightPool reads the registry and drives a FIXED
 * set of real point lights from it.
 *
 * Why the indirection: rendering one `<pointLight>` per glowing shape makes
 * the scene's point-light count fluctuate, and Three bakes that count into
 * every lit material's shader program — so the count changing forces mass
 * shader recompilation (the mid-demo jitter). A constant-size pool keeps
 * NUM_POINT_LIGHTS fixed, so each material compiles one program and keeps it.
 */
export interface EffectLight {
  /** World-space position, refreshed each frame by the owning shape. */
  position: Vector3;
  /** Light color (shared reference from the shape's light config). */
  color: Color;
  /** Current animated intensity; 0 means "off this frame" (skipped by pool). */
  intensity: number;
  /** Three point-light `distance` (Torque radius × 2). */
  distance: number;
}

const _effectLights = new Set<EffectLight>();

export function addEffectLight(light: EffectLight): void {
  _effectLights.add(light);
}

export function removeEffectLight(light: EffectLight): void {
  _effectLights.delete(light);
}

export function effectLights(): ReadonlySet<EffectLight> {
  return _effectLights;
}
