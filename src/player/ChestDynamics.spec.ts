import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { ChestDynamics } from "./ChestDynamics";

const up = new Vector3(0, 1, 0),
  forward = new Vector3(0, 0, 1);
const anchors = () => [new Vector3(-0.15, 0, 0), new Vector3(0.15, 0, 0)];

describe("independent chest motion", () => {
  it("spreads and compresses under vertical motion with distinct left/right responses", () => {
    const dynamics = new ChestDynamics(),
      points = anchors();
    let outward = false,
      inward = false,
      independent = false;
    for (let frame = 0; frame < 240; frame++) {
      const time = frame / 60;
      for (const p of points) p.y = 0.08 * Math.sin(time * 8);
      const [left, right] = dynamics.update(time, points, up, forward, 1, 1);
      outward ||= left.x < -0.001 && right.x > 0.001;
      inward ||= left.x > 0.001 && right.x < -0.001;
      independent ||= Math.abs(left.y - right.y) > 0.002;
    }
    expect(outward).toBe(true);
    expect(inward).toBe(true);
    expect(independent).toBe(true);
  });

  it("prevents crossing at maximum size, including after firmness scaling", () => {
    const dynamics = new ChestDynamics(),
      points = anchors();
    let minimumGap = Infinity;
    for (let frame = 0; frame < 600; frame++) {
      const time = frame / 60;
      const halfGap = 0.07 + 0.055 * Math.sin(time * 15);
      points[0].set(-halfGap, Math.sin(time * 12), 0);
      points[1].set(halfGap, Math.sin(time * 12), 0);
      const [left, right] = dynamics.update(
        time,
        points,
        up,
        forward,
        3,
        frame % 60 < 30 ? 1 : 0.5,
      );
      const gap = 2 * halfGap + right.x - left.x;
      minimumGap = Math.min(minimumGap, gap / (2 * halfGap));
      expect(gap).toBeGreaterThanOrEqual(2 * halfGap * 0.55 - 1e-10);
      expect(
        [...left.toArray(), ...right.toArray()].every(Number.isFinite),
      ).toBe(true);
    }
    // Exercise actual contact, rather than only testing unconstrained motion.
    expect(minimumGap).toBeCloseTo(0.55);
  });

  it("holds while paused, scales firmness, and resets on resizing and seeks", () => {
    const dynamics = new ChestDynamics(),
      points = anchors();
    for (let frame = 0; frame <= 30; frame++) {
      for (const p of points) p.y = 0.05 * Math.sin(frame / 10);
      dynamics.update(frame / 60, points, up, forward, 1, 1, 0);
    }
    const held = dynamics.offsets.map((p) => p.clone());
    expect(held.some((p) => p.length() > 0.001)).toBe(true);
    for (let firmness = 0; firmness <= 100; firmness += 10) {
      const movement = 1 - firmness / 100;
      const result = dynamics.update(0.5, points, up, forward, 1, movement, 0);
      for (let side = 0; side < 2; side++)
        expect(
          result[side].distanceTo(held[side].clone().multiplyScalar(movement)),
        ).toBeLessThan(1e-10);
    }
    for (const [time, size, key] of [
      [0.6, 3, 0],
      [0.61, 3, 1],
    ]) {
      const offsets = dynamics.update(time, points, up, forward, size, 1, key);
      expect(offsets.every((p) => p.length() === 0)).toBe(true);
    }
  });

  it("has no motion at 100% firmness, idle, or constant velocity", () => {
    for (const movement of [0, 1]) {
      const dynamics = new ChestDynamics(),
        points = anchors();
      for (let frame = 0; frame < 100; frame++) {
        const time = frame / 60;
        for (const p of points) p.y = movement ? time * 5 : Math.sin(time * 10);
        expect(
          dynamics
            .update(time, points, up, forward, 1, movement)
            .every((p) => p.length() < 1e-10),
        ).toBe(true);
      }
    }
  });
});
