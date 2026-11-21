import type { ParsedData } from "t2-demo-parser";
import { getNumberField } from "./streamHelpers";

export interface MissileHeatRates {
  heatIncreasePerSec: number;
  heatDecayPerSec: number;
}

export interface MissileTargetHeat {
  tick: number;
  min: number;
  max: number;
}

export interface MissileHeatObservation {
  bounds: MissileTargetHeat;
  priorBounds?: MissileTargetHeat;
  jetting?: boolean;
}

// Player's jet heating (0x5d3ce9) and cooling (0x5d21f0) both use
// the same 1/32 multiplier even though packet replay ticks are 32 ms.
const HEAT_TICK_FACTOR = 1 / 32;
// PlayerData::preload (0x5cdee1) clamps cooling rates below this minimum.
const MIN_HEAT_DECAY = Math.fround(0.001);
const FIRST_COOL_FROM_FULL = Math.fround(0.99999);
const FLOAT_ROUNDING = 2 ** -24;

/** Use the rates actually received for this armor, including mod overrides. */
export function readMissileHeatRates(
  data: ParsedData | undefined,
): MissileHeatRates | undefined {
  const heatIncreasePerSec = getNumberField(data, ["heatIncreasePerSec"]);
  const heatDecayPerSec = getNumberField(data, ["heatDecayPerSec"]);
  if (
    heatIncreasePerSec === undefined ||
    heatDecayPerSec === undefined ||
    heatIncreasePerSec < 0 ||
    heatDecayPerSec < MIN_HEAT_DECAY
  )
    return;
  return { heatIncreasePerSec, heatDecayPerSec };
}

function cooled(heat: number, decay: number): number {
  return heat === 1
    ? FIRST_COOL_FROM_FULL
    : Math.fround(Math.max(0, heat - decay));
}

/** Advance one scoped, unmounted player's stock heat model. Supply only
 * jetting flags received for this completed tick. Unobserved ticks widen the
 * range because the player could have heated or cooled between updates. */
export function advanceMissileTargetHeat(
  previous: MissileTargetHeat | undefined,
  tick: number,
  observedJetting: boolean | undefined,
  rates: MissileHeatRates,
): MissileTargetHeat {
  if (!previous || tick < previous.tick) return { tick, min: 0, max: 1 };
  if (tick === previous.tick) return previous;

  const increase = rates.heatIncreasePerSec * HEAT_TICK_FACTOR;
  const decay = rates.heatDecayPerSec * HEAT_TICK_FACTOR;
  const missed = tick - previous.tick - Number(observedJetting !== undefined);
  // Include worst-case float rounding for each missed tick.
  const min = Math.max(0, previous.min - (decay + FLOAT_ROUNDING) * missed);
  const max = Math.min(1, previous.max + (increase + FLOAT_ROUNDING) * missed);
  if (observedJetting === true)
    return {
      tick,
      min: Math.fround(Math.min(1, min + increase)),
      max: Math.fround(Math.min(1, max + increase)),
    };
  if (observedJetting === false)
    return { tick, min: cooled(min, decay), max: cooled(max, decay) };
  return { tick, min, max };
}

/** Multiple packets can land on one replay tick. Conflicting jet flags leave
 * that tick's jetting unknown until the next tick. */
export function observeMissileTargetHeat(
  previous: MissileHeatObservation | undefined,
  tick: number,
  jetting: boolean,
  rates: MissileHeatRates,
): MissileHeatObservation {
  if (previous?.bounds.tick === tick) {
    if (previous.jetting === undefined || previous.jetting === jetting)
      return previous;
    return {
      priorBounds: previous.priorBounds,
      bounds: advanceMissileTargetHeat(
        previous.priorBounds,
        tick,
        undefined,
        rates,
      ),
    };
  }

  const priorBounds =
    previous && previous.bounds.tick < tick ? previous.bounds : undefined;
  return {
    bounds: advanceMissileTargetHeat(priorBounds, tick, jetting, rates),
    priorBounds,
    jetting,
  };
}
