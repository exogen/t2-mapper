import { describe, expect, it } from "vitest";
import { turretThreadPositions } from "./turretAim";

describe("turretThreadPositions", () => {
  it("has no threads while fully deactivated", () => {
    expect(
      turretThreadPositions({ phi: 90, theta: 90, activation: 0 }),
    ).toEqual({ activate: null, elevate: null, turn: null });
  });

  it("scrubs only the activate thread while activating", () => {
    expect(
      turretThreadPositions({ phi: 90, theta: 90, activation: 0.25 }),
    ).toEqual({ activate: 0.25, elevate: null, turn: null });
  });

  it("aims with turn = phi/360 and elevate = theta/180 once active", () => {
    const pos = turretThreadPositions({ phi: 90, theta: 45, activation: 1 });
    expect(pos.activate).toBe(1);
    expect(pos.turn).toBeCloseTo(0.25);
    expect(pos.elevate).toBeCloseTo(0.25);
  });

  it("wraps phi into [0, 360)", () => {
    expect(
      turretThreadPositions({ phi: -90, theta: 0, activation: 1 }).turn,
    ).toBeCloseTo(0.75);
    expect(
      turretThreadPositions({ phi: 450, theta: 0, activation: 1 }).turn,
    ).toBeCloseTo(0.25);
  });
});
