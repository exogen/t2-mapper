import { describe, expect, it } from "vitest";
import { EmitterInstance } from "./ParticleSystem";
import type { EmitterDataResolved } from "./types";

/** Deterministic emitter: no variance, straight up, one keyframe pair. */
function emitterData(overrides: Partial<EmitterDataResolved> = {}) {
  return {
    ejectionPeriodMS: 10,
    periodVarianceMS: 0,
    ejectionVelocity: 0,
    velocityVariance: 0,
    ejectionOffset: 0,
    thetaMin: 0,
    thetaMax: 0,
    phiReferenceVel: 0,
    phiVariance: 0,
    overrideAdvances: true,
    orientParticles: false,
    orientOnVelocity: false,
    lifetimeMS: 0,
    lifetimeVarianceMS: 0,
    particles: {
      dragCoefficient: 0,
      windCoefficient: 0,
      gravityCoefficient: 0,
      inheritedVelFactor: 0,
      constantAcceleration: 0,
      lifetimeMS: 1000,
      lifetimeVarianceMS: 0,
      spinSpeed: 0,
      spinRandomMin: 0,
      spinRandomMax: 0,
      useInvAlpha: false,
      keys: [
        { r: 1, g: 1, b: 1, a: 1, size: 1, time: 0 },
        { r: 1, g: 1, b: 1, a: 0, size: 1, time: 1 },
      ],
      textureName: "",
    },
    ...overrides,
  } satisfies EmitterDataResolved;
}

describe("EmitterInstance.emitPeriodic", () => {
  it("spaces particles evenly along the frame's segment", () => {
    const e = new EmitterInstance(emitterData());
    e.emitPeriodic([0, 0, 0], [50, 0, 0], 50);
    // Emission times 10, 20, 30, 40, 50 ms → x = 10..50.
    expect(e.particles.map((p) => p.pos[0])).toEqual([10, 20, 30, 40, 50]);
  });

  it("carries the leftover period into the next frame", () => {
    const e = new EmitterInstance(emitterData({ ejectionPeriodMS: 30 }));
    e.emitPeriodic([0, 0, 0], [50, 0, 0], 50);
    expect(e.particles.map((p) => p.pos[0])).toEqual([30]);
    // 10 ms of the next period remain: the next particle lands 10 ms into
    // the following 50 ms frame, then another 30 ms later.
    e.emitPeriodic([50, 0, 0], [100, 0, 0], 50);
    expect(e.particles.map((p) => p.pos[0])).toEqual([30, 60, 90]);
  });

  it("moves spawned particles through the rest of the frame unless overrideAdvances", () => {
    // 1 m/s straight up: a particle spawned 10 ms in has 40 ms of travel.
    const moved = new EmitterInstance(
      emitterData({ ejectionVelocity: 1, overrideAdvances: false }),
    );
    moved.emitPeriodic([0, 0, 0], [0, 0, 0], 50);
    expect(moved.particles.map((p) => +p.pos[2].toFixed(3))).toEqual([
      0.04, 0.03, 0.02, 0.01, 0,
    ]);
    // Only physics runs; the age still starts at 0 (advanceTime ages).
    expect(moved.particles.every((p) => p.currentAge === 0)).toBe(true);
    const held = new EmitterInstance(
      emitterData({ ejectionVelocity: 1, overrideAdvances: true }),
    );
    held.emitPeriodic([0, 0, 0], [0, 0, 0], 50);
    expect(held.particles.every((p) => p.pos[2] === 0)).toBe(true);
  });

  it("drops a spawn whose lifetime is shorter than the rest of the frame", () => {
    const data = emitterData({ overrideAdvances: false });
    data.particles.lifetimeMS = 25;
    const e = new EmitterInstance(data);
    e.emitPeriodic([0, 0, 0], [0, 0, 0], 50);
    // Spawns at 10/20 ms have 40/30 ms left (> 25): dropped; 30/40/50 stay.
    expect(e.particles).toHaveLength(3);
  });

  it("adds inheritedVelFactor × the driver velocity", () => {
    const data = emitterData();
    data.particles.inheritedVelFactor = 0.5;
    const e = new EmitterInstance(data);
    e.emitPeriodic([0, 0, 0], [0, 0, 0], 10, [0, 0, 1], [8, 0, 0]);
    expect(e.particles[0].vel).toEqual([4, 0, 0]);
  });

  it("stops emitting after its own lifetime and dies once empty", () => {
    const e = new EmitterInstance(
      emitterData({
        lifetimeMS: 100,
        particles: { ...emitterData().particles, lifetimeMS: 20 },
      }),
    );
    e.emitPeriodic([0, 0, 0], [0, 0, 0], 100);
    e.update(100);
    expect(e.particles).toHaveLength(0);
    expect(e.isDead()).toBe(false);
    e.update(1);
    e.emitPeriodic([0, 0, 0], [0, 0, 0], 100);
    expect(e.particles).toHaveLength(0);
    expect(e.isDead()).toBe(true);
  });
});
