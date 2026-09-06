import { describe, expect, it } from "vitest";
import { FlareSpikes, VERTS_PER_SPIKE } from "./flareSpikes";

/** Deterministic "random": every draw returns the same value. */
const constant = (v: number) => () => v;

describe("FlareSpikes", () => {
  it("spawns from the datablock sizes and the engine's ranges", () => {
    const s = new FlareSpikes(1, [0.2, 0.5, 0.1], constant(0)).spikes[0];
    expect(s.baseScale).toBe(0.2);
    expect(s.tip0).toBeCloseTo(0.5);
    expect(s.tip1).toBeCloseTo(0.1);
    expect(s.growSec).toBeCloseTo(0.15);
    expect(s.lifetimeSec).toBeCloseTo(0.4);
    expect(s.angle1).toBeCloseTo((65 * Math.PI) / 180);
    expect(Math.hypot(...s.dir)).toBeCloseTo(1);
  });

  it("respawns a spike as soon as it outlives its lifetime", () => {
    const flares = new FlareSpikes(1, [0.2, 0.5, 0.1], constant(0.5));
    const first = flares.spikes[0];
    flares.advance(0.5);
    expect(flares.spikes[0]).toBe(first);
    flares.advance(0.3); // 0.8 > 0.4 + 0.2975
    expect(flares.spikes[0]).not.toBe(first);
    expect(flares.spikes[0].ageSec).toBe(0);
  });

  it("writes 48 vertices per spike with the base/tip/centre shading", () => {
    // 0.5 would give a zero direction (1 − 2·0.5); use 0.3.
    const flares = new FlareSpikes(2, [0.2, 0.5, 0.1], constant(0.3));
    const n = 2 * VERTS_PER_SPIKE;
    const pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const col = new Float32Array(n * 3);
    // Halfway through the ramp-up: brightness 0.5.
    flares.advance(flares.spikes[0].growSec / 2);
    expect(flares.writeGeometry(pos, uv, col, [1, 0.75, 0.25])).toBe(n);
    // First fan: vertex 0 (base ring) then, in triangle 2, the tip ring
    // (vertex index 2 → colour 0.5×) and the fan centre (index 3 → 0.25×).
    expect(col[0]).toBeCloseTo(0.5);
    expect(uv[1]).toBeCloseTo(0.9);
    const tipVertex = 2; // triangle (0,1,2): third vertex is fan vertex 2
    expect(col[tipVertex * 3]).toBeCloseTo(0.25);
    expect(uv[tipVertex * 2 + 1]).toBeCloseTo(0.1);
    const centreVertex = 5; // triangle (0,2,3): third vertex is fan vertex 3
    expect(col[centreVertex * 3]).toBeCloseTo(0.125);
    // Base ring sits at baseScale along the direction (radius ≈ 0).
    const s = flares.spikes[0];
    const base = Math.hypot(pos[3], pos[4], pos[5]);
    expect(base).toBeCloseTo(s.baseScale, 1);
  });
});
