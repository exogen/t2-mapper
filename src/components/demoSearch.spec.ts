import { describe, expect, it } from "vitest";
import type { DemoIndexEntry } from "../stream/demoIndex";
import { searchDemos } from "./demoSearch";

function demo(overrides: Partial<DemoIndexEntry> = {}): DemoIndexEntry {
  return {
    filename: "match-001.rec",
    bytes: 1000,
    recordedAt: "2026-09-19T12:00:00Z",
    server: "Warehouse West",
    address: "127.0.0.1:28000",
    games: [
      {
        mission: "Massive",
        gameType: "Capture the Flag",
        startMs: 0,
        tournament: false,
      },
    ],
    mod: "Classic",
    recorder: "Alice",
    durationMs: 60_000,
    players: ["exogen", "Bob"],
    ...overrides,
  };
}

describe("demo search", () => {
  it.each(["massive exogen", "exogen massive", "  MASSIVE \t Exogen  "])(
    "requires both the map and player to match: %s",
    (query) => {
      const match = demo();
      const mapOnly = demo({ players: ["Bob"] });
      const playerOnly = demo({ games: [] });
      expect(searchDemos([mapOnly, match, playerOnly], query)).toEqual([match]);
    },
  );

  it.each([
    "massive",
    "exogen",
    "mass exog",
    "west warehouse",
    "bob exogen",
    "alice massive",
    "ctf exogen warehouse match-001",
    "flag capture massive",
  ])("searches all existing fields and partial names: %s", (query) => {
    const match = demo();
    expect(searchDemos([match], query)).toEqual([match]);
  });

  it("searches internal and display mission names in any order", () => {
    const match = demo({
      games: [{ ...demo().games[0], mission: "DX_Ice" }],
    });
    expect(searchDemos([match], "DX_Ice exogen")).toEqual([match]);
    expect(searchDemos([match], "crossing exogen dangerous")).toEqual([match]);
  });

  it.each(["", " \t\n "])("shows all demos for a blank query: %j", (query) => {
    const demos = [demo(), demo({ games: [], players: [] })];
    expect(searchDemos(demos, query)).toEqual(demos);
  });

  it("preserves result order across words with different match strengths", () => {
    const demos = [demo({ players: ["[TAG]exogen"] }), demo()];
    expect(searchDemos(demos, "exogen massive")).toEqual(demos);
  });

  it("excludes the observer bot from recorder and player searches", () => {
    const match = demo({
      recorder: "[BOT]MapGenius2",
      players: ["exogen", "MapGenius3"],
    });
    expect(searchDemos([match], "massive exogen")).toEqual([match]);
    expect(searchDemos([match], "massive mapgenius")).toEqual([]);
  });
});
