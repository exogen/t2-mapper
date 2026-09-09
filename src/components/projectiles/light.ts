import { Color, Vector3 } from "three";
import type { Object3D } from "three";
import {
  addEffectLight,
  removeEffectLight,
  type EffectLight,
} from "../effectLights";
import type { EffectLightConfig } from "../useEffectLight";

export function projectileLight(anchor: Object3D, config?: EffectLightConfig) {
  const light: EffectLight | undefined = config
    ? {
        anchor,
        offset: config.offset?.clone() ?? new Vector3(),
        position: new Vector3(),
        color: new Color(config.color.r, config.color.g, config.color.b),
        intensity: 1,
        radius: config.radius,
      }
    : undefined;
  return {
    light,
    acquire() {
      if (light) {
        light.intensity = 1;
        addEffectLight(light);
      }
    },
    release() {
      if (light) {
        light.intensity = 0;
        removeEffectLight(light);
      }
    },
  };
}
