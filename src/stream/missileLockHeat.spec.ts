import { expect, it } from "vitest";
import {
  advanceMissileTargetHeat,
  observeMissileTargetHeat,
  readMissileHeatRates,
  type MissileTargetHeat,
} from "./missileLockHeat";

const rates = { heatDecayPerSec: 0.25, heatIncreasePerSec: 1 / 3 };

it("requires both rates from the target's actual armor datablock", () => {
  expect(readMissileHeatRates(rates)).toEqual(rates);
  expect(readMissileHeatRates({ heatDecayPerSec: 0.25 })).toBeUndefined();
  expect(
    readMissileHeatRates({ ...rates, heatIncreasePerSec: NaN }),
  ).toBeUndefined();
  expect(
    readMissileHeatRates({ ...rates, heatDecayPerSec: -1 }),
  ).toBeUndefined();
  expect(
    readMissileHeatRates({ ...rates, heatDecayPerSec: 0 }),
  ).toBeUndefined();
  const minimum = { ...rates, heatDecayPerSec: Math.fround(0.001) };
  expect(readMissileHeatRates(minimum)).toEqual(minimum);
});

it("proves that a newly scoped player heated up only after enough received jet ticks", () => {
  let heat = advanceMissileTargetHeat(undefined, 0, true, rates);
  expect(heat).toEqual({ tick: 0, min: 0, max: 1 });
  for (let tick = 1; tick <= 67; tick++) {
    heat = advanceMissileTargetHeat(heat, tick, true, rates);
  }
  expect(heat.min).toBeLessThan(0.7);
  expect(advanceMissileTargetHeat(heat, 68, true, rates).min).toBeGreaterThan(
    0.7,
  );
});

it("counts unknown ticks as possible cooling even when both endpoints report jets", () => {
  const hot: MissileTargetHeat = { tick: 10, min: 0.8, max: 0.85 };
  const gap = advanceMissileTargetHeat(hot, 31, true, rates);
  expect(gap.min).toBeLessThan(0.7);
  expect(gap.max).toBe(1);
  const noFlag = advanceMissileTargetHeat(hot, 11, undefined, rates);
  expect(noFlag.min).toBeLessThan(hot.min);
  expect(noFlag.max).toBeGreaterThan(hot.max);
});

it("follows the first cooling step from full, ignores duplicates, and resets on rewind", () => {
  const full: MissileTargetHeat = { tick: 100, min: 1, max: 1 };
  const cooled = advanceMissileTargetHeat(full, 101, false, rates);
  expect(cooled).toEqual({
    tick: 101,
    min: Math.fround(0.99999),
    max: Math.fround(0.99999),
  });
  expect(advanceMissileTargetHeat(cooled, 101, true, rates)).toBe(cooled);
  expect(advanceMissileTargetHeat(cooled, 99, true, rates)).toEqual({
    tick: 99,
    min: 0,
    max: 1,
  });
});

it.each([true, false])(
  "widens heat bounds when packets disagree on the same tick (first flag %s)",
  (jetting) => {
    const bounds = { tick: 10, min: 0.6, max: 0.8 };
    const first = observeMissileTargetHeat({ bounds }, 12, jetting, rates);
    expect(observeMissileTargetHeat(first, 12, jetting, rates)).toBe(first);

    const uncertain = observeMissileTargetHeat(first, 12, !jetting, rates);
    expect(uncertain.bounds).toEqual(
      advanceMissileTargetHeat(bounds, 12, undefined, rates),
    );
    expect(observeMissileTargetHeat(uncertain, 12, jetting, rates)).toBe(
      uncertain,
    );
    expect(observeMissileTargetHeat(uncertain, 13, true, rates).bounds).toEqual(
      advanceMissileTargetHeat(uncertain.bounds, 13, true, rates),
    );
  },
);
