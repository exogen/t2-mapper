/**
 * The free-space grid is built a slice per tick. It must keep building
 * while a shot is on air: pumping it only when the filler chose a shot
 * froze it for the length of every fly-by, and the decision after the
 * fly-by then had no grid to decide with.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DirectorDataset,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  MatchFacts,
} from "./types";

const build = vi.hoisted(() => ({ steps: 0, completeAfter: Infinity }));

vi.mock("./freeSpace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./freeSpace")>()),
  createFreeSpaceBuild: () => {
    let steps = 0;
    return {
      grid: {
        step: 6,
        lo: [0, 0, 0],
        anchors: [],
        nx: 0,
        ny: 0,
        nz: 0,
        free: new Uint8Array(),
        tested: new Uint8Array(),
        assetRadius: 100,
        usable: 0,
        total: 0,
        buildMs: 0,
      },
      step: () => {
        build.steps++;
        return ++steps >= build.completeAfter;
      },
    };
  },
}));

const { planShotsCausal, createSwitcherStream } = await import("./switcher");
const { CausalView } = await import("./causalView");

const STAND_1: DirectorVec3 = [0, 0, 100];
const STAND_2: DirectorVec3 = [800, 0, 100];

/** Team-picking from 0 to 75 with the world complete at 1s. */
function dataset(): DirectorDataset {
  const flagSamples: DirectorFlagSample[] = [];
  const playerSamples: DirectorPlayerSample[] = [];
  for (let t = 0; t <= 120; t += 0.5) {
    for (const [slot, pos] of [
      [1, STAND_1],
      [2, STAND_2],
    ] as const) {
      flagSamples.push({
        timeSec: t,
        slot,
        pos,
        carrierTargetId: null,
        status: "home",
      });
    }
  }
  for (let t = 0; t <= 120; t++) {
    playerSamples.push({
      timeSec: t,
      targetId: 9,
      teamId: 1,
      pos: [12, 8, 100],
      heading: 1.0,
      armor: "heavy",
    });
  }
  return {
    durationSec: 120,
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
    events: [
      { timeSec: 75, type: "match-start", description: "Match started" },
    ],
    flagSamples,
    playerSamples,
    structures: [],
    structureInventory: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    playerNames: [{ targetId: 9, name: "guard", displayName: "Guard" }],
    scoreSamples: [],
    matchFacts: {
      missionName: null,
      missionDisplayName: null,
      gameType: null,
      serverDisplayName: null,
      durationSec: 120,
      matchStartSec: null,
      matchEndSec: null,
      teams: [
        { teamId: 1, name: "Storm" },
        { teamId: 2, name: "Inferno" },
      ],
      scores: [],
      roster: [],
      clock: [],
      worldCompleteSec: 1,
      matchSeenRunningSec: null,
    } satisfies MatchFacts,
  };
}

beforeEach(() => {
  build.steps = 0;
  // Normally never finishes, so every tick has a slice to do.
  build.completeAfter = Infinity;
});

describe("building the grid while a shot is on air", () => {
  it("pumps a slice on every pre-match tick, not only when choosing", () => {
    build.steps = 0;
    planShotsCausal(dataset());
    // Two ticks a second from the world arriving (1s) until the whistle
    // comes into the lookahead (73s). The filler chooses a few shots in
    // that span; pumped only there, this was in the single digits.
    expect(build.steps).toBeGreaterThanOrEqual(140);
  });

  it("keeps pumping after kickoff and when joining a running match", () => {
    build.steps = 0;
    const ds = dataset();
    ds.events = [
      { timeSec: 0, type: "match-start", description: "Match started" },
    ];
    ds.matchFacts!.matchStartSec = 0;
    ds.matchFacts!.matchSeenRunningSec = 0;
    const stream = createSwitcherStream(new CausalView(ds));
    stream.advanceTo(2, ds);
    expect(build.steps).toBe(0); // World arrival plus the usual settle.
    stream.advanceTo(4, ds);
    expect(build.steps).toBe(4); // 2.5, 3, 3.5, 4: one slice per tick.
    expect(stream.freeSpace).toBeNull(); // No blocking wait for completion.
    stream.advanceTo(6, ds);
    expect(build.steps).toBe(8);
  });

  it("publishes only a finished grid and keeps each stream's grid separate", () => {
    build.completeAfter = 2;
    const ds = dataset();
    const first = createSwitcherStream(new CausalView(ds));
    const second = createSwitcherStream(new CausalView(ds));
    first.advanceTo(2.5, ds);
    expect(first.freeSpace).toBeNull();
    second.advanceTo(3, ds);
    expect(second.freeSpace).not.toBeNull();
    expect(first.freeSpace).toBeNull();
    first.advanceTo(3, ds);
    expect(first.freeSpace).not.toBeNull();
    expect(first.freeSpace).not.toBe(second.freeSpace);
    const ready = first.freeSpace;
    first.advanceTo(6, ds);
    expect(first.freeSpace).toBe(ready);
    expect(build.steps).toBe(4); // Completed grids are reused.
  });
});
