import { describe, expect, it } from "vitest";
import { DirectorTrackers } from "./directorTrackers";
import type { PlayerRosterEntry, StreamSnapshot } from "./types";
import { playerName, targetIdForName } from "../director/dataset";

/** The least a snapshot needs for the trackers to sample players. */
function snapshot(
  timeSec: number,
  players: {
    targetId: number;
    name: string;
    clientId: number | null;
    /** Times the target id had been freed before this player took it. */
    generation: number;
  }[],
): StreamSnapshot {
  const roster: PlayerRosterEntry[] = players
    .filter((p) => p.clientId != null)
    .map((p) => ({
      clientId: p.clientId!,
      name: p.name,
      rawName: p.name,
      targetId: p.targetId,
      teamId: 1,
      score: 0,
      ping: 0,
      packetLoss: 0,
    }));
  return {
    timeSec,
    ghostAlwaysDoneSec: null,
    exhausted: false,
    camera: null,
    entities: players.map((p) => ({
      id: `player-${p.clientId ?? p.targetId}`,
      targetGeneration: p.generation,
      type: "Player",
      targetId: p.targetId,
      playerName: p.name,
      position: [10, 20, 100] as [number, number, number],
      damageState: 0,
    })),
    playerSensorGroup: 0,
    status: { health: 1, energy: 1, heat: 0 },
    chatMessages: [],
    serverEvents: [],
    audioEvents: [],
    weaponsHud: { slots: [], activeSlot: -1 },
    backpackHud: null,
    inventoryHud: { slots: new Map(), activeSlot: -1 },
    teamScores: [],
    playerRoster: roster,
    connectedClientId: null,
    loadInfo: null,
    matchClockMs: null,
    matchEnded: false,
    matchStarted: true,
  } as unknown as StreamSnapshot;
}

describe("voice binds", () => {
  it("keeps taunts, cheers and compliments from canned chat, keyed to the speaker", () => {
    const trackers = new DirectorTrackers();
    const cast = [{ targetId: 43, name: "Slush", clientId: 1, generation: 0 }];
    const canned = (
      timeSec: number,
      id: number,
      keys: string,
      sender: string,
      text: string,
    ) => ({
      id,
      timeSec,
      sender,
      text,
      kind: "chat" as const,
      colorCode: 4,
      segments: [
        { text: `[${keys}] `, colorCode: 0 },
        { text: `${sender}: ${text}`, colorCode: 4 },
      ],
    });
    for (let t = 0; t <= 6; t++) {
      const snap = snapshot(t, cast);
      snap.chatMessages =
        t === 3
          ? [
              canned(3, 1, "VGTA", "Slush", "Aww, that's too bad!"),
              canned(3, 2, "VGW", "Slush", "Woohoo!"),
              canned(3, 3, "VGCG", "Slush", "Good game!"),
              // Not a bind the booth cares about.
              canned(3, 4, "VGY", "Slush", "Yes."),
              // Typed chat has no key segment.
              {
                id: 5,
                timeSec: 3,
                sender: "Slush",
                text: "[VGTA] just kidding",
                kind: "chat" as const,
                colorCode: 4,
                segments: [
                  { text: "Slush: [VGTA] just kidding", colorCode: 4 },
                ],
              },
            ]
          : [];
      trackers.step(snap, t);
    }
    const ds = trackers.snapshot(
      { durationSec: 6, gameClassName: "CTFGame" },
      Infinity,
    );
    expect(
      ds.voiceBinds?.map((b) => [b.kind, b.keys, b.targetId, b.text]),
    ).toEqual([
      ["taunt", "VGTA", 43, "Aww, that's too bad!"],
      ["cheer", "VGW", 43, "Woohoo!"],
      ["compliment", "VGCG", 43, "Good game!"],
    ]);
  });
});

describe("player identity tracking", () => {
  it("keeps a renamed player and separates a recycled target id", () => {
    // Client 1 wears target 43 as "Zergy", becomes "saKe Zergy" at 5s
    // (renamed by the server), leaves at 10s — the server frees the id —
    // and client 2 joins into the reissued target id at 12s.
    const trackers = new DirectorTrackers();
    const cast = (t: number) =>
      t < 5
        ? [{ targetId: 43, name: "Zergy", clientId: 1, generation: 0 }]
        : t < 10
          ? [{ targetId: 43, name: "saKeZergy", clientId: 1, generation: 0 }]
          : t < 12
            ? []
            : [
                {
                  targetId: 43,
                  name: "Nofanator",
                  clientId: 2,
                  generation: 1,
                },
              ];
    for (let t = 0; t <= 20; t += 0.5) trackers.step(snapshot(t, cast(t)), t);
    const dataset = trackers.snapshot(
      { durationSec: 20, gameClassName: "CTFGame" },
      Infinity,
    );
    const entries = dataset.playerNames
      .filter((p) => p.targetId === 43)
      .map((p) => `${p.clientId} ${p.name} ${p.fromSec}-${p.toSec ?? "end"}`);
    expect(entries).toEqual([
      "1 zergy 0-5",
      "1 sakezergy 5-12",
      "2 nofanator 12-end",
    ]);
    // The name in force at each moment, and every alias of the stretch.
    expect(playerName(43, dataset, 3)).toBe("Zergy");
    expect(playerName(43, dataset, 8)).toBe("saKeZergy");
    expect(playerName(43, dataset, 15)).toBe("Nofanator");
    expect(targetIdForName("Zergy", dataset, 8)).toBe(43);
    expect(targetIdForName("Zergy", dataset, 15)).toBeNull();
    expect(
      dataset.playerNames.find((p) => p.name === "sakezergy")?.aliases,
    ).toEqual(["zergy", "sakezergy"]);
  });

  it("takes a name change within a generation as a rename, roster or not", () => {
    // No roster link (TacoServer sends the join's target field empty):
    // a name change on an id that was never freed is the server renaming
    // that player, never a new person — that would follow a free.
    const trackers = new DirectorTrackers();
    for (let t = 0; t <= 10; t += 0.5) {
      trackers.step(
        snapshot(t, [
          {
            targetId: 7,
            name: t < 5 ? "iwnlJazzz" : "Jazzziwnl",
            clientId: null,
            generation: 0,
          },
        ]),
        t,
      );
    }
    const dataset = trackers.snapshot(
      { durationSec: 10, gameClassName: "CTFGame" },
      Infinity,
    );
    const entries = dataset.playerNames.filter((p) => p.targetId === 7);
    expect(entries.map((p) => p.name)).toEqual(["iwnljazzz", "jazzziwnl"]);
    expect(entries[1].aliases).toEqual(["iwnljazzz", "jazzziwnl"]);
    expect(entries[0].clientId).toBeUndefined();
  });
});
