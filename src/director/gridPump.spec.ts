/**
 * The free-space grid is built a slice per tick. It must keep building
 * while a shot is on air: pumping it only when the filler chose a shot
 * froze it for the length of every fly-by, and the decision after the
 * fly-by then had no grid to decide with.
 */
import { describe, expect, it, vi } from "vitest";
import type {
  DirectorDataset,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  MatchFacts,
} from "./types";

const build = vi.hoisted(() => ({ steps: 0 }));

vi.mock("./freeSpace", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./freeSpace")>()),
  // A build that never finishes, so every tick has a slice to do.
  createFreeSpaceBuild: () => ({
    grid: null,
    step: () => {
      build.steps++;
      return false;
    },
  }),
}));

const { planShotsCausal } = await import("./switcher");

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

describe("building the grid while a shot is on air", () => {
  it("pumps a slice on every pre-match tick, not only when choosing", () => {
    build.steps = 0;
    planShotsCausal(dataset());
    // Two ticks a second from the world arriving (1s) until the whistle
    // comes into the lookahead (73s). The filler chooses a few shots in
    // that span; pumped only there, this was in the single digits.
    expect(build.steps).toBeGreaterThanOrEqual(140);
  });
});
