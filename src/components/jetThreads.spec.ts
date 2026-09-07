import { describe, expect, it } from "vitest";
import {
  backJetsActive,
  bottomJetsActive,
  contrailDeltaScale,
  createJetDirectionState,
  stepFlareThread,
  stepJetDirection,
  vehicleForwardSpeed,
} from "./jetThreads";

describe("stepFlareThread", () => {
  it("fades in while active and back out when not, clamped", () => {
    let pos = 0;
    pos = stepFlareThread(pos, true, 0.1, 0.333);
    expect(pos).toBeCloseTo(0.3);
    pos = stepFlareThread(pos, true, 1, 0.333);
    expect(pos).toBe(1);
    pos = stepFlareThread(pos, false, 0.1665, 0.333);
    expect(pos).toBeCloseTo(0.5);
    pos = stepFlareThread(pos, false, 5, 0.333);
    expect(pos).toBe(0);
  });
});

describe("stepJetDirection", () => {
  it("plays activate to its end, then hands over to maintain", () => {
    const s = createJetDirectionState();
    stepJetDirection(s, true, 0.25, 0.5, true, 10);
    expect(s.activatePosition).toBeCloseTo(0.5);
    expect(s.maintaining).toBe(false);
    stepJetDirection(s, true, 0.3, 0.5, true, 10.3);
    expect(s.maintaining).toBe(true);
    expect(s.activatePosition).toBe(0);
    expect(s.maintainStartSec).toBe(10.3);
    // Maintain keeps running; activate stays parked.
    stepJetDirection(s, true, 1, 0.5, true, 11.3);
    expect(s.activatePosition).toBe(0);
    expect(s.maintaining).toBe(true);
  });

  it("holds activate at its end when the shape has no maintain", () => {
    const s = createJetDirectionState();
    stepJetDirection(s, true, 2, 0.5, false, 0);
    expect(s.activatePosition).toBe(1);
    expect(s.maintaining).toBe(false);
  });

  it("drops maintain and plays activate back out when deactivated", () => {
    const s = createJetDirectionState();
    stepJetDirection(s, true, 1, 0.5, true, 0);
    expect(s.maintaining).toBe(true);
    stepJetDirection(s, false, 0.1, 0.5, true, 1);
    expect(s.maintaining).toBe(false);
    expect(s.activatePosition).toBeCloseTo(0.8);
    stepJetDirection(s, false, 1, 0.5, true, 2);
    expect(s.activatePosition).toBe(0);
  });

  it("re-activating mid fade-out resumes from the current position", () => {
    const s = createJetDirectionState();
    stepJetDirection(s, true, 0.2, 0.5, true, 0);
    stepJetDirection(s, false, 0.1, 0.5, true, 0.2);
    expect(s.activatePosition).toBeCloseTo(0.2);
    stepJetDirection(s, true, 0.1, 0.5, true, 0.3);
    expect(s.activatePosition).toBeCloseTo(0.4);
  });
});

describe("jet gating", () => {
  it("lights back jets on forward thrust only, bottom jets when jetting down", () => {
    expect(backJetsActive(0)).toBe(true);
    expect(backJetsActive(2)).toBe(false);
    expect(bottomJetsActive(2, true)).toBe(true);
    expect(bottomJetsActive(2, false)).toBe(false);
    expect(bottomJetsActive(0, true)).toBe(false);
  });
});

describe("contrailDeltaScale", () => {
  it("ramps from minTrailSpeed over maneuveringForce/mass", () => {
    expect(contrailDeltaScale(10, 15, 20)).toBe(0);
    expect(contrailDeltaScale(15, 15, 20)).toBe(0);
    expect(contrailDeltaScale(25, 15, 20)).toBeCloseTo(0.5);
    expect(contrailDeltaScale(60, 15, 20)).toBe(1);
  });
});

describe("vehicleForwardSpeed", () => {
  it("projects the Torque velocity onto the rotated forward axis", () => {
    expect(vehicleForwardSpeed([0, 30, 5], [0, 0, 0, 1])).toBeCloseTo(30);
    // Yawed 90° about Three Y (Torque Z): forward becomes Torque −x.
    const s = Math.SQRT1_2;
    expect(vehicleForwardSpeed([-20, 0, 0], [0, s, 0, s])).toBeCloseTo(20);
    expect(vehicleForwardSpeed([0, 20, 0], [0, s, 0, s])).toBeCloseTo(0);
  });
});
