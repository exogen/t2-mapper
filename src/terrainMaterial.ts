/**
 * Terrain material shader modifications.
 * Handles multi-layer texture blending for Tribes 2 terrain rendering.
 */

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
}: {
  shader: any;
  baseTextures: any[];
  alphaTextures: any[];
  visibilityMask: any;
  tiling: Record<number, number>;
  debugMode?: boolean;
  detailTexture?: any;
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
  float a1 = texture2D(mask1, baseUv).r;
  ${layerCount > 1 ? `float a2 = texture2D(mask2, baseUv).r;` : ""}
  ${layerCount > 2 ? `float a3 = texture2D(mask3, baseUv).r;` : ""}
  ${layerCount > 3 ? `float a4 = texture2D(mask4, baseUv).r;` : ""}
  ${layerCount > 4 ? `float a5 = texture2D(mask5, baseUv).r;` : ""}

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

  // Debug mode wireframe handling
  if (debugMode > 0.5) {
    // 256 grid cells across the terrain (matches terrain resolution)
    float wireframe = getWireframe(baseUv, 256.0, 1.0);
    vec3 wireColor = vec3(0.0, 0.8, 0.4); // Green wireframe

    if (gl_FrontFacing) {
      // Front face: show textures with barely visible wireframe overlay
      diffuseColor.rgb = mix(textureColor, wireColor, wireframe * 0.05);
    } else {
      // Back face: show only wireframe, discard non-wireframe pixels
      if (wireframe < 0.1) {
        discard;
      }
      diffuseColor.rgb = mix(vec3(0.0), wireColor, 0.25);
    }
  } else {
    diffuseColor.rgb = textureColor;
  }
`,
  );
}
