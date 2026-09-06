/**
 * Custom fog shader code for Tribes 2-style fog rendering.
 *
 * Based on the V12/Torque engine fog system used in Tribes 2 (circa 2001).
 * See Tribes2_Fog_System.md for complete documentation.
 *
 * Implements:
 * - Quadratic distance-based haze (Torque's getHaze formula)
 * - Height-based fog volumes with ray-marching accumulation
 *
 * Key insight from Torque source: Fog volumes ADD fog based on distance
 * traveled through each volume, they don't replace the global fog parameters.
 */

import { ShaderChunk } from "three";

/**
 * Custom fog fragment shader that implements Torque's fog system.
 * Replaces Three.js default fog_fragment chunk.
 *
 * Torque fog algorithm (from sceneState.cc getHazeAndFog):
 *
 * 1. HAZE (distance-based):
 *    - No fog if dist <= fogDistance
 *    - Full fog if dist > visibleDistance
 *    - Otherwise: quadratic curve using formula:
 *      distFactor = (dist - fogDistance) * fogScale - 1.0
 *      haze = 1.0 - distFactor * distFactor
 *      where fogScale = 1.0 / (visibleDistance - fogDistance)
 *
 * 2. FOG VOLUMES (height-based):
 *    - Each volume has a fog factor = (1 / visibleDistance) * percentage
 *    - Ray-march from camera to fragment, accumulating fog through each volume
 *    - Use similar triangles: subDist = dist * (heightInVolume / totalDeltaZ)
 *    - Fog contribution = subDist * factor
 *    - Sum all volume contributions
 *
 * 3. Final fog = clamp(haze + volumeFog, 0, 1)
 */
export const fogFragmentShader = `
#ifdef USE_FOG
  // Check fog enabled uniform - allows toggling without shader recompilation
  #ifdef USE_VOLUMETRIC_FOG
  if (!fogEnabled) {
    // Skip all fog calculations when disabled
  } else {
  #endif

  // Scale distance for fog calculations — makes everything appear closer/further
  // for fog purposes without changing actual geometry positions.
  float dist = vFogDepth / fogDistanceScale;

  // Discard fragments at or beyond visible distance - matches Torque's behavior
  // where objects beyond visibleDistance are not rendered at all.
  // This prevents fully-fogged geometry from showing as silhouettes against
  // the sky's fog-to-sky gradient.
  if (dist >= fogFar) {
    discard;
  }

  // Step 1: Calculate distance-based haze (quadratic falloff)
  // Since we discard at fogFar, haze never reaches 1.0 here
  float haze = 0.0;
  if (dist > fogNear) {
    float fogScale = 1.0 / (fogFar - fogNear);
    float distFactor = (dist - fogNear) * fogScale - 1.0;
    haze = 1.0 - distFactor * distFactor;
  }

  // Step 2: Calculate fog volume contributions
  // Note: Per-volume colors are NOT used in Tribes 2 ($specialFog defaults to false)
  // All fog uses the global fogColor - see Tribes2_Fog_System.md for details
  float volumeFog = 0.0;

  #ifdef USE_VOLUMETRIC_FOG
  {
    #ifdef USE_FOG_WORLD_POSITION
      float fragmentHeight = vFogWorldPosition.y;
    #else
      float fragmentHeight = cameraHeight;
    #endif

    // Tribes2.exe never evaluates volume fog at the exact fragment
    // height: terrain fog is sampled from a 64-row fog texture whose
    // rows are fixed world heights spanning the terrain's height range,
    // bilinearly interpolated (SceneGraph::buildFogTexture, 0x569fc0).
    // Evaluate the fog at the two nearest row heights and blend — exact
    // per-pixel evaluation produces razor-sharp volume boundaries (and
    // a pop when the camera crosses one) that the real engine never
    // shows. Row step 0 (no terrain) falls back to exact evaluation,
    // matching the engine (no fog texture without a terrain).
    float rowT = 0.0;
    float sampleH0 = fragmentHeight;
    float sampleH1 = fragmentHeight;
    if (fogRowStep > 0.0) {
      float rowF = (fragmentHeight - fogRowBase) / fogRowStep;
      float row0 = floor(rowF);
      rowT = rowF - row0;
      sampleH0 = fogRowBase + row0 * fogRowStep;
      sampleH1 = sampleH0 + fogRowStep;
    }

    float fogSamples[2];
    for (int s = 0; s < 2; s++) {
      float sampleHeight = (s == 0) ? sampleH0 : sampleH1;
      float sampleFog = 0.0;
      float deltaY = sampleHeight - cameraHeight;
      float absDeltaY = abs(deltaY);

      if (absDeltaY > 0.01) {
        // Non-horizontal ray: ray-march through fog volumes
        for (int i = 0; i < 3; i++) {
          // [factor, minH, maxH, 0]; factor is Torque's
          // percentage / (visDist * smVisibleDistanceMod), precomputed
          // CPU-side in packFogVolumeData. 0 = inactive volume.
          vec4 vol = fogVolumeData[i];
          if (vol.x <= 0.0) continue;

          // Find ray intersection with this volume's height range
          float rayMinY = min(cameraHeight, sampleHeight);
          float rayMaxY = max(cameraHeight, sampleHeight);

          if (rayMinY < vol.z && rayMaxY > vol.y) {
            float intersectMin = max(rayMinY, vol.y);
            float intersectMax = min(rayMaxY, vol.z);
            float intersectHeight = intersectMax - intersectMin;

            // Distance traveled through this volume (similar triangles):
            // subDist / dist = intersectHeight / absDeltaY
            float subDist = dist * (intersectHeight / absDeltaY);
            sampleFog += subDist * vol.x;
          }
        }
      } else {
        // Near-horizontal ray: if camera is inside a volume, apply full
        // fog for that volume (the engine's partial-band case)
        for (int i = 0; i < 3; i++) {
          vec4 vol = fogVolumeData[i];
          if (vol.x <= 0.0) continue;

          if (cameraHeight >= vol.y && cameraHeight <= vol.z) {
            sampleFog += dist * vol.x;
          }
        }
      }
      // The engine clamps each texel's alpha BEFORE bilinear filtering;
      // mixing raw oversaturated samples would skew blends toward opaque
      // near dense volumes, sharpening boundaries the engine keeps soft.
      fogSamples[s] = min(sampleFog, 1.0);
    }
    volumeFog = mix(fogSamples[0], fogSamples[1], rowT);
  }
  #endif

  // Step 3: Combine haze and volume fog
  // Torque's clamping: if (bandPct + hazePct > 1) hazePct = 1 - bandPct
  // This gives fog volumes priority over haze
  float volPct = min(volumeFog, 1.0);
  float hazePct = haze;
  if (volPct + hazePct > 1.0) {
    hazePct = 1.0 - volPct;
  }
  float fogFactor = hazePct + volPct;

  #ifdef FOG_ADDITIVE
  // An additive surface cannot mix toward the fog colour — that would ADD
  // fog. The engine disables the fog texture stage for Additive/Subtractive
  // materials and scales their alpha by 1 - fog instead (tsMesh.cc; the
  // flare spikes do the same with 1 - haze, FUN_0063e2e0), so they fade out.
  gl_FragColor.rgb *= 1.0 - fogFactor;
  #else
  // Apply fog using global fogColor (per-volume colors not used in Tribes 2)
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif

  #ifdef USE_VOLUMETRIC_FOG
  } // end fogEnabled check
  #endif
#endif
`;

/**
 * Install custom fog shaders globally.
 * Call this once at app startup to replace Three.js default fog.
 */
export function installCustomFogShader(): void {
  // Note: This modifies global shader chunks, affecting all materials
  // For more control, use onBeforeCompile on individual materials

  ShaderChunk.fog_pars_fragment = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif

  // Custom volumetric fog uniforms (only defined when USE_VOLUMETRIC_FOG is set)
  // Per volume: [factor, minH, maxH, 0] (see packFogVolumeData)
  #ifdef USE_VOLUMETRIC_FOG
    uniform vec4 fogVolumeData[3];
    uniform float cameraHeight;
    uniform float fogRowBase;
    uniform float fogRowStep;
  #endif

  #ifdef USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
  #endif

  // Fog distance scale — multiplies all distance-based fog calculations.
  // 1.0 = normal, >1 = less fog. Set by camera tour for distant orbits.
  #ifdef HAS_FOG_DISTANCE_SCALE
    uniform float fogDistanceScale;
  #else
    #define fogDistanceScale 1.0
  #endif

#endif
`;

  ShaderChunk.fog_fragment = fogFragmentShader;

  // Add world position output to vertex shader
  ShaderChunk.fog_pars_vertex = `
#ifdef USE_FOG
  varying float vFogDepth;
  #ifdef USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
  #endif
#endif
`;

  ShaderChunk.fog_vertex = `
#ifdef USE_FOG
  // Use Euclidean distance from camera, not view-space z-depth
  // This ensures fog doesn't change when rotating the camera
  vFogDepth = length(mvPosition.xyz);
  #ifdef USE_FOG_WORLD_POSITION
    vec4 _fogPos2 = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      _fogPos2 = instanceMatrix * _fogPos2;
    #endif
    vFogWorldPosition = (modelMatrix * _fogPos2).xyz;
  #endif
#endif
`;
}

/**
 * Shared fog shader uniform objects interface.
 * These objects are passed directly to shaders so uniform values can be updated per-frame.
 */
interface FogShaderUniformObjects {
  fogVolumeData: { value: Float32Array };
  cameraHeight: { value: number };
  fogEnabled: { value: boolean };
  fogDistanceScale: { value: number };
  fogRowBase: { value: number };
  fogRowStep: { value: number };
}

/**
 * Add fog uniforms to a shader via onBeforeCompile.
 * Use this for materials that need custom fog without modifying global chunks.
 *
 * @param shader - The shader object from onBeforeCompile
 * @param fogUniforms - Shared uniform objects (pass the objects, not values)
 */
function addFogUniformsToShader(
  shader: { uniforms: Record<string, { value: unknown }> },
  fogUniforms: FogShaderUniformObjects,
): void {
  // Pass the uniform objects directly so they stay linked to FogProvider updates
  shader.uniforms.fogVolumeData = fogUniforms.fogVolumeData;
  shader.uniforms.cameraHeight = fogUniforms.cameraHeight;
  shader.uniforms.fogEnabled = fogUniforms.fogEnabled;
  shader.uniforms.fogDistanceScale = fogUniforms.fogDistanceScale;
  shader.uniforms.fogRowBase = fogUniforms.fogRowBase;
  shader.uniforms.fogRowStep = fogUniforms.fogRowStep;
}

/**
 * Inject custom fog code into a material's shader.
 * Call this in material's onBeforeCompile callback.
 * This enables full volumetric fog support for the material.
 *
 * `additive` selects the engine's rule for additively blended surfaces:
 * scale by 1 - fog instead of mixing toward the fog colour.
 */
export function injectCustomFog(
  shader: {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
  },
  fogUniforms: FogShaderUniformObjects,
  options: { additive?: boolean } = {},
): void {
  // Add uniforms - pass objects directly so they stay linked
  addFogUniformsToShader(shader, fogUniforms);
  if (options.additive) {
    shader.fragmentShader = `#define FOG_ADDITIVE\n${shader.fragmentShader}`;
  }

  // Add world position varying to vertex shader
  shader.vertexShader = shader.vertexShader.replace(
    "#include <fog_pars_vertex>",
    `#include <fog_pars_vertex>
#ifdef USE_FOG
  #define USE_FOG_WORLD_POSITION
  #define USE_VOLUMETRIC_FOG
  varying vec3 vFogWorldPosition;
#endif`,
  );

  shader.vertexShader = shader.vertexShader.replace(
    "#include <fog_vertex>",
    `#include <fog_vertex>
#ifdef USE_FOG
  vec4 _fogPos3 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    _fogPos3 = instanceMatrix * _fogPos3;
  #endif
  vFogWorldPosition = (modelMatrix * _fogPos3).xyz;
#endif`,
  );

  // Add volumetric fog uniforms to fragment shader
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <fog_pars_fragment>",
    `#define HAS_FOG_DISTANCE_SCALE
#include <fog_pars_fragment>
#ifdef USE_FOG
  #define USE_VOLUMETRIC_FOG
  uniform vec4 fogVolumeData[3];
  uniform float cameraHeight;
  uniform float fogRowBase;
  uniform float fogRowStep;
  uniform bool fogEnabled;
  #define USE_FOG_WORLD_POSITION
  varying vec3 vFogWorldPosition;
#endif`,
  );

  // Replace fog fragment with custom implementation
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <fog_fragment>",
    fogFragmentShader,
  );
}

/**
 * injectCustomFog for a SpriteMaterial. three's sprite vertex shader has no
 * `transformed`, so the sprite's centre stands in as the fog position. Use
 * `additiveSpriteFog` for additive sprites: three's own fog mixes even the
 * quad's transparent corners toward the fog colour, which additive blending
 * then adds to the scene as a visible square.
 */
export function injectSpriteFog(
  shader: {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
  },
  fogUniforms: FogShaderUniformObjects,
  options: { additive?: boolean } = {},
): void {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <fog_vertex>",
    "vec3 transformed = vec3(0.0);\n#include <fog_vertex>",
  );
  injectCustomFog(shader, fogUniforms, options);
}
