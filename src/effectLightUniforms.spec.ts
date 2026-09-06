import { describe, expect, it } from "vitest";
import {
  DYNAMIC_LIGHTS_CLIP_PIX,
  DYNAMIC_LIGHTS_FADE_PIX,
  dynamicLightScreenFade,
  effectLightUniforms,
  injectEffectLights,
} from "./effectLightUniforms";

describe("dynamicLightScreenFade", () => {
  it("skips lights at or under the clip size", () => {
    expect(dynamicLightScreenFade(0)).toBe(0);
    expect(dynamicLightScreenFade(DYNAMIC_LIGHTS_CLIP_PIX)).toBe(0);
  });

  it("is full strength from the fade size up", () => {
    expect(dynamicLightScreenFade(DYNAMIC_LIGHTS_FADE_PIX)).toBe(1);
    expect(dynamicLightScreenFade(500)).toBe(1);
  });

  it("fades in linearly between the two", () => {
    const mid = (DYNAMIC_LIGHTS_CLIP_PIX + DYNAMIC_LIGHTS_FADE_PIX) / 2;
    expect(dynamicLightScreenFade(mid)).toBeCloseTo(0.5);
  });
});

describe("injectEffectLights", () => {
  const fragment = `
#include <lights_lambert_pars_fragment>
void main() {
  #include <opaque_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  #include <premultiplied_alpha_fragment>
}`;

  it("shares the pool uniforms and adds the pass after fog", () => {
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      fragmentShader: fragment,
    };
    injectEffectLights(shader);
    expect(shader.uniforms.effectLightRadius).toBe(
      effectLightUniforms.effectLightRadius,
    );
    const add = shader.fragmentShader.indexOf(
      "effectLightsSRGB(-vViewPosition)",
    );
    expect(add).toBeGreaterThan(
      shader.fragmentShader.indexOf("<fog_fragment>"),
    );
    expect(add).toBeLessThan(
      shader.fragmentShader.indexOf("<premultiplied_alpha_fragment>"),
    );
    expect(shader.fragmentShader).toContain("RE_Direct_EffectLightIgnore(");
  });
});
