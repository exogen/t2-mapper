import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { timelineRandom } from "../stream/timelineRandom";
import type { LightningConfig } from "./types";
import {
  ExploreLightningScheduler,
  generateLightningNodes,
  LightningBolt,
  lightningRandomDirection,
  LightningStrikeSimulation,
  lightningThunderDelay,
} from "./lightning";

function config(): LightningConfig {
  return {
    position: [0, 0, 150],
    scale: [512, 512, 300],
    strikeWidth: 2.5,
    chanceToHitTarget: 0.5,
    strikeRadius: 20,
    boltStartRadius: 20,
    color: [1, 0.8, 0.6, 0.7],
    fadeColor: [0.1, 0.1, 1, 0.01],
    useFog: true,
    strikesPerMinute: 12,
    strikeTextures: ["lightning"],
    thunderSounds: [],
  };
}

describe("retail lightning geometry", () => {
  it("pins both endpoints and uses the native node count and angular draw", () => {
    const nodes = generateLightningNodes(
      [0, 0, 90],
      [0, 0, 0],
      10,
      0,
      () => 0.5,
    );
    expect(nodes.map(({ point }) => point)).toEqual(
      Array.from({ length: 10 }, (_, i) => [0, 0, 90 - i * 10]),
    );
    const draws = [0.5, 0.25];
    const direction = new Vector3(
      ...lightningRandomDirection([0, 0, 1], 0, 30, () => draws.shift()!),
    );
    expect(direction.length()).toBeCloseTo(1);
    expect(
      (direction.angleTo(new Vector3(0, 0, 1)) * 180) / Math.PI,
    ).toBeCloseTo(15);
    const orientation = lightningRandomDirection([0, 0, 1], 30, 30, () => 0);
    expect(orientation[0]).toBeCloseTo(0);
    expect(orientation[1]).toBeCloseTo(0.5);
    expect(orientation[2]).toBeCloseTo(Math.sqrt(0.75));
  });

  it("makes three cloud starts with ten major and four minor nodes", () => {
    const simulation = new LightningStrikeSimulation(
      config(),
      [10, 20, 5],
      () => 1,
    );
    expect(simulation.bolts).toHaveLength(3);
    for (const bolt of simulation.bolts) {
      expect(bolt.primary.major).toHaveLength(10);
      expect(bolt.primary.major[0].point).toEqual([30, 40, 300]);
      expect(bolt.primary.major.at(-1)!.point).toEqual([10, 20, 5]);
      expect(bolt.primary.minor).toHaveLength(9);
      expect(bolt.primary.minor.every((nodes) => nodes.length === 4)).toBe(
        true,
      );
      expect(bolt.renderTime).toBe(0.25);
    }
  });

  it("recursively splits to depth four, with native widths and per-segment U", () => {
    const bolt = new LightningBolt([0, 0, 100], [0, 0, 0], 2.5, () => 0);
    bolt.update(0.01);
    const lines = bolt.lines(config(), false);
    expect(bolt.branches).toHaveLength(9 * 15);
    expect(lines[0].points).toHaveLength(28);
    expect(lines[0].u.slice(0, 7)).toEqual([0, 1, 0, 0, 1, 0, 0]);
    expect(
      lines
        .slice(1)
        .every((line) => line.width === 0.75 && line.points.length === 5),
    ).toBe(true);
  });

  it("jiggles minor nodes per render until fading, and freezes when paused", () => {
    const bolt = new LightningBolt(
      [0, 0, 100],
      [0, 0, 0],
      2.5,
      timelineRandom(7),
    );
    bolt.update(0.26);
    const first = bolt.lines(config());
    expect(bolt.lines(config(), false)).toEqual(first);
    expect(bolt.lines(config())).not.toEqual(first);
    bolt.update(0.201);
    const faded = bolt.lines(config());
    expect(bolt.lines(config())).toEqual(faded);
  });
});

describe("retail lightning clocks", () => {
  it("uses strict delay/fade thresholds, resets age on start, and ignores fadeColor alpha", () => {
    const bolt = new LightningBolt([0, 0, 100], [0, 0, 0], 2.5, () => 1);
    bolt.update(0.25);
    expect(bolt.started).toBe(false);
    bolt.update(0.001);
    expect(bolt.started).toBe(true);
    expect(bolt.elapsedTime).toBe(0);
    expect(bolt.lines(config(), false)[0].color).toEqual(config().color);
    bolt.update(0.2);
    expect(bolt.fading).toBe(false);
    bolt.update(0.001);
    expect(bolt.lines(config(), false)[0].color).toEqual([
      0.1,
      0.1,
      1,
      1 - 0.401,
    ]);
    bolt.update(1);
    expect(bolt.lines(config(), false)[0].color[3]).toBe(0);
  });

  it("reconstructs the same cosmetic pose from an event seed and seek age", () => {
    const a = new LightningStrikeSimulation(
      config(),
      [10, 20, 0],
      timelineRandom(23),
    );
    const b = new LightningStrikeSimulation(
      config(),
      [10, 20, 0],
      timelineRandom(23),
    );
    a.advanceTo(0.36, config());
    b.advanceTo(0.36, config());
    expect(a.lines(config(), false)).toEqual(b.lines(config(), false));
  });

  it("delays thunder by horizontal distance /330, playing immediately within 0.03 s", () => {
    expect(lightningThunderDelay([0, 0, 10000], [0, 0, 0])).toBe(0);
    expect(lightningThunderDelay([9.9, 0, 0], [0, 0, 0])).toBe(0);
    expect(lightningThunderDelay([330, 0, 0], [0, 0, 10000])).toBe(1);
  });

  it("schedules only on whole 32 ms server ticks with a strict period comparison", () => {
    const scheduler = new ExploreLightningScheduler();
    expect(scheduler.update(0.32, 187.5)).toBe(0);
    expect(scheduler.update(0, 187.5)).toBe(0);
    expect(scheduler.update(0.032, 187.5)).toBe(1);
    expect(scheduler.update(0.288, 187.5)).toBe(0);
    expect(scheduler.update(0.032, 187.5)).toBe(1);
    expect(new ExploreLightningScheduler().update(0.32, 100_000)).toBe(10);
    expect(new ExploreLightningScheduler().update(100, 0)).toBe(0);
  });
});
