import { describe, expect, it } from "vitest";
import { computeSkyFogBands } from "./skyFogBands";

// Reference values hand-computed from the Tribes2.exe formulas
// (Sky::calcPoints 0x5ad030): p = 0.95 * visD / sqrt(3), cap = p / sqrt(2),
// satH = p * depth / sqrt(effVis^2 - depth^2), bandH = p * depth / (0.2 * effVis).

const DBS_VOLUME = {
  visibleDistance: 300,
  minHeight: 0,
  maxHeight: 100,
  percentage: 1,
};

describe("computeSkyFogBands", () => {
  it("no fog volumes: opaque horizon line fading over 60 units", () => {
    expect(computeSkyFogBands(475, [], 200)).toEqual({
      h0: 0,
      h1: 60,
      alpha0: 0,
      alpha1: 0,
      radius: (0.95 * 475) / Math.sqrt(3),
    });
  });

  it("camera above the fog top behaves like the no-volume case", () => {
    const bands = computeSkyFogBands(475, [DBS_VOLUME], 150);
    expect(bands.h0).toBe(0);
    expect(bands.h1).toBe(60);
    expect(bands.alpha0).toBe(0);
    expect(bands.alpha1).toBe(0);
  });

  it("camera inside the volume (DeadlyBirdsSong at height 60)", () => {
    // p = 0.95*475/sqrt(3) = 260.529; cap = 184.222; depth = 40
    // horiz = sqrt(300^2 - 40^2) = 297.321
    // satH = 260.529*40/297.321 = 35.048
    // bandH = 260.529*40/(0.2*300) = 173.686 (< cap)
    // rings below the cap -> alpha0 = h0/cap = 0.19025, alpha1 = 0
    const bands = computeSkyFogBands(475, [DBS_VOLUME], 60);
    expect(bands.h0).toBeCloseTo(35.048, 2);
    expect(bands.h1).toBeCloseTo(173.686, 2);
    expect(bands.alpha0).toBeCloseTo(0.19025, 4);
    expect(bands.alpha1).toBe(0);
  });

  it("fog fades in continuously as the camera sinks below the fog top", () => {
    // Just below the top must approach the above-fog values (0, 60, 0, 0)
    // — the discontinuity here was the visible skybox flash when
    // crossing fog layer boundaries.
    const above = computeSkyFogBands(475, [DBS_VOLUME], 100.01);
    const below = computeSkyFogBands(475, [DBS_VOLUME], 99.99);
    expect(above).toEqual({
      h0: 0,
      h1: 60,
      alpha0: 0,
      alpha1: 0,
      radius: (0.95 * 475) / Math.sqrt(3),
    });
    expect(below.h0).toBeCloseTo(0, 1);
    expect(below.h1).toBe(60);
    expect(below.alpha0).toBeCloseTo(0, 4);
    expect(below.alpha1).toBe(0);
  });

  it("deep in the volume: band ring capped, partial alpha at the cap", () => {
    // cam 0: depth = 100; horiz = sqrt(90000-10000) = 282.843
    // satH = 260.529*100/282.843 = 92.111; bandH = 260.529*100/60 = 434.2 >= cap
    // -> h1 = cap = 184.222, alpha0 = h0/cap = 0.5, alpha1 = 0
    const bands = computeSkyFogBands(475, [DBS_VOLUME], 0);
    expect(bands.h0).toBeCloseTo(92.111, 2);
    expect(bands.h1).toBeCloseTo(184.222, 2);
    expect(bands.alpha0).toBeCloseTo(0.5, 3);
    expect(bands.alpha1).toBe(0);
  });

  it("fog depth exceeding visibility fogs the entire sky", () => {
    const dense = { ...DBS_VOLUME, visibleDistance: 30 };
    const bands = computeSkyFogBands(475, [dense], 0);
    const cap = (0.95 * 475) / Math.sqrt(3) / Math.SQRT2;
    expect(bands.h0).toBeCloseTo(cap, 3);
    expect(bands.h1).toBeCloseTo(cap, 3);
    expect(bands.alpha0).toBe(1);
    expect(bands.alpha1).toBe(1);
  });

  it("stacked denser lower volume reduces effective visibility", () => {
    // Volumes: dense low layer (vis 100, 0..50), light upper (vis 300, 0..100).
    // cam 0: hIn(low) = 50; effVis = 300 - 300*50/100 = 150; depth = 100
    // horiz = sqrt(150^2-100^2) = 111.803; satH = 260.529*100/111.803 = 233.024
    // Both rings pinned at cap (satH and bandH >= cap): alpha0 = 1,
    // alpha1 = (satH - cap) * horiz / depth / p = 48.802*1.11803/260.529 = 0.20943
    const low = {
      visibleDistance: 100,
      minHeight: 0,
      maxHeight: 50,
      percentage: 1,
    };
    const bands = computeSkyFogBands(475, [low, DBS_VOLUME], 0);
    const cap = (0.95 * 475) / Math.sqrt(3) / Math.SQRT2;
    expect(bands.h0).toBeCloseTo(cap, 3);
    expect(bands.h1).toBeCloseTo(cap, 3);
    expect(bands.alpha0).toBeCloseTo(1, 5);
    expect(bands.alpha1).toBeCloseTo(0.20943, 4);
  });

  it("storm percentage scales both band heights", () => {
    const stormy = { ...DBS_VOLUME, percentage: 0.5 };
    const full = computeSkyFogBands(475, [DBS_VOLUME], 60);
    const half = computeSkyFogBands(475, [stormy], 60);
    expect(half.h0).toBeCloseTo(full.h0 * 0.5, 3);
    expect(half.h1).toBeCloseTo(full.h1 * 0.5, 3);
  });
});
