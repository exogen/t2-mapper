import { describe, expect, it } from "vitest";
import {
  advanceForceField,
  forceFieldAlpha,
  forceFieldPositionForState,
  ForceFieldState,
  type ForceFieldMotion,
} from "./forceFieldState";

describe("forceFieldPositionForState", () => {
  it("derives the position the wire omits", () => {
    expect(forceFieldPositionForState(ForceFieldState.Closed, 500, 1000)).toBe(
      0,
    );
    expect(
      forceFieldPositionForState(ForceFieldState.Open, undefined, 1000),
    ).toBe(1000);
    expect(forceFieldPositionForState(ForceFieldState.Closing, 968, 1000)).toBe(
      968,
    );
    expect(forceFieldPositionForState(ForceFieldState.Opening, 0, 1000)).toBe(
      0,
    );
  });
});

describe("advanceForceField", () => {
  it("closes over fadeMS / 32 ticks from the server's first-tick position", () => {
    let motion: ForceFieldMotion = {
      state: ForceFieldState.Closing,
      position: 968,
    };
    let ticks = 0;
    while (motion.state === ForceFieldState.Closing) {
      motion = advanceForceField(motion, 1000);
      ticks++;
    }
    expect(ticks).toBe(31);
    expect(motion).toEqual({ state: ForceFieldState.Closed, position: 0 });
  });

  it("opens and clamps at fadeMS", () => {
    let motion: ForceFieldMotion = {
      state: ForceFieldState.Opening,
      position: 992,
    };
    motion = advanceForceField(motion, 1000);
    expect(motion).toEqual({ state: ForceFieldState.Open, position: 1000 });
    expect(advanceForceField(motion, 1000)).toBe(motion);
  });

  it("leaves resting states alone", () => {
    const closed = { state: ForceFieldState.Closed, position: 0 };
    expect(advanceForceField(closed, 1000)).toBe(closed);
  });
});

describe("forceFieldAlpha", () => {
  it("is 1 − position / fadeMS, floored at 0", () => {
    expect(
      forceFieldAlpha({ state: ForceFieldState.Closed, position: 0 }, 1000),
    ).toBe(1);
    expect(
      forceFieldAlpha({ state: ForceFieldState.Closing, position: 968 }, 1000),
    ).toBeCloseTo(0.032, 6);
    expect(
      forceFieldAlpha({ state: ForceFieldState.Open, position: 1000 }, 1000),
    ).toBe(0);
    expect(
      forceFieldAlpha({ state: ForceFieldState.Opening, position: 1200 }, 1000),
    ).toBe(0);
  });

  it("falls back to the state when the datablock has no fade", () => {
    expect(
      forceFieldAlpha({ state: ForceFieldState.Open, position: 0 }, 0),
    ).toBe(0);
    expect(
      forceFieldAlpha({ state: ForceFieldState.Closed, position: 0 }, 0),
    ).toBe(1);
  });
});
