/**
 * Color parsing utilities for Tribes 2 mission/scene files.
 *
 * Torque (2001) worked in gamma/sRGB space — colors in mission files are
 * specified as they should appear on screen. Three.js expects linear colors
 * for lighting calculations, so convert with SRGBColorSpace or
 * .convertSRGBToLinear() when passing to lit materials.
 */
import { Color, SRGBColorSpace } from "three";
import type { Color3, Color4 } from "./scene/types";

/** Parse a Torque color string ("R G B" or "R G B A", values 0–1) as sRGB. */
export function parseColor(colorString: string | undefined): Color | undefined {
  if (!colorString) return undefined;
  const parts = colorString.split(" ").map((s) => parseFloat(s));
  const [r = 0, g = 0, b = 0] = parts;
  return new Color().setRGB(r, g, b, SRGBColorSpace);
}

/** Parse a Torque color string and convert to linear color space. */
export function parseColorLinear(
  colorString: string | undefined,
): Color | undefined {
  const color = parseColor(colorString);
  return color?.convertSRGBToLinear();
}

/** Parse a Torque color string to a plain {r, g, b} object (raw sRGB). */
export function parseColor3(
  s: string | undefined,
  fallback: Color3 = { r: 0, g: 0, b: 0 },
): Color3 {
  if (!s) return fallback;
  const parts = s.split(" ").map(Number);
  return {
    r: parts[0] ?? fallback.r,
    g: parts[1] ?? fallback.g,
    b: parts[2] ?? fallback.b,
  };
}

/** Parse a Torque color string to a plain {r, g, b, a} object (raw sRGB). */
export function parseColor4(
  s: string | undefined,
  fallback: Color4 = { r: 0.5, g: 0.5, b: 0.5, a: 1 },
): Color4 {
  if (!s) return fallback;
  const parts = s.split(" ").map(Number);
  return {
    r: parts[0] ?? fallback.r,
    g: parts[1] ?? fallback.g,
    b: parts[2] ?? fallback.b,
    a: parts[3] ?? fallback.a,
  };
}

/** Parse a Torque color string to a [r, g, b] tuple (raw sRGB). */
export function parseColorTuple(s: string): [number, number, number] {
  const parts = s.split(" ").map((v) => parseFloat(v));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}
