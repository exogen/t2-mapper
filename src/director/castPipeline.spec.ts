import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCastStream, runCastPipeline } from "./castPipeline";
import type { DirectorDataset, Shot } from "./types";

const facts = vi.hoisted(() => ({
  locatedAt: 84,
  modeKnownAt: 0,
  captureAvailableAt: Infinity,
}));
beforeEach(() => {
  facts.locatedAt = 84;
  facts.modeKnownAt = 0;
  facts.captureAvailableAt = Infinity;
});

// A recording with one delayed fact: the kill message arrives at 80s,
// but the tracker cannot locate its victim until 84s. Feeding a large
// scan chunk must not give an earlier camera decision that later fact.
vi.mock("./demoDirectorScanner", () => ({
  createDirectorScanStream: async () => {
    let scanned = 0;
    const durationSec = 100.25;
    const kill = {
      timeSec: 80,
      type: "kill" as const,
      description: "Runner down",
      victim: "Runner",
      weapon: "disc",
      pos: undefined as [number, number, number] | undefined,
    };
    return {
      durationSec,
      advanceTo: async (sec: number) => {
        scanned = Math.max(scanned, Math.min(sec, durationSec));
        if (scanned >= facts.locatedAt) kill.pos = [400, 0, 100];
      },
      datasetTo: (sec: number): DirectorDataset => ({
        durationSec: Math.min(sec, durationSec),
        flagSampleStepSec: 0.5,
        playerSampleStepSec: 1,
        gameClassName: scanned >= facts.modeKnownAt ? "CTFGame" : null,
        teams: [
          { teamId: 1, name: "Storm" },
          { teamId: 2, name: "Inferno" },
        ],
        flagStands:
          scanned >= facts.modeKnownAt
            ? [
                { slot: 1, teamId: 1, name: "Storm", pos: [0, 0, 100] },
                { slot: 2, teamId: 2, name: "Inferno", pos: [800, 0, 100] },
              ]
            : [],
        events: [
          { timeSec: 0, type: "match-start", description: "Match started" },
          ...(scanned >= 80 ? [kill] : []),
          ...(scanned >= facts.captureAvailableAt
            ? [
                {
                  timeSec: 80.1,
                  type: "flag-cap" as const,
                  capturer: "Runner",
                  flagTeamName: "Inferno",
                  description: "Runner captured the Inferno flag",
                },
              ]
            : []),
        ],
        flagSamples: Array.from(
          { length: Math.floor(scanned * 2) + 1 },
          (_, i) =>
            [1, 2].map((slot) => ({
              timeSec: i / 2,
              slot,
              status: "home" as const,
              carrierTargetId: null,
              pos: [slot === 1 ? 0 : 800, 0, 100] as [number, number, number],
            })),
        ).flat(),
        playerSamples: [],
        playerNames: [],
        structures: [],
        structureInventory: [],
        mortarShots: [],
        deaths: [],
        stations: [],
        scoreSamples: [],
      }),
      drainFacts: () => [],
      drainStates: () => [],
    };
  },
}));

const cameras = (shots: Shot[]) =>
  shots.map(({ scene: _scene, ...camera }) => camera);

describe("cast pipeline cadence", () => {
  it("waits for a from-connect recording's mode instead of choosing the offline fallback", async () => {
    facts.modeKnownAt = 4.5;
    const stream = await createCastStream(new ArrayBuffer(0));
    expect(stream.plan.shots.length).toBeGreaterThan(0);
    expect(stream.plannedToSec).toBeLessThan(5);
    await stream.finish();
    expect(stream.complete).toBe(true);
  });

  it("does not anticipate a kill using a location resolved after it happened", async () => {
    const { plan } = await runCastPipeline(new ArrayBuffer(0));
    expect(plan.shots.some((s) => s.topic === "kill")).toBe(false);
  });

  it("does not borrow even one extra second of tracker enrichment beyond the horizon", async () => {
    facts.locatedAt = 81;
    const { plan } = await runCastPipeline(new ArrayBuffer(0));
    const kill = plan.shots.find((s) => s.topic === "kill");
    expect(kill).toBeDefined();
    // At picture time 79 the two-second horizon reaches availability
    // time 81. It cannot use that location at picture time 78.
    expect(kill!.startSec).toBeGreaterThanOrEqual(79);
  });

  it("produces the same cameras with irregular playback updates and batch input", async () => {
    const dynamic = await createCastStream(new ArrayBuffer(0));
    for (let t = 0; t < 100; t += 0.7) await dynamic.advanceTo(t);
    const dynamicPlan = await dynamic.finish();
    const { plan } = await runCastPipeline(new ArrayBuffer(0));
    expect(cameras(dynamicPlan.shots)).toEqual(cameras(plan.shots));
    expect(plan.shots.at(-1)?.endSec).toBe(100.25);
    expect(await dynamic.finish()).toBe(dynamicPlan);
  });

  it("reacts to a delayed capture identically in batch and playback, preserving aired cameras", async () => {
    // Capture at 80.1, learned only at scan time 84.5. With the normal
    // two-second lookahead the picture has already reached 82.5.
    facts.captureAvailableAt = 84.5;
    const stream = await createCastStream(new ArrayBuffer(0));
    const aired: { time: number; shot: Shot; camera: object }[] = [];
    const framing = ({
      scene: _scene,
      endSec: _end,
      quickCut: _quick,
      ...s
    }: Shot) => structuredClone(s);
    for (let time = 79; time <= 86; time += 0.5) {
      await stream.advanceTo(time);
      const shot = stream.shots.find(
        (s) => s.startSec <= time && s.endSec > time,
      );
      expect(shot).toBeDefined();
      aired.push({ time, shot: shot!, camera: framing(shot!) });
      if (time === 82.5) {
        expect(shot).toMatchObject({
          topic: "aftermath",
          startSec: 82.5,
        });
        if (shot?.kind === "fixedOrbit") expect(shot.staged).toBeDefined();
      }
    }
    const dynamic = await stream.finish();
    const { plan: batch } = await runCastPipeline(new ArrayBuffer(0));
    expect(cameras(dynamic.shots)).toEqual(cameras(batch.shots));
    expect(dynamic.shots.find((s) => s.topic === "aftermath")?.endSec).toBe(
      84.6,
    );
    expect(dynamic.shots.filter((s) => s.topic === "aftermath")).toHaveLength(
      1,
    );
    for (const { time, shot, camera } of aired) {
      expect(
        dynamic.shots.find((s) => s.startSec <= time && s.endSec > time),
      ).toBe(shot);
      expect(framing(shot)).toEqual(camera);
    }
  });

  it("publishes solved cameras before playback and preserves their framing through EOF", async () => {
    const stream = await createCastStream(new ArrayBuffer(0));
    const plan = stream.plan;
    const shots = stream.shots;
    const aired: { time: number; shot: Shot; camera: object }[] = [];
    const framing = ({
      scene: _scene,
      endSec: _end,
      quickCut: _quick,
      ...s
    }: Shot) => structuredClone(s);
    for (let time = 0; time <= 100; time++) {
      await stream.advanceTo(time);
      const shot = stream.shots.find(
        (s) => s.startSec <= time && s.endSec > time,
      );
      expect(shot).toBeDefined();
      if (shot?.kind === "fixedOrbit") expect(shot.staged).toBeDefined();
      aired.push({ time, shot: shot!, camera: framing(shot!) });
    }
    // Playback reaches EOF without an explicit batch-style finish call.
    expect(stream.complete).toBe(true);
    expect(stream.plan).toBe(plan);
    expect(stream.shots).toBe(shots);
    for (const { time, shot, camera } of aired) {
      expect(shots.find((s) => s.startSec <= time && s.endSec > time)).toBe(
        shot,
      );
      expect(framing(shot)).toEqual(camera);
    }
    const final = structuredClone(plan);
    await stream.advanceTo(10);
    await stream.finish();
    expect(plan).toEqual(final);
  });
});
