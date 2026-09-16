import { describe, expect, it } from "vitest";
import { OrbitDistanceSpring } from "./OrbitDistanceSpring";

function seeded(distance = 8) {
  const spring = new OrbitDistanceSpring();
  spring.update("player", 0, 0, distance);
  return spring;
}

describe("OrbitDistanceSpring", () => {
  it("eases inward without snapping, even if that temporarily exceeds clearance", () => {
    const spring = seeded();
    const eased = spring.update("player", 0, 1 / 60, 2);
    expect(eased).toBeLessThan(8);
    expect(eased).toBeGreaterThan(7.7);
    let previous = eased;
    for (let i = 0; i < 120; i++) {
      spring.update("player", 0, 1 / 60, 2);
      expect(spring.distance).toBeGreaterThanOrEqual(2);
      expect(spring.distance).toBeLessThanOrEqual(previous);
      previous = spring.distance;
    }
    expect(spring.distance).toBeCloseTo(2, 6);
  });

  it("recovers smoothly when an obstruction flickers", () => {
    const spring = seeded(2);
    let max = spring.distance;
    for (let i = 0; i < 120; i++) {
      const distance = spring.update("player", 0, 1 / 60, i % 2 ? 8 : 2);
      expect(distance).toBeGreaterThanOrEqual(2);
      max = Math.max(max, distance);
    }
    expect(max).toBeLessThan(2.8);
    let largestStep = 0;
    let last = spring.distance;
    for (let i = 0; i < 180; i++) {
      spring.update("player", 0, 1 / 60, 8);
      largestStep = Math.max(largestStep, Math.abs(spring.distance - last));
      last = spring.distance;
    }
    expect(largestStep).toBeLessThan(0.3);
    expect(spring.distance).toBeCloseTo(8, 4);
  });

  it("pulls inward faster than it extends outward", () => {
    const inward = seeded(8);
    const outward = seeded(2);
    inward.update("player", 0, 0.1, 2);
    outward.update("player", 0, 0.1, 8);
    expect(8 - inward.distance).toBeGreaterThan(outward.distance - 2);
  });

  it.each([2, 12])(
    "has the same response at different frame rates to distance %s",
    (goal) => {
      const reference = seeded();
      reference.update("player", 0, 0.5, goal);
      for (const fps of [30, 60, 144]) {
        const spring = seeded();
        for (let i = 0; i < fps / 2; i++)
          spring.update("player", 0, 1 / fps, goal);
        expect(spring.distance).toBeCloseTo(reference.distance, 12);
      }
      reference.update("player", 0, 60, goal);
      expect(reference.distance).toBe(goal);
    },
  );

  it("resets on seeks, target changes, and leaving follow mode", () => {
    const spring = seeded(2);
    expect(spring.update("player", 1, 1 / 60, 8)).toBe(8);
    expect(spring.update("other", 1, 1 / 60, 4)).toBe(4);
    spring.reset();
    expect(spring.update("other", 1, 1 / 60, 8)).toBe(8);
  });

  it("doesn't carry inward momentum through the player when a wall disappears", () => {
    const spring = seeded();
    for (let i = 0; i < 10; i++) spring.update("player", 0, 1 / 60, 0);
    for (let i = 0; i < 120; i++) {
      const distance = spring.update("player", 0, 1 / 60, 8);
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(8);
    }
    expect(spring.distance).toBeCloseTo(8, 2);
  });

  it("holds with zero elapsed time and resumes easing without a snap", () => {
    const spring = seeded();
    expect(spring.update("player", 0, 0, 3)).toBe(8);
    expect(spring.update("player", 0, 1 / 60, 3)).toBeGreaterThan(7.7);
  });
});
