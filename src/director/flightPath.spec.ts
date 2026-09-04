/**
 * A sweep's path. Straight sweeps must keep their exact old behaviour;
 * ones carrying waypoints fly a smooth curve through them, and the
 * validator and the runtime must sample the SAME thing.
 */
import { describe, expect, it } from "vitest";
import { flightPointAt } from "./flightPath";
import type { DirectorVec3, Shot } from "./types";

function sweep(via?: DirectorVec3[]): Extract<Shot, { kind: "sweep" }> {
  return {
    kind: "sweep",
    from: [0, 0, 100],
    to: [400, 0, 100],
    target: [0, 0, 100],
    startSec: 0,
    endSec: 10,
    transitionIn: "cut",
    reason: "test",
    ...(via ? { via } : {}),
  } as Extract<Shot, { kind: "sweep" }>;
}

describe("flightPointAt", () => {
  it("interpolates a plain sweep in a straight line", () => {
    const s = sweep();
    expect(flightPointAt(s, 0)).toEqual([0, 0, 100]);
    expect(flightPointAt(s, 0.5)).toEqual([200, 0, 100]);
    expect(flightPointAt(s, 1)).toEqual([400, 0, 100]);
  });

  it("rises over a waypoint instead of cutting the chord", () => {
    // The ridge case: without waypoints the only way to clear 160 is to
    // fly the WHOLE route at 160.
    const s = sweep([[200, 0, 160]]);
    expect(flightPointAt(s, 0)[2]).toBeCloseTo(100, 5);
    expect(flightPointAt(s, 1)[2]).toBeCloseTo(100, 5);
    expect(flightPointAt(s, 0.5)[2]).toBeGreaterThan(150);
  });

  it("stays smooth — no sudden jumps between samples", () => {
    const s = sweep([
      [100, 20, 130],
      [200, 30, 160],
      [300, 10, 120],
    ]);
    let prev = flightPointAt(s, 0, [0, 0, 0]).slice() as DirectorVec3;
    let biggest = 0;
    for (let i = 1; i <= 60; i++) {
      const p = flightPointAt(s, i / 60, [0, 0, 0]).slice() as DirectorVec3;
      biggest = Math.max(
        biggest,
        Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]),
      );
      prev = p;
    }
    // A 400-unit route in 60 steps averages under 7 per step; a kink
    // would show up as a step several times that.
    expect(biggest).toBeLessThan(15);
  });

  it("keeps both endpoints exactly", () => {
    const s = sweep([[200, 40, 160]]);
    expect(flightPointAt(s, 0)[0]).toBeCloseTo(0, 5);
    expect(flightPointAt(s, 1)[0]).toBeCloseTo(400, 5);
  });
});
