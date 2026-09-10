import { describe, expect, it } from "vitest";
import {
  decodeVehicleSteering,
  wheelRotationAt,
  wheelSteeringPosition,
  type WheelState,
} from "./vehicleWheels";

describe("WheeledVehicle steering", () => {
  it.each([
    [0, -0.3, 0.65],
    [0.25, -0.15, 0.5375],
    [0.5, 0, 0.5],
    [0.75, 0.15, 0.4625],
    [1, 0.3, 0.35],
  ])(
    "decodes packed yaw %s into radians %s and wheel position %s",
    (packed, angle, position) => {
      const yaw = decodeVehicleSteering(packed, 0.3);
      expect(yaw).toBeCloseTo(angle);
      expect(wheelSteeringPosition(yaw, 0.3)).toBeCloseTo(position);
    },
  );

  it("preserves both sides of the 9-bit midpoint without inventing a dead zone", () => {
    const a = decodeVehicleSteering(255 / 511, 0.3);
    const b = decodeVehicleSteering(256 / 511, 0.3);
    expect(a).toBeLessThan(0);
    expect(b).toBeGreaterThan(0);
    expect(a).toBeCloseTo(-b);
    expect(wheelSteeringPosition(a, 0.3)).toBeGreaterThan(0.5);
    expect(wheelSteeringPosition(b, 0.3)).toBeLessThan(0.5);
  });

  it("uses each vehicle's steering limit and centers vehicles with no steering", () => {
    expect(decodeVehicleSteering(0, 0.6)).toBe(-0.6);
    expect(wheelSteeringPosition(-0.6, 0.6)).toBeCloseTo(0.8);
    expect(wheelSteeringPosition(0.6, 0.6)).toBeCloseTo(0.2);
    expect(wheelSteeringPosition(decodeVehicleSteering(1, 0), 0)).toBe(0.5);
  });
});

function wheel(speed: number, rotation = 0): WheelState {
  return { speed, rotation, timeSec: 10, lateralSlip: 0, longitudinalSlip: 0 };
}

describe("WheeledVehicle angular position", () => {
  it("converts network radians per second into normalized turns", () => {
    expect(wheelRotationAt(wheel(1), 11)).toBeCloseTo(0.15915494309189535);
    expect(wheelRotationAt(wheel(Math.PI), 11)).toBeCloseTo(0.5);
    expect(wheelRotationAt(wheel(2 * Math.PI), 11)).toBeCloseTo(0);
    expect(wheelRotationAt(wheel(2 * Math.PI), 12.25)).toBeCloseTo(0.25);
  });

  it("wraps reverse rotation without reversing the direction or leaving [0, 1)", () => {
    expect(wheelRotationAt(wheel(-Math.PI), 10.5)).toBeCloseTo(0.75);
    expect(wheelRotationAt(wheel(-Math.PI, 0.1), 13)).toBeCloseTo(0.6);
  });

  it("holds stopped and frozen wheels even when their last velocity is nonzero", () => {
    expect(wheelRotationAt(wheel(0, 0.3), 1000)).toBe(0.3);
    expect(wheelRotationAt(wheel(100, 0.3), 1000, true)).toBe(0.3);
  });

  it("samples fractional stream time without accumulating extra render frames", () => {
    const state = wheel(2 * Math.PI);
    const original = { ...state };
    // The same playhead produces the same phase, regardless of render count,
    // pauses, playback rate, or revisiting a time after a seek.
    for (const time of [10.25, 10.25, 10.5, 10.75, 10.25]) {
      expect(wheelRotationAt(state, time)).toBeCloseTo(time - 10);
    }
    expect(wheelRotationAt(state, 9.99)).toBe(0);
    expect(state).toEqual(original);
  });
});
