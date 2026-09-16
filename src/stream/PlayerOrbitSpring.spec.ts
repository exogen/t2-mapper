import { describe, expect, it } from "vitest";
import { PlayerOrbitSpring } from "./PlayerOrbitSpring";
import { MAX_PITCH } from "./streamHelpers";

function seeded(yaw = 0, pitch = 0) {
  const spring = new PlayerOrbitSpring();
  spring.update("player", 0, 0, { yaw, pitch });
  return spring;
}

describe("PlayerOrbitSpring", () => {
  it("eases yaw and pitch without overshooting a stopped view", () => {
    const spring = seeded();
    const goal = { yaw: 1, pitch: -0.6 };
    let yaw = spring.yaw;
    let pitch = spring.pitch;
    for (let frame = 1; frame <= 120; frame++) {
      spring.update("player", 0, frame / 60, goal);
      expect(spring.yaw).toBeGreaterThanOrEqual(yaw);
      expect(spring.yaw).toBeLessThanOrEqual(goal.yaw);
      expect(spring.pitch).toBeLessThanOrEqual(pitch);
      expect(spring.pitch).toBeGreaterThanOrEqual(goal.pitch);
      yaw = spring.yaw;
      pitch = spring.pitch;
      if (frame === 1) {
        expect(yaw).toBeGreaterThan(0);
        expect(yaw).toBeLessThan(0.1);
        expect(pitch).toBeLessThan(0);
        expect(pitch).toBeGreaterThan(-0.06);
      }
    }
    expect(yaw).toBeCloseTo(goal.yaw, 6);
    expect(pitch).toBeCloseTo(goal.pitch, 6);
  });

  it("takes the short path across the yaw wrap in either direction", () => {
    for (const direction of [-1, 1]) {
      const start = direction * (Math.PI - 0.02);
      const spring = seeded(start);
      spring.update("player", 0, 0.1, { yaw: -start, pitch: 0 });
      const change = (spring.yaw - start) * direction;
      expect(change).toBeGreaterThan(0);
      expect(change).toBeLessThan(0.04);
    }
  });

  it("has the same response at different frame rates and after a long frame", () => {
    const goal = { yaw: 2, pitch: 0.8 };
    const reference = seeded();
    reference.update("player", 0, 0.5, goal);
    for (const fps of [30, 60, 144]) {
      const spring = seeded();
      for (let frame = 1; frame <= fps / 2; frame++) {
        spring.update("player", 0, frame / fps, goal);
      }
      expect(spring.yaw).toBeCloseTo(reference.yaw, 12);
      expect(spring.pitch).toBeCloseTo(reference.pitch, 12);
    }
    reference.update("player", 0, 60, goal);
    expect(reference.yaw).toBe(goal.yaw);
    expect(reference.pitch).toBe(goal.pitch);
  });

  it("uses playhead time: pauses freeze velocity and slow motion slows the response", () => {
    const goal = { yaw: 1, pitch: 0.5 };
    const spring = seeded();
    spring.update("player", 0, 0.1, goal);
    const paused = { yaw: spring.yaw, pitch: spring.pitch };
    for (let frame = 0; frame < 120; frame++) {
      spring.update("player", 0, 0.1, goal);
    }
    expect(spring.yaw).toBe(paused.yaw);
    expect(spring.pitch).toBe(paused.pitch);
    spring.update("player", 0, 0.2, goal);
    const uninterrupted = seeded();
    uninterrupted.update("player", 0, 0.2, goal);
    expect(spring.yaw).toBeCloseTo(uninterrupted.yaw, 12);
    expect(spring.pitch).toBeCloseTo(uninterrupted.pitch, 12);

    const slow = seeded();
    for (let frame = 1; frame <= 60; frame++) {
      slow.update("player", 0, (frame / 60) * 0.1, goal);
    }
    expect(slow.yaw).toBeCloseTo(paused.yaw, 12);
    expect(slow.pitch).toBeCloseTo(paused.pitch, 12);
  });

  it("resets on a seek, target change, timeline reset, and re-entering the mode", () => {
    const spring = seeded();
    spring.update("player", 0, 0.1, { yaw: 1, pitch: 0.5 });
    const goal = { yaw: -0.8, pitch: -0.2 };
    for (const [target, seek, time] of [
      ["player", 1, 10],
      ["player", 2, 0.5],
      ["replacement", 2, 0.5],
      ["replacement", 2, 0],
    ] as const) {
      spring.update(target, seek, time, goal);
      expect(spring.yaw).toBe(goal.yaw);
      expect(spring.pitch).toBe(goal.pitch);
      // No velocity from the previous target leaks into the new shot.
      spring.update(target, seek, time + 0.01, goal);
      expect(spring.yaw).toBe(goal.yaw);
      expect(spring.pitch).toBe(goal.pitch);
    }
    spring.reset();
    spring.update("replacement", 2, 0.01, { yaw: 0, pitch: 0 });
    expect(spring.yaw).toBe(0);
    expect(spring.pitch).toBe(0);
  });

  it("keeps pitch within its limits through abrupt direction reversals", () => {
    const spring = seeded(0, MAX_PITCH);
    for (let frame = 1; frame <= 180; frame++) {
      const pitch = (Math.floor(frame / 10) % 2 ? -1 : 1) * MAX_PITCH;
      spring.update("player", 0, frame / 60, { yaw: 0, pitch });
      expect(spring.pitch).toBeGreaterThanOrEqual(-MAX_PITCH);
      expect(spring.pitch).toBeLessThanOrEqual(MAX_PITCH);
    }
  });
});
