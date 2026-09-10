/**
 * Terrain material shader modifications for MeshLambertMaterial.
 *
 * Matches Torque's terrain rendering formula (terrLighting.cc + blender.cc):
 *   output = clamp(lighting × texture, 0, 1)
 *
 * Where:
 *   - lighting = clamp(ambient + NdotL × shadowFactor × sunColor, 0, 1)
 *   - NdotL, terrain self-shadows and building shadows from the baked lightmap
 *   - All operations in sRGB/gamma space
 *
 * Key insights from Torque source (terrLighting.cc:471-483):
 * 1. Lightmap bakes: ambient + max(0, N·L) × sunColor for lit areas
 * 2. Shadowed areas get only ambient
 * 3. Mission sun/ambient colors ARE sRGB values - Torque used them directly
 * 4. Final output = lightmap × texture, all in gamma space
 */

import { Vector2, type Texture } from "three";
import { injectEffectLights } from "./effectLightUniforms";
import { globalSunUniforms } from "./globalSunUniforms";
import { lightsFragmentBeginByType } from "./lightsChunk";
import { glslColorSpace, glslDebugGrid } from "./shaderUtils";
import { TERRAIN_SIZE } from "./terrain";

/** The subset of Three's onBeforeCompile shader object this module touches. */
interface TerrainShader {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

/** TerrainRender::renderBlock (Tribes2.exe 0x5a62c0): texels per world unit. */
export const TERRAIN_DETAIL_TEXELS_PER_UNIT = 62;

export function updateTerrainTextureShader({
  shader,
  baseTextures,
  alphaTextures,
  visibilityMask,
  tiling,
  squareSize,
  detailViewportHeight,
  detailTexture = null,
  lightmap = null,
}: {
  shader: TerrainShader;
  baseTextures: Texture[];
  alphaTextures: Texture[];
  visibilityMask: Texture | null;
  tiling: Record<number, number>;
  squareSize: number;
  detailViewportHeight: { value: number };
  detailTexture?: Texture | null;
  lightmap?: Texture | null;
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

  if (detailTexture) {
    const image = detailTexture.image as { width: number; height: number };
    const blockSize = squareSize * TERRAIN_SIZE;
    shader.uniforms.detailTexture = { value: detailTexture };
    shader.uniforms.detailTiling = {
      value: new Vector2(
        (blockSize * TERRAIN_DETAIL_TEXELS_PER_UNIT) / image.width,
        (blockSize * TERRAIN_DETAIL_TEXELS_PER_UNIT) / image.height,
      ),
    };
    shader.uniforms.terrainSquareSize = { value: squareSize };
    shader.uniforms.detailViewportHeight = detailViewportHeight;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      `#include <common>
uniform float terrainSquareSize;
uniform float detailViewportHeight;
varying float vTerrainDetailFade;
#ifdef USE_FOG
  uniform float fogNear;
  uniform float fogFar;
  uniform bool fogEnabled;
  uniform float fogDistanceScale;
  uniform float cameraHeight;
  uniform vec4 fogVolumeData[3];
#endif`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
// dglProjectRadius(1, 1) uses the physical viewport and projection scale.
float detailDistance = terrainSquareSize * detailViewportHeight * projectionMatrix[1][1] / 128.0
  - floor(terrainSquareSize / 2.0);
float detailVertexDistance = length(mvPosition.xyz);
float detailFade = detailDistance > 0.0
  ? clamp(1.0 - detailVertexDistance / detailDistance, 0.0, 1.0) : 0.0;
#ifdef USE_FOG
  if (fogEnabled) {
    vec4 detailWorldPosition = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      detailWorldPosition = instanceMatrix * detailWorldPosition;
    #endif
    float height = (modelMatrix * detailWorldPosition).y;
    float dist = detailVertexDistance / fogDistanceScale;
    float haze = dist >= fogFar ? 1.0 : 0.0;
    if (dist > fogNear && dist < fogFar) {
      float f = (dist - fogNear) / (fogFar - fogNear) - 1.0;
      haze = 1.0 - f * f;
    }
    float deltaHeight = abs(height - cameraHeight);
    for (int i = 0; i < 3; i++) {
      vec4 vol = fogVolumeData[i];
      if (deltaHeight > 0.01) {
        float overlap = max(0.0, min(max(height, cameraHeight), vol.z)
          - max(min(height, cameraHeight), vol.y));
        haze += dist * overlap / deltaHeight * vol.x;
      } else if (cameraHeight >= vol.y && cameraHeight <= vol.z) {
        haze += dist * vol.x;
      }
    }
    detailFade *= 1.0 - min(haze, 1.0);
  }
#endif
// The original detail pass interpolates a byte-valued vertex color.
vTerrainDetailFade = floor(detailFade * 255.0 + 0.5) / 255.0;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <premultiplied_alpha_fragment>",
      `// The engine draws detail AFTER fog with DST_COLOR, ONE_MINUS_SRC_ALPHA.
vec4 terrainDetail = texture2D(detailTexture, vTerrainUv * detailTiling);
gl_FragColor.rgb *= terrainDetail.rgb * vTerrainDetailFade
  + vec3(1.0 - terrainDetail.a * vTerrainDetailFade);
#include <premultiplied_alpha_fragment>`,
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
uniform vec2 detailTiling;
varying float vTerrainDetailFade;`
    : ""
}

${glslColorSpace}
${glslDebugGrid}

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
  // Sample stored color values: Torque blends and filters texture bytes in gamma space.
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

  // Preserve the gamma-space blend for the original lightmap multiplication.
  diffuseColor.rgb = blended;
`,
  );

  // Dynamic lights (flags, packs, projectiles) are the engine's projected
  // falloff-disc pass, added after fog; Three's point/spot loops are diverted
  // to a no-op so they never accumulate.
  injectEffectLights(shader);

  // The directional loop is diverted to a no-op: the ground's sun lighting,
  // self-shadowing and building shadows all come from the baked lightmap
  // (terrainLightmap.ts), so there is no runtime shadow to sample.
  if (lightmap) {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      `${lightsFragmentBeginByType({
        directional: "RE_Direct_EffectLightIgnore",
        punctual: "RE_Direct_EffectLightIgnore",
      })}
// Clear indirect diffuse - we'll compute ambient in gamma space
#if defined( RE_IndirectDiffuse )
  irradiance = vec3(0.0);
#endif
`,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      `#include <lights_fragment_end>
  // Clear Three.js lighting - we compute sun/ambient in gamma space
  reflectedLight.directDiffuse = vec3(0.0);
  reflectedLight.indirectDiffuse = vec3(0.0);
`,
    );
  } else {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_begin>",
      lightsFragmentBeginByType({ punctual: "RE_Direct_EffectLightIgnore" }),
    );
  }

  // Replace opaque_fragment with Torque-style gamma-space calculation
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <opaque_fragment>",
    `// Torque-style terrain lighting: output = clamp(lighting × texture, 0, 1) in sRGB space
{
  // Terrain samplers preserve stored color values through blending/filtering.
  vec3 textureSRGB = diffuseColor.rgb;

  ${
    lightmap
      ? `
  // The bake samples texel i at (i + 0.5) texel widths from the block
  // origin, which is exactly where GL puts that texel's centre, so the
  // geometry UV addresses it directly. A half-texel nudge here would slide
  // the whole lightmap off the ground by half a texel — invisible when this
  // texture held only a smooth NdotL, but not now that shadow edges are
  // baked into it.
  float lightmapNdotL = texture2D(terrainLightmap, vTerrainUv).r;

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
  vec3 lightingSRGB = clamp(ambientColorSRGB + lightmapNdotL * sunColorSRGB, 0.0, 1.0);
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
