/**
 * Shape material utilities and shader modifications.
 */

import {
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshStandardMaterial,
  AdditiveBlending,
  SubtractiveBlending,
  FrontSide,
  Texture,
} from "three";
import type { Material } from "three";
import {
  effectLightUniforms,
  glslEffectLightIgnoreDirect,
  glslEffectLightsPars,
} from "./effectLightUniforms";
import { injectCustomFog, injectSpriteFog } from "./fogShader";
import { globalFogUniforms } from "./globalFogUniforms";
import { lightsFragmentBeginByType } from "./lightsChunk";
import { glslColorSpace } from "./shaderUtils";
import {
  defaultShapeLightUniforms,
  glslShapeLightingPars,
  shapeSunUniforms,
  type ShapeLightUniforms,
} from "./shapeLighting";

/**
 * Replace Three's Lambert lighting with the engine's (see shapeLighting.ts):
 * the object's probed light set and the pooled point lights, summed and
 * clamped in gamma space, then multiplied into the sRGB texture. Three's
 * own light loops are diverted to a no-op. The per-shape uniforms come
 * from the material (`userData.shapeLight`, attached by the shape), so
 * one shared callback serves every shape and the program cache still
 * matches by function identity.
 */
function injectShapeLighting(material: Material, shader: any): void {
  const shapeLight =
    (material.userData.shapeLight as ShapeLightUniforms | undefined) ??
    defaultShapeLightUniforms;
  Object.assign(
    shader.uniforms,
    shapeLight,
    shapeSunUniforms,
    effectLightUniforms,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>
${glslColorSpace}`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_lambert_pars_fragment>",
    `#include <lights_lambert_pars_fragment>
${glslEffectLightIgnoreDirect}
${glslEffectLightsPars}
${glslShapeLightingPars}`,
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_fragment_begin>",
    lightsFragmentBeginByType({
      directional: "RE_Direct_EffectLightIgnore",
      punctual: "RE_Direct_EffectLightIgnore",
    }),
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <opaque_fragment>",
    `{
  vec3 textureSRGB = torqueLinearToSRGB(diffuseColor.rgb);
  vec3 lightingSRGB = shapeLightingSRGB(normalize(normal), -vViewPosition);
  outgoingLight = torqueSRGBToLinear(clamp(lightingSRGB * textureSRGB, 0.0, 1.0)) + totalEmissiveRadiance;
}
#include <opaque_fragment>`,
  );
}

// ── Environment map reflectivity ──
//
// Tribes 2 uses a 2D sphere map texture (from the sky's .dml file, index 6)
// for shape reflections. The MULTI_1 path (binary-verified via Ghidra) uses
// GL_COMBINE with GL_INTERPOLATE (0x8575):
//   result = envmap * factor + base * (1 - factor)
// where factor = base_texture_alpha * vertexAlpha
//   vertexAlpha = environmentMapAlpha * reflectionAmount (per material)
// The base texture's alpha channel acts as a reflectance mask — bright alpha
// areas show the env map, dark alpha areas keep the base appearance.
// environmentMapAlpha = 1.0 for all game objects.

/**
 * Shared sphere map uniform. Sky component sets the real texture; materials
 * reference this object so updates propagate without recompilation.
 */
export const shapeEnvMapUniforms = {
  shapeEnvMap: { value: null as Texture | null },
  shapeEnvMapActive: { value: false },
  shapeEnvMapDebugUV: { value: false },
};

/** Set the shared shape environment sphere map (called by Sky component). */
export function setShapeEnvMap(texture: Texture): void {
  shapeEnvMapUniforms.shapeEnvMap.value = texture;
  shapeEnvMapUniforms.shapeEnvMapActive.value = true;
}

/** Reset env map (called when Sky unmounts). */
export function resetShapeEnvMap(): void {
  shapeEnvMapUniforms.shapeEnvMap.value = null;
  shapeEnvMapUniforms.shapeEnvMapActive.value = false;
}

/**
 * Inject Tribes 2 environment map reflectivity into a Lambert shader.
 * Uses a 2D sphere map texture with the classic GL_SPHERE_MAP UV formula.
 * Blends envmap color with diffuse based on the base texture's alpha channel.
 */
function injectShapeEnvMap(
  shader: {
    uniforms: Record<string, { value: unknown }>;
    fragmentShader: string;
    vertexShader: string;
  },
  reflectionAmount: number,
): void {
  // Shared uniforms — values update when sky loads, no recompile needed.
  shader.uniforms.shapeEnvMap = shapeEnvMapUniforms.shapeEnvMap;
  shader.uniforms.shapeEnvMapActive = shapeEnvMapUniforms.shapeEnvMapActive;
  shader.uniforms.shapeEnvMapDebugUV = shapeEnvMapUniforms.shapeEnvMapDebugUV;
  shader.uniforms.shapeReflectionAmount = { value: reflectionAmount };

  // Per-vertex sphere map UV computation, matching GL_SPHERE_MAP texgen.
  // GL_SPHERE_MAP computes UVs at vertices and interpolates linearly.
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>
uniform sampler2D shapeEnvMap;
uniform bool shapeEnvMapActive;
uniform float shapeReflectionAmount;
uniform bool shapeEnvMapDebugUV;
varying vec2 vShapeSphereUV;
`,
  );

  shader.vertexShader = shader.vertexShader.replace(
    "#include <common>",
    `#include <common>
varying vec2 vShapeSphereUV;
`,
  );

  // GL_SPHERE_MAP formula adapted for Torque's coordinate system.
  // Torque puts darkToOGLCoord (Z-up to Y-up) in the PROJECTION matrix, so
  // the MODELVIEW (and thus eye space) stays Z-up: X-right, Y-forward, Z-up.
  // Three.js eye space is Y-up: X-right, Y-up, Z-backward.
  // Mapping: torque.x = three.x, torque.y = -three.z, torque.z = three.y
  // The GL_SPHERE_MAP formula in Torque's eye space is:
  //   m = 2*sqrt(rt.x² + rt.y² + (rt.z+1)²), s = rt.x/m+0.5, t = rt.y/m+0.5
  // Substituting Three.js coords:
  //   m = 2*sqrt(r.x² + r.z² + (r.y+1)²), s = r.x/m+0.5, t = -r.z/m+0.5
  shader.vertexShader = shader.vertexShader.replace(
    "#include <fog_vertex>",
    `#include <fog_vertex>
{
  vec3 _eyePos = mvPosition.xyz;
  #ifdef FLAT_SHADED
    vec3 _eyeN = vec3(0.0, 0.0, 1.0);
  #elif defined(USE_SKINNING) || defined(USE_INSTANCING)
    vec3 _eyeN = normalize(transformedNormal);
  #else
    vec3 _eyeN = normalize(normalMatrix * normal);
  #endif
  vec3 _eyeU = normalize(_eyePos);
  vec3 _r = reflect(_eyeU, _eyeN);
  float _m = 2.0 * sqrt(_r.x * _r.x + _r.z * _r.z + (_r.y + 1.0) * (_r.y + 1.0));
  vShapeSphereUV = vec2(_r.x, -_r.z) / _m + 0.5;
}
`,
  );

  // Binary-verified GL_INTERPOLATE (0x8575) with base texture alpha as
  // reflectance mask. The formula is:
  //   result = envmap * factor + base * (1 - factor)
  // where factor = base_alpha * vertexAlpha
  // vertexAlpha = environmentMapAlpha(1.0) * reflectionAmount(per-material)
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <opaque_fragment>",
    `// Tribes 2 sphere-map environment reflections (GL_INTERPOLATE)
if (shapeEnvMapActive && shapeReflectionAmount > 0.0) {
  if (shapeEnvMapDebugUV) {
    outgoingLight = vec3(vShapeSphereUV, 0.0);
  } else {
    vec3 _envColor = texture2D(shapeEnvMap, vShapeSphereUV).rgb;
    #ifdef USE_MAP
      float _baseAlpha = texture2D(map, vMapUv).a;
    #else
      float _baseAlpha = 1.0;
    #endif
    float _factor = _baseAlpha * shapeReflectionAmount;
    // Torque blends in sRGB space (fixed-function pipeline, no gamma).
    // Convert outgoingLight to sRGB, mix with sRGB env map, convert back.
    vec3 _baseSRGB = pow(max(outgoingLight, 0.0), vec3(1.0 / 2.2));
    outgoingLight = pow(mix(_baseSRGB, _envColor, _factor), vec3(2.2));
  }
}
#include <opaque_fragment>`,
  );
}

// ── Shape material creation ──

type SingleMaterial =
  MeshStandardMaterial | MeshBasicMaterial | MeshLambertMaterial;

// The instance renderer accepts only shaders installed here. This describes
// shader compatibility without inspecting callback source or custom properties.
const shapeShaderConfigurations = new WeakMap<
  Material,
  {
    reflectionAmount: number;
    beforeCompile: Material["onBeforeCompile"];
  }
>();
export function getShapeShaderConfiguration(
  material: Material,
  beforeCompile = material.onBeforeCompile,
) {
  const configuration = shapeShaderConfigurations.get(material);
  return configuration?.beforeCompile === beforeCompile
    ? configuration.reflectionAmount
    : undefined;
}

// Stable onBeforeCompile callbacks — using shared function references lets
// Three.js's program cache match by identity rather than toString().
const lambertBeforeCompile: Material["onBeforeCompile"] = function (
  this: Material,
  shader,
) {
  injectCustomFog(shader, globalFogUniforms);
  injectShapeLighting(this, shader);
};

const basicBeforeCompile: Material["onBeforeCompile"] = (shader) => {
  injectCustomFog(shader, globalFogUniforms);
};

const additiveBeforeCompile: Material["onBeforeCompile"] = (shader) => {
  injectCustomFog(shader, globalFogUniforms, { additive: true });
};

/** onBeforeCompile for additive SpriteMaterials (effect billboards). */
export const additiveSpriteBeforeCompile: Material["onBeforeCompile"] = (
  shader,
) => {
  injectSpriteFog(shader, globalFogUniforms, { additive: true });
};

/**
 * Helper to apply volumetric fog and lighting multipliers to a material.
 * When envMapOptions is provided, also injects Tribes 2 env map reflectivity.
 */
export function applyShapeShaderModifications(
  mat: MeshBasicMaterial | MeshLambertMaterial,
  envMapOptions?: { reflectionAmount: number },
): void {
  const additive =
    mat.blending === AdditiveBlending || mat.blending === SubtractiveBlending;
  if (!envMapOptions) {
    mat.onBeforeCompile =
      mat instanceof MeshLambertMaterial
        ? lambertBeforeCompile
        : additive
          ? additiveBeforeCompile
          : basicBeforeCompile;
    shapeShaderConfigurations.set(mat, {
      reflectionAmount: 0,
      beforeCompile: mat.onBeforeCompile,
    });
    return;
  }
  const matType = mat instanceof MeshLambertMaterial ? "lambert" : "basic";
  mat.customProgramCacheKey = () =>
    `shape-envmap-${matType}${additive ? "-additive" : ""}`;
  const { reflectionAmount } = envMapOptions;
  mat.onBeforeCompile = function (this: Material, shader) {
    injectCustomFog(shader, globalFogUniforms, { additive });
    if (this instanceof MeshLambertMaterial) injectShapeLighting(this, shader);
    injectShapeEnvMap(shader, reflectionAmount);
  };
  shapeShaderConfigurations.set(mat, {
    reflectionAmount,
    beforeCompile: mat.onBeforeCompile,
  });
}

export function createMaterialFromFlags(
  baseMaterial: MeshStandardMaterial | MeshLambertMaterial,
  texture: Texture | null,
  flagNames: Set<string>,
  vis: number = 1,
  animated: boolean = false,
  reflectionAmount: number = 0,
): SingleMaterial {
  const isTranslucent = flagNames.has("Translucent");
  const isAdditive = flagNames.has("Additive");
  const isSubtractive = flagNames.has("Subtractive");
  const isSelfIlluminating = flagNames.has("SelfIlluminating");
  // DTS per-object visibility: when vis < 1, the engine sets fadeSet=true which
  // forces the Translucent flag and renders with GL_SRC_ALPHA/GL_ONE_MINUS_SRC_ALPHA.
  // Animated vis also needs transparent materials so opacity can be updated per frame.
  const isFaded = vis < 1 || animated;
  const isBlended = isAdditive || isSubtractive || isTranslucent || isFaded;
  // TSMesh::initMaterials culls back faces; Translucent changes blending and
  // depth writes, not sidedness. Sorted DTS meshes supply their own draw order.
  const baseProps = {
    map: texture,
    vertexColors: baseMaterial.vertexColors,
    side: FrontSide as typeof FrontSide,
    transparent: isBlended,
    depthWrite: !isBlended,
    alphaTest: 0,
    opacity: vis,
  };

  // Env map reflectivity: gated only by NeverEnvMap flag and reflectionAmount
  // (which is 0 when the datablock doesn't have emap=true). Independent of
  // SelfIlluminating/Additive — those affect lighting, not env mapping.
  const enableEnvMap =
    !flagNames.has("NeverEnvMap") && reflectionAmount > 0 && !isFaded;
  const envMapOptions = enableEnvMap ? { reflectionAmount } : undefined;

  // SelfIlluminating or Additive materials are unlit (use MeshBasicMaterial).
  // Additive materials without SelfIlluminating (e.g. explosion shells) must
  // also be unlit, otherwise they render black with no scene lighting.
  if (isSelfIlluminating || isAdditive || isSubtractive) {
    const mat = new MeshBasicMaterial({
      ...baseProps,
      fog: true,
      ...(isAdditive && { blending: AdditiveBlending }),
      ...(isSubtractive && { blending: SubtractiveBlending }),
    });
    applyShapeShaderModifications(mat, envMapOptions);
    return mat;
  }

  const mat = new MeshLambertMaterial({ ...baseProps, reflectivity: 0 });
  applyShapeShaderModifications(mat, envMapOptions);
  return mat;
}
