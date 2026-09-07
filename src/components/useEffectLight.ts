import { useEffect, useRef } from "react";
import { Color, Vector3 } from "three";
import type { Object3D } from "three";
import type { RefObject } from "react";
import {
  addEffectLight,
  removeEffectLight,
  type EffectLight,
} from "./effectLights";

/** A registered light's static description. */
export interface EffectLightConfig {
  radius: number;
  /** sRGB colour (any object with r, g, b — a Three Color qualifies). */
  color: { r: number; g: number; b: number };
  /** Anchor-local position of the light; the anchor origin by default. */
  offset?: Vector3;
}

/**
 * Register a point light on the effect-light registry for as long as
 * `config` is set and the anchor is mounted. The returned ref holds the
 * live light so the owner can drive `intensity` (and `offset`) per
 * frame; it starts at `initialIntensity` — full for a bolt in flight,
 * as Projectile::registerLights has it.
 */
export function useEffectLight(
  anchor: Object3D | RefObject<Object3D | null>,
  config: EffectLightConfig | undefined,
  initialIntensity = 1,
): RefObject<EffectLight | null> {
  const lightRef = useRef<EffectLight | null>(null);
  useEffect(() => {
    const object = isRef(anchor) ? anchor.current : anchor;
    if (!config || !object) return;
    const light: EffectLight = {
      anchor: object,
      offset: config.offset ? config.offset.clone() : new Vector3(),
      position: new Vector3(),
      color: new Color(config.color.r, config.color.g, config.color.b),
      intensity: initialIntensity,
      radius: config.radius,
    };
    addEffectLight(light);
    lightRef.current = light;
    return () => {
      removeEffectLight(light);
      lightRef.current = null;
    };
  }, [anchor, config, initialIntensity]);
  return lightRef;
}

function isRef(
  anchor: Object3D | RefObject<Object3D | null>,
): anchor is RefObject<Object3D | null> {
  return !(anchor as Object3D).isObject3D;
}
