/**
 * Shape material utilities and shader modifications.
 */

import { Texture } from "three";
import { SHAPE_LIGHTING } from "./lightingConfig";

/**
 * Inject lighting multipliers into a MeshLambertMaterial or MeshBasicMaterial shader.
 * Call this from onBeforeCompile after other shader modifications (e.g., fog).
 */
export function injectShapeLighting(shader: any): void {
  // Add lighting multiplier uniforms
  shader.uniforms.shapeDirectionalFactor = {
    value: SHAPE_LIGHTING.directional,
  };
  shader.uniforms.shapeAmbientFactor = { value: SHAPE_LIGHTING.ambient };

  // Declare uniforms in fragment shader
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>
uniform float shapeDirectionalFactor;
uniform float shapeAmbientFactor;
`,
  );

  // Scale directional and ambient light contributions
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_fragment_end>",
    `#include <lights_fragment_end>
  // Apply shape-specific lighting multipliers
  reflectedLight.directDiffuse *= shapeDirectionalFactor;
  reflectedLight.indirectDiffuse *= shapeAmbientFactor;
`,
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
export function injectShapeEnvMap(
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
  vec3 _eyePos = (modelViewMatrix * vec4(transformed, 1.0)).xyz;
  #ifdef FLAT_SHADED
    vec3 _eyeN = vec3(0.0, 0.0, 1.0);
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
