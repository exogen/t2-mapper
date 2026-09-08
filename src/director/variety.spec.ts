import { describe, expect, it } from "vitest";
import { CausalView } from "./causalView";
import { canContinueVarietyShot, pickVarietyShot } from "./variety";
import type { DirectorDataset, DirectorVec3 } from "./types";

const continuation = { kind: "capperSetup" as const, targetId: 5, flagSlot: 2 };

function dataset(): DirectorDataset {
  return {
    durationSec: 90,
    flagSampleStepSec: 0.5,
    playerSampleStepSec: 1,
    gameClassName: "CTFGame",
    teams: [],
    flagStands: [
      { slot: 1, teamId: 1, name: "Storm", pos: [0, 0, 100] },
      { slot: 2, teamId: 2, name: "Inferno", pos: [1000, 0, 100] },
    ],
    flagSamples: [
      {
        timeSec: 60,
        slot: 2,
        status: "home",
        carrierTargetId: null,
        pos: [1000, 0, 100],
      },
    ],
    playerSamples: Array.from({ length: 11 }, (_, i) => ({
      timeSec: 57 + i,
      targetId: 5,
      teamId: 1,
      pos: [i * 50, 0, 100] as DirectorVec3,
    })),
    events: [],
    structures: [],
    structureInventory: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    playerNames: [],
    scoreSamples: [],
  };
}

describe("capper route validity", () => {
  it("attaches the player and intended flag, and rejects respawn motion or a flag away from its stand", () => {
    for (const invalid of [null, "death", "field"] as const) {
      const ds = dataset();
      if (invalid === "death")
        ds.deaths.push({
          timeSec: 59,
          targetId: 5,
          teamId: 1,
          pos: [100, 0, 100],
          killerTargetId: null,
        });
      if (invalid === "field") ds.flagSamples[0].status = "field";
      const view = new CausalView(ds);
      view.advanceTo(60);
      const pick = pickVarietyShot(
        view,
        60,
        new Map(),
        { fixedCount: 0, dollyCount: 0 },
        9,
        0,
      );
      if (invalid) expect(pick?.family).not.toBe("capperSetup");
      else expect(pick?.continuation).toEqual(continuation);
    }
  });

  it("does not end an approach early for a death inside the peek, or revive it after respawn", () => {
    const ds = dataset();
    ds.deaths.push({
      timeSec: 64,
      targetId: 5,
      teamId: 1,
      pos: [350, 0, 100],
      killerTargetId: null,
    });
    const view = new CausalView(ds, 2);
    view.advanceTo(62);
    expect(canContinueVarietyShot(view, continuation, 60)).toBe(true);
    view.advanceTo(64);
    expect(canContinueVarietyShot(view, continuation, 60)).toBe(false);
    view.advanceTo(67);
    expect(canContinueVarietyShot(view, continuation, 60)).toBe(false);
  });

  it("ends an abandoned route but tolerates a slower approach and one missing sample", () => {
    for (const behavior of ["away", "slow", "missing"] as const) {
      const ds = dataset();
      ds.playerSamples = ds.playerSamples.filter((p) => p.timeSec <= 60);
      if (behavior !== "missing")
        ds.playerSamples.push({
          timeSec: 63,
          targetId: 5,
          teamId: 1,
          pos: [behavior === "away" ? 0 : 225, 0, 100],
        });
      const view = new CausalView(ds);
      view.advanceTo(63);
      expect(canContinueVarietyShot(view, continuation, 60)).toBe(
        behavior !== "away",
      );
    }
  });

  it("uses only samples at or before picture time, including at zero lookahead", () => {
    const ds = dataset();
    ds.playerSamples.find((p) => p.timeSec === 64)!.pos = [-1000, 0, 100];
    const full = new CausalView(ds, 0);
    const prefix = new CausalView(
      {
        ...ds,
        playerSamples: ds.playerSamples.filter((p) => p.timeSec <= 63.5),
      },
      0,
    );
    for (const view of [full, prefix]) {
      view.advanceTo(63.5);
      expect(canContinueVarietyShot(view, continuation, 60)).toBe(true);
      expect(
        pickVarietyShot(
          view,
          63.5,
          new Map(),
          { fixedCount: 0, dollyCount: 0 },
          9,
          0,
        )?.continuation,
      ).toEqual(continuation);
    }
  });
});
