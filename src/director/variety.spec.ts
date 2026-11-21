import { describe, expect, it } from "vitest";
import { CausalView } from "./causalView";
import { busiestInventory } from "./analysis";
import {
  canContinueVarietyShot,
  offensiveWaveShot,
  pickVarietyShot,
} from "./variety";
import { directorDataset } from "./directorTestFixtures";
import type { DirectorDataset, DirectorVec3 } from "./types";

function choose(ds: DirectorDataset, at = 60, lookahead = 6, currentMax = 0) {
  const view = new CausalView(ds, lookahead);
  const framing = { fixedCount: 0, dollyCount: 0 };
  view.advanceTo(at);
  return {
    pick: pickVarietyShot(view, at, new Map(), framing, 9, currentMax),
    framing,
    view,
  };
}

describe("variety arbitration", () => {
  it("can air an opposing aircraft engagement without a transport crew", () => {
    const ds = directorDataset({
      vehicles: [54, 57, 60].flatMap((timeSec) =>
        [1, 2].map((teamId) => ({
          timeSec,
          teamId,
          key: String(teamId),
          kind: "shrike",
          pos: [timeSec * 8, teamId * 6, 100],
          passengers: 1,
        })),
      ),
    });
    expect(choose(ds).pick?.shot).toMatchObject({
      kind: "sweep",
      target: [480, 9, 102],
      targetTo: [512, 9, 102],
      topic: "vehicle",
      reason: "Dogfight — opposing aircraft",
    });
  });

  it.each([
    { parked: true, passengers: 0 },
    { parked: true, passengers: 1 },
    { parked: false, passengers: 0 },
  ])(
    "skips an aircraft encounter when the other craft is idle or empty ($parked, $passengers)",
    ({ parked, passengers }) => {
      const ds = directorDataset({
        vehicles: [55, 56, 57, 58, 59, 60].flatMap((timeSec) =>
          [1, 2].map((teamId) => ({
            timeSec,
            teamId,
            key: String(teamId),
            kind: "shrike",
            pos: [teamId === 2 && parked ? 480 : timeSec * 8, teamId * 6, 100],
            passengers: teamId === 2 ? passengers : 1,
          })),
        ),
      });
      expect(choose(ds).pick?.family).not.toBe("vehicle");
    },
  );

  it("waits for boarding before showing a pad and follows the rider through departure", () => {
    const ds = directorDataset({
      stations: [
        {
          kind: "vehiclePad",
          pos: [100, 100, 48],
          deployed: false,
          activations: [61],
        },
      ],
      vehicles: [
        {
          timeSec: 61.5,
          key: "new",
          teamId: 1,
          kind: "shrike",
          pos: [103, 99, 53],
          passengers: 0,
        },
      ],
    });
    expect(choose(ds, 60, 2).pick?.family).not.toBe("vehiclePad");
    ds.vehicles!.push({
      ...ds.vehicles![0],
      timeSec: 62.5,
      pos: [121, 99, 55],
      passengers: 1,
    });
    ds.playerSamples = [
      { timeSec: 61, targetId: 7, teamId: 1, pos: [103, 99, 50] },
      { timeSec: 62, targetId: 7, teamId: 1, pos: [103, 99, 50] },
      {
        timeSec: 62.5,
        targetId: 7,
        teamId: 1,
        pos: [121, 99, 55],
        vehicleId: "new",
      },
    ];
    expect(choose(ds, 61, 1).pick?.family).not.toBe("vehiclePad");
    expect(choose(ds, 61, 2).pick?.shot).toMatchObject({
      kind: "followPlayer",
      targetId: 7,
      reason: "Boarding a shrike at the vehicle pad",
    });
  });

  it("frames a recorded impact near a flag and leaves a more urgent story on screen", () => {
    const ds = directorDataset({
      flagSamples: [
        {
          timeSec: 60,
          slot: 2,
          status: "home",
          carrierTargetId: null,
          pos: [800, 0, 100],
        },
      ],
      mortarShots: [
        { timeSec: 58, endSec: 62, from: [900, 0, 100], to: [800, 0, 100] },
      ],
      ordnanceImpacts: [{ timeSec: 62, kind: "mortar", pos: [800, 0, 100] }],
    });
    expect(choose(ds, 60, 1).pick?.family).not.toBe("ordnanceImpact");
    expect(choose(ds, 60, 3, 96).pick?.family).not.toBe("ordnanceImpact");
    expect(choose(ds, 60, 3).pick?.shot).toMatchObject({
      kind: "fixedOrbit",
      center: [800, 0, 100],
      reason: "Mortar impact at the flag stand",
    });
    ds.ordnanceImpacts = [];
    expect(choose(ds, 60, 3).pick?.family).not.toBe("ordnanceImpact");
  });

  it("follows an actual transport rider when a ground player is closer to the flight path", () => {
    const ds = directorDataset({
      vehicles: [55, 59, 60].map((timeSec) => ({
        timeSec,
        teamId: 1,
        key: "transport",
        kind: "havoc",
        pos: [timeSec * 20, 0, 100],
        passengers: 3,
      })),
      playerSamples: [
        { timeSec: 60, targetId: 1, teamId: 1, pos: [1150, 0, 100] },
        {
          timeSec: 60,
          targetId: 2,
          teamId: 1,
          pos: [1200, 0, 100],
          vehicleId: "transport",
        },
      ],
    });
    expect(choose(ds).pick?.shot).toMatchObject({
      kind: "followPlayer",
      targetId: 2,
    });
  });

  it("never spends a framing angle on candidates that lose or cannot interrupt", () => {
    const ds = directorDataset({
      structures: [
        {
          timeSec: 58,
          name: "generator",
          className: "StaticShape",
          pos: [20, 0, 100],
          from: 0,
          to: 2,
        },
        {
          timeSec: 59,
          name: "turret",
          className: "Turret",
          pos: [30, 0, 100],
          from: 1,
          to: 0,
        },
      ],
    });
    expect(choose(ds, 60, 6, 100).framing.fixedCount).toBe(0);
    const accepted = choose(ds);
    expect(accepted.pick?.family).toBe("destruction");
    expect(accepted.framing.fixedCount).toBe(1);
  });

  it("frames a sustained group approach and gives the live flag priority", () => {
    const ds = directorDataset({
      flagSamples: [
        {
          timeSec: 60,
          slot: 2,
          status: "home",
          pos: [800, 0, 100],
          carrierTargetId: null,
        },
      ],
      playerSamples: [57, 60].flatMap((timeSec) =>
        [1, 2, 3].map((targetId) => ({
          timeSec,
          targetId,
          teamId: 1,
          pos: [510 + (timeSec - 57) * 18, 10 * targetId, 100],
        })),
      ),
    });
    expect(choose(ds).pick?.shot).toMatchObject({
      kind: "sweep",
      target: [564, 20, 102],
      targetTo: [636, 20, 102],
      reason: "3 attackers pushing the enemy base",
    });
    const { view } = choose(ds);
    expect(
      offensiveWaveShot(view, 60, new Map([["offensiveWave:2", 59]])),
    ).toBeNull();
    expect(
      offensiveWaveShot(view, 60, new Map([["offensiveWave:1", 59]]))
        ?.cooldownKey,
    ).toBe("offensiveWave:2");
    expect(choose(ds, 60, 6, 100).pick).toBeNull();
    ds.playerSamples = ds.playerSamples.map((p) =>
      p.targetId === 3 ? { ...p, vehicleId: "transport" } : p,
    );
    expect(choose(ds).pick?.shot.reason).toBe(
      "2 attackers pushing the enemy base",
    );
    ds.playerSamples = ds.playerSamples.filter((p) => p.targetId !== 2);
    expect(choose(ds).pick?.family).not.toBe("offensiveWave");
  });

  it("bounds player positions and station activity to the information horizon", () => {
    const ds = directorDataset({
      stations: [
        {
          kind: "inventory",
          pos: [0, 0, 100],
          activations: [64],
          deployed: false,
        },
      ],
      playerSamples: [63, 64].flatMap((timeSec) =>
        [1, 2, 3].map((targetId) => ({
          timeSec,
          targetId,
          teamId: 1,
          pos: [timeSec - 63, 0, 100],
        })),
      ),
    });
    const { view, pick } = choose(ds, 63.5, 0);
    expect(view.playerAt(1)?.pos).toEqual([0, 0, 100]);
    expect(view.playersAt()).toHaveLength(3);
    expect(pick?.family).not.toBe("suitUp");
    expect(
      busiestInventory(choose(ds, 63.5, 1).view, 63.5, {
        minimum: 3,
        requireActive: true,
      }),
    ).toMatchObject({ count: 3 });
  });
});

const continuation = { kind: "capperSetup" as const, targetId: 5, flagSlot: 2 };

function dataset(): DirectorDataset {
  return directorDataset({
    durationSec: 90,
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
  });
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
