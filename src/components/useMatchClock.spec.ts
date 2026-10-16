import { expect, it } from "vitest";
import { matchClockAt } from "../state/matchClock";
import { formatHudClock } from "./useMatchClock";

it.each([
  [-(29 * 60_000 + 59_999), "29:59"],
  [-45_678, "45.67"],
  [-0.4, "00.00"],
  [0, "00:00"],
  [3 * 60_000 + 5_999, "03:05"],
  [-3_599_999, "59:59"],
  // Hours, which Tribes2.exe drops: a 999-minute limit (MsgSystemClock
  // "999" "5.992e+07") reads 38:40 there with 998:40 left, and fakes a
  // final minute at the top of every hour.
  [-3_600_000, "1:00:00"],
  [-59_920_000, "16:38:40"],
  [-(16 * 3_600_000 + 30_250), "16:00:30"],
  [3_600_000 + 2 * 60_000 + 5_000, "1:02:05"],
])("renders HUD clock %f ms as %s", (clockMs, text) => {
  expect(formatHudClock(clockMs)).toBe(text);
});

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
