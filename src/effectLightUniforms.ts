/**
 * Dynamic lights on terrain and interiors, the way Tribes2.exe draws them.
 *
 * Neither surface type sees a GL light. TerrainRender::buildLightArray
 * (FUN_005a8290) and InteriorInstance::renderObject (FUN_00522160) take the
 * LightManager's point lights and, per triangle/surface plane, project a
 * disc: with d the light's distance to the plane and R its radius, planes
 * with d < R get an extra pass textured with `special/lightFalloffMono`
 * spanning the in-plane circle of radius sqrt(R² − d²), vertex colour =
 * light colour, alpha = (R − d)/R, GL_MODULATE, glBlendFunc(SRC_ALPHA, ONE)
 * (terrain: FUN_005a2980 + the pass at the end of FUN_005a62c0; interiors:
 * FUN_00518c10). So the framebuffer, already fogged, gains
 * falloff × colour × (R − d)/R in gamma space, with no N·L term. Lights whose
 * projected radius is under DynamicLightsClipPix fade in up to
 * DynamicLightsFadePix (both renderers, folded into the colour).
 *
 * This module holds the uniforms LightPool fills before every render and the
 * GLSL that reproduces the pass per fragment on the plane the fragment lies
 * in (screen-space derivatives give the same per-plane normal the engine
 * projected onto).
 */
import {
  ClampToEdgeWrapping,
  LinearFilter,
  NoColorSpace,
  type Texture,
} from "three";
import { textureToUrl } from "./loaders";
import { loadTexture } from "./textureUtils";

/** Slots match the LightPool size; unused slots carry radius 0. */
export const EFFECT_LIGHT_COUNT = 8;

/** `$pref::*::DynamicLightsClipPix` default: skip lights this small on screen. */
export const DYNAMIC_LIGHTS_CLIP_PIX = 10;
/** `$pref::*::DynamicLightsFadePix` default: full strength from this size up. */
export const DYNAMIC_LIGHTS_FADE_PIX = 20;

export const effectLightUniforms = {
  /** View-space light positions, xyz per slot. */
  effectLightViewPosition: {
    value: new Float32Array(EFFECT_LIGHT_COUNT * 3),
  },
  /** Light colour × pulse, rgb per slot (sRGB values). */
  effectLightColor: { value: new Float32Array(EFFECT_LIGHT_COUNT * 3) },
  /**
   * Screen-size fade per slot (terrain and interiors only; GL lights on
   * shapes are never faded).
   */
  effectLightFade: { value: new Float32Array(EFFECT_LIGHT_COUNT) },
  /** Torque light radius per slot; 0 = slot unused. */
  effectLightRadius: { value: new Float32Array(EFFECT_LIGHT_COUNT) },
  /** `special/lightFalloffMono`: radial ramp, ~0 at the edge, full at centre. */
  effectLightFalloff: { value: null as Texture | null },
};

/**
 * The engine's screen-size gate (TerrainRender::buildLightArray
 * FUN_005a8290, InteriorInstance::renderObject FUN_00522160): a light whose
 * projected radius is at most ClipPix is skipped, one at FadePix or more is
 * full strength, and in between it fades in linearly.
 */
export function dynamicLightScreenFade(projectedRadiusPixels: number): number {
  if (projectedRadiusPixels <= DYNAMIC_LIGHTS_CLIP_PIX) return 0;
  if (projectedRadiusPixels >= DYNAMIC_LIGHTS_FADE_PIX) return 1;
  return (
    1 -
    (DYNAMIC_LIGHTS_FADE_PIX - projectedRadiusPixels) /
      (DYNAMIC_LIGHTS_FADE_PIX - DYNAMIC_LIGHTS_CLIP_PIX)
  );
}

let falloffRequested = false;

/** Loads the falloff texture once; the uniform picks it up when ready. */
export function ensureEffectLightFalloff(): void {
  if (falloffRequested) return;
  falloffRequested = true;
  const texture = loadTexture(textureToUrl("special/lightFalloffMono"));
  // A plain intensity ramp: no colour-space decode, and the edge texel (≈0)
  // is what the engine's clamped texcoords land on beyond the disc.
  texture.colorSpace = NoColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  effectLightUniforms.effectLightFalloff.value = texture;
}

/**
 * Lambert `RE_Direct` stand-in that accumulates nothing, for the point/spot
 * loops of materials that draw dynamic lights with `effectLightsSRGB`
 * instead (see lightsFragmentBeginByType).
 */
export const glslEffectLightIgnoreDirect = `
void RE_Direct_EffectLightIgnore( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {}
`;

/**
 * Declares the uniforms and `effectLightsSRGB(viewPosition)`: the summed
 * gamma-space contribution of every pooled light to the fragment's plane.
 */
export const glslEffectLightsPars = `
#define EFFECT_LIGHT_COUNT ${EFFECT_LIGHT_COUNT}
uniform vec3 effectLightViewPosition[EFFECT_LIGHT_COUNT];
uniform vec3 effectLightColor[EFFECT_LIGHT_COUNT];
uniform float effectLightFade[EFFECT_LIGHT_COUNT];
uniform float effectLightRadius[EFFECT_LIGHT_COUNT];
uniform sampler2D effectLightFalloff;

vec3 effectLightsSRGB(vec3 viewPosition) {
  // The engine projects onto each triangle's own plane.
  vec3 planeNormal = normalize(cross(dFdx(viewPosition), dFdy(viewPosition)));
  vec3 sum = vec3(0.0);
  for (int i = 0; i < EFFECT_LIGHT_COUNT; i++) {
    float radius = effectLightRadius[i];
    if (radius <= 0.0 || effectLightFade[i] <= 0.0) continue;
    vec3 toFragment = viewPosition - effectLightViewPosition[i];
    float alongNormal = dot(planeNormal, toFragment);
    float planeDistance = abs(alongNormal);
    if (planeDistance >= radius) continue;
    float discRadius = sqrt(radius * radius - planeDistance * planeDistance);
    // 0 at the disc centre, 1 at its edge; the texture is radially symmetric,
    // so a diameter of it is the whole falloff.
    float t = length(toFragment - planeNormal * alongNormal) / discRadius;
    if (t >= 1.0) continue;
    float falloff = texture2D(effectLightFalloff, vec2(0.5 + 0.5 * t, 0.5)).r;
    sum += falloff * effectLightColor[i] * effectLightFade[i] * ((radius - planeDistance) / radius);
  }
  return sum;
}
`;

/**
 * Adds the dynamic-light pass to a Lambert-based material: uniforms, the
 * GLSL above (after the material's own lighting declarations), and the
 * additive blend after fog — the engine draws the light polys last, onto the
 * fogged frame, in gamma space, which is where Three's fragment is after
 * `colorspace_fragment` and `fog_fragment`.
 */
export function injectEffectLights(shader: {
  uniforms: Record<string, { value: unknown }>;
  fragmentShader: string;
}): void {
  Object.assign(shader.uniforms, effectLightUniforms);
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_lambert_pars_fragment>",
    `#include <lights_lambert_pars_fragment>
${glslEffectLightIgnoreDirect}
${glslEffectLightsPars}`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <premultiplied_alpha_fragment>",
    `gl_FragColor.rgb = min(gl_FragColor.rgb + effectLightsSRGB(-vViewPosition), 1.0);
#include <premultiplied_alpha_fragment>`,
  );
}
