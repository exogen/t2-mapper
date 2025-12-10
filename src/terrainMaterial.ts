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

// Terrain and texture dimensions (must match TerrainBlock.tsx constants)
const TERRAIN_SIZE = 256; // Terrain grid size in squares
const LIGHTMAP_SIZE = 512; // Lightmap texture size (2 pixels per terrain square)

// Detail texture tiling factor.
const DETAIL_TILING = 64.0;

// Distance at which detail texture fully fades out (in world units)
const DETAIL_FADE_DISTANCE = 150.0;

// sRGB <-> Linear conversion functions (GLSL)
const colorSpaceFunctions = /* glsl */ `
vec3 terrainLinearToSRGB(vec3 linear) {
  vec3 higher = pow(linear, vec3(1.0/2.4)) * 1.055 - 0.055;
  vec3 lower = linear * 12.92;
  return mix(lower, higher, step(vec3(0.0031308), linear));
}

vec3 terrainSRGBToLinear(vec3 srgb) {
  vec3 higher = pow((srgb + 0.055) / 1.055, vec3(2.4));
  vec3 lower = srgb / 12.92;
  return mix(lower, higher, step(vec3(0.04045), srgb));
}

// Debug grid overlay using screen-space derivatives for sharp, anti-aliased lines
// Returns 1.0 on grid lines, 0.0 elsewhere
float terrainDebugGrid(vec2 uv, float gridSize, float lineWidth) {
  vec2 scaledUV = uv * gridSize;
  vec2 grid = abs(fract(scaledUV - 0.5) - 0.5) / fwidth(scaledUV);
  float line = min(grid.x, grid.y);
  return 1.0 - min(line / lineWidth, 1.0);
}
`;

export function updateTerrainTextureShader({
  shader,
  baseTextures,
  alphaTextures,
  visibilityMask,
  tiling,
  debugMode = false,
  detailTexture = null,
  lightmap = null,
}: {
  shader: any;
  baseTextures: any[];
  alphaTextures: any[];
  visibilityMask: any;
  tiling: Record<number, number>;
  debugMode?: boolean;
  detailTexture?: any;
  lightmap?: any;
}) {
  const layerCount = baseTextures.length;

  baseTextures.forEach((tex, i) => {
    shader.uniforms[`albedo${i}`] = { value: tex };
  });

  alphaTextures.forEach((tex, i) => {
    if (i > 0) {
      shader.uniforms[`mask${i}`] = { value: tex };
    }
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

  // Add debug mode uniform
  shader.uniforms.debugMode = { value: debugMode ? 1.0 : 0.0 };

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
vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    );
  }

  // Declare our uniforms and color space functions at the top of the fragment shader
  shader.fragmentShader =
    `
uniform sampler2D albedo0;
uniform sampler2D albedo1;
uniform sampler2D albedo2;
uniform sampler2D albedo3;
uniform sampler2D albedo4;
uniform sampler2D albedo5;
uniform sampler2D mask1;
uniform sampler2D mask2;
uniform sampler2D mask3;
uniform sampler2D mask4;
uniform sampler2D mask5;
uniform float tiling0;
uniform float tiling1;
uniform float tiling2;
uniform float tiling3;
uniform float tiling4;
uniform float tiling5;
uniform float debugMode;
${visibilityMask ? "uniform sampler2D visibilityMask;" : ""}
${lightmap ? "uniform sampler2D terrainLightmap;" : ""}
${
  detailTexture
    ? `uniform sampler2D detailTexture;
uniform float detailTiling;
uniform float detailFadeDistance;
varying vec3 vTerrainWorldPos;`
    : ""
}

${colorSpaceFunctions}

// Global variable to store shadow factor from RE_Direct for use in output calculation
float terrainShadowFactor = 1.0;
` + shader.fragmentShader;

  if (visibilityMask) {
    const clippingPlaceholder = "#include <clipping_planes_fragment>";
    shader.fragmentShader = shader.fragmentShader.replace(
      clippingPlaceholder,
      `${clippingPlaceholder}
  // Early discard for invisible areas (before fog/lighting)
  float visibility = texture2D(visibilityMask, vMapUv).r;
  if (visibility < 0.5) {
    discard;
  }
  `,
    );
  }

  // Replace the default map sampling block with our layered blend.
  // We rely on vMapUv provided by USE_MAP.
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <map_fragment>",
    `
  // Sample base albedo layers (sRGB textures auto-decoded to linear by Three.js)
  vec2 baseUv = vMapUv;
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

  // Sample linear masks (use R channel)
  // Add +0.5 texel offset: Torque samples alpha at grid corners (integer indices),
  // but GPU linear filtering samples at texel centers. This offset aligns them.
  vec2 alphaUv = baseUv + vec2(0.5 / ${TERRAIN_SIZE}.0);
  float a1 = texture2D(mask1, alphaUv).r;
  ${layerCount > 1 ? `float a2 = texture2D(mask2, alphaUv).r;` : ""}
  ${layerCount > 2 ? `float a3 = texture2D(mask3, alphaUv).r;` : ""}
  ${layerCount > 3 ? `float a4 = texture2D(mask4, alphaUv).r;` : ""}
  ${layerCount > 4 ? `float a5 = texture2D(mask5, alphaUv).r;` : ""}

  // Bottom-up compositing: each mask tells how much the higher layer replaces lower
  ${layerCount > 1 ? `vec3 blended = mix(c0, c1, clamp(a1, 0.0, 1.0));` : ""}
  ${layerCount > 2 ? `blended = mix(blended, c2, clamp(a2, 0.0, 1.0));` : ""}
  ${layerCount > 3 ? `blended = mix(blended, c3, clamp(a3, 0.0, 1.0));` : ""}
  ${layerCount > 4 ? `blended = mix(blended, c4, clamp(a4, 0.0, 1.0));` : ""}
  ${layerCount > 5 ? `blended = mix(blended, c5, clamp(a5, 0.0, 1.0));` : ""}

  // Assign to diffuseColor before lighting
  vec3 textureColor = ${layerCount > 1 ? "blended" : "c0"};

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

    // Override lights_fragment_begin to skip indirect diffuse calculation
    // We'll handle ambient in gamma space
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      `#include <lights_fragment_begin>
// Clear indirect diffuse - we'll compute ambient in gamma space
#if defined( RE_IndirectDiffuse )
  irradiance = vec3(0.0);
#endif
`,
    );

    // Clear the indirect diffuse after lights_fragment_end
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
  // Clear Three.js lighting - we compute everything in gamma space
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
  vec3 textureSRGB = terrainLinearToSRGB(diffuseColor.rgb);

  ${
    lightmap
      ? `
  // Sample terrain lightmap for smooth NdotL
  vec2 lightmapUv = vMapUv + vec2(0.5 / ${LIGHTMAP_SIZE}.0);
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
  outgoingLight = terrainSRGBToLinear(resultSRGB) + totalEmissiveRadiance;
}
#include <opaque_fragment>`,
  );

  // Add debug grid overlay AFTER opaque_fragment sets gl_FragColor
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <tonemapping_fragment>",
    `// Debug mode: overlay green grid matching terrain grid squares (256x256)
if (debugMode > 0.5) {
  float gridIntensity = terrainDebugGrid(vMapUv, 256.0, 1.5);
  vec3 gridColor = vec3(0.0, 0.8, 0.4); // Green
  gl_FragColor.rgb = mix(gl_FragColor.rgb, gridColor, gridIntensity * 0.05);
}

#include <tonemapping_fragment>`,
  );
}
