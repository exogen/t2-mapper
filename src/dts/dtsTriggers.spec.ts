import { expect, it } from "vitest";
import { advanceDTSTriggers } from "./dtsTriggers";
const on = 0x80000000;
const invert = 0x40000000;
it("consumes half-open trigger intervals and wraps in both directions", () => {
  const triggers = [
    { state: on | 1, position: 0.25 },
    { state: on | 2, position: 0.75 },
  ];
  expect(advanceDTSTriggers(triggers, 0, 0.25, true)).toBe(0);
  expect(advanceDTSTriggers(triggers, 0.25, 0.26, true)).toBe(1);
  expect(advanceDTSTriggers(triggers, 0.9, 1.3, true)).toBe(1);
  expect(advanceDTSTriggers(triggers, 0.1, -0.3, true)).toBe(2);
  expect(advanceDTSTriggers(triggers, 0.75, 0.25, true)).toBe(1);
});
it("preserves trigger bit masks, clear events and reverse inversion", () => {
  const triggers = [
    { state: on | invert | 3, position: 0.2 },
    { state: 1, position: 0.4 },
  ];
  expect(advanceDTSTriggers(triggers, 0, 0.3, false)).toBe(3);
  expect(advanceDTSTriggers(triggers, 0.3, 0.5, false, 3)).toBe(2);
  expect(advanceDTSTriggers(triggers, 0.3, 0.1, false, 3)).toBe(0);
});
it("processes only the final cycle on a multi-wrap advance", () => {
  const triggers = [
    { state: 1, position: 0.1 },
    { state: on | 1, position: 0.5 },
  ];
  expect(advanceDTSTriggers(triggers, 0.2, 50.2, true)).toBe(0);
  expect(advanceDTSTriggers(triggers, 0.2, -50.8, true)).toBe(1);
});
