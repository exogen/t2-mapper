import type { DirectorDataset, DirectorVec3 } from "./types";

export const STAND_1: DirectorVec3 = [0, 0, 100];
export const STAND_2: DirectorVec3 = [800, 0, 100];

/**
 * A two-minute CTF recording with Storm's stand at STAND_1, Inferno's at
 * STAND_2, and nothing else in it. Each override replaces a whole field.
 */
export function directorDataset(
  overrides: Partial<DirectorDataset> = {},
): DirectorDataset {
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
    events: [],
    flagSamples: [],
    playerSamples: [],
    structures: [],
    structureInventory: [],
    mortarShots: [],
    deaths: [],
    stations: [],
    playerNames: [],
    scoreSamples: [],
    ...overrides,
  };
}
