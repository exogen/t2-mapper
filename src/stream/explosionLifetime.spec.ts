import { describe, expect, it } from "vitest";
import {
  explosionExplodeTicks,
  explosionLifetimeTicks,
  resolveExplosionTiming,
} from "./explosionLifetime";

const lifetimeMS = (
  block: Record<string, unknown> | undefined,
  ambient: number | undefined,
  random?: () => number,
) => resolveExplosionTiming(block, ambient, random).lifetimeMS;

describe("resolveExplosionTiming lifetime", () => {
  it("unpacks the 16-bit lifetime with << 5 when there is no shape", () => {
    // ChaingunExplosion: no lifetimeMS in script → engine default 1000 → 31.
    expect(lifetimeMS({ lifetimeMS: 31 }, undefined)).toBe(992);
    expect(lifetimeMS(undefined, undefined)).toBe(992);
  });

  it("applies lifetimeVariance as an integer in [-v, v]", () => {
    const block = { lifetimeMS: 31, lifetimeVariance: 2 };
    expect(lifetimeMS(block, undefined, () => 0)).toBe(992 - 64);
    expect(lifetimeMS(block, undefined, () => 0.999999)).toBe(992 + 64);
  });

  it("uses the ambient sequence duration over playSpeed for shape explosions", () => {
    // MissileExplosion: effect_plasma_explosion (1.1333 s) @ playSpeed 1.5.
    expect(lifetimeMS({ lifetimeMS: 31, playSpeed: 30 }, 1.1333)).toBe(756);
    // SniperExplosion: energy_explosion (0.3 s) @ default playSpeed.
    expect(lifetimeMS({ lifetimeMS: 31 }, 0.3)).toBe(300);
  });

  it("falls back to the datablock lifetime without an ambient sequence", () => {
    expect(lifetimeMS({ lifetimeMS: 62 }, undefined)).toBe(1984);
  });
});

describe("resolveExplosionTiming delay", () => {
  it("unpacks delayMS ± delayVariance and keeps the armed lifetime", () => {
    // MortarSubExplosion1: delayMS 100 → wire 3 → 96 ms.
    const t = resolveExplosionTiming(
      { delayMS: 3, lifetimeMS: 31, playSpeed: 30 },
      0.9,
    );
    expect(t).toEqual({ delayMS: 96, armedLifetimeMS: 992, lifetimeMS: 600 });
    expect(
      resolveExplosionTiming(
        { delayMS: 3, delayVariance: 1 },
        undefined,
        () => 0,
      ).delayMS,
    ).toBe(64);
    expect(resolveExplosionTiming(undefined, undefined).delayMS).toBe(0);
  });
});

describe("explosionExplodeTicks", () => {
  it("is the first tick whose 32 ms clock exceeds the delay", () => {
    expect(explosionExplodeTicks(0)).toBe(0);
    expect(explosionExplodeTicks(32)).toBe(2);
    expect(explosionExplodeTicks(96)).toBe(4);
    expect(explosionExplodeTicks(100)).toBe(4);
  });
});

describe("explosionLifetimeTicks", () => {
  it("matches processTick's 32 ms steps with a <= comparison", () => {
    expect(explosionLifetimeTicks(992)).toBe(31);
    expect(explosionLifetimeTicks(600)).toBe(19);
    expect(explosionLifetimeTicks(300)).toBe(10);
    expect(explosionLifetimeTicks(0)).toBe(1);
  });
});
