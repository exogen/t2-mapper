import { afterEach, describe, expect, it, vi } from "vitest";
import { setStatsEnabled, statsStore } from "./statsStore";
import { engineStore } from "./engineStore";
import type { MatchStats, StatsData } from "../stats/types";
import type { StreamRecording, StreamSnapshot } from "../stream/types";
import { setStreamSnapshot } from "./streamSnapshotStore";

const mocks = vi.hoisted(() => ({ scan: vi.fn() }));
vi.mock("../stats/demoStatsScanner", () => ({ scanDemoStats: mocks.scan }));
const data: StatsData = { sampleIntervalSec: 0.256, matches: [] };
const recording = (complete = true) =>
  ({
    source: "demo",
    duration: 10,
    streamingPlayback: { streamComplete: complete },
  }) as StreamRecording;

function install(buffer: ArrayBuffer) {
  const demo = recording();
  engineStore.getState().setRecording(demo, buffer);
  return demo;
}

afterEach(() => {
  setStatsEnabled(false);
  engineStore.getState().setRecording(null);
  vi.clearAllMocks();
  setStreamSnapshot(null);
});

const at = (timeSec: number) =>
  setStreamSnapshot({ timeSec } as StreamSnapshot);
function match(id: number, fromSec: number, names: string[]): MatchStats {
  return {
    id,
    fromSec,
    sceneFromSec: fromSec + 2,
    missionName: "SameMap",
    matchStartSec: fromSec + 10,
    matchEndSec: fromSec + 20,
    matchComplete: true,
    players: names.map((name, playerId) => ({
      id: playerId,
      name,
      teamId: 1,
      sampleCount: 0,
    })),
    positionSamples: {
      count: 0,
      x: new Float32Array(),
      z: new Float32Array(),
      t: new Float32Array(),
      team: new Uint8Array(),
      playerId: new Float64Array(),
    },
  };
}

describe("stats follow the playhead", () => {
  const matches = [
    match(0, 0, ["Runner", "Other"]),
    match(1, 30, ["Other", "RUNNER"]),
    match(2, 60, ["Other"]),
  ];
  const multi: StatsData = { sampleIntervalSec: 0.256, matches };

  it("switches at the pre-match boundary, including backwards seeks on the same mission", async () => {
    mocks.scan.mockResolvedValue(multi);
    install(new ArrayBuffer(0));
    setStatsEnabled(true);
    await vi.waitFor(() =>
      expect(statsStore.getState().activeMatch).toBe(matches[0]),
    );
    statsStore.getState().selectPlayer(0);
    at(19.999);
    expect(statsStore.getState().activeMatch).toBe(matches[0]);
    at(30); // Loading/warmup, ten seconds before kickoff.
    expect(statsStore.getState()).toMatchObject({
      activeMatch: matches[1],
      selectedPlayerId: 1,
    });
    at(41);
    expect(statsStore.getState().activeMatch).toBe(matches[1]);
    at(0);
    expect(statsStore.getState()).toMatchObject({
      activeMatch: matches[0],
      selectedPlayerId: 0,
    });
    expect(mocks.scan).toHaveBeenCalledOnce();
  });

  it("selects the upcoming match during loading but waits for its scene before showing heat", async () => {
    mocks.scan.mockResolvedValue(multi);
    install(new ArrayBuffer(0));
    setStatsEnabled(true);
    await vi.waitFor(() => expect(statsStore.getState().data).toBe(multi));
    at(10);
    statsStore.getState().selectPlayer(0);
    expect(statsStore.getState().sceneReady).toBe(true);
    at(30);
    expect(statsStore.getState()).toMatchObject({
      activeMatch: matches[1],
      selectedPlayerId: 1,
      sceneReady: false,
    });
    at(32); // Ready, still before kickoff.
    expect(statsStore.getState().sceneReady).toBe(true);
    at(30); // Backwards seek into loading.
    expect(statsStore.getState().sceneReady).toBe(false);
    at(19.999); // Back into the previous game.
    expect(statsStore.getState()).toMatchObject({
      activeMatch: matches[0],
      selectedPlayerId: 0,
      sceneReady: true,
    });
  });

  it("uses the next match before the first interval when its scene is already loaded", async () => {
    const upcoming = { ...match(0, 5, ["Runner"]), sceneFromSec: 0 };
    mocks.scan.mockResolvedValue({ ...multi, matches: [upcoming] });
    install(new ArrayBuffer(0));
    at(0);
    setStatsEnabled(true);
    await vi.waitFor(() => expect(statsStore.getState().data).not.toBeNull());
    statsStore.getState().selectPlayer(0);
    expect(statsStore.getState()).toMatchObject({
      activeMatch: upcoming,
      selectedPlayerId: 0,
      sceneReady: true,
    });
    at(6);
    expect(statsStore.getState().selectedPlayerId).toBe(0);
  });

  it("uses the next match in a gap, while keeping heat off the previous scene", async () => {
    mocks.scan.mockResolvedValue(multi);
    install(new ArrayBuffer(0));
    setStatsEnabled(true);
    await vi.waitFor(() => expect(statsStore.getState().data).toBe(multi));
    at(10);
    statsStore.getState().selectPlayer(0);
    setStreamSnapshot({
      timeSec: 20,
      matchEnded: true,
      matchEndedAtSec: 20,
    } as StreamSnapshot);
    expect(statsStore.getState()).toMatchObject({
      activeMatch: matches[1],
      selectedPlayerId: 1,
      sceneReady: false,
    });
    at(32);
    expect(statsStore.getState().sceneReady).toBe(true);
    at(19);
    expect(statsStore.getState().activeMatch).toBe(matches[0]);
    // Keep the last game when there is no later one to preview.
    at(90);
    expect(statsStore.getState().activeMatch).toBe(matches[2]);
  });

  it("hides a frozen scene whose end timestamp is also the next match's boundary", async () => {
    const restart = { ...matches[1], sceneFromSec: matches[1].fromSec };
    mocks.scan.mockResolvedValue({ ...multi, matches: [matches[0], restart] });
    install(new ArrayBuffer(0));
    setStatsEnabled(true);
    await vi.waitFor(() => expect(statsStore.getState().data).not.toBeNull());
    at(10);
    statsStore.getState().selectPlayer(0);
    setStreamSnapshot({
      timeSec: 31,
      matchEnded: true,
      matchEndedAtSec: 30,
    } as StreamSnapshot);
    expect(statsStore.getState()).toMatchObject({
      activeMatch: restart,
      selectedPlayerId: 1,
      sceneReady: false,
    });
    at(31);
    expect(statsStore.getState().sceneReady).toBe(true);
  });

  it("disables a player who has no samples in the next match instead of choosing a reused numeric ID", async () => {
    mocks.scan.mockResolvedValue(multi);
    install(new ArrayBuffer(0));
    setStatsEnabled(true);
    await vi.waitFor(() =>
      expect(statsStore.getState().activeMatch).toBe(matches[0]),
    );
    statsStore.getState().selectPlayer(0);
    at(60);
    expect(statsStore.getState()).toMatchObject({
      activeMatch: matches[2],
      selectedPlayerId: null,
    });
    at(0);
    expect(statsStore.getState().selectedPlayerId).toBeNull();
  });

  it("uses the playhead's latest position when a background scan finishes", async () => {
    let finish!: (value: StatsData) => void;
    mocks.scan.mockImplementation(
      () =>
        new Promise<StatsData>((resolve) => {
          finish = resolve;
        }),
    );
    install(new ArrayBuffer(0));
    setStatsEnabled(true);
    await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());
    at(35);
    finish(multi);
    await vi.waitFor(() =>
      expect(statsStore.getState().activeMatch).toBe(matches[1]),
    );
    expect(statsStore.getState().selectedPlayerId).toBeNull();
  });
});

describe("demo stats lifecycle", () => {
  it("scans the already-loaded demo when enabled, without another load notification", async () => {
    mocks.scan.mockResolvedValue(data);
    const buffer = new ArrayBuffer(0);
    install(buffer);
    expect(mocks.scan).not.toHaveBeenCalled();
    setStatsEnabled(true);
    await vi.waitFor(() => expect(statsStore.getState().data).toBe(data));
    setStatsEnabled(true);
    expect(mocks.scan).toHaveBeenCalledOnce();
    expect(mocks.scan.mock.calls[0][0]).toBe(buffer);
  });

  it("waits for progressive download bytes, then automatically begins scanning", async () => {
    mocks.scan.mockResolvedValue(data);
    setStatsEnabled(true);
    const demo = recording(false);
    engineStore.getState().setRecording(demo);
    expect(statsStore.getState()).toMatchObject({
      data: null,
      error: null,
      scanProgress: null,
    });
    expect(mocks.scan).not.toHaveBeenCalled();
    const buffer = new ArrayBuffer(4);
    engineStore.getState().setDemoBuffer(demo, buffer);
    engineStore.getState().setDownloadComplete(true);
    await vi.waitFor(() => expect(statsStore.getState().data).toBe(data));
    expect(mocks.scan.mock.calls[0][0]).toBe(buffer);
  });

  it("ignores results and progress from an aborted demo when another one loads", async () => {
    let finish!: (value: StatsData) => void;
    mocks.scan.mockImplementationOnce(
      () =>
        new Promise<StatsData>((resolve) => {
          finish = resolve;
        }),
    );
    setStatsEnabled(true);
    install(new ArrayBuffer(1));
    await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());
    const [, progress, signal] = mocks.scan.mock.calls[0];
    mocks.scan.mockResolvedValueOnce(data);
    install(new ArrayBuffer(2));
    expect(signal.aborted).toBe(true);
    await vi.waitFor(() => expect(statsStore.getState().data).toBe(data));
    progress(0.5);
    finish({ ...data, matches: [] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(statsStore.getState()).toMatchObject({
      data,
      scanProgress: null,
      selectedPlayerId: null,
    });
    statsStore.getState().selectPlayer(0);
    engineStore.getState().setRecording(null);
    expect(statsStore.getState()).toMatchObject({
      data: null,
      selectedPlayerId: null,
    });
    expect(engineStore.getState().playback.demoBuffer).toBeNull();
  });

  it("does not attach a late download to a replacement recording", async () => {
    mocks.scan.mockResolvedValue(data);
    setStatsEnabled(true);
    const oldDemo = recording(false);
    engineStore.getState().setRecording(oldDemo);
    const buffer = new ArrayBuffer(2);
    const nextDemo = install(buffer);
    engineStore.getState().setDemoBuffer(oldDemo, new ArrayBuffer(1));
    await vi.waitFor(() => expect(statsStore.getState().data).toBe(data));
    expect(engineStore.getState().playback).toMatchObject({
      recording: nextDemo,
      demoBuffer: buffer,
    });
    expect(mocks.scan).toHaveBeenCalledOnce();
    expect(mocks.scan.mock.calls[0][0]).toBe(buffer);
  });

  it("can restart after an effect cleanup without discarding playback's source bytes", async () => {
    mocks.scan.mockImplementationOnce(() => new Promise(() => {}));
    setStatsEnabled(true);
    const buffer = new ArrayBuffer(4);
    install(buffer);
    await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());
    const signal = mocks.scan.mock.calls[0][2];
    setStatsEnabled(false);
    expect(signal.aborted).toBe(true);
    expect(engineStore.getState().playback.demoBuffer).toBe(buffer);
    mocks.scan.mockResolvedValueOnce(data);
    setStatsEnabled(true);
    await vi.waitFor(() => expect(statsStore.getState().data).toBe(data));
    expect(mocks.scan.mock.calls[1][0]).toBe(buffer);
  });

  it("recovers after the Stats module is recreated while playback stays loaded", async () => {
    mocks.scan.mockResolvedValue(data);
    const buffer = new ArrayBuffer(4);
    install(buffer);
    setStatsEnabled(true);
    await vi.waitFor(() => expect(statsStore.getState().data).toBe(data));
    setStatsEnabled(false); // Old module disposal / React Refresh cleanup.
    vi.resetModules();
    // HMR replaces Stats, while the unrelated playback module stays alive.
    vi.doMock("./engineStore", () => ({ engineStore }));
    const refreshed = await import("./statsStore");
    try {
      expect(refreshed.statsStore).not.toBe(statsStore);
      expect(refreshed.statsStore.getState().data).toBeNull();
      refreshed.setStatsEnabled(true);
      await vi.waitFor(() =>
        expect(refreshed.statsStore.getState().data).toBe(data),
      );
      expect(mocks.scan).toHaveBeenCalledTimes(2);
      expect(mocks.scan.mock.calls[1][0]).toBe(buffer);
    } finally {
      refreshed.setStatsEnabled(false);
      vi.doUnmock("./engineStore");
    }
  });

  it("reports unavailable source bytes instead of claiming a finished demo is downloading", async () => {
    setStatsEnabled(true);
    const demo = recording();
    engineStore.getState().setRecording(demo);
    expect(statsStore.getState().error).toContain(
      "Demo source data is unavailable",
    );
    mocks.scan.mockResolvedValue(data);
    engineStore.getState().setDemoBuffer(demo, new ArrayBuffer(4));
    await vi.waitFor(() => expect(statsStore.getState().data).toBe(data));
    expect(statsStore.getState().error).toBeNull();
  });

  it("reports scan failures and clears them on unload", async () => {
    mocks.scan.mockRejectedValue(new Error("No match start found"));
    setStatsEnabled(true);
    install(new ArrayBuffer(0));
    await vi.waitFor(() =>
      expect(statsStore.getState().error).toBe("No match start found"),
    );
    expect(statsStore.getState().scanProgress).toBeNull();
    engineStore.getState().setRecording(null);
    expect(statsStore.getState().error).toBeNull();
  });
});
