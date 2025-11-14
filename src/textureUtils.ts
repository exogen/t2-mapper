import {
  DataTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  UnsignedByteType,
} from "three";

export function setupColor(tex, repeat = [1, 1]) {
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.colorSpace = SRGBColorSpace;
  tex.repeat.set(...repeat);
  tex.anisotropy = 16;
  tex.generateMipmaps = true;
  tex.minFilter = LinearMipmapLinearFilter;
  tex.magFilter = LinearFilter;

  tex.needsUpdate = true;

  return tex;
}

export function setupMask(data) {
  const tex = new DataTexture(
    data,
    256,
    256,
    RedFormat, // 1 channel
    UnsignedByteType // 8-bit
  );

  // Masks should stay linear
  tex.colorSpace = NoColorSpace;

  // Set tiling / sampling. For NPOT sizes, disable mips or use power-of-two.
  tex.wrapS = tex.wrapT = RepeatWrapping;
  tex.generateMipmaps = false; // if width/height are not powers of two
  tex.minFilter = LinearFilter; // avoid mips if generateMipmaps=false
  tex.magFilter = LinearFilter;

  tex.needsUpdate = true;

  return tex;
}

export function updateTerrainTextureShader({
  shader,
  baseTextures,
  alphaTextures,
  visibilityMask,
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
      value: Math.min(512, { 0: 16, 1: 16, 2: 32, 3: 32, 4: 32, 5: 32 }[i]),
    };
  });

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
${visibilityMask ? "uniform sampler2D visibilityMask;" : ""}
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
  `
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
  diffuseColor.rgb = ${layerCount > 1 ? "blended" : "c0"};
`
  );
}
