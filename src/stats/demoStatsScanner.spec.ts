import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  StreamEntity,
  StreamSnapshot,
  ServerMessageEvent,
  PlayerRosterEntry,
} from "../stream/types";
import {
  HEATMAP_SAMPLE_INTERVAL_SEC as interval,
  scanDemoStats,
} from "./demoStatsScanner";

const mocks = vi.hoisted(() => ({ create: vi.fn(), step: vi.fn() }));
vi.mock("../stream/demoStreaming", () => ({
  createDemoStreamingRecording: mocks.create,
}));

const message = (
  id: number,
  timeSec: number,
  body: string,
  msgType = "MsgMissionStart",
): ServerMessageEvent => ({
  id,
  timeSec,
  msgType,
  args: [msgType, body],
});
const player = (overrides: Partial<StreamEntity> = {}): StreamEntity => ({
  id: "player",
  type: "Player",
  targetId: 32,
  targetGeneration: 0,
  playerName: "Runner",
  teamId: 1,
  position: [10, 20, 30],
  health: 1,
  ...overrides,
});
const roster = (
  overrides: Partial<PlayerRosterEntry> = {},
): PlayerRosterEntry => ({
  clientId: 100,
  targetId: 32,
  name: "Runner",
  rawName: "Runner",
  teamId: 1,
  score: 0,
  ping: 0,
  packetLoss: 0,
  ...overrides,
});
function fixture(
  events: ServerMessageEvent[],
  entities: (time: number) => StreamEntity[] = () => [player()],
  duration = 3,
  extra: (time: number) => Partial<StreamSnapshot> = () => ({}),
) {
  mocks.step.mockImplementation((timeSec: number) => ({
    timeSec,
    entities: entities(timeSec),
    playerRoster: [],
    serverEvents: events.filter((e) => e.timeSec <= timeSec),
    exhausted: false,
    matchStarted: true, // Deliberately true throughout the countdown too.
    matchEnded: false,
    matchEndedAtSec: null,
    ...extra(timeSec),
  }));
  mocks.create.mockResolvedValue({
    duration,
    missionName: "TestMap",
    streamingPlayback: { stepToTime: mocks.step },
  });
}

beforeEach(() => vi.clearAllMocks());

const load = (
  id: number,
  timeSec: number,
  name = "SameMap",
): ServerMessageEvent => ({
  ...message(id, timeSec, "", "MsgLoadInfo"),
  args: ["MsgLoadInfo", "", name, name, "Capture the Flag"],
});

describe("matches within a demo", () => {
  it("keeps the initial scene available before a delayed first ClientReady", async () => {
    fixture(
      [
        message(0, 1.056, "", "MsgClientReady"),
        message(1, 2, "Match started!"),
      ],
      (time) => [
        { id: "initial-world", type: "InteriorInstance" },
        ...(time >= 1.056 ? [player()] : []),
      ],
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      fromSec: 0,
      sceneFromSec: 0,
      matchStartSec: 2,
    });
    expect(matches[0].players).toHaveLength(1);
    expect(matches[0].positionSamples.t[0]).toBeCloseTo(0.048);
  });

  it("does not sample the previous scene while loading into a running match", async () => {
    fixture(
      [
        message(0, 0, "Match started!"),
        message(1, 1, "", "MsgGameOver"),
        load(2, 2, "NextMap"),
        message(3, 3, "", "MsgClientReady"),
      ],
      (time) => [player({ position: time < 3 ? [999, 999, 0] : [10, 20, 0] })],
      4,
      (time) => ({
        matchClockMs: -100_000,
        matchEnded: time >= 1 && time < 3,
        matchEndedAtSec: time >= 1 && time < 3 ? 1 : null,
      }),
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches).toHaveLength(2);
    expect(matches[1]).toMatchObject({
      fromSec: 2,
      sceneFromSec: 3,
      matchStartSec: null,
      matchComplete: false,
    });
    expect([...matches[1].positionSamples.x]).toEqual([20, 20, 20, 20, 20]);
  });

  it("does not create another match for repeated load info or retain a frozen scene at EOF", async () => {
    fixture(
      [
        message(0, 0, "Match started!"),
        message(1, 1, "", "MsgGameOver"),
        load(2, 2),
        load(3, 2.5),
      ],
      undefined,
      3,
      (time) => ({
        matchEnded: time >= 1,
        matchEndedAtSec: time >= 1 ? 1 : null,
        teamScores: [{ teamId: 1, name: "Team", score: 5, playerCount: 1 }],
      }),
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches).toHaveLength(2);
    expect(matches[1]).toMatchObject({ fromSec: 2, sceneFromSec: null });
    expect(matches[1].positionSamples.count).toBe(0);
  });

  it("retains a partial game when the demo transitions away without its end event", async () => {
    fixture(
      [
        message(0, 0, "Match started!"),
        load(1, 1, "NextMap"),
        message(2, 1.2, "", "MsgClientReady"),
        message(3, 2, "Match started!"),
      ],
      (time) => [player({ position: time < 1 ? [10, 20, 0] : [100, 200, 0] })],
      3,
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      matchStartSec: 0,
      matchEndSec: 1,
      matchComplete: false,
    });
    expect([...matches[0].positionSamples.x]).toEqual([20, 20, 20, 20]);
    expect(matches[1]).toMatchObject({
      fromSec: 1,
      matchStartSec: 2,
      matchComplete: false,
    });
    expect(matches[1].positionSamples.t[0]).toBeCloseTo(0.048);
  });

  it("keeps a player's arrivals, departures, and rejoin in one game without sampling their absence", async () => {
    fixture(
      [message(0, 0, "Match started!")],
      (time) =>
        time < interval || time === interval * 2
          ? []
          : [player({ targetId: time < interval * 2 ? 32 : 45 })],
      interval * 4,
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches[0].players).toEqual([
      { id: 0, name: "Runner", teamId: 1, sampleCount: 3 },
    ]);
    expect([...matches[0].positionSamples.t]).toEqual(
      [interval, interval * 3, interval * 4].map((value) => Math.fround(value)),
    );
  });

  it("separates repeated missions and assigns loading and warmup to the upcoming game", async () => {
    fixture(
      [
        load(0, 0),
        message(1, 0.1, "", "MsgClientReady"),
        message(2, 1, "Match started!"),
        message(3, 2, "", "MsgGameOver"),
        load(4, 3),
        message(5, 3.5, "", "MsgClientReady"),
        message(6, 5, "Match starts in 1 second."),
        message(7, 6, "Match started!"),
        message(8, 7, "", "MsgGameOver"),
      ],
      (time) => [player({ position: time >= 6 ? [100, 200, 0] : [10, 20, 0] })],
      8,
      (time) => ({
        matchEnded: (time >= 2 && time < 3.5) || time >= 7,
        matchEndedAtSec: time >= 7 ? 7 : time >= 2 && time < 3.5 ? 2 : null,
      }),
    );
    const result = await scanDemoStats(new ArrayBuffer(0));
    expect(result.matches).toHaveLength(2);
    expect(
      result.matches.map(
        ({
          id,
          fromSec,
          missionName,
          matchStartSec,
          matchEndSec,
          matchComplete,
        }) => ({
          id,
          fromSec,
          missionName,
          matchStartSec,
          matchEndSec,
          matchComplete,
        }),
      ),
    ).toEqual([
      {
        id: 0,
        fromSec: 0,
        missionName: "SameMap",
        matchStartSec: 1,
        matchEndSec: 2,
        matchComplete: true,
      },
      {
        id: 1,
        fromSec: 3,
        missionName: "SameMap",
        matchStartSec: 6,
        matchEndSec: 7,
        matchComplete: true,
      },
    ]);
    expect([...result.matches[0].positionSamples.x]).toEqual([20, 20, 20, 20]);
    expect([...result.matches[1].positionSamples.x]).toEqual([
      200, 200, 200, 200,
    ]);
    expect(result.matches[1].positionSamples.t[0]).toBeCloseTo(0.144);
  });

  it("handles restarts without mission-load events and preserves an unfinished last match", async () => {
    fixture(
      [
        message(0, 0, "Match started!"),
        message(1, 1, "", "MsgGameOver"),
        message(2, 2, "Match starts in 1 second."),
        message(3, 3, "Match started!"),
      ],
      undefined,
      4,
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches).toHaveLength(2);
    expect(matches[1]).toMatchObject({
      id: 1,
      fromSec: 1,
      matchStartSec: 3,
      matchEndSec: 4,
      matchComplete: false,
    });
    expect(matches[1].positionSamples.t[0]).toBeCloseTo(0.072);
  });

  it.each([900_000, 20_000])(
    "includes a mid-match join with %i ms remaining, followed by an early leave",
    async (remainingMs) => {
      fixture([], undefined, interval * 3, (time) => ({
        matchClockMs: -remainingMs + time * 1000,
      }));
      const { matches } = await scanDemoStats(new ArrayBuffer(0));
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        fromSec: 0,
        matchStartSec: null,
        matchEndSec: interval * 3,
        matchComplete: false,
      });
      expect(matches[0].positionSamples.count).toBe(4);
    },
  );

  it("recovers early samples when running-match evidence arrives after the first positions", async () => {
    fixture([], undefined, interval * 2, (time) => ({
      teamScores:
        time >= interval
          ? [{ teamId: 1, name: "Team", score: 1, playerCount: 1 }]
          : [],
    }));
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches[0].positionSamples.count).toBe(3);
    expect(matches[0].positionSamples.t[0]).toBe(0);
  });

  it("keeps a partial first game separate from a complete later game", async () => {
    fixture(
      [
        message(0, 1, "", "MsgGameOver"),
        load(1, 2, "OtherMap"),
        message(2, 2.1, "", "MsgClientReady"),
        message(3, 3, "Match started!"),
        message(4, 4, "", "MsgGameOver"),
      ],
      undefined,
      5,
      (time) => ({ matchClockMs: time < 1 ? -100_000 : 0 }),
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      matchStartSec: null,
      matchEndSec: 1,
      matchComplete: false,
    });
    expect(matches[0].positionSamples.count).toBe(4);
    expect(matches[1]).toMatchObject({
      fromSec: 2,
      missionName: "OtherMap",
      matchStartSec: 3,
      matchEndSec: 4,
      matchComplete: true,
    });
    expect(matches[1].positionSamples.count).toBe(4);
  });

  it("discards tentative warmup samples when kickoff is later recorded", async () => {
    fixture(
      [message(0, 1, "Match started!")],
      (time) => [player({ position: time < 1 ? [999, 999, 0] : [10, 20, 0] })],
      2,
      (time) => ({ matchClockMs: -20_000 + time * 1000 }),
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect([...matches[0].positionSamples.x]).toEqual([20, 20, 20, 20, 20]);
  });

  it("does not turn an unfinished countdown into a partial running match", async () => {
    fixture(
      [message(0, 0, "Match starts in 30 seconds.")],
      undefined,
      1,
      () => ({ matchClockMs: -30_000 }),
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches[0].matchStartSec).toBeNull();
    expect(matches[0].positionSamples.count).toBe(0);
  });

  it("does not carry a prior game's heatmap into a final warmup with no kickoff", async () => {
    fixture(
      [
        message(0, 0, "Match started!"),
        message(1, 1, "", "MsgGameOver"),
        load(2, 2),
      ],
      undefined,
      3,
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches).toHaveLength(2);
    expect(matches[1]).toMatchObject({ fromSec: 2, matchStartSec: null });
    expect(matches[1].positionSamples.count).toBe(0);
  });

  it("discards warmup ended by an admin map change without a countdown", async () => {
    fixture(
      [
        message(0, 1, "", "MsgGameOver"),
        load(1, 1, "NextMap"),
        message(2, 1.1, "", "MsgClientReady"),
        message(3, 2, "Match started!"),
      ],
      undefined,
      3,
      (time) => ({ matchClockMs: time * 1000 }),
    );
    const { matches } = await scanDemoStats(new ArrayBuffer(0));
    expect(matches).toHaveLength(2);
    expect(matches[0].positionSamples.count).toBe(0);
    expect(matches[0].players).toEqual([]);
    expect(matches[1].positionSamples.count).toBeGreaterThan(0);
  });
});

describe("demo heatmap scan", () => {
  it("excludes cancelled countdowns, warmup, and post-match positions from each match", async () => {
    fixture(
      [
        message(0, 0, "The admin has forced the match to start."),
        message(1, 0.1, "Match starts in 30 seconds."),
        message(2, 0.4, "The match has been started by vote: 75 percent."),
        message(3, 0.5, "Match starts in 1 second."),
        message(4, 1, "\x02Match started!"),
        message(5, 2, "Game over", "MsgGameOver"),
        message(6, 2.5, "Match started!"),
      ],
      (time) => [
        player({
          position: time < 1 || time >= 2 ? [999, 999, 999] : [10, 20, 30],
        }),
      ],
    );
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result).toMatchObject({
      matchStartSec: 1,
      matchEndSec: 2,
      matchComplete: true,
    });
    expect(result.positionSamples.count).toBe(4);
    expect([...result.positionSamples.x]).toEqual([20, 20, 20, 20]);
    expect([...result.positionSamples.z]).toEqual([10, 10, 10, 10]);
    expect(result.positionSamples.t[0]).toBeCloseTo(0.024);
    expect(result.positionSamples.t[3]).toBeCloseTo(0.792);
    expect(mocks.step.mock.calls.at(-1)![0]).toBe(3);
  });

  it("counts standing still equally over time and filters corpses, nonplayers, and invalid positions", async () => {
    fixture(
      [message(0, 0, "Match started!")],
      () => [
        player(),
        player({ id: "duplicate" }),
        player({ targetId: 33, damageState: 1 }),
        player({ targetId: 34, health: 0 }),
        player({ targetId: 35, type: "Camera" }),
        player({ targetId: 36, position: [NaN, 0, 0] }),
        player({ targetId: 37, mountObjectId: "missing" }),
      ],
      interval * 3,
    );
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.players).toHaveLength(1);
    expect(result.players[0].sampleCount).toBe(4);
    expect([...result.positionSamples.x]).toEqual([20, 20, 20, 20]);
    expect(result.matchComplete).toBe(false);
  });

  it("follows vehicle mounts and combines respawns", async () => {
    fixture(
      [message(0, 0, "Match started!")],
      (time) => [
        player({
          id: time < interval ? "old-ghost" : "respawn",
          mountObjectId: "vehicle",
        }),
        { id: "vehicle", type: "Vehicle", position: [100, 200, 50] },
      ],
      interval,
    );
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.players).toEqual([
      { id: 0, name: "Runner", teamId: 1, sampleCount: 2 },
    ]);
    expect([...result.positionSamples.x]).toEqual([200, 200]);
    expect([...result.positionSamples.z]).toEqual([100, 100]);
  });

  it("separates recycled target IDs and uses roster names when available", async () => {
    fixture(
      [message(0, 0, "Match started!")],
      (time) => [player({ targetGeneration: time < interval ? 0 : 1 })],
      interval,
      (time) => ({
        playerRoster: [
          { targetId: 32, name: time < interval ? "First" : "Second" },
        ] as StreamSnapshot["playerRoster"],
      }),
    );
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.players.map((p) => p.name)).toEqual(["First", "Second"]);
    expect([...result.positionSamples.playerId]).toEqual([0, 1]);
  });

  it("does not invent a kickoff from a forced start or the playback matchStarted flag", async () => {
    fixture([message(0, 0, "The admin has forced the match to start.")]);
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.matchStartSec).toBeNull();
    expect(result.positionSamples.count).toBe(0);
  });

  it.each(["philthyHistory-", "Sage Dest"])(
    "combines reconnects and clan-tag changes for %s without needing a roster or GUID",
    async (name) => {
      fixture(
        [message(0, 0, "Match started!")],
        (time) => [
          player({
            targetId: time < interval ? 32 : 45,
            targetGeneration: time < interval ? 0 : 1,
            playerName: time < interval ? `OLD|${name}` : `${name}.new`,
            playerRawName:
              time < interval
                ? `\x10\x0bOLD|\x08${name}\x11`
                : `\x10\x08${name}\x0b.new\x11`,
            position: time < interval ? [10, 20, 30] : [100, 200, 30],
            teamId: time < interval ? 1 : 2,
          }),
        ],
        interval,
      );
      const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
      expect(result.players).toEqual([
        { id: 0, name, teamId: 2, sampleCount: 2 },
      ]);
      expect([...result.positionSamples.playerId]).toEqual([0, 0]);
      expect([...result.positionSamples.x]).toEqual([20, 200]);
      expect([...result.positionSamples.team]).toEqual([1, 2]);
    },
  );

  it.each([undefined, "0", "67890"])(
    "groups by base name regardless of missing, hidden, or conflicting GUIDs (%s)",
    async (guid) => {
      fixture(
        [message(0, 0, "Match started!")],
        (time) => [player({ targetGeneration: time < interval ? 0 : 1 })],
        interval,
        (time) => ({
          playerRoster: [
            roster({
              clientId: time < interval ? 100 : 200,
              guid: time < interval ? "12345" : guid,
              name: time < interval ? "TAG|Runner" : "Runner",
              rawName:
                time < interval
                  ? "\x10\x0bTAG|\x08Runner\x11"
                  : "\x10\x0cRunner\x11",
            }),
          ],
        }),
      );
      const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
      expect(result.players).toEqual([
        { id: 0, name: "Runner", teamId: 1, sampleCount: 2 },
      ]);
      expect([...result.positionSamples.playerId]).toEqual([0, 0]);
    },
  );

  it("uses separate base names even when the account and connection stay the same", async () => {
    fixture([message(0, 0, "Match started!")], undefined, interval, (time) => ({
      playerRoster: [
        roster({ name: time < interval ? "First" : "Second", guid: "12345" }),
      ],
    }));
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.players.map((p) => p.name)).toEqual(["First", "Second"]);
    expect([...result.positionSamples.playerId]).toEqual([0, 1]);
  });

  it("ignores name casing and preserves punctuation that is not marked as a tag", async () => {
    fixture(
      [message(0, 0, "Match started!")],
      () => [
        player({ playerName: "[TAG]Runner-" }),
        player({ id: "other", targetId: 45, playerName: "Runner-" }),
      ],
      interval,
      (time) => ({
        playerRoster: [
          roster({ name: time < interval ? "[TAG]Runner-" : "[tag]runner-" }),
        ],
      }),
    );
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.players).toEqual([
      { id: 0, name: "[tag]runner-", teamId: 1, sampleCount: 2 },
      { id: 1, name: "Runner-", teamId: 1, sampleCount: 2 },
    ]);
    expect([...result.positionSamples.playerId]).toEqual([0, 1, 0, 1]);
  });

  it("uses roster tag markup when a mod omits join target IDs", async () => {
    fixture(
      [message(0, 0, "Match started!")],
      () => [player({ playerName: "TAG|Runner" })],
      interval,
      () => ({
        playerRoster: [
          roster({
            targetId: undefined,
            name: "TAG|Runner",
            rawName: "\x10\x0bTAG|\x08Runner\x11",
          }),
        ],
      }),
    );
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.players[0].name).toBe("Runner");
  });

  it("combines simultaneous matching base names without double-counting an interval", async () => {
    fixture(
      [message(0, 0, "Match started!")],
      () => [player(), player({ id: "second", targetId: 45 })],
      interval,
      () => ({
        playerRoster: [
          roster({ guid: "12345" }),
          roster({ guid: "67890", targetId: 45, clientId: 200 }),
        ],
      }),
    );
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.players).toEqual([
      { id: 0, name: "Runner", teamId: 1, sampleCount: 2 },
    ]);
    expect(result.positionSamples.count).toBe(2);
    expect([...result.positionSamples.playerId]).toEqual([0, 0]);
  });

  it("honors MissionEnd and debrief state without a MsgGameOver", async () => {
    fixture([message(0, 0, "Match started!")], undefined, 3, (time) => ({
      matchEnded: time >= 1,
      matchEndedAtSec: time >= 1 ? 1 : null,
    }));
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.matchEndSec).toBe(1);
    expect(result.matchComplete).toBe(true);
    expect(result.positionSamples.count).toBe(4);
  });

  it("stops at early EOF instead of repeating the last known position", async () => {
    fixture([message(0, 0, "Match started!")], undefined, 100, (time) => ({
      exhausted: time >= 1,
      timeSec: Math.min(time, 1),
    }));
    const result = (await scanDemoStats(new ArrayBuffer(0))).matches[0];
    expect(result.matchEndSec).toBe(1);
    expect(result.matchComplete).toBe(false);
    expect(result.positionSamples.count).toBe(4);
  });

  it("cancels before parsing or after asynchronous parser initialization", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(
      scanDemoStats(new ArrayBuffer(0), undefined, abort.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.create).not.toHaveBeenCalled();
    const during = new AbortController();
    mocks.create.mockImplementation(async () => {
      during.abort();
      return {};
    });
    await expect(
      scanDemoStats(new ArrayBuffer(0), undefined, during.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.step).not.toHaveBeenCalled();
  });
});
