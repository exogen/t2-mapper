import { describe, expect, it } from "vitest";
import {
  demoDeletionFilter,
  demoDeletionObjects,
  matchesDemoDeletion,
} from "./demoDeletion";

describe("demo deletion metadata filters", () => {
  it("deletes strictly below minimum length, including decimal seconds", () => {
    const filter = demoDeletionFilter("min-length-seconds", "1.5");
    expect(matchesDemoDeletion({ durationMs: 1499 }, filter)).toEqual({
      matches: true,
      value: 1.499,
    });
    expect(matchesDemoDeletion({ durationMs: 1500 }, filter)).toEqual({
      matches: false,
      value: 1.5,
    });
  });

  it("uses published player counts, with a fallback for legacy names", () => {
    const filter = demoDeletionFilter("min-players", "2");
    expect(
      matchesDemoDeletion(
        { playerCount: 1, players: ["Alice", "Alias", "Bob"] },
        filter,
      ),
    ).toEqual({ matches: true, value: 1 });
    expect(matchesDemoDeletion({ players: ["Alice", "Bob"] }, filter)).toEqual({
      matches: false,
      value: 2,
    });
    expect(matchesDemoDeletion({ playerCount: 0 }, filter)).toEqual({
      matches: true,
      value: 0,
    });
  });

  it("matches full server names case-insensitively rather than key substrings", () => {
    const filter = demoDeletionFilter(
      "exclude-server",
      "  Ski Club - Slope 1  ",
    );
    expect(
      matchesDemoDeletion({ server: "ski club - slope 1" }, filter),
    ).toMatchObject({ matches: true });
    expect(
      matchesDemoDeletion({ server: "Ski Club - Slope 12" }, filter),
    ).toMatchObject({ matches: false });
    expect(
      matchesDemoDeletion(
        { filename: "ski-club-slope-1.rec", server: "Other Server" },
        filter,
      ),
    ).toMatchObject({ matches: false });
  });

  it("excludes a whole demo when any started game matches, including legacy metadata", () => {
    const filter = demoDeletionFilter("exclude-game-type", "Arena");
    expect(
      matchesDemoDeletion(
        { games: [{ gameType: "CTF" }, { gameType: "arena" }] },
        filter,
      ),
    ).toMatchObject({ matches: true });
    expect(
      matchesDemoDeletion({ games: [{ gameType: "Arena Practice" }] }, filter),
    ).toMatchObject({ matches: false });
    expect(matchesDemoDeletion({ gameType: "ARENA" }, filter)).toMatchObject({
      matches: true,
    });
    expect(matchesDemoDeletion({ games: [] }, filter)).toEqual({
      matches: false,
      value: [],
    });
  });

  it.each([
    ["min-length-seconds", {}],
    ["min-length-seconds", { durationMs: -1 }],
    ["min-players", {}],
    ["min-players", { playerCount: NaN, players: [] }],
    ["min-players", { players: [null] }],
    ["exclude-server", { server: "" }],
    ["exclude-game-type", { games: [null] }],
  ] as const)(
    "skips missing or malformed metadata for %s",
    (name, metadata) => {
      const filter = demoDeletionFilter(
        name,
        name.startsWith("min-") ? "2" : "Arena",
      );
      expect(matchesDemoDeletion(metadata, filter)).toHaveProperty("skipped");
    },
  );

  it.each(["", "-1", "Infinity", "NaN", "1second", "9007199254740992"])(
    "rejects invalid length threshold %s",
    (raw) => {
      expect(() => demoDeletionFilter("min-length-seconds", raw)).toThrow();
    },
  );
  it.each(["", "-1", "1.5", "Infinity", "invalid", "9007199254740992"])(
    "rejects invalid player threshold %s",
    (raw) => {
      expect(() => demoDeletionFilter("min-players", raw)).toThrow();
    },
  );
  it.each(["exclude-server", "exclude-game-type"] as const)(
    "rejects empty %s",
    (name) => {
      expect(() => demoDeletionFilter(name, " ")).toThrow(
        "non-empty full name",
      );
    },
  );
});

it("groups only the selected demo's objects, preserving similarly named recordings", () => {
  const keys = new Set(["demos/a.rec", "demos/a.rec.copy.rec", "demos/b.rec"]);
  const result = demoDeletionObjects(keys, [
    "demos/a.rec",
    "demos/a.rec.json",
    "demos/a.rec.checkpoints.json",
    "demos/a.rec.en.commentary.mp3",
    "demos/a.rec.copy.rec",
    "demos/a.rec.copy.rec.json",
    "demos/a.rec.copy.rec.cast.json",
    "demos/b.rec",
    "demos/index.json",
    ".rec.unrelated",
  ]);
  expect(result.get("demos/a.rec")).toEqual([
    "demos/a.rec",
    "demos/a.rec.json",
    "demos/a.rec.checkpoints.json",
    "demos/a.rec.en.commentary.mp3",
  ]);
  expect(result.get("demos/a.rec.copy.rec")).toEqual([
    "demos/a.rec.copy.rec",
    "demos/a.rec.copy.rec.json",
    "demos/a.rec.copy.rec.cast.json",
  ]);
  expect(result.get("demos/b.rec")).toEqual(["demos/b.rec"]);
});
