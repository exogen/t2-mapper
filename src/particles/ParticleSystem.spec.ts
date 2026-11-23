import { describe, expect, it } from "vitest";
import { EmitterInstance } from "./ParticleSystem";
import type { EmitterDataResolved } from "./types";
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";

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

describe("EmitterInstance render revision", () => {
  it("keeps paused buffers valid but invalidates on bursts, motion, and death", () => {
    const emitter = new EmitterInstance(emitterData({ ejectionVelocity: 1 }));
    emitter.update(16);
    expect(emitter.revision).toBe(0);
    emitter.emitBurst([0, 0, 0], 1);
    const spawned = emitter.revision;
    expect(spawned).toBeGreaterThan(0);
    for (let i = 0; i < 120; i++) emitter.update(0);
    emitter.update(0.1);
    expect(emitter.revision).toBe(spawned);
    expect(emitter.particles[0].pos).toEqual([0, 0, 0]);
    emitter.update(10);
    expect(emitter.particles[0].pos[2]).toBeCloseTo(0.01);
    expect(emitter.revision).toBeGreaterThan(spawned);
    const moving = emitter.revision;
    emitter.kill();
    expect(emitter.revision).toBe(moving);
    emitter.update(1000);
    expect(emitter.particles).toHaveLength(0);
    expect(emitter.revision).toBeGreaterThan(moving);
    const dead = emitter.revision;
    emitter.update(16);
    expect(emitter.revision).toBe(dead);
  });

  it("invalidates on periodic emission even before the next simulation update", () => {
    const emitter = new EmitterInstance(emitterData());
    emitter.emitPeriodic([0, 0, 0], [1, 0, 0], 10);
    expect(emitter.particles).toHaveLength(1);
    const first = emitter.revision;
    emitter.emitPeriodic([1, 0, 0], [2, 0, 0], 10);
    expect(emitter.particles).toHaveLength(2);
    expect(emitter.revision).toBeGreaterThan(first);
  });
});

describe("EmitterInstance particle slot reuse", () => {
  it("tracks all owners with scalar current ownership and lifetime allocation counters", () => {
    const before = readResourceMetrics();
    const first = new EmitterInstance(emitterData(), 3);
    const second = new EmitterInstance(emitterData(), 2);
    first.emitBurst([0, 0, 0], 3);
    second.emitBurst([0, 0, 0], 2);
    expect(readResourceMetrics()).toMatchObject({
      "particleAllocations.activeEmitters":
        before["particleAllocations.activeEmitters"]! + 2,
      "particleAllocations.ownedParticleSlots":
        before["particleAllocations.ownedParticleSlots"]! + 5,
      "particleAllocations.liveParticles":
        before["particleAllocations.liveParticles"]! + 5,
    });
    first.update(1000);
    second.update(1000);
    first.emitBurst([1, 2, 3], 2);
    expect(readResourceMetrics()).toMatchObject({
      "particleAllocations.liveParticles":
        before["particleAllocations.liveParticles"]! + 2,
      "particleAllocations.freeParticleSlots":
        before["particleAllocations.freeParticleSlots"]! + 3,
      "particleAllocations.createdParticleSlotsLifetime":
        before["particleAllocations.createdParticleSlotsLifetime"]! + 5,
      "particleAllocations.reusedParticleSpawnsLifetime":
        before["particleAllocations.reusedParticleSpawnsLifetime"]! + 2,
    });
    first.dispose();
    second.dispose();
    first.dispose();
    expect(readResourceMetrics()).toMatchObject({
      "particleAllocations.activeEmitters":
        before["particleAllocations.activeEmitters"],
      "particleAllocations.ownedParticleSlots":
        before["particleAllocations.ownedParticleSlots"],
      "particleAllocations.liveParticles":
        before["particleAllocations.liveParticles"],
      "particleAllocations.freeParticleSlots":
        before["particleAllocations.freeParticleSlots"],
      "particleAllocations.disposedEmittersLifetime":
        before["particleAllocations.disposedEmittersLifetime"]! + 2,
    });
  });
  it("reuses bounded object/vector slots across repeated bursts without changing the live cap", () => {
    const data = emitterData();
    data.particles.lifetimeMS = 10;
    const emitter = new EmitterInstance(data, 3);
    emitter.emitBurst([0, 0, 0], 20);
    const original = [...emitter.particles];
    const vectors = original.map((particle) => [
      particle.pos,
      particle.vel,
      particle.acc,
      particle.orientDir,
    ]);
    expect(emitter.particles).toHaveLength(3);
    for (let burst = 0; burst < 100; burst++) {
      if (burst > 0) emitter.emitBurst([burst, 2, 3], 20);
      expect(emitter.particles).toHaveLength(3);
      expect(emitter.allocatedParticleSlots).toBe(3);
      for (const particle of emitter.particles) {
        const slot = original.indexOf(particle);
        expect(slot).toBeGreaterThanOrEqual(0);
        expect(particle.pos).toBe(vectors[slot][0]);
        expect(particle.vel).toBe(vectors[slot][1]);
        expect(particle.acc).toBe(vectors[slot][2]);
        expect(particle.orientDir).toBe(vectors[slot][3]);
      }
      emitter.update(10);
      expect(emitter.particles).toHaveLength(0);
      expect(emitter.freeParticleSlots).toBe(3);
    }
    expect(emitter.createdParticleSlots).toBe(3);
    expect(emitter.reusedParticleSpawns).toBe(297);
  });

  it("resets every field and preserves RNG, orientation, inherited velocity, colors and sizes", () => {
    const data = emitterData({
      useEmitterColors: true,
      useEmitterSizes: true,
      orientParticles: true,
      ejectionVelocity: 4,
      velocityVariance: 2,
      ejectionOffset: 0.75,
      thetaMin: 10,
      thetaMax: 70,
      phiVariance: 120,
      phiReferenceVel: 25,
    });
    Object.assign(data.particles, {
      lifetimeMS: 100,
      lifetimeVarianceMS: 20,
      inheritedVelFactor: 0.7,
      constantAcceleration: 1.5,
      spinSpeed: 35,
      spinRandomMin: -10,
      spinRandomMax: 30,
    });
    const values = [0.13, 0.71, 0.23, 0.91, 0.42, 0.68, 0.07, 0.34];
    let draws = 0;
    const emitter = new EmitterInstance(
      data,
      1,
      () => values[draws++ % values.length],
    );
    emitter.emitBurst([50, 60, 70], 1);
    const old = emitter.particles[0];
    old.pos.fill(-999);
    old.vel.fill(-998);
    old.acc.fill(-997);
    old.orientDir.fill(-996);
    Object.assign(old, {
      currentAge: 99,
      dataIndex: 52,
      spinSpeed: 53,
      currentSpin: 54,
      r: 55,
      g: 56,
      b: 57,
      a: 58,
      size: 59,
    });
    emitter.update(1000);
    const colors = [
      { r: 0.2, g: 0.4, b: 0.6, a: 0.8 },
      { r: 0.9, g: 0.7, b: 0.5, a: 0.3 },
    ];
    emitter.setColors(colors);
    emitter.setSizes([2, 4]);
    let freshDraws = draws;
    const fresh = new EmitterInstance(
      data,
      1,
      () => values[freshDraws++ % values.length],
    );
    fresh.setColors(colors);
    fresh.setSizes([2, 4]);
    for (const target of [emitter, fresh])
      target.emitPeriodic([3, -2, 8], [-5, 6, 1], 10, [0, 1, 0], [2, -4, 6]);
    expect(emitter.particles[0]).toBe(old);
    expect(emitter.particles[0]).toEqual(fresh.particles[0]);
    expect(draws).toBe(freshDraws);
    expect(emitter.reusedParticleSpawns).toBe(1);
    expect(fresh.particles[0]).not.toBe(old);
    emitter.update(25);
    fresh.update(25);
    expect(emitter.particles[0]).toEqual(fresh.particles[0]);
  });

  it("recycles spawns discarded during frame advancement", () => {
    const data = emitterData({ overrideAdvances: false });
    data.particles.lifetimeMS = 1;
    const emitter = new EmitterInstance(data, 3);
    emitter.emitPeriodic([0, 0, 0], [50, 0, 0], 50);
    expect(emitter.particles).toHaveLength(1);
    expect(emitter.particles[0].pos).toEqual([50, 0, 0]);
    expect(emitter.createdParticleSlots).toBe(1);
    expect(emitter.reusedParticleSpawns).toBe(4);
    emitter.kill();
    emitter.update(1);
    expect(emitter.isDead()).toBe(true);
    expect(emitter.freeParticleSlots).toBe(1);
  });

  it("releases live/free slots on disposal and never revives a disposed emitter", () => {
    const data = emitterData();
    data.particles.lifetimeMS = 1;
    const emitter = new EmitterInstance(data, 3);
    emitter.emitBurst([0, 0, 0], 3);
    emitter.update(1);
    emitter.emitBurst([0, 0, 0], 1);
    expect(emitter.freeParticleSlots).toBe(2);
    emitter.dispose();
    emitter.dispose();
    emitter.emitBurst([0, 0, 0], 3);
    emitter.emitRadial([0, 0, 0], 1, 3);
    emitter.emitPeriodic([0, 0, 0], [1, 0, 0], 30);
    emitter.update(30);
    expect(emitter.allocatedParticleSlots).toBe(0);
    expect(emitter.particles).toHaveLength(0);
    expect(emitter.freeParticleSlots).toBe(0);
    expect(emitter.createdParticleSlots).toBe(3);
    expect(emitter.reusedParticleSpawns).toBe(1);
  });
});

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

it("keeps terrain colour overrides per emitter and preserves sizes/times", () => {
  const data = emitterData({ useEmitterColors: true });
  const first = new EmitterInstance(data),
    second = new EmitterInstance(data);
  first.setColors([
    { r: 0.46, g: 0.36, b: 0.26, a: 0.4 },
    { r: 0.46, g: 0.36, b: 0.26, a: 0 },
  ]);
  first.emitBurst([0, 0, 0], 1);
  second.emitBurst([0, 0, 0], 1);
  expect(first.particles[0]).toMatchObject({
    r: 0.46,
    g: 0.36,
    b: 0.26,
    a: 0.4,
    size: 1,
  });
  expect(second.particles[0]).toMatchObject({
    r: 1,
    g: 1,
    b: 1,
    a: 1,
    size: 1,
  });
  first.update(500);
  expect(first.particles[0].a).toBeCloseTo(0.2);
  const fixed = new EmitterInstance({ ...data, useEmitterColors: false });
  fixed.setColors([{ r: 0, g: 0, b: 0, a: 0 }]);
  fixed.emitBurst([0, 0, 0], 1);
  expect(fixed.particles[0].r).toBe(1);
});
it("emits foot puffs in the engine's radius/count distribution", () => {
  const e = new EmitterInstance(emitterData(), 256, () => 0.25);
  e.emitRadial([10, 20, 30], 0.25, 15);
  expect(e.particles).toHaveLength(15);
  for (const p of e.particles) {
    expect(Math.abs(p.pos[0] - 10)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(p.pos[1] - 20)).toBeLessThanOrEqual(0.25);
    expect(p.pos[2]).toBeGreaterThanOrEqual(30);
    expect(p.pos[2]).toBeLessThanOrEqual(30.25);
  }
});

it("keeps per-emitter size and color overrides independent of shared particle datablocks", () => {
  const data = emitterData({ useEmitterSizes: true, useEmitterColors: true });
  const first = new EmitterInstance(data),
    second = new EmitterInstance(data);
  first.setSizes([2, 4]);
  first.setColors([
    { r: 0.5, g: 0, b: 0, a: 1 },
    { r: 0, g: 0, b: 1, a: 0 },
  ]);
  first.emitBurst([0, 0, 0], 1);
  second.emitBurst([0, 0, 0], 1);
  expect(first.particles[0].size).toBe(2);
  expect(first.particles[0].r).toBe(0.5);
  expect(second.particles[0].size).toBe(1);
  expect(second.particles[0].r).toBe(1);
  first.update(500);
  expect(first.particles[0].size).toBe(3);
  const fixed = new EmitterInstance(emitterData());
  fixed.setSizes([10, 20]);
  fixed.emitBurst([0, 0, 0], 1);
  expect(fixed.particles[0].size).toBe(1);
});
