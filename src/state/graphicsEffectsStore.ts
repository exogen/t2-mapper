import { createStore } from "zustand/vanilla";
import {
  GRAPHICS_EFFECT_KEYS,
  type ClipGraphicsEffects,
  type ColorGrade,
  type GraphicsEffect,
} from "../graphicsEffects";

export type GraphicsEffects = Record<GraphicsEffect, boolean> & {
  enabled: boolean;
  colorGrade: ColorGrade;
  gradeIntensity: number;
  gradeStatus: "idle" | "loading" | "error";
  awaitingFirstFrame: boolean;
  intensity: Record<GraphicsEffect, number>;
};

/** Graphics experiments last for the current page load. */
export const graphicsEffectsStore = createStore<GraphicsEffects>(() => ({
  enabled: true,
  colorGrade: "off",
  gradeIntensity: 1,
  gradeStatus: "idle",
  awaitingFirstFrame: false,
  bloom: false,
  tiltShift: false,
  vignette: false,
  grain: false,
  scanlines: false,
  chromaticAberration: false,
  crtPhosphorMask: false,
  intensity: {
    bloom: 0.5,
    tiltShift: 0.6,
    vignette: 0.8,
    grain: 0.5,
    scanlines: 0.5,
    chromaticAberration: 0.5,
    crtPhosphorMask: 0.5,
  },
}));

export type GraphicsEffectsStore = typeof graphicsEffectsStore;

export function captureClipGraphicsEffects(
  effects: GraphicsEffects,
): ClipGraphicsEffects {
  const intensity: Partial<GraphicsEffects["intensity"]> = {};
  if (!effects.enabled) return { intensity };
  for (const effect of GRAPHICS_EFFECT_KEYS) {
    if (effects[effect] && effects.intensity[effect] > 0)
      intensity[effect] = effects.intensity[effect];
  }
  return {
    intensity,
    ...(effects.colorGrade !== "off" &&
      effects.gradeIntensity > 0 && {
        grade: { name: effects.colorGrade, intensity: effects.gradeIntensity },
      }),
  };
}

export function createClipGraphicsEffectsStore(
  snapshot: ClipGraphicsEffects,
): GraphicsEffectsStore {
  return createStore<GraphicsEffects>(() => {
    const defaults = graphicsEffectsStore.getInitialState();
    const effects = {
      ...defaults,
      colorGrade: snapshot.grade?.name ?? defaults.colorGrade,
      gradeIntensity: snapshot.grade?.intensity ?? defaults.gradeIntensity,
      intensity: { ...defaults.intensity, ...snapshot.intensity },
    };
    for (const key of GRAPHICS_EFFECT_KEYS)
      effects[key] = (snapshot.intensity[key] ?? 0) > 0;
    effects.enabled = hasVisibleGraphicsEffects(effects);
    effects.awaitingFirstFrame = effects.enabled;
    return effects;
  });
}

export function hasSelectedGraphicsEffects(effects: GraphicsEffects): boolean {
  return (
    effects.colorGrade !== "off" ||
    GRAPHICS_EFFECT_KEYS.some((effect) => effects[effect])
  );
}

export function hasVisibleGraphicsEffects(effects: GraphicsEffects): boolean {
  return (
    (effects.colorGrade !== "off" && effects.gradeIntensity > 0) ||
    GRAPHICS_EFFECT_KEYS.some(
      (effect) => effects[effect] && effects.intensity[effect] > 0,
    )
  );
}
