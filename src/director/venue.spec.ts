import { describe, expect, it, vi } from "vitest";
import type { DirectorDataset, DirectorVec3 } from "./types";

/** Flat terrain at z=100 everywhere; six force fields on the map. */
vi.mock("../collision/terrainCollision", () => ({
  terrainHeightAt: () => 100,
}));
vi.mock("../collision/worldCollision", () => ({
  getWorldColliderCounts: () => ({
    interiors: 4,
    meshes: 40,
    forceFields: 6,
    staticShapes: 12,
  }),
}));

const { describeVenue } = await import("./venue");

function dataset(standGap: number): DirectorDataset {
  const hardware = (
    teamId: number,
    name: string,
    z: number,
    n = 1,
  ): DirectorDataset["structureInventory"] =>
    Array.from({ length: n }, (_, i) => ({
      firstSeenSec: 0,
      name,
      className: "StaticShape",
      teamId,
      pos: [teamId * 50 + i, 0, z] as DirectorVec3,
    }));
  return {
    durationSec: 10,
    flagSampleStepSec: 0.5,
    playerSampleStepSec: 1,
    gameClassName: "CTFGame",
    teams: [
      { teamId: 1, name: "Storm" },
      { teamId: 2, name: "Inferno" },
    ],
    flagStands: [
      { slot: 1, teamId: 1, name: "Storm", pos: [0, 0, 100] },
      // Inferno's stand is in a basement, well under the terrain.
      { slot: 2, teamId: 2, name: "Inferno", pos: [standGap, 0, 80] },
    ],
    events: [],
    flagSamples: [],
    playerSamples: [],
    structures: [],
    structureInventory: [
      ...hardware(1, "generator", 70, 2),
      ...hardware(1, "inventory station", 101, 3),
      ...hardware(1, "base turret", 110, 2),
      ...hardware(1, "vehicle station", 100),
      // A clamp someone placed before the whistle is not the venue.
      ...hardware(1, "spider clamp turret", 100),
      ...hardware(2, "generator", 70, 2),
    ],
    mortarShots: [],
    deaths: [],
    stations: [],
    playerNames: [],
    scoreSamples: [],
  };
}

describe("describeVenue", () => {
  it("counts one base's hardware and says what sits underground", () => {
    const venue = describeVenue(dataset(1100))!;
    expect(venue.hardwarePerBase).toEqual([
      { kind: "base turret", count: 2, underground: 0 },
      { kind: "generator", count: 2, underground: 2 },
      { kind: "inventory station", count: 3, underground: 0 },
      { kind: "vehicle station", count: 1, underground: 0 },
    ]);
    expect(venue.flagStandsUnderground).toBe(1);
    expect(venue.forceFields).toBe(6);
  });

  it("sizes the map by the distance between the flags", () => {
    expect(describeVenue(dataset(1100))!.size).toBe("medium");
    expect(describeVenue(dataset(1100))!.flagDistanceM).toBe(1100);
    expect(describeVenue(dataset(500))!.size).toBe("small");
    expect(describeVenue(dataset(1500))!.size).toBe("large");
    expect(describeVenue(dataset(2100))!.size).toBe("very large");
  });

  it("is unknown until both stands are known", () => {
    const ds = dataset(1100);
    ds.flagStands = ds.flagStands.slice(0, 1);
    expect(describeVenue(ds)).toBeNull();
  });
});
