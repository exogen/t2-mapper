import { expect, it } from "vitest";
import { matchClockAt } from "./useMatchClock";

it.each([-123456, 123456, 0])(
  "holds an ended HUD clock (%i ms) instead of extrapolating",
  (matchClockMs) => {
    const snapshot = { matchClockMs, timeSec: 60, matchEnded: true };
    expect(matchClockAt(snapshot, 65)).toBe(matchClockMs);
    expect(matchClockAt({ ...snapshot, matchEnded: false }, 65)).toBe(
      matchClockMs + 5000,
    );
  },
);

it("does not invent a clock for a missing snapshot", () => {
  expect(matchClockAt(null, 65)).toBeNull();
  expect(
    matchClockAt({ matchClockMs: null, timeSec: 60, matchEnded: true }, 65),
  ).toBeNull();
});
