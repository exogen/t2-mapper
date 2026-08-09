import { describe, it, expect } from "vitest";
import { buildLut, colorize, HEATMAP_SCHEMES } from "./colormap";
import type { LutStop } from "./colormap";

const STOPS: LutStop[] = [
  { t: 0, rgba: [0, 0, 0, 0] },
  { t: 1, rgba: [255, 255, 255, 200] },
];

describe("buildLut", () => {
  it("hits the stop colors at the endpoints", () => {
    const lut = buildLut(STOPS);
    expect([lut[0], lut[1], lut[2], lut[3]]).toEqual([0, 0, 0, 0]);
    const last = 255 * 4;
    expect([lut[last], lut[last + 1], lut[last + 2], lut[last + 3]]).toEqual([
      255, 255, 255, 200,
    ]);
  });

  it("interpolates linearly between stops", () => {
    const lut = buildLut(STOPS);
    const mid = 128 * 4;
    expect(lut[mid]).toBeGreaterThan(120);
    expect(lut[mid]).toBeLessThan(136);
  });

  it("forces level 0 fully transparent even with opaque first stop", () => {
    const lut = buildLut([
      { t: 0, rgba: [255, 0, 0, 255] },
      { t: 1, rgba: [255, 255, 255, 255] },
    ]);
    expect(lut[3]).toBe(0);
  });
});

describe("HEATMAP_SCHEMES", () => {
  it("every scheme spans t 0 to 1 with a transparent start", () => {
    for (const stops of Object.values(HEATMAP_SCHEMES)) {
      expect(stops[0].t).toBe(0);
      expect(stops[0].rgba[3]).toBe(0);
      expect(stops[stops.length - 1].t).toBe(1);
      expect(stops[stops.length - 1].rgba[3]).toBeGreaterThan(0);
      for (let i = 1; i < stops.length; i++) {
        expect(stops[i].t).toBeGreaterThan(stops[i - 1].t);
      }
    }
  });

  it("decodes hex anchors correctly (viridis endpoints)", () => {
    const stops = HEATMAP_SCHEMES.viridis;
    // #440154 → rgb(68, 1, 84); #fde725 → rgb(253, 231, 37)
    expect(stops[0].rgba.slice(0, 3)).toEqual([68, 1, 84]);
    expect(stops[stops.length - 1].rgba.slice(0, 3)).toEqual([253, 231, 37]);
  });
});

describe("colorize", () => {
  it("maps levels through the LUT", () => {
    const lut = buildLut(STOPS);
    const rgba = colorize(new Uint8Array([0, 255]), lut);
    expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([0, 0, 0, 0]);
    expect([rgba[4], rgba[5], rgba[6], rgba[7]]).toEqual([255, 255, 255, 200]);
  });
});
