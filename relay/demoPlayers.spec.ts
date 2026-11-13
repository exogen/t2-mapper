import { describe, expect, it } from "vitest";
import { DemoPlayers } from "./demoPlayers.js";
import { serverMessagePacket } from "./serverPacketFixtures.js";
import { taglessPlayerName } from "./shared.js";
import { WatchStateAccumulator } from "./watchState.js";

const message = (...args: string[]) => serverMessagePacket(args);

describe("demo player identity", () => {
  it.each([
    ["\x10\x0b[TAG]\x08Alice\x11", "Alice"],
    ["\x10\x08Alice\x0b[TAG]\x11", "Alice"],
    ["\x10\x0cSmurf\x11", "Smurf"],
    ["\x10\x0eBot\x11", "Bot"],
    ["[Typed]Alice", "[Typed]Alice"],
    ["\x9fChloé\x7f", "Chloé"],
  ])("removes only the official tag from %j", (raw, expected) => {
    expect(taglessPlayerName(raw)).toBe(expected);
  });

  it("deduplicates tag changes across reconnects, including smurfs", () => {
    const players = new DemoPlayers("MapGenius");
    players.sample(
      new Map([
        [1, { rawName: "\x10\x0b[TAG]\x08Alice\x11" }],
        [2, { rawName: "\x10\x0cSmurf\x11" }],
      ]),
    );
    players.sample(
      new Map([
        [3, { rawName: "\x10\x08Alice\x0b[NEW]\x11" }],
        [4, { rawName: "\x10\x0cSmurf\x11" }],
        [5, { rawName: "\x10\x0eBot\x11" }],
      ]),
    );
    expect(players.metadata()).toEqual({
      playerCount: 3,
      players: ["[TAG]Alice", "Alice[NEW]", "Bot", "Smurf"],
    });
  });

  it("preserves client identity across tag/name changes, drops and roster refreshes", () => {
    const watch = new WatchStateAccumulator();
    const players = new DemoPlayers("MapGenius");
    const sample = (...args: string[]) => {
      watch.applyPacket(message(...args));
      players.sample(watch.getPlayerRoster());
    };
    sample("MsgClientJoin", "", "\x02Alice", "10", "1");
    sample(
      "MsgClientNameChanged",
      "",
      "Alice",
      "\x10\x0b[TAG]\x08Alice\x11",
      "10",
    );
    sample(
      "MsgClientNameChanged",
      "",
      "[TAG]Alice",
      "\x10\x0b[NEW]\x08Alice\x11",
      "10",
    );
    sample("MsgClientJoin", "", "\x10\x0b[NEW]\x08Alice\x11", "10", "1");
    sample("MsgClientJoin", "", "Bob", "11", "2");
    sample("MsgClientDrop", "", "Alice", "10");
    expect(players.metadata()).toEqual({
      playerCount: 2,
      players: ["[NEW]Alice", "[TAG]Alice", "Alice", "Bob"],
    });
  });

  it("deduplicates the same name on different clients and ignores unnamed stubs", () => {
    const players = new DemoPlayers("MapGenius");
    players.sample(
      new Map([
        [1, { rawName: "Alice" }],
        [2, { rawName: "Alice" }],
        [3, { rawName: " " }],
      ]),
    );
    expect(players.metadata()).toEqual({ playerCount: 1, players: ["Alice"] });
  });

  it("excludes the recorder's earlier aliases after late self identification", () => {
    const players = new DemoPlayers("Recorder");
    players.sample(new Map([[1, { rawName: "Me" }]]));
    expect(players.count).toBe(1);
    players.sample(new Map([[1, { rawName: "Renamed recorder" }]]), 1);
    expect(players.metadata()).toEqual({ playerCount: 0, players: [] });
    players.clear();
    players.sample(new Map([[1, { rawName: "New recording" }]]));
    expect(players.count).toBe(1);
  });

  it("uses names only until an authoritative recorder ID is known", () => {
    const players = new DemoPlayers("Recorder");
    players.sample(new Map([[1, { rawName: "Recorder" }]]), 0);
    expect(players.count).toBe(0);
    players.sample(new Map([[1, { rawName: "Another player" }]]), 2);
    expect(players.metadata()).toEqual({
      playerCount: 2,
      players: ["Another player", "Recorder"],
    });
    // Temporarily missing self IDs do not discard established identity.
    players.sample(new Map([[2, { rawName: "Self" }]]));
    expect(players.count).toBe(2);
  });

  it("keeps joins and renames that are dropped later in the same packet", () => {
    const watch = new WatchStateAccumulator();
    const players = new DemoPlayers("Recorder");
    // Same transport packet, ordered reliable events.
    const combined = serverMessagePacket(
      ["MsgClientJoin", "", "Alice", "10", "1"],
      ["MsgClientNameChanged", "", "Alice", "Bob", "10"],
      ["MsgClientDrop", "", "Bob", "10"],
    );
    watch.applyPacket(combined, () => players.sample(watch.getPlayerRoster()));
    expect(watch.getPlayerRoster().size).toBe(0);
    expect(players.metadata()).toEqual({
      playerCount: 2,
      players: ["Alice", "Bob"],
    });
  });

  it("seeds mid-match demos and counts genuinely different base names separately", () => {
    const roster = new Map([
      [
        10,
        {
          rawName: "Alice",
          name: "Alice",
          teamId: 1,
          score: 0,
          ping: 0,
          packetLoss: 0,
        },
      ],
    ]);
    const watch = new WatchStateAccumulator(roster);
    const players = new DemoPlayers("Recorder");
    players.sample(watch.getPlayerRoster());
    watch.applyPacket(
      message("MsgClientNameChanged", "", "Alice", "NewAlice", "10"),
    );
    players.sample(watch.getPlayerRoster());
    expect(players.metadata()).toEqual({
      playerCount: 2,
      players: ["Alice", "NewAlice"],
    });
    expect(roster.get(10)?.name).toBe("Alice");
  });
});

describe("demo player GUIDs", () => {
  it("collects tag-less names per GUID across clients, keeping them out of metadata", () => {
    const players = new DemoPlayers("Recorder");
    players.sample(
      new Map([
        [1, { rawName: "\x10\x0b[TAG]\x08Alice\x11", guid: "12345" }],
        [2, { rawName: "Recorder", guid: "999" }],
        [3, { rawName: "\x10\x0cSmurf\x11" }],
      ]),
      2,
    );
    players.sample(
      new Map([
        [1, { rawName: "\x10\x08Alice\x0b[NEW]\x11", guid: "12345" }],
        [4, { rawName: "Zed", guid: "12345" }],
        [5, { rawName: "Bob", guid: "67890" }],
      ]),
    );
    expect(players.namesByGuid()).toEqual({
      "999": ["Recorder"],
      "12345": ["Alice", "Zed"],
      "67890": ["Bob"],
    });
    expect(JSON.stringify(players.metadata())).not.toMatch(/12345|67890|999/);
    players.clear();
    expect(players.namesByGuid()).toEqual({});
  });
});
