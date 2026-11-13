import { describe, expect, it } from "vitest";
import { DEMO_STATS_VERSION } from "./demoPlayerStatsModel";
import { readCurrentDemoStats } from "./demoStats";

const sidecar = (mapScores: unknown) => ({
  version: DEMO_STATS_VERSION,
  statsByGuid: { "123": { mapScores } },
});

describe("demo stats score validation", () => {
  it.each([null, 0, false, "player", []].map((player) => ({ player })))(
    "rejects malformed player stats $player",
    ({ player }) => {
      expect(
        readCurrentDemoStats({
          version: DEMO_STATS_VERSION,
          statsByGuid: { "123": player },
        }),
      ).toBeNull();
    },
  );

  it("accepts absent legacy scores, empty arrays, and finite final scores", () => {
    for (const mapScores of [
      undefined,
      [],
      [{ mission: "Katabatic", score: 0 }],
      [{ mission: "DX", score: -3 }],
      [{ mission: "Riverdance", score: 99.5 }],
    ])
      expect(readCurrentDemoStats(sidecar(mapScores))).toEqual(
        sidecar(mapScores),
      );
    expect(
      readCurrentDemoStats({ version: DEMO_STATS_VERSION, statsByGuid: {} }),
    ).toEqual({ version: DEMO_STATS_VERSION, statsByGuid: {} });
  });

  it.each(
    [
      null,
      {},
      "scores",
      [null],
      ["score"],
      [{}],
      [{ mission: "Katabatic", score: null }],
      [{ mission: "Katabatic", score: "50" }],
      [{ mission: "Katabatic", score: Number.NaN }],
      [{ mission: "Katabatic", score: Number.POSITIVE_INFINITY }],
      [{ mission: "Katabatic", score: Number.NEGATIVE_INFINITY }],
      [{ mission: "", score: 50 }],
      [{ mission: "  ", score: 50 }],
      [{ mission: null, score: 50 }],
      [{ mission: 5, score: 50 }],
      [{ mission: "Katabatic" }],
    ].map((mapScores) => ({ mapScores })),
  )("rejects malformed map scores $mapScores", ({ mapScores }) => {
    expect(readCurrentDemoStats(sidecar(mapScores))).toBeNull();
  });

  it.each(["0", "000", "invalid", "-123", ""])(
    "rejects a final score without an account GUID (%j)",
    (guid) => {
      expect(
        readCurrentDemoStats({
          version: DEMO_STATS_VERSION,
          statsByGuid: {
            [guid]: { mapScores: [{ mission: "Katabatic", score: 20 }] },
          },
        }),
      ).toBeNull();
    },
  );

  it("accepts a score for a GUID that the database can normalize", () => {
    expect(
      readCurrentDemoStats({
        version: DEMO_STATS_VERSION,
        statsByGuid: {
          "000123": { mapScores: [{ mission: "Katabatic", score: 20 }] },
        },
      }),
    ).toMatchObject({ version: DEMO_STATS_VERSION });
  });

  it("rejects a malformed later player or score rather than accepting a partial calculation", () => {
    const valid = { mission: "Katabatic", score: 20 };
    expect(
      readCurrentDemoStats({
        version: DEMO_STATS_VERSION,
        statsByGuid: {
          "123": { mapScores: [valid] },
          "456": { mapScores: [valid, { mission: "DX", score: null }] },
        },
      }),
    ).toBeNull();
  });

  it.each([DEMO_STATS_VERSION - 1, DEMO_STATS_VERSION + 1])(
    "rejects stats from a different version (%i)",
    (version) => {
      expect(readCurrentDemoStats({ ...sidecar([]), version })).toBeNull();
    },
  );

  it("returns current stats without copying and checks available source fingerprints", () => {
    const saved = { ...sidecar([]), sourceETag: "original" };
    expect(readCurrentDemoStats(saved)).toBe(saved);
    expect(readCurrentDemoStats(saved, "original")).toBe(saved);
    expect(readCurrentDemoStats(saved, "replacement")).toBeNull();
    const legacy = sidecar([]);
    expect(readCurrentDemoStats(legacy, "original")).toBe(legacy);
    expect(readCurrentDemoStats({ ...saved, sourceETag: "" })).toBeNull();
  });
});
