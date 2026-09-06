/**
 * Force field shader material for Tribes 2 ForceFieldBare objects.
 *
 * Tribes2.exe ForceFieldBare::renderObject (FUN_00676050, binary-verified):
 * - glBlendFunc(GL_SRC_ALPHA, GL_ONE), GL_MODULATE, cull off, depth write
 *   off; six outward quads of the scaled unit box
 * - glColor4f(mix(powerOffColor, color, alpha) blended toward the fog
 *   color by haze, mix(powerOffTranslucency, baseTranslucency, alpha)
 *   × (1 − haze)) where alpha is the open/close fade and
 *   haze is SceneState::getHazeAndFog at the object's origin (distance
 *   haze plus the fog-volume walk, see hazeAndFog)
 * - frame = round(framesPerSec × age) % numFrames, v scrolls by
 *   scrollSpeed × age
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

// Opacity multiplier - set to 1.0 to match Tribes 2's baseTranslucency directly.
// Previously 0.5 to compensate for DoubleSide, but this made force fields too dim.
// Tribes 2 used the full baseTranslucency value even though back faces could render.
export const OPACITY_FACTOR = 1.0;

// Vertex shader
const vertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// Fragment shader - handles frame animation, UV scrolling, and color tinting
// NOTE: Shader supports up to 5 texture frames (hardcoded samplers)
const fragmentShader = `
uniform vec3 fogColor;
uniform float fieldHaze;

uniform sampler2D frame0;
uniform sampler2D frame1;
uniform sampler2D frame2;
uniform sampler2D frame3;
uniform sampler2D frame4;
uniform int currentFrame;
uniform float vScroll;
uniform vec2 uvScale;
uniform vec3 tintColor;
uniform vec3 powerOffColor;
uniform float opacity;
uniform float powerOffOpacity;
uniform float fieldAlpha;
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

  // Open/close fade: color × alpha + powerOffColor × (1 − alpha), same
  // for the translucency.
  vec3 fieldColor = mix(powerOffColor, tintColor, fieldAlpha);
  float translucency = mix(powerOffOpacity, opacity, fieldAlpha) * opacityFactor;

  // Engine haze (ForceFieldBare::renderObject 0x676050): one
  // getHazeAndFog value for the whole object, computed per frame by the
  // component; glColor blends toward the fog color and the alpha is
  // scaled by 1 - haze (the constant at 0x7b9894 is 0), so an additive
  // field fades out into the fog instead of adding the fog colour.
  // The fog color arrives linear while this shader works in the textures'
  // raw sRGB values (sRGBTransferOETF comes from the colorspace chunk
  // Three prepends to every fragment).
  vec3 hazeColor = sRGBTransferOETF(vec4(fogColor, 1.0)).rgb;
  fieldColor = mix(fieldColor, hazeColor, fieldHaze);
  translucency *= 1.0 - fieldHaze;

  // Tribes 2 GL_MODULATE: output = texture * vertexColor
  // No gamma correction - textures use NoColorSpace and values pass through
  // directly to display, matching how WaterBlock handles sRGB textures.
  gl_FragColor = vec4(texColor.rgb * fieldColor, translucency);
}
`;

interface ForceFieldMaterialOptions {
  textures: Texture[];
  scale: [number, number, number];
  umapping: number;
  vmapping: number;
  color: [number, number, number];
  powerOffColor: [number, number, number];
  baseTranslucency: number;
  powerOffTranslucency: number;
}

/** The engine's glColor alpha for a fade position (1 closed, 0 open). */
export function forceFieldTranslucency(
  baseTranslucency: number,
  powerOffTranslucency: number,
  fieldAlpha: number,
): number {
  return (
    baseTranslucency * fieldAlpha + powerOffTranslucency * (1 - fieldAlpha)
  );
}

export function createForceFieldMaterial({
  textures,
  scale,
  umapping,
  vmapping,
  color,
  powerOffColor,
  baseTranslucency,
  powerOffTranslucency,
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
      powerOffColor: { value: new Color(...powerOffColor) },
      opacity: { value: baseTranslucency },
      powerOffOpacity: { value: powerOffTranslucency },
      fieldAlpha: { value: 1 },
      opacityFactor: { value: OPACITY_FACTOR },
      // Three fills these from the scene fog (fog: true) and requires all
      // three to exist; only fogColor is read. The haze itself is the
      // object's getHazeAndFog, set by ForceFieldBare.
      fogColor: { value: new Color() },
      fogNear: { value: 1 },
      fogFar: { value: 2000 },
      fieldHaze: { value: 0 },
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
