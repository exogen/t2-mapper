import { describe, expect, it } from "vitest";
import { demoGameIndexAt, readDemoGames } from "./demoMetadata.js";

describe("published demo game details", () => {
  it("reads saved labels alongside older metadata and unfamiliar optional fields", () => {
    expect(
      readDemoGames({
        futureMetadata: { format: 2 },
        games: [
          {
            mission: "Katabatic",
            gameType: "CTF",
            startMs: 0,
            gameId: "game",
            presentationRevision: 2,
            missionSequence: 7,
            title: " Final ",
            teamNames: { 1: "Knights", 2: "Storm" },
            futureGameField: ["extra data"],
          },
        ],
      }),
    ).toEqual([
      {
        mission: "Katabatic",
        gameType: "CTF",
        startMs: 0,
        tournament: false,
        gameId: "game",
        presentationRevision: 2,
        missionSequence: 7,
        title: "Final",
        teamNames: { 1: "Knights", 2: "Storm" },
      },
    ]);
    expect(readDemoGames({ mission: "OldMap", gameType: "CTF" })).toEqual([
      { mission: "OldMap", gameType: "CTF", startMs: 0, tournament: false },
    ]);
  });

  it("drops malformed labels while preserving a valid next-mission boundary", () => {
    expect(
      readDemoGames({
        games: [
          null,
          [],
          {},
          { mission: "bad", startMs: -1 },
          {
            mission: "NextMap",
            startMs: 1000,
            title: {},
            teamNames: { 1: 42 },
            gameId: [],
            presentationRevision: "2",
          },
        ],
      }),
    ).toEqual([
      { mission: "NextMap", gameType: "", startMs: 1000, tournament: false },
    ]);
  });

  it.each([null, [], true, { games: "wrong shape" }])(
    "ignores incompatible sidecar shapes: %j",
    (raw) => {
      expect(readDemoGames(raw)).toEqual([]);
    },
  );
});

describe("demo game boundaries", () => {
  it("returns no game before the first boundary or for an empty recording", () => {
    expect(demoGameIndexAt([], 0)).toBe(-1);
    expect(demoGameIndexAt([{ startMs: 1000 }], 999)).toBe(-1);
  });

  it("selects the latest reached boundary even when metadata is unsorted", () => {
    const games = [{ startMs: 2000 }, { startMs: 0 }, { startMs: 1000 }];
    expect(demoGameIndexAt(games, 0)).toBe(1);
    expect(demoGameIndexAt(games, 999)).toBe(1);
    expect(demoGameIndexAt(games, 1000)).toBe(2);
    expect(demoGameIndexAt(games, 2000)).toBe(0);
  });

  it("keeps the first game when multiple entries share a boundary", () => {
    expect(
      demoGameIndexAt(
        [{ startMs: 0 }, { startMs: 1000 }, { startMs: 1000 }],
        1000,
      ),
    ).toBe(1);
  });
});
