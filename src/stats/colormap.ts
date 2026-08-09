import type { StatsTeamFilter } from "./types";

/**
 * A gradient stop: position t ∈ [0, 1] and sRGB color + alpha (0–255).
 */
export interface LutStop {
  t: number;
  rgba: [number, number, number, number];
}

const LUT_SIZE = 256;

/**
 * Builds a 256-entry RGBA lookup table by linearly interpolating between
 * stops. Level 0 is forced fully transparent so empty cells never tint the
 * map.
 */
export function buildLut(stops: LutStop[]): Uint8Array {
  const lut = new Uint8Array(LUT_SIZE * 4);
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / (LUT_SIZE - 1);
    let lower = sorted[0];
    let upper = sorted[sorted.length - 1];
    for (const stop of sorted) {
      if (stop.t <= t) lower = stop;
      else {
        upper = stop;
        break;
      }
    }
    const span = upper.t - lower.t;
    const mix = span > 0 ? (t - lower.t) / span : 0;
    for (let c = 0; c < 4; c++) {
      lut[i * 4 + c] = Math.round(
        lower.rgba[c] + (upper.rgba[c] - lower.rgba[c]) * mix,
      );
    }
  }
  lut[3] = 0; // level 0 always transparent
  return lut;
}

/**
 * Maps density levels (0–255) through a LUT to an RGBA image.
 */
export function colorize(levels: Uint8Array, lut: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(levels.length * 4);
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i] * 4;
    const o = i * 4;
    rgba[o] = lut[l];
    rgba[o + 1] = lut[l + 1];
    rgba[o + 2] = lut[l + 2];
    rgba[o + 3] = lut[l + 3];
  }
  return rgba;
}

/**
 * Selectable color schemes: "team" uses HEATMAP_PALETTES (switched by the
 * team filter); the rest are standard colormaps applied regardless of team.
 */
export type HeatmapScheme = "team" | "viridis" | "turbo";

/**
 * Opacity ramp shared by the standard colormaps, shaped to match the team
 * palettes: quick rise so low densities read, capped at 220 so terrain
 * stays visible under hotspots.
 */
function alphaAt(t: number): number {
  return t === 0 ? 0 : Math.round(220 * (0.2 + 0.8 * Math.pow(t, 0.7)));
}

/**
 * Spreads hex anchor colors evenly across t ∈ [0, 1] with the shared
 * opacity ramp applied.
 */
function schemeStops(hexes: string[], ts?: number[]): LutStop[] {
  return hexes.map((hex, i): LutStop => {
    const t = ts ? ts[i] : i / (hexes.length - 1);
    const value = parseInt(hex.slice(1), 16);
    return {
      t,
      rgba: [
        (value >> 16) & 0xff,
        (value >> 8) & 0xff,
        value & 0xff,
        alphaAt(t),
      ],
    };
  });
}

/**
 * Standard colormaps, anchored at published control points. Viridis is
 * matplotlib's perceptually uniform, colorblind-safe ramp; Turbo is
 * Google's improved rainbow.
 */
export const HEATMAP_SCHEMES: Record<
  Exclude<HeatmapScheme, "team">,
  LutStop[]
> = {
  // prettier-ignore
  viridis: schemeStops([
    "#440154", "#482878", "#3e4989", "#31688e", "#26828e",
    "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725",
  ]),
  // prettier-ignore
  turbo: schemeStops(
    [
      "#30123b", "#4145ab", "#4675ed", "#39a2fc", "#1bcfd4",
      "#24eca6", "#61fc6c", "#a4fc3b", "#d1e834", "#f3c63a",
      "#fe9b2d", "#f36315", "#d93806", "#b11901", "#7a0402",
    ],
    [0, 0.071, 0.143, 0.214, 0.286, 0.357, 0.429, 0.5, 0.571, 0.643, 0.714, 0.786, 0.857, 0.929, 1],
  ),
};

/**
 * Palettes per team filter, authored in sRGB. "All" is a thermal ramp;
 * team palettes echo Storm blue and Inferno red.
 */
export const HEATMAP_PALETTES: Record<StatsTeamFilter, LutStop[]> = {
  all: [
    { t: 0, rgba: [0, 0, 0, 0] },
    { t: 0.25, rgba: [80, 0, 160, 110] },
    { t: 0.55, rgba: [230, 80, 0, 160] },
    { t: 0.8, rgba: [255, 200, 0, 200] },
    { t: 1, rgba: [255, 255, 220, 220] },
  ],
  1: [
    { t: 0, rgba: [0, 0, 0, 0] },
    { t: 0.3, rgba: [0, 60, 200, 110] },
    { t: 0.65, rgba: [0, 180, 255, 170] },
    { t: 1, rgba: [230, 255, 255, 220] },
  ],
  2: [
    { t: 0, rgba: [0, 0, 0, 0] },
    { t: 0.3, rgba: [150, 10, 0, 110] },
    { t: 0.65, rgba: [255, 120, 0, 170] },
    { t: 1, rgba: [255, 240, 200, 220] },
  ],
};
