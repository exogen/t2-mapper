import { describe, it, expect } from "vitest";
import { parseStatsJson } from "./statsJson";

const VALID = JSON.stringify({
  schema_version: 4,
  match: { map: "TWL_StonehengeLT", gametype: "LCTF", length_sec: 646 },
  map_anchors: {
    storm_flag: { x: -266.04, y: -424.61, z: 287.34 },
    inferno_flag: { x: -232.38, y: 131.94, z: 271.1 },
  },
  position_samples: [
    { t: 12, g: 3524, e: 1, x: -241.2, y: -410.0 },
    { t: 13, g: -9, e: 2, x: -234.4, y: 62.6 },
  ],
});

describe("parseStatsJson", () => {
  it("parses a valid file and swizzles Torque (x, y) to Three (z, x)", () => {
    const data = parseStatsJson(VALID, "test.json");
    expect(data.missionName).toBe("TWL_StonehengeLT");
    expect(data.sourceLabel).toBe("test.json");
    expect(data.gametype).toBe("LCTF");
    expect(data.lengthSec).toBe(646);
    expect(data.positionSamples.count).toBe(2);
    // Sample 0: Torque x=-241.2 → Three z, Torque y=-410 → Three x.
    expect(data.positionSamples.x[0]).toBeCloseTo(-410.0);
    expect(data.positionSamples.z[0]).toBeCloseTo(-241.2);
    expect(data.positionSamples.t[0]).toBe(12);
    expect(data.positionSamples.team[0]).toBe(1);
    expect(data.positionSamples.playerId[0]).toBe(3524);
    expect(data.positionSamples.team[1]).toBe(2);
    expect(data.positionSamples.playerId[1]).toBe(-9);
    // Anchors swizzled the same way, altitude dropped.
    expect(data.anchors.storm).toEqual({ x: -424.61, z: -266.04 });
    expect(data.anchors.inferno).toEqual({ x: 131.94, z: -232.38 });
  });

  it("parses newer exports with metadata nested under a meta wrapper", () => {
    const data = parseStatsJson(
      JSON.stringify({
        meta: {
          schema_version: 4,
          map: "S8_ZilchLT",
          match: { map: "S8_ZilchLT" },
        },
        map_anchors: {
          storm_flag: { x: 1.45, y: 292.65, z: 125.58 },
        },
        position_samples: [{ t: 6, g: 4336159, e: 1, x: -9.3, y: 330.9 }],
      }),
      "zilch.json",
    );
    expect(data.missionName).toBe("S8_ZilchLT");
    expect(data.gametype).toBeUndefined();
    expect(data.positionSamples.count).toBe(1);
    expect(data.anchors.storm).toEqual({ x: 292.65, z: 1.45 });
  });

  it("falls back to meta.map when the wrapper has no match object", () => {
    const data = parseStatsJson(
      JSON.stringify({
        meta: { schema_version: 4, map: "S8_ZilchLT" },
        position_samples: [{ t: 6, g: 1, e: 1, x: 0, y: 0 }],
      }),
      "zilch.json",
    );
    expect(data.missionName).toBe("S8_ZilchLT");
  });

  it("skips malformed samples but keeps valid ones", () => {
    const data = parseStatsJson(
      JSON.stringify({
        schema_version: 4,
        match: { map: "X" },
        position_samples: [
          { t: 1, g: 1, e: 1, x: 1, y: 2 },
          { t: 1, g: 1, e: 3, x: 1, y: 2 },
          { t: 1, g: 1, e: 2, x: NaN, y: 2 },
          { t: 1, g: 1, e: 2 },
        ],
      }),
      "x.json",
    );
    expect(data.positionSamples.count).toBe(1);
  });

  it("rejects non-JSON, missing schema, missing map, and empty samples", () => {
    expect(() => parseStatsJson("not json", "a")).toThrow(/valid JSON/);
    expect(() => parseStatsJson("{}", "a")).toThrow(/schema_version/);
    expect(() =>
      parseStatsJson(JSON.stringify({ schema_version: 4 }), "a"),
    ).toThrow(/map name/);
    expect(() =>
      parseStatsJson(
        JSON.stringify({
          schema_version: 4,
          match: { map: "X" },
          position_samples: [],
        }),
        "a",
      ),
    ).toThrow(/no position samples/);
    expect(() =>
      parseStatsJson(
        JSON.stringify({
          schema_version: 4,
          match: { map: "X" },
          position_samples: [{ e: 5, x: 1, y: 1 }],
        }),
        "a",
      ),
    ).toThrow(/No usable/);
  });
});
