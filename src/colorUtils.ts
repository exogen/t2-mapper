/**
 * Color parsing utilities for Tribes 2 mission files.
 *
 * Torque (2001) worked in gamma/sRGB space - colors in mission files are
 * specified as they should appear on screen. Three.js expects linear colors
 * for lighting calculations, so convert with .convertSRGBToLinear() when
 * passing to lit materials.
 */
import { Color, SRGBColorSpace } from "three";

/**
 * Parse a Tribes 2 color string (space-separated RGB or RGBA values 0-1).
 * The values are interpreted as sRGB and stored as linear internally by Three.js.
 *
 * @param colorString - Space-separated "R G B" or "R G B A" string (0-1 range)
 * @returns Color (linear internally), or undefined if no string
 */
export function parseColor(colorString: string | undefined): Color | undefined {
  if (!colorString) return undefined;
  const parts = colorString.split(" ").map((s) => parseFloat(s));
  const [r = 0, g = 0, b = 0] = parts;
  // Interpret as sRGB, Three.js converts to linear internally
  return new Color().setRGB(r, g, b, SRGBColorSpace);
}

/**
 * Parse a Tribes 2 color string and convert to linear color space.
 * Use this when passing colors to Three.js lit materials.
 *
 * @param colorString - Space-separated "R G B" or "R G B A" string (0-1 range)
 * @returns Color in linear space, or undefined if no string
 */
export function parseColorLinear(
  colorString: string | undefined,
): Color | undefined {
  const color = parseColor(colorString);
  return color?.convertSRGBToLinear();
}
