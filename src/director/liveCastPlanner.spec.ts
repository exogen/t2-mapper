import { describe, expect, it, vi } from "vitest";
import { TICK_DURATION_MS } from "../stream/streamHelpers";
import type { DirectorSnapshot } from "../stream/types";
import {
  createLiveCastPlanner,
  liveCameraShot,
  type LiveCastPlannerFrame,
} from "./liveCastPlanner";
import * as variety from "./variety";
import type { Shot } from "./types";

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

describe("authoritative live cast planner", () => {
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
        endSec: 6,
        from: [0, 0, 100],
        to: [60, 0, 100],
        target: [0, 30, 100],
        targetTo: [60, 30, 100],
        moveSec: 5,
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
              latestStartSec: expired ? 2 : 4,
              shot: candidate,
            };
          }
          if (expired && t === 2.5) {
            return {
              family: "vehiclePad",
              shot: {
                kind: "fixedOrbit",
                center: [80, 60, 100],
                radius: 20,
                startSec: t,
                endSec: t + 4,
                transitionIn: "cut",
                reason: "Vehicle pad",
              },
            };
          }
          return null;
        });
      try {
        const shots = [];
        for (let tick = 0; tick < 230; tick++) {
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
          expect(replacement?.shot.startSec).toBeGreaterThanOrEqual(3);
        } else {
          expect(sweep?.shot.startSec).toBeGreaterThanOrEqual(3);
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
