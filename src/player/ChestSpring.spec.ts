import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { ChestSpring } from "./ChestSpring";

describe("chest inertia", () => {
  it("has no idle drift or oscillation at constant velocity", () => {
    const spring = new ChestSpring();
    for (let frame = 0; frame < 120; frame++) {
      const t = frame / 60;
      spring.update(t, new Vector3(t * 10, 5, 0));
    }
    expect(spring.offset.length()).toBeLessThan(1e-10);
  });

  it("lags acceleration, overshoots, and settles after stopping", () => {
    const spring = new ChestSpring();
    const anchor = new Vector3();
    spring.update(0, anchor);
    spring.update(1 / 60, anchor);
    spring.update(2 / 60, anchor.set(0, 0.02, 0));
    expect(spring.offset.y).toBeLessThan(0);
    let overshoot = false;
    for (let frame = 3; frame < 600; frame++) {
      spring.update(frame / 60, anchor);
      overshoot ||= spring.offset.y > 0.001;
    }
    expect(overshoot).toBe(true);
    expect(spring.offset.length()).toBeLessThan(1e-8);
  });

  it("holds while paused and resets on seeks, stalls and teleports", () => {
    const spring = new ChestSpring();
    const p = new Vector3();
    spring.update(0, p, 0);
    spring.update(0.01, p, 0);
    spring.update(0.02, p.set(0, 0.02, 0), 0);
    const held = spring.offset.clone();
    for (let i = 0; i < 100; i++) spring.update(0.02, p, 0);
    expect(spring.offset).toEqual(held);
    for (const [time, x, key] of [
      [0.03, 0, 1],
      [-1, 0, 1],
      [5, 0, 1],
      [5.01, 1000, 1],
    ]) {
      spring.update(time, p.set(x, 0, 0), key);
      expect(spring.offset.length()).toBe(0);
    }
  });

  it("remains bounded and comparable from 20 to 144 FPS", () => {
    const samples = [20, 30, 60, 144].map((fps) => {
      const spring = new ChestSpring();
      for (let frame = 0; frame <= fps * 5; frame++) {
        const time = frame / fps;
        spring.update(time, new Vector3(0, 0.08 * Math.sin(time * 8), 0));
        expect(spring.offset.length()).toBeLessThanOrEqual(0.160001);
      }
      return spring.offset.y;
    });
    expect(Math.max(...samples) - Math.min(...samples)).toBeLessThan(0.012);
  });

  it("recovers from non-finite anchors and ignores vanishingly small time steps", () => {
    const spring = new ChestSpring();
    spring.update(0, new Vector3());
    for (const time of [Number.MIN_VALUE, 1e-100, 1e-10])
      expect(spring.update(time, new Vector3(1, 0, 0)).length()).toBe(0);
    spring.update(0.01, new Vector3(NaN, Infinity, 0));
    for (let frame = 2; frame < 30; frame++) {
      const result = spring.update(frame / 100, new Vector3(0, frame / 100, 0));
      expect(result.toArray().every(Number.isFinite)).toBe(true);
      expect(result.length()).toBeLessThanOrEqual(0.160001);
    }
  });
});
