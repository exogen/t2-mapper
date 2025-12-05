/**
 * Force field shader material for Tribes 2 ForceFieldBare objects.
 *
 * Tribes 2 rendering (forceFieldBare.cc):
 * - glBlendFunc(GL_SRC_ALPHA, GL_ONE) - additive blending
 * - glTexEnvi(GL_TEXTURE_ENV, GL_TEXTURE_ENV_MODE, GL_MODULATE)
 * - Final: framebuffer += (texture.rgb * fieldColor.rgb) * fieldColor.alpha
 * - Renders 6 separate outward-facing quads with glDisable(GL_CULL_FACE)
 * - Depth test enabled but depth write disabled - back faces can be occluded
 *
 * Differences from engine that affect brightness:
 * 1. In T2, force fields are in doorways with geometry that occludes back faces
 * 2. T2 textures were authored for CRT gamma (~2.2) with no correction
 * 3. BoxGeometry + DoubleSide renders all faces even in empty space
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  ShaderMaterial,
  Texture,
  Vector2,
} from "three";

// Opacity multiplier to compensate for DoubleSide rendering both front and back faces.
// In Tribes 2, back faces were often occluded by surrounding geometry (door frames, walls).
export const OPACITY_FACTOR = 0.5;

// Vertex shader
const vertexShader = `
#include <fog_pars_vertex>

varying vec2 vUv;

void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

// Fragment shader - handles frame animation, UV scrolling, and color tinting
// NOTE: Shader supports up to 5 texture frames (hardcoded samplers)
const fragmentShader = `
#include <fog_pars_fragment>

uniform sampler2D frame0;
uniform sampler2D frame1;
uniform sampler2D frame2;
uniform sampler2D frame3;
uniform sampler2D frame4;
uniform int currentFrame;
uniform float vScroll;
uniform vec2 uvScale;
uniform vec3 tintColor;
uniform float opacity;
uniform float opacityFactor;

varying vec2 vUv;

void main() {
  // Scale and scroll UVs
  vec2 scrolledUv = vec2(vUv.x * uvScale.x, vUv.y * uvScale.y + vScroll);

  // Sample the current frame
  vec4 texColor;
  if (currentFrame == 0) {
    texColor = texture2D(frame0, scrolledUv);
  } else if (currentFrame == 1) {
    texColor = texture2D(frame1, scrolledUv);
  } else if (currentFrame == 2) {
    texColor = texture2D(frame2, scrolledUv);
  } else if (currentFrame == 3) {
    texColor = texture2D(frame3, scrolledUv);
  } else {
    texColor = texture2D(frame4, scrolledUv);
  }

  // Tribes 2 GL_MODULATE: output = texture * vertexColor
  vec3 modulatedColor = texColor.rgb * tintColor;

  // Gamma correction: T2 textures were authored for CRT displays (~2.2 gamma).
  // Converting to linear space makes them appear as they did on those displays.
  // This significantly darkens the colors to match the original look.
  modulatedColor = pow(modulatedColor, vec3(2.2));

  float adjustedOpacity = opacity * opacityFactor;

  gl_FragColor = vec4(modulatedColor, adjustedOpacity);

  // Custom fog for additive blending: fade out rather than blend to fog color.
  // Standard fog (mix toward fogColor) doesn't work with additive blending
  // because we'd still be adding fogColor to the framebuffer.
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor.a *= 1.0 - fogFactor;
  #endif
}
`;

export interface ForceFieldMaterialOptions {
  textures: Texture[];
  scale: [number, number, number];
  umapping: number;
  vmapping: number;
  color: [number, number, number];
  baseTranslucency: number;
}

export function createForceFieldMaterial({
  textures,
  scale,
  umapping,
  vmapping,
  color,
  baseTranslucency,
}: ForceFieldMaterialOptions): ShaderMaterial {
  // UV scale based on the two largest dimensions (force fields are thin planes)
  const dims = [...scale].sort((a, b) => b - a);
  const uvScale = new Vector2(dims[0] * umapping, dims[1] * vmapping);

  // Use first texture as fallback for unused frame slots
  const fallback = textures[0];

  return new ShaderMaterial({
    uniforms: {
      frame0: { value: fallback },
      frame1: { value: textures[1] ?? fallback },
      frame2: { value: textures[2] ?? fallback },
      frame3: { value: textures[3] ?? fallback },
      frame4: { value: textures[4] ?? fallback },
      currentFrame: { value: 0 },
      vScroll: { value: 0 },
      uvScale: { value: uvScale },
      tintColor: { value: new Color(...color) },
      opacity: { value: baseTranslucency },
      opacityFactor: { value: OPACITY_FACTOR },
      // Fog uniforms (Three.js populates from scene fog when fog: true)
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    blending: AdditiveBlending,
    side: DoubleSide,
    depthWrite: false,
    fog: true,
  });
}
