/**
 * Shared GLSL utility functions for Torque-style gamma-space rendering, and
 * helpers for patching three.js shader chunks from onBeforeCompile.
 */
import { createLogger } from "./logger";

const log = createLogger("shaderUtils");

/**
 * The parts of Three's onBeforeCompile shader object that our patches touch.
 */
export type ShaderSource = {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
};

const missingChunks = new Set<string>();

/**
 * Replace the first `#include <chunk>` in `src`. A missing anchor (say,
 * after a three.js chunk rename) leaves `src` unchanged and warns once per
 * chunk name.
 */
export function replaceChunk(src: string, chunk: string, code: string): string {
  const include = `#include <${chunk}>`;
  const index = src.indexOf(include);
  if (index < 0) {
    if (!missingChunks.has(chunk)) {
      missingChunks.add(chunk);
      log.warn("No %s in the shader to patch", include);
    }
    return src;
  }
  return src.slice(0, index) + code + src.slice(index + include.length);
}

/**
 * Insert `code` on the line after the first `#include <chunk>`.
 */
export function insertAfterChunk(
  src: string,
  chunk: string,
  code: string,
): string {
  return replaceChunk(src, chunk, `#include <${chunk}>\n${code}`);
}

/**
 * Insert `code` on the line before the first `#include <chunk>`.
 */
export function insertBeforeChunk(
  src: string,
  chunk: string,
  code: string,
): string {
  return replaceChunk(src, chunk, `${code}\n#include <${chunk}>`);
}

/** sRGB ↔ Linear conversion functions. */
export const glslColorSpace = /* glsl */ `
vec3 torqueLinearToSRGB(vec3 linear) {
  vec3 higher = pow(linear, vec3(1.0/2.4)) * 1.055 - 0.055;
  vec3 lower = linear * 12.92;
  return mix(lower, higher, step(vec3(0.0031308), linear));
}

vec3 torqueSRGBToLinear(vec3 srgb) {
  vec3 higher = pow((srgb + 0.055) / 1.055, vec3(2.4));
  vec3 lower = srgb / 12.92;
  return mix(lower, higher, step(vec3(0.04045), srgb));
}
`;

/** Debug grid overlay using screen-space derivatives. */
export const glslDebugGrid = /* glsl */ `
float torqueDebugGrid(vec2 uv, float gridSize, float lineWidth) {
  vec2 scaledUV = uv * gridSize;
  vec2 grid = abs(fract(scaledUV - 0.5) - 0.5) / fwidth(scaledUV);
  float line = min(grid.x, grid.y);
  return 1.0 - min(line / lineWidth, 1.0);
}
`;
