/**
 * Terrain material shader modifications.
 * Handles multi-layer texture blending for Tribes 2 terrain rendering.
 */

import { TERRAIN_LIGHTING } from "./lightingConfig";

// Terrain and texture dimensions (must match TerrainBlock.tsx constants)
const TERRAIN_SIZE = 256; // Terrain grid size in squares
const LIGHTMAP_SIZE = 512; // Lightmap texture size (2 pixels per terrain square)

// Texture brightness scale to prevent clipping and preserve shadow visibility
const TEXTURE_BRIGHTNESS_SCALE = 0.7;

// Detail texture tiling factor.
// Torque uses world-space generation: U = worldX * (62.0 / textureWidth)
// For 256px texture across 2048 world units, this gives ~496 repeats mathematically.
// However, this appears visually excessive. Using a moderate multiplier relative
// to base texture tiling (32x) - detail should be finer but not overwhelming.
const DETAIL_TILING = 64.0;

// Distance at which detail texture fully fades out (in world units)
// Torque: zeroDetailDistance = (squareSize * worldToScreenScale) / 64 - squareSize/2
// For squareSize=8 and typical worldToScreenScale (~800), this gives ~96 units.
// Using 150 for a slightly more gradual fade.
const DETAIL_FADE_DISTANCE = 150.0;

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

  // Add terrain lighting multiplier uniforms
  shader.uniforms.terrainDirectionalFactor = {
    value: TERRAIN_LIGHTING.directional,
  };
  shader.uniforms.terrainAmbientFactor = { value: TERRAIN_LIGHTING.ambient };

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

  // Declare our uniforms at the top of the fragment shader
  shader.fragmentShader =
    `
uniform float terrainDirectionalFactor;
uniform float terrainAmbientFactor;
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

// Wireframe edge detection for debug mode
float getWireframe(vec2 uv, float gridSize, float lineWidth) {
  vec2 gridUv = uv * gridSize;
  vec2 grid = abs(fract(gridUv - 0.5) - 0.5);
  vec2 deriv = fwidth(gridUv);
  vec2 edge = smoothstep(vec2(0.0), deriv * lineWidth, grid);
  return 1.0 - min(edge.x, edge.y);
}
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
  // Sample base albedo layers (sRGB textures auto-decoded to linear)
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

  // Apply texture color or debug mode solid gray
  if (debugMode > 0.5) {
    // Solid gray to visualize lighting only (without texture influence)
    diffuseColor.rgb = vec3(0.5);
  } else {
    // Scale texture to prevent clipping, preserving shadow visibility
    diffuseColor.rgb = textureColor * ${TEXTURE_BRIGHTNESS_SCALE};
  }
`,
  );

  // When lightmap is available, replace vertex normal-based lighting with smooth lightmap
  // This eliminates banding by using pre-computed per-pixel NdotL values
  if (lightmap) {
    // Override the RE_Direct_Lambert function to use our lightmap NdotL
    // instead of computing dotNL from vertex normals
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_lambert_pars_fragment>",
      `#include <lights_lambert_pars_fragment>

// Override RE_Direct to use terrain lightmap for smooth NdotL
#undef RE_Direct
void RE_Direct_TerrainLightmap( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {

  // Sample pre-computed terrain lightmap (smooth NdotL values)
  // Add +0.5 texel offset to align GPU texel-center sampling with Torque's corner sampling
  vec2 lightmapUv = vMapUv + vec2(0.5 / ${LIGHTMAP_SIZE}.0);
  float lightmapNdotL = texture2D(terrainLightmap, lightmapUv).r;

  // Use lightmap NdotL instead of dot(geometryNormal, directLight.direction)
  // directLight.color already has shadow factor applied from getShadow()
  // Apply terrain-specific directional intensity multiplier
  vec3 directIrradiance = lightmapNdotL * directLight.color * terrainDirectionalFactor;

  // Debug mode: visualize raw lightmap values (no textures)
  if (debugMode > 0.5) {
    reflectedLight.directDiffuse = directIrradiance;
  } else {
    reflectedLight.directDiffuse += directIrradiance * BRDF_Lambert( material.diffuseColor );
  }
}
#define RE_Direct RE_Direct_TerrainLightmap

`,
    );

    // Override lights_fragment_begin to fix hemisphere light irradiance calculation
    // The default uses geometryNormal which causes banding
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      `#include <lights_fragment_begin>
// Fix: Recalculate irradiance without using vertex normals (causes banding)
// Use flat upward normal for hemisphere/light probe calculations
#if defined( RE_IndirectDiffuse )
{
  vec3 flatNormal = vec3(0.0, 1.0, 0.0);
  irradiance = getAmbientLightIrradiance( ambientLightColor );
  #if defined( USE_LIGHT_PROBES )
    irradiance += getLightProbeIrradiance( lightProbe, flatNormal );
  #endif
  #if ( NUM_HEMI_LIGHTS > 0 )
    for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
      irradiance += getHemisphereLightIrradiance( hemisphereLights[i], flatNormal );
    }
  #endif
}
#endif
`,
    );
  }

  // Scale ambient/indirect lighting to darken shadows on terrain
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_fragment_end>",
    `#include <lights_fragment_end>
  // Scale indirect (ambient) light to increase shadow contrast on terrain
  reflectedLight.indirectDiffuse *= terrainAmbientFactor;
`,
  );
}
