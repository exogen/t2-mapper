import { describe, expect, it, vi } from "vitest";
import { EmitterInstance } from "./ParticleSystem";
import type { EmitterDataResolved } from "./types";
import { warmAmbientEmitter } from "./ambientWarmup";

const origin: [number, number, number] = [10, 20, 30];
const axis: [number, number, number] = [0, 0, 1];
const velocity: [number, number, number] = [0, 0, 2];

function data(): EmitterDataResolved {
  return {
    ejectionPeriodMS: 64,
    periodVarianceMS: 0,
    ejectionVelocity: 10,
    velocityVariance: 0,
    ejectionOffset: 0,
    thetaMin: 0,
    thetaMax: 0,
    phiReferenceVel: 0,
    phiVariance: 0,
    overrideAdvances: true,
    orientParticles: false,
    orientOnVelocity: true,
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
  };
}

function emitter(configuration = data()): EmitterInstance {
  return new EmitterInstance(configuration, 16384, () => 0.5);
}

describe("ambient seek warmup", () => {
  it("reconstructs births without scaling particle age or movement by timeMultiple", () => {
    const slow = emitter();
    const fast = emitter();
    warmAmbientEmitter(slow, 256, origin, axis, velocity, 1);
    warmAmbientEmitter(fast, 256, origin, axis, velocity, 2);
    expect(slow.particles).toHaveLength(4);
    expect(fast.particles).toHaveLength(8);
    for (const particle of [...slow.particles, ...fast.particles]) {
      expect(particle.totalLifetime).toBe(1000);
      expect(particle.currentAge).toBeLessThanOrEqual(256);
      expect(particle.pos[2] - origin[2]).toBeCloseTo(
        (10 * particle.currentAge) / 1000,
      );
    }
    expect(fast.particles[0].currentAge).toBe(256);
    expect(fast.particles[0].pos).toEqual([10, 20, 32.56]);
  });

  it("retains finite emitters' surviving tails and never restarts an expired effect", () => {
    const configuration = data();
    configuration.lifetimeMS = 128;
    configuration.particles.lifetimeMS = 512;
    const tail = emitter(configuration);
    warmAmbientEmitter(tail, 300, origin, axis, velocity, 1);
    expect(tail.particles).toHaveLength(2);
    tail.emitPeriodic(origin, origin, 64, axis, velocity);
    expect(tail.particles).toHaveLength(2);
    const expired = emitter(configuration);
    warmAmbientEmitter(expired, 900, origin, axis, velocity, 1);
    expect(expired.isDead()).toBe(true);
    expect(expired.particles).toHaveLength(0);
    expired.emitPeriodic(origin, origin, 64, axis, velocity);
    expect(expired.particles).toHaveLength(0);
  });

  it("preserves the ejection clock's phase through omitted history", () => {
    const configuration = data();
    configuration.ejectionPeriodMS = 96;
    configuration.thetaMin = configuration.thetaMax = 90;
    configuration.phiReferenceVel = 90;
    configuration.particles.lifetimeMS = 1024;
    const complete = emitter(configuration);
    for (let i = 0; i < 160; i++) {
      complete.emitPeriodic(origin, origin, 32, axis, velocity);
      complete.update(32);
    }
    const warmed = emitter(configuration);
    warmAmbientEmitter(warmed, 5120, origin, axis, velocity, 1);
    // The full simulation swaps dead particles out of its array, so compare
    // retained particles by age rather than incidental storage order.
    const byAge = (a: { currentAge: number }, b: { currentAge: number }) =>
      a.currentAge - b.currentAge;
    expect(warmed.particles.toSorted(byAge)).toEqual(
      complete.particles.toSorted(byAge),
    );
  });

  it("keeps a long seek bounded and includes caller-supplied gravity", () => {
    const configuration = data();
    configuration.particles.lifetimeMS = 60_000;
    configuration.particles.gravityCoefficient = 1;
    const warmed = emitter(configuration);
    warmed.worldGravity = -2;
    const emit = vi.spyOn(warmed, "emitPeriodic");
    const update = vi.spyOn(warmed, "update");
    warmAmbientEmitter(warmed, 3_600_000, origin, axis, velocity, 1);
    expect(emit).toHaveBeenCalledTimes(128);
    expect(update).toHaveBeenCalledTimes(129);
    expect(warmed.particles.length).toBeGreaterThan(0);
    expect(warmed.particles[0].vel[2]).toBeLessThan(10);
    expect(warmed.particles[0].currentAge).toBeLessThanOrEqual(4096);
  });

  it("leaves a newborn emitter alone at zero, negative or nonfinite ages", () => {
    for (const age of [0, -1, NaN, Infinity]) {
      const newborn = emitter();
      const emit = vi.spyOn(newborn, "emitPeriodic");
      warmAmbientEmitter(newborn, age, origin, axis, velocity, 1);
      expect(emit).not.toHaveBeenCalled();
      expect(newborn.particles).toHaveLength(0);
    }
  });
});
