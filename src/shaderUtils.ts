/**
 * Shared GLSL utility functions for Torque-style gamma-space rendering.
 *
 * Used by terrain and interior materials which both need sRGB↔linear
 * conversion and debug grid overlays.
 */

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
