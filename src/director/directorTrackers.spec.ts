import { describe, expect, it } from "vitest";
import { DirectorTrackers } from "./directorTrackers";
import type { PlayerRosterEntry, StreamSnapshot } from "../stream/types";
import { playerName, targetIdForName } from "./dataset";
import { DirectorFactReplay, type DirectorFactRecord } from "./factJournal";
import { DirectorObservationReplay } from "./liveObservation";

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

describe("current-state recording", () => {
  it("snapshots names, target generations, health, scores, and flags without changing the director", () => {
    const recorded = new DirectorTrackers({ stateStreamId: "match" });
    const cameraOnly = new DirectorTrackers();
    const replay = new DirectorObservationReplay("match");
    for (let t = 0; t <= 2; t += 0.5) {
      const s = snapshot(t, [
        {
          targetId: 43,
          name: t < 1 ? "Runner" : "Replacement",
          clientId: t < 1 ? 1 : 2,
          generation: t < 1 ? 0 : 1,
        },
      ]);
      s.entities[0].health = t < 1 ? 0.5 : 1;
      s.entities.push({
        id: "flag",
        type: "Item",
        teamId: 2,
        targetRenderFlags: 2,
        position: [0, 0, 0],
      });
      s.teamScores = [
        {
          teamId: 2,
          name: "Inferno",
          score: t < 1 ? 0 : 1,
          flagStatus: t < 1 ? "field" : "home",
          playerCount: 1,
        },
      ];
      s.matchClockMs = -60000 + t * 1000;
      recorded.step(s, t);
      cameraOnly.step(s, t);
      replay.append(recorded.drainStates());
      // Parsers can reuse and mutate their objects after a tick.
      s.entities[0].playerName = "Future name";
      s.teamScores[0].score = 99;
    }
    const atZero = replay.observe({ timeSec: 0, availableThroughSec: 2 });
    expect(atZero.state?.players[0]).toMatchObject({
      name: "Runner",
      targetGeneration: 0,
      clientId: 1,
      health: 0.5,
    });
    expect(atZero.state?.teams[0].score).toBe(0);
    expect(atZero.state?.flags[0]).toMatchObject({
      status: "field",
      teamId: 2,
    });
    expect(atZero.state?.match.clockMs).toBe(-60000);
    expect(
      replay.observe({ timeSec: 1, availableThroughSec: 2 }).state?.players[0],
    ).toMatchObject({
      name: "Replacement",
      targetGeneration: 1,
      clientId: 2,
      health: 1,
    });
    const meta = { durationSec: 2, gameClassName: "CTFGame" };
    expect(recorded.snapshot(meta, 2)).toEqual(cameraOnly.snapshot(meta, 2));
    expect(cameraOnly.drainStates()).toEqual([]);
    expect(recorded.drainFacts()).toEqual([]);
  });

  it("does not promote the director's missing-status home fallback to confirmed state", () => {
    const tracker = new DirectorTrackers({ stateStreamId: "match" });
    const s = snapshot(0, []);
    s.entities.push({
      id: "flag",
      type: "Item",
      teamId: 2,
      targetRenderFlags: 2,
      position: [0, 0, 0],
    });
    tracker.step(s, 0);
    expect(tracker.drainStates()[0].flags[0].status).toBe("unknown");
  });
});

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

describe("optional fact recording", () => {
  const cast = [
    { targetId: 7, name: "Killer", clientId: 1, generation: 0 },
    { targetId: 8, name: "Runner", clientId: 2, generation: 0 },
  ];
  const meta = { durationSec: 12, gameClassName: "CTFGame" };
  function play(t: number): StreamSnapshot {
    const snap = snapshot(t, cast);
    snap.entities[1].damageState = t >= 2 ? 2 : 0;
    // Include already seen messages to exercise snapshot/reconnect deduping.
    snap.serverEvents =
      t >= 2
        ? [
            {
              id: 1,
              timeSec: 2,
              msgType: "MsgLegitKill",
              args: ["", "", "Runner", "", "", "Killer", "", "", "", "disc"],
            },
            {
              id: 2,
              timeSec: 2,
              msgType: "MsgCTFFlagDropped",
              args: ["", "", "Runner", "Inferno"],
            },
          ]
        : [];
    snap.chatMessages =
      t >= 2
        ? [
            {
              id: 1,
              timeSec: 2,
              kind: "server",
              colorCode: 5,
              sender: "",
              text: "Killer hit a mid air shot. [69m, Spinfusor]",
              segments: [],
            },
          ]
        : [];
    return snap;
  }

  it("records immediate messages and later attribution separately", () => {
    const trackers = new DirectorTrackers({ factStreamId: "live-match" });
    const records: DirectorFactRecord[] = [];
    for (let t = 0; t <= 12; t += 0.5) {
      trackers.step(play(t), t);
      records.push(...trackers.drainFacts());
    }
    const drop = records.filter(
      (r) => r.kind === "event" && r.value.type === "flag-drop",
    );
    expect(drop.map((r) => [r.revision, r.timeSec, r.availableAtSec])).toEqual([
      [1, 2, 2],
      [2, 2, 10],
    ]);
    expect(drop[0].kind === "event" && drop[0].value.dropKind).toBeUndefined();
    expect(drop[1]).toMatchObject({ value: { dropKind: "died" } });
    const deaths = records.filter((r) => r.kind === "death");
    expect(
      deaths.map((r) => [
        r.availableAtSec,
        r.value.killerTargetId,
        r.value.midair,
      ]),
    ).toEqual([
      [2, null, undefined],
      [6, 7, undefined],
      [10, 7, true],
    ]);
    const skills = records.filter((r) => r.kind === "skillShot");
    expect(skills.map((r) => [r.availableAtSec, r.value.lethal])).toEqual([
      [2, undefined],
      [10, true],
    ]);
    // Replay cannot see the final dataset's classification at event time.
    const replay = new DirectorFactReplay(records);
    expect(replay.advanceTo(2).every((r) => r.revision === 1)).toBe(true);
    expect(
      replay.advanceTo(9).some((r) => r.kind === "event" && r.value.dropKind),
    ).toBe(false);
    expect(
      replay
        .advanceTo(10)
        .some((r) => r.kind === "event" && r.value.dropKind === "died"),
    ).toBe(true);
  });

  it("does not change the director dataset, regardless of consumer cadence", () => {
    const cameraOnly = new DirectorTrackers();
    const dynamic = new DirectorTrackers({ factStreamId: "same-match" });
    const batch = new DirectorTrackers({ factStreamId: "same-match" });
    const records: DirectorFactRecord[] = [];
    for (let t = 0; t <= 12; t += 0.5) {
      cameraOnly.step(play(t), t);
      dynamic.step(play(t), t);
      batch.step(play(t), t);
      records.push(...dynamic.drainFacts());
      expect(dynamic.snapshot(meta, t)).toEqual(cameraOnly.snapshot(meta, t));
      expect(batch.snapshot(meta, t)).toEqual(cameraOnly.snapshot(meta, t));
    }
    expect(cameraOnly.drainFacts()).toEqual([]);
    expect(batch.drainFacts()).toEqual(records);
  });

  it("keeps a recorded prefix unchanged when an unseen suffix resolves it", () => {
    const short = new DirectorTrackers({ factStreamId: "same-match" });
    const long = new DirectorTrackers({ factStreamId: "same-match" });
    for (let t = 0; t <= 3; t += 0.5) {
      short.step(play(t), t);
      long.step(play(t), t);
    }
    const prefix = short.drainFacts();
    const before = JSON.stringify(prefix);
    // Finalizing the archive must not manufacture finite availability times.
    short.snapshot(meta, Infinity);
    expect(short.drainFacts()).toEqual([]);
    for (let t = 3.5; t <= 12; t += 0.5) long.step(play(t), t);
    expect(new DirectorFactReplay(long.drainFacts()).advanceTo(3)).toEqual(
      prefix,
    );
    expect(JSON.stringify(prefix)).toBe(before);
  });
});
