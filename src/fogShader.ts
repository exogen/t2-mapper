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
 * Fog uniform declarations for fragment shaders.
 * Add this to the top of fragment shaders that need fog.
 */
export const fogUniformsDeclaration = `
#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;

  // Volumetric fog: 3 volumes, 4 floats each
  // [visDist, minHeight, maxHeight, percentage]
  // Note: Per-volume colors not used ($specialFog = false), all fog uses fogColor
  uniform float fogVolumeData[12];
  uniform float cameraHeight;
  uniform bool hasVolumetricFog;
#endif
`;

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
  float dist = vFogDepth;

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

    float deltaY = fragmentHeight - cameraHeight;
    float absDeltaY = abs(deltaY);

    // Determine if we're going up (positive) or down (negative)
    if (absDeltaY > 0.01) {
      // Non-horizontal ray: ray-march through fog volumes
      for (int i = 0; i < 3; i++) {
        int offset = i * 4;
        float volVisDist = fogVolumeData[offset + 0];
        float volMinH = fogVolumeData[offset + 1];
        float volMaxH = fogVolumeData[offset + 2];
        float volPct = fogVolumeData[offset + 3];

        // Skip inactive volumes (visibleDistance = 0)
        if (volVisDist <= 0.0) continue;

        // Calculate fog factor for this volume
        // From Torque: factor = (1 / (volumeVisDist * visFactor)) * percentage
        // where visFactor is smVisibleDistanceMod (a user quality pref, default 1.0)
        // Since we don't have quality settings, we use visFactor = 1.0
        float factor = (1.0 / volVisDist) * volPct;

        // Find ray intersection with this volume's height range
        float rayMinY = min(cameraHeight, fragmentHeight);
        float rayMaxY = max(cameraHeight, fragmentHeight);

        // Check if ray intersects volume height range
        if (rayMinY < volMaxH && rayMaxY > volMinH) {
          float intersectMin = max(rayMinY, volMinH);
          float intersectMax = min(rayMaxY, volMaxH);
          float intersectHeight = intersectMax - intersectMin;

          // Calculate distance traveled through this volume using similar triangles:
          // subDist / dist = intersectHeight / absDeltaY
          float subDist = dist * (intersectHeight / absDeltaY);

          // Accumulate fog: fog += subDist * factor
          volumeFog += subDist * factor;
        }
      }
    } else {
      // Near-horizontal ray: if camera is inside a volume, apply full fog for that volume
      for (int i = 0; i < 3; i++) {
        int offset = i * 4;
        float volVisDist = fogVolumeData[offset + 0];
        float volMinH = fogVolumeData[offset + 1];
        float volMaxH = fogVolumeData[offset + 2];
        float volPct = fogVolumeData[offset + 3];

        if (volVisDist <= 0.0) continue;

        // If camera is inside this volume, apply fog for full distance
        if (cameraHeight >= volMinH && cameraHeight <= volMaxH) {
          float factor = (1.0 / volVisDist) * volPct;
          volumeFog += dist * factor;
        }
      }
    }
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

  // Apply fog using global fogColor (per-volume colors not used in Tribes 2)
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
#endif
`;

/**
 * Vertex shader code to pass world position for fog calculation.
 */
export const fogVertexShader = `
#ifdef USE_FOG
  #define USE_FOG_WORLD_POSITION
  varying vec3 vFogWorldPosition;
#endif
`;

export const fogVertexShaderWorldPos = `
#ifdef USE_FOG
  vFogWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
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
  // Format: [visDist, minH, maxH, percentage] x 3 volumes = 12 floats
  #ifdef USE_VOLUMETRIC_FOG
    uniform float fogVolumeData[12];
    uniform float cameraHeight;
  #endif

  #ifdef USE_FOG_WORLD_POSITION
    varying vec3 vFogWorldPosition;
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
    vFogWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
#endif
`;
}

/**
 * Shared fog shader uniform objects interface.
 * These objects are passed directly to shaders so uniform values can be updated per-frame.
 */
export interface FogShaderUniformObjects {
  fogVolumeData: { value: Float32Array };
  cameraHeight: { value: number };
}

/**
 * Add fog uniforms to a shader via onBeforeCompile.
 * Use this for materials that need custom fog without modifying global chunks.
 *
 * @param shader - The shader object from onBeforeCompile
 * @param fogUniforms - Shared uniform objects (pass the objects, not values)
 */
export function addFogUniformsToShader(
  shader: { uniforms: Record<string, { value: unknown }> },
  fogUniforms: FogShaderUniformObjects,
): void {
  // Pass the uniform objects directly so they stay linked to FogProvider updates
  shader.uniforms.fogVolumeData = fogUniforms.fogVolumeData;
  shader.uniforms.cameraHeight = fogUniforms.cameraHeight;
}

/**
 * Inject custom fog code into a material's shader.
 * Call this in material's onBeforeCompile callback.
 * This enables full volumetric fog support for the material.
 *
 * @param shader - The shader object from onBeforeCompile
 * @param fogUniforms - Shared uniform objects from globalFogUniforms
 */
export function injectCustomFog(
  shader: {
    uniforms: Record<string, { value: unknown }>;
    vertexShader: string;
    fragmentShader: string;
  },
  fogUniforms: FogShaderUniformObjects,
): void {
  // Add uniforms - pass objects directly so they stay linked
  addFogUniformsToShader(shader, fogUniforms);

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
  vFogWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
  );

  // Add volumetric fog uniforms to fragment shader
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <fog_pars_fragment>",
    `#include <fog_pars_fragment>
#ifdef USE_FOG
  #define USE_VOLUMETRIC_FOG
  uniform float fogVolumeData[12];
  uniform float cameraHeight;
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
