import { describe, expect, it } from "vitest";
import { timingChanges, upgradeChanges } from "./compareRelayDemoUpgrades.js";
import type { RelayDemoUpgrade } from "./upgradeRelayDemo.js";

/**
 * An applied report as older converter code wrote it, before it counted
 * clamped pitches.
 */
const applied = {
  generation: "unacked-moves",
  oldLengthMs: 368832,
  newLengthMs: 368672,
  cutMs: 160,
  droppedTicks: 2,
  droppedRuns: [{ fromMs: 64000, ms: 64 }],
  ackedPackets: 15047,
  gameOversRewritten: 0,
  clientId: { old: 73807, new: 73807 },
} as unknown as RelayDemoUpgrade;

describe("timingChanges", () => {
  it("passes a re-upgrade that only rewrites more packets", () => {
    const reupgraded = {
      ...applied,
      droppedRuns: [{ fromMs: 64000, ms: 64 }],
      clampedPitches: 14900,
      zeroedVelocities: 0,
    } as RelayDemoUpgrade;
    expect(timingChanges(applied, reupgraded)).toEqual([]);
  });

  it("names each timing field that moves", () => {
    expect(
      timingChanges(applied, { ...applied, cutMs: 192, newLengthMs: 368640 }),
    ).toEqual(["cutMs 160 → 192", "newLengthMs 368672 → 368640"]);
  });

  it("compares dropped runs by content", () => {
    expect(
      timingChanges(applied, {
        ...applied,
        droppedRuns: [{ fromMs: 64032, ms: 64 }],
      }),
    ).toEqual([
      'droppedRuns [{"fromMs":64000,"ms":64}] → [{"fromMs":64032,"ms":64}]',
    ]);
  });
});

describe("upgradeChanges", () => {
  it("lists every field that differs, counting a missing one as 0", () => {
    const reupgraded = {
      ...applied,
      clampedPitches: 14900,
      zeroedVelocities: 0,
      fallback: "no handshake",
    } as RelayDemoUpgrade;
    expect(upgradeChanges(applied, reupgraded)).toEqual([
      "clampedPitches none → 14900",
      "fallback none → no handshake",
    ]);
  });

  it("shortens long values", () => {
    const droppedRuns = Array.from({ length: 20 }, (_, i) => ({
      fromMs: i * 1000,
      ms: 32,
    }));
    const [change] = upgradeChanges(applied, { ...applied, droppedRuns }, [
      "droppedRuns",
    ]);
    expect(change).toMatch(/^droppedRuns \[.+\] → \[.{58}…$/);
  });
});
