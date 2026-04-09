/**
 * Terrain material shader modifications for MeshLambertMaterial.
 *
 * Matches Torque's terrain rendering formula (terrLighting.cc + blender.cc):
 *   output = clamp(lighting × texture, 0, 1)
 *
 * Where:
 *   - lighting = clamp(ambient + NdotL × shadowFactor × sunColor, 0, 1)
 *   - NdotL and terrain self-shadows from pre-computed lightmap (ray-traced)
 *   - shadowFactor from Three.js real-time shadow maps (for building/object shadows)
 *   - All operations in sRGB/gamma space
 *
 * Key insights from Torque source (terrLighting.cc:471-483):
 * 1. Lightmap bakes: ambient + max(0, N·L) × sunColor for lit areas
 * 2. Shadowed areas get only ambient
 * 3. Mission sun/ambient colors ARE sRGB values - Torque used them directly
 * 4. Final output = lightmap × texture, all in gamma space
 */

import { globalSunUniforms } from "./globalSunUniforms";
import { glslColorSpace, glslDebugGrid } from "./shaderUtils";

// Terrain and texture dimensions (must match TerrainBlock.tsx constants)
const TERRAIN_SIZE = 256; // Terrain grid size in squares
const LIGHTMAP_SIZE = 512; // Lightmap texture size (2 pixels per terrain square)

// Detail texture tiling factor.
const DETAIL_TILING = 64.0;

// Distance at which detail texture fully fades out (in world units)
const DETAIL_FADE_DISTANCE = 150.0;

export function updateTerrainTextureShader({
  shader,
  baseTextures,
  alphaTextures,
  visibilityMask,
  tiling,
  detailTexture = null,
  lightmap = null,
}: {
  shader: any;
  baseTextures: any[];
  alphaTextures: any[];
  visibilityMask: any;
  tiling: Record<number, number>;
  detailTexture?: any;
  lightmap?: any;
}) {
  // Add global sun uniform (shared reference - value updates automatically)
  shader.uniforms.sunLightPointsDown = globalSunUniforms.sunLightPointsDown;
  const layerCount = baseTextures.length;

  baseTextures.forEach((tex, i) => {
    shader.uniforms[`albedo${i}`] = { value: tex };
  });

  // Alpha masks are packed into RGB textures (3 masks per texture).
  const packedMaskCount = alphaTextures.length;
  alphaTextures.forEach((tex, i) => {
    shader.uniforms[`maskPacked${i}`] = { value: tex };
  });

  // Add visibility mask uniform if we have empty squares
  if (visibilityMask) {
    shader.uniforms.visibilityMask = { value: visibilityMask };
  }

  // Add per-texture tiling uniforms
  baseTextures.forEach((tex, i) => {
    shader.uniforms[`tiling${i}`] = {
      value: tiling[i] ?? 32,
    };
  });

  // Add lightmap uniform for smooth per-pixel terrain lighting
  if (lightmap) {
    shader.uniforms.terrainLightmap = { value: lightmap };
  }

  // Add detail texture uniforms
  if (detailTexture) {
    shader.uniforms.detailTexture = { value: detailTexture };
    shader.uniforms.detailTiling = { value: DETAIL_TILING };
    shader.uniforms.detailFadeDistance = { value: DETAIL_FADE_DISTANCE };

    // Add vertex shader code to pass world position to fragment shader
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
varying vec3 vTerrainWorldPos;`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
vec4 _terrainPos = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  _terrainPos = instanceMatrix * _terrainPos;
#endif
vTerrainWorldPos = (modelMatrix * _terrainPos).xyz;`,
    );
  }

  // Provide terrain UVs without setting MeshLambertMaterial.map (which would
  // allocate a texture unit for an unused `map` sampler). The geometry's UV
  // attribute maps [0,1] across each terrain tile.
  shader.vertexShader = shader.vertexShader.replace(
    "#include <common>",
    `#include <common>
varying vec2 vTerrainUv;`,
  );
  shader.vertexShader = shader.vertexShader.replace(
    "#include <uv_vertex>",
    `#include <uv_vertex>
vTerrainUv = uv;`,
  );

  // Declare our uniforms and color space functions at the top of the fragment shader
  shader.fragmentShader =
    `
varying vec2 vTerrainUv;
${Array.from({ length: layerCount }, (_, i) => `uniform sampler2D albedo${i};`).join("\n")}
${Array.from({ length: packedMaskCount }, (_, i) => `uniform sampler2D maskPacked${i};`).join("\n")}
${Array.from({ length: layerCount }, (_, i) => `uniform float tiling${i};`).join("\n")}
${visibilityMask ? "uniform sampler2D visibilityMask;" : ""}
${lightmap ? "uniform sampler2D terrainLightmap;" : ""}
uniform bool sunLightPointsDown;
${
  detailTexture
    ? `uniform sampler2D detailTexture;
uniform float detailTiling;
uniform float detailFadeDistance;
varying vec3 vTerrainWorldPos;`
    : ""
}

${glslColorSpace}
${glslDebugGrid}

// Global variable to store shadow factor from RE_Direct for use in output calculation
float terrainShadowFactor = 1.0;
` + shader.fragmentShader;

  if (visibilityMask) {
    const clippingPlaceholder = "#include <clipping_planes_fragment>";
    shader.fragmentShader = shader.fragmentShader.replace(
      clippingPlaceholder,
      `${clippingPlaceholder}
  // Early discard for invisible areas (before fog/lighting)
  float visibility = texture2D(visibilityMask, vTerrainUv).r;
  if (visibility < 0.5) {
    discard;
  }
  `,
    );
  }

  // Replace the default map sampling block with our layered blend.
  // vTerrainUv is computed from the geometry's UV attribute in the vertex shader.
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <map_fragment>",
    `
  // Sample base albedo layers (sRGB textures auto-decoded to linear by Three.js)
  vec2 baseUv = vTerrainUv;
  vec3 c0 = texture2D(albedo0, baseUv * vec2(tiling0)).rgb;
  ${
    layerCount > 1
      ? `vec3 c1 = texture2D(albedo1, baseUv * vec2(tiling1)).rgb;`
      : ""
  }
  ${
    layerCount > 2
      ? `vec3 c2 = texture2D(albedo2, baseUv * vec2(tiling2)).rgb;`
      : ""
  }
  ${
    layerCount > 3
      ? `vec3 c3 = texture2D(albedo3, baseUv * vec2(tiling3)).rgb;`
      : ""
  }
  ${
    layerCount > 4
      ? `vec3 c4 = texture2D(albedo4, baseUv * vec2(tiling4)).rgb;`
      : ""
  }
  ${
    layerCount > 5
      ? `vec3 c5 = texture2D(albedo5, baseUv * vec2(tiling5)).rgb;`
      : ""
  }

  // Sample alpha masks from packed RGB textures (3 masks per texture).
  // Add +0.5 texel offset: Torque samples alpha at grid corners (integer indices),
  // but GPU linear filtering samples at texel centers. This offset aligns them.
  vec2 alphaUv = baseUv + vec2(0.5 / ${TERRAIN_SIZE}.0);
  vec3 maskRGB0 = texture2D(maskPacked0, alphaUv).rgb;
  float a0 = maskRGB0.r;
  ${layerCount > 1 ? `float a1 = maskRGB0.g;` : ""}
  ${layerCount > 2 ? `float a2 = maskRGB0.b;` : ""}
  ${
    layerCount > 3
      ? `vec3 maskRGB1 = texture2D(maskPacked1, alphaUv).rgb;
  float a3 = maskRGB1.r;`
      : ""
  }
  ${layerCount > 4 ? `float a4 = maskRGB1.g;` : ""}
  ${layerCount > 5 ? `float a5 = maskRGB1.b;` : ""}

  // Torque-style additive weighted blending (blender.cc):
  // result = tex0 * alpha0 + tex1 * alpha1 + tex2 * alpha2 + ...
  // Each layer's alpha map defines its contribution weight.
  vec3 blended = c0 * a0;
  ${layerCount > 1 ? `blended += c1 * a1;` : ""}
  ${layerCount > 2 ? `blended += c2 * a2;` : ""}
  ${layerCount > 3 ? `blended += c3 * a3;` : ""}
  ${layerCount > 4 ? `blended += c4 * a4;` : ""}
  ${layerCount > 5 ? `blended += c5 * a5;` : ""}

  // Assign to diffuseColor before lighting
  vec3 textureColor = blended;

  ${
    detailTexture
      ? `// Detail texture blending (Torque-style multiplicative blend)
  // Sample detail texture at high frequency tiling
  vec3 detailColor = texture2D(detailTexture, baseUv * detailTiling).rgb;

  // Calculate distance-based fade factor using world positions
  // Torque: distFactor = (zeroDetailDistance - distance) / zeroDetailDistance
  float distToCamera = distance(vTerrainWorldPos, cameraPosition);
  float detailFade = clamp(1.0 - distToCamera / detailFadeDistance, 0.0, 1.0);

  // Torque blending: dst * lerp(1.0, detailTexel, fadeFactor)
  // Detail textures are authored with bright values (~0.8 mean), not 0.5 gray
  // Direct multiplication adds subtle darkening for surface detail
  textureColor *= mix(vec3(1.0), detailColor, detailFade);`
      : ""
  }

  // Store blended texture in diffuseColor (still in linear space here)
  // We'll convert to sRGB in the output calculation
  diffuseColor.rgb = textureColor;
`,
  );

  // When lightmap is available, override RE_Direct to extract shadow factor
  // We don't compute lighting here - just capture the shadow for use in output
  if (lightmap) {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_lambert_pars_fragment>",
      `#include <lights_lambert_pars_fragment>

// Override RE_Direct to extract shadow factor for Torque-style gamma-space lighting
#undef RE_Direct
void RE_Direct_TerrainShadow( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  // Torque lighting (terrLighting.cc): if light points up, terrain gets only ambient
  // This prevents shadow acne from light hitting terrain backfaces
  if (!sunLightPointsDown) {
    terrainShadowFactor = 0.0;
    return;
  }
  // directLight.color = sunColor * shadowFactor (shadow already applied by Three.js)
  // Extract shadow factor by comparing to original sun color
  #if ( NUM_DIR_LIGHTS > 0 )
    vec3 originalSunColor = directionalLights[0].color;
    float sunMax = max(max(originalSunColor.r, originalSunColor.g), originalSunColor.b);
    float shadowedMax = max(max(directLight.color.r, directLight.color.g), directLight.color.b);
    terrainShadowFactor = clamp(shadowedMax / max(sunMax, 0.001), 0.0, 1.0);
  #endif
  // Don't add to reflectedLight - we'll compute lighting in gamma space at output
}
#define RE_Direct RE_Direct_TerrainShadow

`,
    );

    // Override lights_fragment_begin: save directDiffuse before lights run,
    // then after lights_fragment_end we can extract the point/spot contribution.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      `vec3 terrainPreLightDirect = reflectedLight.directDiffuse;
#include <lights_fragment_begin>
// Clear indirect diffuse - we'll compute ambient in gamma space
#if defined( RE_IndirectDiffuse )
  irradiance = vec3(0.0);
#endif
`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
  // Extract dynamic point/spot light contribution by subtracting what was
  // there before lights ran. directDiffuse now has sun + point lights;
  // terrainPreLightDirect was 0, so the difference is all lights.
  // We'll subtract the sun part below and keep just the point/spot part.
  vec3 terrainAllLightsLinear = reflectedLight.directDiffuse - terrainPreLightDirect;
  // Clear Three.js lighting - we compute sun/ambient in gamma space
  reflectedLight.directDiffuse = vec3(0.0);
  reflectedLight.indirectDiffuse = vec3(0.0);
`,
    );
  }

  // Replace opaque_fragment with Torque-style gamma-space calculation
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <opaque_fragment>",
    `// Torque-style terrain lighting: output = clamp(lighting × texture, 0, 1) in sRGB space
{
  // Get texture in sRGB space (undo Three.js linear decode)
  vec3 textureSRGB = torqueLinearToSRGB(diffuseColor.rgb);

  ${
    lightmap
      ? `
  // Sample terrain lightmap for smooth NdotL
  vec2 lightmapUv = vTerrainUv + vec2(0.5 / ${LIGHTMAP_SIZE}.0);
  float lightmapNdotL = texture2D(terrainLightmap, lightmapUv).r;

  // Get sun and ambient colors from Three.js lights (these ARE sRGB values from mission file)
  // Three.js interprets them as linear, but the numerical values are preserved
  #if ( NUM_DIR_LIGHTS > 0 )
    vec3 sunColorSRGB = directionalLights[0].color;
  #else
    vec3 sunColorSRGB = vec3(0.7);
  #endif
  vec3 ambientColorSRGB = ambientLightColor;

  // Torque formula (terrLighting.cc:471-483):
  // lighting = ambient + NdotL * shadowFactor * sunColor
  // Clamp lighting to [0,1] before multiplying by texture
  vec3 lightingSRGB = clamp(ambientColorSRGB + lightmapNdotL * terrainShadowFactor * sunColorSRGB, 0.0, 1.0);
  `
      : `
  // No lightmap - use simple ambient lighting
  vec3 lightingSRGB = ambientLightColor;
  `
  }

  // Torque formula: output = clamp(lighting × texture, 0, 1) in sRGB/gamma space
  vec3 resultSRGB = clamp(lightingSRGB * textureSRGB, 0.0, 1.0);

  // Convert back to linear for Three.js output pipeline
  outgoingLight = torqueSRGBToLinear(resultSRGB) + totalEmissiveRadiance;
  // Add dynamic point/spot light contributions when present.
  // terrainAllLightsLinear includes both directional + point from Three.js.
  // We only add it when point/spot lights exist to avoid double-counting
  // the sun (already computed in gamma space above). The slight sun
  // double-count when points are active is acceptable — point light
  // intensity dominates near the source.
  #if ( NUM_POINT_LIGHTS > 0 || NUM_SPOT_LIGHTS > 0 )
    outgoingLight += terrainAllLightsLinear;
  #endif
}
#include <opaque_fragment>`,
  );

  // Add debug grid overlay AFTER opaque_fragment sets gl_FragColor
  // Uses #if so material.defines.DEBUG_MODE (0 or 1) can trigger recompilation
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <tonemapping_fragment>",
    `#if DEBUG_MODE
  // Debug mode: overlay green grid matching terrain grid squares (256x256)
  float gridIntensity = torqueDebugGrid(vTerrainUv, 256.0, 1.5);
  vec3 gridColor = vec3(0.0, 0.8, 0.4); // Green
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridIntensity * 0.1);
#endif

#include <tonemapping_fragment>`,
  );
}
