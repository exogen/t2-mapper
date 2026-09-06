import type { Color, Object3D, Vector3 } from "three";

/**
 * A dynamic point light contributed by a shape (glowing items, plasma,
 * pulsing flags, …). The owning shape mutates `intensity` every frame;
 * LightPool resolves `anchor`/`offset` to a world position right before
 * each render and drives a FIXED set of real point lights (for shapes) and
 * the effectLightUniforms (for terrain and interiors) from the registry.
 *
 * Why the indirection: rendering one `<pointLight>` per glowing shape makes
 * the scene's point-light count fluctuate, and Three bakes that count into
 * every lit material's shader program — so the count changing forces mass
 * shader recompilation (the mid-demo jitter). A constant-size pool keeps
 * NUM_POINT_LIGHTS fixed, so each material compiles one program and keeps it.
 */
export interface EffectLight {
  /** Object the light follows; its matrixWorld places `offset`. */
  anchor: Object3D;
  /** Anchor-local light position (Items: object box centre; projectiles: origin). */
  offset: Vector3;
  /** World position, resolved by LightPool before each render. */
  position: Vector3;
  /** Light color (shared reference from the shape's light config). */
  color: Color;
  /**
   * The engine's light intensity this frame (pulse × fade, 0–1); 0 means
   * "off this frame" (skipped by pool).
   */
  intensity: number;
  /** Torque light radius. */
  radius: number;
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
