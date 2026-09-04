import { describe, expect, it } from "vitest";
import { planShots } from "./planner";
import { radiusForSpread } from "./framing";
import { DIRECTOR_CLUSTER_CAM_RADIUS } from "./tunables";
import type {
  DirectorDataset,
  DirectorEvent,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  Shot,
} from "./types";

const STAND_1: DirectorVec3 = [0, 0, 100];
const STAND_2: DirectorVec3 = [800, 0, 100];

function lerp(a: DirectorVec3, b: DirectorVec3, t: number): DirectorVec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

/**
 * Synthetic 120s CTF demo: quiet until t=30, then the Inferno flag is
 * grabbed and run toward Storm's base, dropped at 55, re-grabbed at 70,
 * and capped at 90.
 */
function ctfDataset(
  extraEvents: DirectorEvent[] = [],
  extraPlayerSamples: DirectorPlayerSample[] = [],
): DirectorDataset {
  const durationSec = 120;
  const flagSamples: DirectorFlagSample[] = [];
  for (let t = 0; t <= durationSec; t += 0.5) {
    flagSamples.push({
      timeSec: t,
      slot: 1,
      pos: STAND_1,
      carrierTargetId: null,
      status: "home",
    });
    let status: DirectorFlagSample["status"];
    let pos: DirectorVec3;
    let carrierTargetId: number | null = null;
    if (t < 30 || t >= 90) {
      status = "home";
      pos = STAND_2;
    } else if (t < 55) {
      status = "held";
      carrierTargetId = 5;
      pos = lerp(STAND_2, STAND_1, (t - 30) / 60);
    } else if (t < 70) {
      status = "field";
      pos = lerp(STAND_2, STAND_1, 25 / 60);
    } else {
      status = "held";
      carrierTargetId = 5;
      pos = lerp(STAND_2, STAND_1, (t - 45) / 60);
    }
    flagSamples.push({ timeSec: t, slot: 2, pos, carrierTargetId, status });
  }
  const events: DirectorEvent[] = [
    { timeSec: 5, type: "match-start", description: "Match started" },
    {
      timeSec: 30,
      type: "flag-grab",
      description: "Slayer grabbed the Inferno flag",
      actor: "Slayer",
      flagTeamName: "Inferno",
    },
    {
      timeSec: 55,
      type: "flag-drop",
      description: "Slayer dropped the Inferno flag",
      actor: "Slayer",
      flagTeamName: "Inferno",
    },
    {
      timeSec: 70,
      type: "flag-grab",
      description: "Slayer grabbed the Inferno flag",
      actor: "Slayer",
      flagTeamName: "Inferno",
    },
    {
      timeSec: 90,
      type: "flag-cap",
      description: "Slayer captured the Inferno flag",
      capturer: "Slayer",
      flagTeamName: "Inferno",
    },
    { timeSec: 118, type: "match-end", description: "Match ended" },
    ...extraEvents,
  ];
  return {
    durationSec,
    flagSampleStepSec: 0.5,
    playerSampleStepSec: 1,
    gameClassName: "CTFGame",
    teams: [
      { teamId: 1, name: "Storm" },
      { teamId: 2, name: "Inferno" },
    ],
    flagStands: [
      { slot: 1, teamId: 1, name: "Storm", pos: STAND_1 },
      { slot: 2, teamId: 2, name: "Inferno", pos: STAND_2 },
    ],
    events,
    flagSamples,
    playerSamples: [
      { timeSec: 40, targetId: 5, teamId: 1, pos: lerp(STAND_2, STAND_1, 0.2) },
      // A lone defender loitering by the flag while it lies on the
      // ground (55–70), so the drop counts as contested — an
      // uncontested flag in an empty field deliberately gets no camera.
      ...Array.from({ length: 16 }, (_, i) => ({
        timeSec: 55 + i,
        targetId: 9,
        teamId: 2,
        pos: lerp(STAND_2, STAND_1, 25 / 60),
      })),
      ...extraPlayerSamples,
    ],
    structures: [],
    structureInventory: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    playerNames: [{ targetId: 5, name: "slayer" }],
  };
}

/** Rapid-fire grabs on BOTH flags at the same instants: the camera can
 *  only be at one, so the other's grabs need spliced cut-ins — the case
 *  that produces the most splices, and so the most chances to leave a
 *  sliver or a cut storm. */
function shotAt(shots: Shot[], t: number): Shot | undefined {
  return shots.find((s) => t >= s.startSec && t < s.endSec);
}

function expectContiguous(shots: Shot[], durationSec: number): void {
  expect(shots.length).toBeGreaterThan(0);
  expect(shots[0].startSec).toBe(0);
  expect(shots[shots.length - 1].endSec).toBeCloseTo(durationSec, 5);
  for (let i = 1; i < shots.length; i++) {
    expect(shots[i].startSec).toBeCloseTo(shots[i - 1].endSec, 5);
    expect(shots[i].endSec).toBeGreaterThan(shots[i].startSec);
  }
}

describe("radiusForSpread fog cap", () => {
  const dataset = ctfDataset();
  const wide = 400;

  it("caps a wide camera at the map's fog range", () => {
    // 40m fog, 160m vanishing point: 40 + (160-40)*0.25 = 70 — between
    // the cluster-radius floor and the overview ceiling, so the fog is
    // what binds.
    expect(
      radiusForSpread(wide, {
        ...dataset,
        visibility: { fogDistance: 40, visibleDistance: 160 },
      }),
    ).toBeCloseTo(70, 5);
  });

  it("lets clear air use the full width", () => {
    const clear = radiusForSpread(wide, {
      ...dataset,
      visibility: { fogDistance: 900, visibleDistance: 1200 },
    });
    const soup = radiusForSpread(wide, {
      ...dataset,
      visibility: { fogDistance: 40, visibleDistance: 120 },
    });
    expect(clear).toBeGreaterThan(soup);
    // Clear air is limited by the field fraction, not the fog.
    expect(clear).toBeCloseTo(
      radiusForSpread(wide, { ...dataset, visibility: undefined }),
      5,
    );
  });

  it("never shrinks below a usable cluster radius", () => {
    expect(
      radiusForSpread(wide, {
        ...dataset,
        visibility: { fogDistance: 5, visibleDistance: 20 },
      }),
    ).toBeGreaterThanOrEqual(DIRECTOR_CLUSTER_CAM_RADIUS);
  });
});

describe("planShots (degradation)", () => {
  it("plans a single chase for Rabbit", () => {
    const dataset: DirectorDataset = {
      ...ctfDataset(),
      gameClassName: "RabbitGame",
      teams: [],
      flagStands: [{ slot: 1, teamId: null, name: null, pos: STAND_1 }],
      flagSamples: [
        {
          timeSec: 0,
          slot: 1,
          pos: STAND_1,
          carrierTargetId: null,
          status: "home",
        },
      ],
      events: [],
    };
    const plan = planShots(dataset);
    expect(plan.gameMode).toBe("rabbit");
    expect(plan.shots).toHaveLength(1);
    expect(plan.shots[0]).toMatchObject({
      kind: "followFlag",
      slot: 1,
      startSec: 0,
      endSec: 120,
      // The pack chasing the rabbit is always behind them.
      aim: { mode: "backward" },
    });
  });

  it("orbits kill clusters in flagless modes", () => {
    const dataset: DirectorDataset = {
      ...ctfDataset(),
      gameClassName: "DMGame",
      flagStands: [],
      flagSamples: [],
      events: [
        {
          timeSec: 40,
          type: "kill",
          description: "a kill",
          killer: "Slayer",
          victim: "Someone",
          pos: [100, 100, 50],
        },
        {
          timeSec: 43,
          type: "kill",
          description: "another kill",
          killer: "Slayer",
          victim: "SomeoneElse",
          pos: [110, 105, 50],
        },
      ],
    };
    const plan = planShots(dataset);
    expect(plan.gameMode).toBe("deathmatch");
    const shot = shotAt(plan.shots, 40);
    // The cluster's busiest killer resolves to a target id → hero-follow,
    // camera behind the shooter.
    expect(shot?.kind).toBe("followPlayer");
    expect(shot).toMatchObject({ targetId: 5, aim: { mode: "forward" } });
    expectContiguous(plan.shots, 120);
  });
});
