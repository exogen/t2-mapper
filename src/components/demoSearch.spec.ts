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
  it("searches saved titles and team names alongside the other visible metadata", () => {
    const match = demo({
      games: [
        {
          ...demo().games[0],
          title: "Grand Final",
          teamNames: { 1: "Knights", 2: "Dragons" },
        },
      ],
    });
    expect(searchDemos([match, demo()], "dragons massive")).toEqual([match]);
    expect(searchDemos([match], "knights exogen")).toEqual([match]);
    expect(searchDemos([match, demo()], "grand final")).toEqual([match]);
    expect(searchDemos([match, demo()], "final dragons")).toEqual([match]);
    expect(searchDemos([match], "grand final ghosts")).toEqual([]);
  });
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

  it.each(["", " \t\n ", "@", " @ \t @ \n @ "])(
    "shows all demos in their original order for an empty query: %j",
    (query) => {
      const demos = [demo(), demo({ games: [], players: [], recorder: "" })];
      expect(searchDemos(demos, query)).toBe(demos);
    },
  );

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

  it.each(["exogen", "EXOG", "brian", "BeCk", "brian massive", "exog beck"])(
    "searches the saved Discord handle and display name as ordinary metadata: %s",
    (query) => {
      const match = demo({
        players: [],
        discordHandleAtUploadTime: "exogen",
        discordDisplayNameAtUploadTime: "Brian Beck",
      });
      expect(searchDemos([demo({ players: [] }), match], query)).toEqual([
        match,
      ]);
    },
  );

  it.each([
    "@EXOG",
    "@bri",
    "@BeCk",
    "massive @exogen",
    "@beck massive",
    "@ @exog massive",
  ])(
    "restricts each @token to uploader identity while other words remain unrestricted: %s",
    (query) => {
      const match = demo({
        players: [],
        discordHandleAtUploadTime: "exogen",
        discordDisplayNameAtUploadTime: "Brian Beck",
      });
      const mapAndPlayerOnly = demo();
      expect(searchDemos([mapAndPlayerOnly, match], query)).toEqual([match]);
    },
  );

  it("requires every regular and identity token to match the same recording", () => {
    const match = demo({ discordHandleAtUploadTime: "exogen" });
    const mapOnly = demo();
    const identityOnly = demo({
      games: [],
      discordHandleAtUploadTime: "exogen",
    });
    expect(
      searchDemos([mapOnly, match, identityOnly], "massive @exogen"),
    ).toEqual([match]);
    expect(
      searchDemos([mapOnly, match, identityOnly], "@exogen massive"),
    ).toEqual([match]);
    expect(searchDemos([match], "massive @exogen @ghost")).toEqual([]);
  });

  it("matches an in-game recorder independently of the Discord uploader", () => {
    const match = demo({
      recorder: "Storm",
      discordHandleAtUploadTime: "exogen",
      discordDisplayNameAtUploadTime: "Brian Beck",
    });
    expect(searchDemos([match], "@storm")).toEqual([match]);
    expect(searchDemos([match], "@storm @exog")).toEqual([match]);
    expect(searchDemos([match], "@alice")).toEqual([]);
  });

  it.each([
    ["player", { players: ["exogen"] }],
    ["server", { server: "exogen", players: [] }],
    ["filename", { filename: "exogen.rec", players: [] }],
    [
      "mission",
      { games: [{ ...demo().games[0], mission: "exogen" }], players: [] },
    ],
    [
      "mission type",
      { games: [{ ...demo().games[0], gameType: "exogen" }], players: [] },
    ],
    [
      "title",
      { games: [{ ...demo().games[0], title: "exogen" }], players: [] },
    ],
    [
      "team",
      {
        games: [{ ...demo().games[0], teamNames: { 1: "exogen" } }],
        players: [],
      },
    ],
  ] satisfies Array<[string, Partial<DemoIndexEntry>]>)(
    "does not let a %s match an identity token",
    (_field, metadata) => {
      const match = demo(metadata);
      expect(searchDemos([match], "exogen")).toEqual([match]);
      expect(searchDemos([match], "@exogen")).toEqual([]);
    },
  );

  it("uses the recorder for older demos without Discord snapshots, excluding players", () => {
    const old = demo();
    expect(searchDemos([old], "@alice")).toEqual([old]);
    expect(searchDemos([old], "@exogen")).toEqual([]);
    expect(searchDemos([old], "@alice exogen")).toEqual([old]);
  });

  it("strips only one leading @ from identity tokens", () => {
    const normal = demo();
    const literal = demo({ recorder: "@Alice" });
    expect(searchDemos([normal, literal], "@@alice")).toEqual([literal]);
  });

  it("keeps the observer excluded but permits the same name as a Discord uploader", () => {
    const observer = demo({
      recorder: "[BOT]MapGenius2",
      players: ["MapGenius3"],
    });
    const uploader = {
      ...observer,
      discordDisplayNameAtUploadTime: "MapGenius",
    };
    expect(searchDemos([observer, uploader], "@mapgenius")).toEqual([uploader]);
    expect(searchDemos([observer, uploader], "mapgenius")).toEqual([uploader]);
  });

  it("preserves result order across recorder and Discord identity matches", () => {
    const demos = [
      demo({ recorder: "[TAG]exogen" }),
      demo({ discordHandleAtUploadTime: "exogen" }),
      demo({ recorder: "exogen" }),
    ];
    expect(searchDemos(demos, "@exogen massive")).toEqual(demos);
  });
});
