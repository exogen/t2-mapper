import { describe, expect, it, vi } from "vitest";
import { TICK_DURATION_MS } from "../stream/streamHelpers";
import type { DirectorSnapshot } from "../stream/types";
import { STAND_1, STAND_2 } from "./directorTestFixtures";
import {
  createLiveCastPlanner,
  liveCameraShot,
  type LiveCastPlannerFrame,
  type LiveCastPlannerShot,
} from "./liveCastPlanner";
import * as shotPath from "./shotPath";
import * as stage from "./stage";
import * as variety from "./variety";
import type { DirectorVec3, Shot } from "./types";

function frame(
  tick: number,
  overrides: Partial<DirectorSnapshot> = {},
): LiveCastPlannerFrame {
  const timeSec = (tick * TICK_DURATION_MS) / 1000;
  const snapshot: DirectorSnapshot = {
    timeSec,
    ghostAlwaysDoneSec: 0,
    entities: [],
    chatMessages: [],
    serverEvents: [],
    teamScores: [],
    playerRoster: [],
    matchClockMs: null,
    matchEnded: false,
    matchStarted: true,
    ...overrides,
  };
  return { tick, snapshot, matchPhase: snapshot.matchPhase };
}

const metadata = { gameClassName: "CTFGame" };

type TestFlag = {
  position: DirectorVec3;
  status: "home" | "held" | "field";
};

function player(
  targetId: number,
  teamId: number,
  position: DirectorVec3,
): DirectorSnapshot["entities"][number] {
  return {
    id: `player-${targetId}`,
    type: "Player",
    targetId,
    teamId,
    position,
  };
}

function flagEvent(
  timeSec: number,
  msgType: string,
  actor: string,
  team: string,
): DirectorSnapshot["serverEvents"][number] {
  return {
    id: Math.round(timeSec * 1000),
    timeSec,
    msgType,
    args: ["", "", actor, team],
  };
}

async function planCtfShots(
  durationSec: number,
  events: DirectorSnapshot["serverEvents"],
  sceneAt: (timeSec: number) => {
    flags: [TestFlag, TestFlag];
    players: DirectorSnapshot["entities"];
  },
): Promise<LiveCastPlannerShot[]> {
  const planner = createLiveCastPlanner({ startTick: 0, metadata });
  const shots: LiveCastPlannerShot[] = [];
  const teams = ["Storm", "Inferno"];
  for (let tick = 0; tick * TICK_DURATION_MS <= durationSec * 1000; tick++) {
    const timeSec = (tick * TICK_DURATION_MS) / 1000;
    const { flags, players } = sceneAt(timeSec);
    const entities = flags.map(({ position }, index) => ({
      id: `flag-${index}`,
      type: "Item",
      teamId: index + 1,
      targetRenderFlags: 2,
      position,
    }));
    shots.push(
      ...(await planner.pushFrame(
        frame(tick, {
          entities: [...entities, ...players],
          teamScores: flags.map(({ status }, index) => ({
            teamId: index + 1,
            name: teams[index],
            playerCount: 1,
            score: 0,
            flag: { teamId: index + 1, status },
          })),
          matchPhase: { kind: "running", startSec: -600 },
          serverEvents: events.filter((event) => event.timeSec <= timeSec),
        }),
      )),
    );
  }
  return shots;
}

const openingInventory: DirectorVec3 = [100, 100, 100];

async function planOpening(
  playersAt: (timeSec: number) => DirectorSnapshot["entities"],
): Promise<LiveCastPlannerShot[]> {
  const planner = createLiveCastPlanner({ startTick: 0, metadata });
  const station = {
    id: "opening-inventory",
    type: "StaticShape",
    dataBlock: "Station_inv_human",
    position: openingInventory,
  };
  const shots: LiveCastPlannerShot[] = [];
  for (let tick = 0; tick <= 480; tick++) {
    const t = (tick * TICK_DURATION_MS) / 1000;
    shots.push(
      ...(await planner.pushFrame(
        frame(tick, {
          entities: [station, ...playersAt(t)],
          matchPhase: { kind: "running", startSec: 0 },
        }),
      )),
    );
  }
  return shots;
}

function inventoryShot({ shot }: LiveCastPlannerShot): boolean {
  return (
    shot.kind === "fixedOrbit" &&
    shot.center.every((value, index) => value === openingInventory[index]) &&
    shot.radius === 14
  );
}

describe("authoritative live cast planner", () => {
  it("cuts away from a quiet flag contest to a sustained grab elsewhere", async () => {
    const looseFlag: DirectorVec3 = [580, 0, 100];
    const grabAt = 80;
    const shots = await planCtfShots(
      102,
      [
        flagEvent(48, "MsgCTFFlagTaken", "Runner", "Inferno"),
        flagEvent(50, "MsgCTFFlagDropped", "Runner", "Inferno"),
        flagEvent(grabAt, "MsgCTFFlagTaken", "Other runner", "Storm"),
      ],
      (t) => {
        const stormPosition: DirectorVec3 =
          t < grabAt ? STAND_1 : [Math.min((t - grabAt) * 20, 550), 0, 100];
        const players =
          t >= 49
            ? [player(1, 1, [580, -4, 100]), player(2, 2, [580, 4, 100])]
            : [];
        if (t >= grabAt) players.push(player(3, 2, stormPosition));
        return {
          flags: [
            { position: stormPosition, status: t < grabAt ? "home" : "held" },
            {
              position: t < 48 ? STAND_2 : looseFlag,
              status: t < 48 ? "home" : t < 50 ? "held" : "field",
            },
          ],
          players,
        };
      },
    );
    expect(
      shots.some(
        ({ shot }) =>
          shot.kind === "fixedOrbit" &&
          shot.subject?.type === "flag" &&
          shot.subject.slot === 2,
      ),
    ).toBe(true);
    const coveringGrab = shots.findLast(
      ({ shot }) => shot.startSec <= grabAt + 6,
    );
    expect(coveringGrab?.shot).toMatchObject({ kind: "followFlag", slot: 1 });
  });

  it.each([
    { returnAt: 65, isUseful: true },
    { returnAt: 64.6, isUseful: false },
  ])(
    "only gives a late scoring return cut room when it can show the play ($returnAt)",
    async ({ returnAt, isUseful }) => {
      const dropAt = 62.5;
      const returnPosition: DirectorVec3 = [500, 0, 100];
      const shots = await planCtfShots(
        78,
        [
          flagEvent(50, "MsgCTFFlagTaken", "Runner", "Inferno"),
          flagEvent(dropAt, "MsgCTFFlagDropped", "Runner", "Storm"),
          flagEvent(returnAt, "MsgCTFFlagReturned", "Defender", "Storm"),
        ],
        (t) => {
          const stormStatus =
            t < 59 || t >= returnAt ? "home" : t < dropAt ? "held" : "field";
          return {
            flags: [
              {
                position: stormStatus === "home" ? STAND_1 : returnPosition,
                status: stormStatus,
              },
              {
                position: t >= 50 ? [170, 0, 100] : STAND_2,
                status: t >= 50 ? "held" : "home",
              },
            ],
            players:
              t >= 59 && t < 69
                ? [player(8, 1, returnPosition), player(9, 2, [500, 5, 100])]
                : [],
          };
        },
      );
      expect(
        shots.findLast(({ shot }) => shot.startSec < dropAt)?.shot,
      ).toMatchObject({
        kind: "followFlag",
        slot: 1,
      });
      const next = shots.find(({ shot }) => shot.startSec >= dropAt);
      if (isUseful) {
        expect(next?.shot).toMatchObject({
          kind: "fixedOrbit",
          center: returnPosition,
        });
        expect(next?.shot.startSec).toBeLessThan(returnAt);
      } else {
        expect(next?.shot.startSec).toBeGreaterThanOrEqual(returnAt);
        expect(next?.shot.startSec).toBeLessThan(returnAt + 2);
      }
    },
  );

  it("repairs an aired scoring shot after its subject leaves the room", async () => {
    const capAt = 20;
    const stageShot = stage.stageShot;
    let stagedRoom = false;
    const staging = vi
      .spyOn(stage, "stageShot")
      .mockImplementation((...args) => {
        const result = stageShot(...args);
        if (args[0].topic !== "capture" || stagedRoom) return result;
        stagedRoom = true;
        return {
          ...result,
          shot: {
            ...result.shot,
            kind: "fixedOrbit",
            center: STAND_1,
            radius: 8,
            lookSubject: { type: "player", targetId: 15 },
            trackSubject: true,
            staged: { angle: 0, radius: 8, liftFactor: 0.2, visibility: 1 },
          },
        };
      });
    const sightline = vi
      .spyOn(shotPath, "subjectVisible")
      .mockImplementation((_eye, aim) => aim[0] >= 0);
    try {
      const shots = await planCtfShots(
        31,
        [flagEvent(capAt, "MsgCTFFlagCapped", "Scorer", "Inferno")],
        (t) => ({
          flags: [
            { position: STAND_1, status: "home" },
            { position: STAND_2, status: "home" },
          ],
          players: [
            {
              ...player(15, 1, [
                t > capAt + 0.5 ? -50 : Math.max(1, (capAt - t) * 15),
                0,
                100,
              ]),
              playerName: "Scorer",
            },
          ],
        }),
      );
      const at = (t: number) =>
        shots.findLast(({ shot }) => shot.startSec <= t);
      expect(at(capAt)?.shot).toMatchObject({
        kind: "fixedOrbit",
        trackSubject: true,
      });
      expect(at(capAt + 3)?.shot).toMatchObject({
        kind: "followPlayer",
        targetId: 15,
      });
    } finally {
      sightline.mockRestore();
      staging.mockRestore();
    }
  });

  it.each([
    { runner: true, announcedAt: 20, raidAt: 14.5, kind: "followPlayer" },
    { runner: false, announcedAt: 20, raidAt: 15.5, kind: "fixedOrbit" },
    { runner: false, announcedAt: 25.5, raidAt: 15.5, kind: undefined },
  ])(
    "reserves the scoring shot before the capture when announced at $announcedAt (runner=$runner)",
    async ({ runner, announcedAt, raidAt, kind }) => {
      const capSec = runner ? 19.968 : 20;
      const stand: [number, number, number] = [0, 0, 100];
      const distant: [number, number, number] = [700, 400, 100];
      const pick = vi
        .spyOn(variety, "pickVarietyShot")
        .mockImplementation((_view, t) =>
          t === raidAt
            ? {
                family: "destruction",
                shot: {
                  kind: "fixedOrbit",
                  center: distant,
                  radius: 30,
                  startSec: t,
                  endSec: 28,
                  transitionIn: "cut",
                  reason: "Distant raid",
                },
              }
            : null,
        );
      try {
        const planner = createLiveCastPlanner({ startTick: 0, metadata });
        const teams = ["Storm", "Inferno"];
        const flags = teams.map((_, index) => ({
          id: `flag-${index}`,
          type: "Item",
          teamId: index + 1,
          targetRenderFlags: 2,
          position:
            index === 0 ? stand : ([800, 0, 100] as [number, number, number]),
        }));
        const shots: LiveCastPlannerShot[] = [];
        for (let tick = 0; tick < 1_020; tick++) {
          const t = (tick * TICK_DURATION_MS) / 1000;
          const entities: DirectorSnapshot["entities"] = [...flags];
          if (runner) {
            entities.push({
              id: "scorer",
              type: "Player",
              targetId: 15,
              playerName: "Scorer",
              teamId: 1,
              position: [Math.max(1, (capSec - t) * 15), 0, 100],
            });
          }
          shots.push(
            ...(await planner.pushFrame(
              frame(tick, {
                entities,
                teamScores: teams.map((name, index) => ({
                  teamId: index + 1,
                  name,
                  playerCount: 1,
                  score: 0,
                })),
                matchPhase: { kind: "running", startSec: -600 },
                serverEvents:
                  t >= announcedAt
                    ? [
                        {
                          id: 1,
                          timeSec: capSec,
                          msgType: "MsgCTFFlagCapped",
                          args: ["", "", "Scorer", "Inferno"],
                        },
                      ]
                    : [],
              }),
            )),
          );
        }
        const at = (t: number) =>
          shots.findLast(({ shot }) => shot.startSec <= t);
        const scoring = at(capSec);
        expect(pick.mock.calls.some(([, t]) => t === raidAt)).toBe(true);
        if (!kind) {
          expect(scoring?.shot).toMatchObject({
            kind: "fixedOrbit",
            center: distant,
          });
          expect(at(capSec + 3)).toBe(scoring);
          return;
        }
        expect(scoring?.shot).toMatchObject({
          kind,
          subject: { type: "flag", slot: 2 },
          ...(runner ? { targetId: 15 } : { center: stand }),
        });
        expect(at(capSec - 2)).toBe(scoring);
        expect(at(capSec + 3)).toBe(scoring);
        const raid = shots.find(
          ({ shot }) =>
            shot.kind === "fixedOrbit" &&
            shot.center.every((value, i) => value === distant[i]),
        );
        if (runner) {
          expect(raid).toBeDefined();
          const hold = scoring!.shot.startSec - raid!.shot.startSec;
          expect(hold).toBeCloseTo(3.008, 3);
        } else expect(raid).toBeUndefined();
      } finally {
        pick.mockRestore();
      }
    },
  );

  it("waits for a useful scene but can start with terrain alone", async () => {
    const planner = createLiveCastPlanner({
      startTick: 0,
      lookaheadSec: 0,
      metadata,
    });
    const unready = { ghostAlwaysDoneSec: null };
    expect(await planner.pushFrame(frame(0, unready))).toEqual([]);
    expect(planner.plannedThroughTick).toBe(-1);
    const [shot] = await planner.pushFrame(
      frame(15, {
        ...unready,
        entities: [
          {
            id: "terrain",
            type: "TerrainBlock",
            className: "TerrainBlock",
            sceneData: {
              className: "TerrainBlock",
              ghostIndex: 1,
              terrFileName: "arena.ter",
              detailTextureName: "",
              squareSize: 8,
            },
          },
        ],
      }),
    );
    expect(shot.startTick).toBe(15);
  });

  it("cuts from the empty inventory as soon as the live minimum hold allows", async () => {
    const shots = await planOpening((t) => {
      const x = t < 4.2 ? 100 : 200 + 10 * t;
      return [player(1, 1, [x, 98, 100]), player(2, 1, [x, 102, 100])];
    });
    const index = shots.findIndex(inventoryShot);
    expect(index).toBeGreaterThanOrEqual(0);
    const next = shots[index + 1]?.shot;
    expect(next).toMatchObject({ kind: "followPlayer", targetId: 1 });
    const hold = next.startSec - shots[index].shot.startSec;
    expect(hold).toBeGreaterThanOrEqual(3);
    expect(hold).toBeLessThan(5);
  });

  it("finds an inventory group even when players spawn on different samples", async () => {
    const shots = await planOpening((t) =>
      t < 2
        ? [player(1, 1, openingInventory)]
        : [
            player(1, 1, openingInventory),
            player(2, 1, [100, 102, 100]),
            player(3, 1, [100, 98, 100]),
          ],
    );
    const kickoff = shots.find(inventoryShot);
    expect(kickoff?.shot.startSec).toBeLessThan(5);
  });

  it("cuts to current players when departing inventory users leave scope", async () => {
    const shots = await planOpening((t) =>
      t < 5
        ? [1, 2, 3, 4].map((id) => player(id, 1, [100, 100 + id, 100]))
        : [player(5, 1, [280, 102, 100]), player(6, 1, [280, 104, 100])],
    );
    const index = shots.findIndex(inventoryShot);
    expect(index).toBeGreaterThanOrEqual(0);
    expect(shots[index + 1]?.shot).toMatchObject({
      kind: "fixedOrbit",
      center: [280, 103, 100],
    });
  });

  it.each([
    { kickoff: 13, cut: 106, horizon: 122 },
    { kickoff: 101, cut: 101, horizon: 116 },
  ])(
    "cuts to the kickoff shot at tick $cut after kickoff at $kickoff",
    async ({ kickoff, cut, horizon }) => {
      const planner = createLiveCastPlanner({
        startTick: 0,
        lookaheadSec: 0.5,
        metadata,
      });
      const station = {
        id: "station",
        type: "StaticShape",
        dataBlock: "Station_inv_human",
        position: [100, 120, 30] as [number, number, number],
      };
      const entities = [
        station,
        ...[1, 2].map((targetId) => ({
          id: `player-${targetId}`,
          type: "Player",
          targetId,
          teamId: 1,
          position: station.position,
        })),
      ];
      const shots = [];
      for (let tick = 0; tick <= horizon; tick++) {
        shots.push(
          ...(await planner.pushFrame({
            ...frame(tick, { entities }),
            matchPhase:
              tick >= kickoff
                ? {
                    kind: "running",
                    startSec: (kickoff * TICK_DURATION_MS) / 1000,
                  }
                : { kind: "warmup" },
          })),
        );
      }
      expect(shots.map((shot) => shot.startTick)).toEqual([0, cut]);
      expect(cut * TICK_DURATION_MS).toBeGreaterThanOrEqual(3_000);
      expect(shots[1]).toMatchObject({
        availableThroughTick: horizon,
        shot: { kind: "fixedOrbit", center: station.position },
      });
      expect(shots[0].shot).not.toHaveProperty("center", station.position);
    },
  );

  it.each([
    { startSec: -600, ongoing: true },
    { startSec: null, ongoing: true },
    { startSec: 0, ongoing: false },
  ])(
    "starts with the correct shot policy when hydrated with kickoff $startSec",
    async ({ startSec, ongoing }) => {
      const phase = { kind: "running" as const, startSec };
      const planner = createLiveCastPlanner({
        startTick: 0,
        lookaheadSec: 0,
        metadata,
      });
      const mixer = vi.spyOn(variety, "pickVarietyShot");
      try {
        for (let tick = 0; tick < 120; tick++) {
          await planner.pushFrame(frame(tick, { matchPhase: phase }));
        }
        expect(mixer.mock.calls.length > 0).toBe(ongoing);
      } finally {
        mixer.mockRestore();
      }
    },
  );

  it("waits for the configured lookahead and keeps reporting planned coverage between shots", async () => {
    const planner = createLiveCastPlanner({ startTick: 100, metadata });
    expect(await planner.pushFrame(frame(99))).toEqual([]);
    expect(await planner.pushFrame(frame(100))).toEqual([]);
    // Tick 287 is the last input tick at or before 3.2 s + 6 s.
    expect(await planner.pushFrame(frame(286))).toEqual([]);
    expect(planner.plannedThroughTick).toBe(99);
    const [first] = await planner.pushFrame(frame(287));
    expect(first).toMatchObject({
      startTick: 100,
      availableThroughTick: 287,
      shot: { startSec: 3.2 },
    });
    expect(first.shot).not.toHaveProperty("reason");
    expect(Object.isFrozen(first.shot)).toBe(true);
    expect(planner.plannedThroughTick).toBe(100);

    const original = structuredClone(first);
    await planner.pushFrame(frame(303));
    expect(planner.plannedThroughTick).toBe(115);
    expect(first).toEqual(original);
  });

  it("ignores startup history without advancing the switcher through a fabricated match", async () => {
    const planner = createLiveCastPlanner({
      startTick: 9_000,
      lookaheadSec: 0.25,
      metadata,
    });
    await planner.pushFrame(frame(8_999));
    await planner.pushFrame(frame(10_000));
    const [shot] = await planner.pushFrame(frame(10_008));
    expect(shot.startTick).toBe(10_000);
    expect(shot.availableThroughTick).toBe(10_007);
    expect(planner.plannedThroughTick).toBe(10_000);
  });

  it("does not use a late source snapshot to plan an earlier horizon", async () => {
    const usedFrames: number[] = [];
    const planner = createLiveCastPlanner({
      startTick: 0,
      lookaheadSec: 0.5,
      metadata,
      withWorld: (snapshot, operation) => {
        usedFrames.push(snapshot.timeSec);
        return operation();
      },
    });
    await planner.pushFrame(frame(0));
    await planner.pushFrame(frame(24));
    expect(planner.plannedThroughTick).toBe(0);
    expect(usedFrames.length).toBeGreaterThan(1);
    expect(usedFrames.every((timeSec) => timeSec === 0)).toBe(true);
  });

  it("only reads snapshots needed for planning and for the final tick", async () => {
    const readTicks = new Set<number>();
    const planner = createLiveCastPlanner({
      startTick: 0,
      lookaheadSec: 0,
      metadata,
    });
    for (let tick = 0; tick <= 19; tick++) {
      await planner.pushFrame({
        tick,
        get snapshot() {
          readTicks.add(tick);
          return frame(tick).snapshot;
        },
      });
    }
    expect([...readTicks]).toEqual([0, 15]);
    await planner.finish();
    expect([...readTicks]).toEqual([0, 15, 19]);
  });

  it("finishes the remaining tail using existing input even if the match is shorter than the window", async () => {
    const planner = createLiveCastPlanner({ startTick: 100, metadata });
    expect(await planner.pushFrame(frame(100))).toEqual([]);
    expect(await planner.pushFrame(frame(160))).toEqual([]);
    const shots = await planner.finish();
    expect(shots[0]).toMatchObject({
      startTick: 100,
      availableThroughTick: 160,
    });
    expect(shots.every((shot) => shot.startTick < 160)).toBe(true);
    expect(planner.plannedThroughTick).toBe(160);
    expect(await planner.finish()).toEqual([]);
  });

  it("never publishes a plan for unsupported modes", async () => {
    const planner = createLiveCastPlanner({
      startTick: 100,
      metadata: { gameClassName: "DeathmatchGame" },
    });
    await planner.pushFrame(frame(100));
    expect(await planner.pushFrame(frame(350))).toEqual([]);
    expect(await planner.finish()).toEqual([]);
  });

  it.each([false, true])(
    "preserves sweep phase and records only aired cooldowns (expired=%s)",
    async (expired) => {
      const planner = createLiveCastPlanner({
        startTick: 0,
        lookaheadSec: 0.5,
        metadata,
      });
      const candidate: Shot = {
        kind: "sweep",
        startSec: 0.5,
        endSec: 10,
        from: [0, 0, 100],
        to: [60, 0, 100],
        target: [0, 30, 100],
        targetTo: [60, 30, 100],
        moveSec: 9,
        easing: "linear",
        pathSolved: true,
        transitionIn: "cut",
        reason: "Tracking wide",
      };
      const pick = vi
        .spyOn(variety, "pickVarietyShot")
        .mockImplementation((_view, t) => {
          if (t === candidate.startSec) {
            return {
              family: "offensiveWave",
              cooldownKey: "offensiveWave:2",
              latestStartSec: expired ? 2 : 7.5,
              shot: candidate,
            };
          }
          if (expired && t >= 2.5 && t <= 3) {
            return {
              family: "vehiclePad",
              shot: {
                kind: "fixedOrbit",
                center: [80, 60, 100],
                radius: 20,
                startSec: t,
                endSec: t + 5,
                transitionIn: "cut",
                reason: "Vehicle pad",
              },
            };
          }
          return null;
        });
      try {
        const shots = [];
        for (let tick = 0; tick < 310; tick++) {
          shots.push(
            ...(await planner.pushFrame(
              frame(tick, {
                matchPhase: { kind: "running", startSec: -600 },
              }),
            )),
          );
        }
        const sweep = shots.find(({ shot }) => shot.kind === "sweep");
        const memory = pick.mock.calls.at(-1)?.[2];
        if (expired) {
          expect(sweep).toBeUndefined();
          expect(memory?.has("offensiveWave:2")).toBe(false);
          const replacement = shots.find(
            ({ shot }) => shot.kind === "fixedOrbit" && shot.center[0] === 80,
          );
          expect(replacement?.shot.startSec).toBeLessThan(candidate.endSec);
          expect(replacement?.shot.startSec).toBeGreaterThan(4.9);
        } else {
          expect(sweep?.shot.startSec).toBeGreaterThan(4.9);
          expect(sweep?.shot).toMatchObject({
            moveOffsetSec: (sweep?.shot.startSec ?? 0) - 0.5,
          });
          expect(memory?.get("offensiveWave:2")).toBe(sweep?.shot.startSec);
        }
      } finally {
        pick.mockRestore();
      }
    },
  );

  it("detaches and freezes only the camera parameters used in the published shot", () => {
    const candidate: Shot = {
      kind: "sweep",
      startSec: 4,
      endSec: 10,
      from: [1, 2, 3],
      to: [4, 5, 6],
      target: [7, 8, 9],
      via: [[3, 4, 5]],
      moveSec: 5,
      easing: "hold",
      transitionIn: "cut",
      reason: "Private reason",
      role: "rosterWide",
      coverageCutIn: true,
    };
    const shot = liveCameraShot(candidate, 125);
    expect(shot).toMatchObject({
      startSec: 4,
      moveSec: 5,
      easing: "hold",
      via: [[3, 4, 5]],
    });
    expect(
      liveCameraShot({ ...candidate, easing: undefined }, 125),
    ).toMatchObject({
      easing: "hold",
    });
    expect(shot).not.toHaveProperty("reason");
    expect(shot).not.toHaveProperty("role");
    expect(shot).not.toHaveProperty("coverageCutIn");
    candidate.via![0][0] = 99;
    expect(shot.kind === "sweep" && Object.isFrozen(shot.via?.[0])).toBe(true);
    expect(shot).toMatchObject({ via: [[3, 4, 5]] });
  });

  it("gives a live shot at least three seconds of playback even with a short input horizon", () => {
    const candidate: Shot = {
      kind: "fixedOrbit",
      center: [0, 0, 0],
      radius: 10,
      startSec: 0,
      endSec: 0.5,
      transitionIn: "cut",
      reason: "Test orbit",
    };
    expect(liveCameraShot(candidate, 0).endSec).toBe(3);
  });
});
