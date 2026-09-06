import { Vector3 } from "three";
import { injectEffectLights } from "./effectLightUniforms";
import { lightsFragmentBeginByType } from "./lightsChunk";
import { glslColorSpace, glslDebugGrid } from "./shaderUtils";

/**
 * Interior material shader modifications for MeshLambertMaterial.
 *
 * Matches Torque's rendering formula (sceneLighting.cc + interiorRender.cc):
 *   output = clamp(lighting × texture, 0, 1)
 *
 * Where:
 *   - Outside surfaces: lighting = clamp(clamp(scene_lighting) + lightmap)
 *   - Inside surfaces:  lighting = lightmap
 *   - scene_lighting = sun_color × N·L + ambient_color
 *   - All operations in sRGB/gamma space
 *
 * Key insights from Torque source:
 * 1. Scene lighting is clamped to [0,1] BEFORE adding to lightmap (line 1785)
 * 2. The sum is clamped per-channel to [0,1] (lines 1817-1827)
 * 3. Mission sun/ambient colors ARE sRGB values - Torque used them directly
 *    in gamma space math. When we pass them to Three.js (which interprets them
 *    as linear), the numerical values are preserved, so extracted lighting
 *    gives us the sRGB values we need - NO conversion required.
 *
 * We only convert:
 * - Texture: linearToSRGB (Three.js decoded from sRGB)
 * - Lightmap: linearToSRGB (Three.js decoded from sRGB)
 * - Result: sRGBToLinear (Three.js expects linear output)
 */

export type InteriorLightingOptions = {
  surfaceOutsideVisible?: boolean;
  /**
   * Lambert (lit) material: gets the engine's projected falloff-disc pass for
   * dynamic lights. Self-illuminating surfaces use MeshBasicMaterial and
   * skip it.
   */
  dynamicLights?: boolean;
};

export function injectInteriorLighting(
  shader: any,
  options: InteriorLightingOptions,
): void {
  const isOutsideVisible = options.surfaceOutsideVisible ?? false;

  // Outside surfaces: scene lighting + lightmap
  // Inside surfaces: lightmap only (no scene lighting)
  shader.uniforms.useSceneLighting = { value: isOutsideVisible };

  // Debug color: blue for outside visible, red for inside
  // Only used when DEBUG_MODE define is set
  shader.uniforms.interiorDebugColor = {
    value: isOutsideVisible
      ? new Vector3(0.0, 0.4, 1.0)
      : new Vector3(1.0, 0.2, 0.0),
  };

  // Add color space functions and uniform
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>
${glslColorSpace}
${glslDebugGrid}
uniform bool useSceneLighting;
uniform vec3 interiorDebugColor;
`,
  );

  // The sun (directional loop) keeps the stock Lambert RE_Direct for the
  // gamma-space extraction below; the point/spot loops are diverted to a
  // no-op, since dynamic lights are the engine's projected falloff-disc
  // pass added after fog (injectEffectLights).
  if (options.dynamicLights) {
    injectEffectLights(shader);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      lightsFragmentBeginByType({ punctual: "RE_Direct_EffectLightIgnore" }),
    );
  }

  // Disable default lightmap handling - we'll handle it in the output.
  // Since three r183, MeshLambertMaterial DOES apply IBL when
  // scene.environment is set — we never set it, so only the lightmap
  // texel matters here. Don't set scene.environment without revisiting.
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_fragment_maps>",
    `// Lightmap handled in custom output calculation
#ifdef USE_LIGHTMAP
  vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
#endif`,
  );

  // Override outgoingLight with Torque-style gamma-space calculation
  // Using #include <opaque_fragment> as a stable replacement target (it consumes outgoingLight)
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <opaque_fragment>",
    `// Torque-style lighting: output = clamp(lighting × texture, 0, 1) in sRGB space
// Get texture in sRGB space (undo Three.js linear decode)
vec3 textureSRGB = torqueLinearToSRGB(diffuseColor.rgb);

// Compute lighting in sRGB space
vec3 lightingSRGB = vec3(0.0);

if (useSceneLighting) {
  // Three.js computed: reflectedLight = lighting × texture_linear / PI
  // Extract pure lighting: lighting = reflectedLight × PI / texture_linear
  vec3 totalLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
  vec3 safeTexLinear = max(diffuseColor.rgb, vec3(0.001));
  vec3 extractedLighting = totalLight * PI / safeTexLinear;
  // NOTE: extractedLighting is ALREADY sRGB values because mission sun/ambient colors
  // are sRGB values (Torque used them directly in gamma space). Three.js treats them
  // as linear but the numerical values are the same. DO NOT convert to sRGB here!
  // IMPORTANT: Torque clamps scene lighting to [0,1] BEFORE adding to lightmap
  // (sceneLighting.cc line 1785: tmp.clamp())
  lightingSRGB = clamp(extractedLighting, 0.0, 1.0);
}

// Add lightmap contribution (for BOTH outside and inside surfaces)
// In Torque, scene lighting is ADDED to lightmaps for outside surfaces at mission load
// (stored in .ml files). Inside surfaces only have base lightmap. Both need lightmap here.
#ifdef USE_LIGHTMAP
  // Lightmap is stored as linear in Three.js (decoded from sRGB texture), convert back
  lightingSRGB += torqueLinearToSRGB(lightMapTexel.rgb);
#endif
// Torque clamps the sum to [0,1] per channel (sceneLighting.cc lines 1817-1827)
lightingSRGB = clamp(lightingSRGB, 0.0, 1.0);

// Torque formula: output = clamp(lighting × texture, 0, 1) in sRGB/gamma space
vec3 resultSRGB = clamp(lightingSRGB * textureSRGB, 0.0, 1.0);

// Convert back to linear for Three.js output pipeline
vec3 resultLinear = torqueSRGBToLinear(resultSRGB);

// Reassign outgoingLight before opaque_fragment consumes it
outgoingLight = resultLinear + totalEmissiveRadiance;

#include <opaque_fragment>`,
  );

  // Add debug grid overlay AFTER opaque_fragment sets gl_FragColor
  // This ensures our debug visualization isn't affected by the Torque lighting calculations
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <tonemapping_fragment>",
    `// Debug mode: overlay colored grid on top of normal rendering
// Blue grid = SurfaceOutsideVisible (receives scene ambient light)
// Red grid = inside surface (no scene ambient light)
#if DEBUG_MODE && defined(USE_MAP)
  // gridSize=4 creates 4x4 grid per UV tile, lineWidth=1.5 is ~1.5 pixels wide
  float gridIntensity = torqueDebugGrid(vMapUv, 4.0, 1.5);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, interiorDebugColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`,
  );
}
