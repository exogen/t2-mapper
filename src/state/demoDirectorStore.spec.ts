import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyLocalCastLookahead,
  demoDirectorStore,
  exitDirector,
  resetDirector,
  setCommentaryPreload,
  setDirectorDemoBuffer,
  startDirector,
} from "./demoDirectorStore";
import { commentaryPlayback, streamClock } from "./streamPlaybackStore";
import type { CastStream } from "../director/castPipeline";
import { DIRECTOR_LOOKAHEAD_SEC } from "../director/tunables";
import type { ShotPlan } from "../director/types";

const mocks = vi.hoisted(() => ({
  seek: vi.fn(),
  play: vi.fn(),
  cancelTour: vi.fn(),
  cancelCircuit: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  clipActive: false,
  sidecarSourceUrl: null as string | null,
  planFromSidecar: vi.fn(),
  createCastStream: vi.fn(),
  setPreference: vi.fn(),
  localCastLookaheadMs: null as number | null,
}));
vi.mock("./clipStore", () => ({
  clipStore: { getState: () => ({ active: mocks.clipActive }) },
}));
vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: mocks.warn, error: mocks.error }),
}));
vi.mock("./streamPlaybackStore", () => ({
  streamClock: { time: 0 },
  commentaryPlayback: { startSec: null },
  streamPlaybackStore: { setState: vi.fn() },
}));
vi.mock("./engineStore", () => ({
  engineStore: {
    getState: () => ({
      seekPlayback: mocks.seek,
      setPlaybackStatus: mocks.play,
    }),
  },
}));
vi.mock("./cameraTourStore", () => ({
  cameraTourStore: { getState: () => ({ cancel: mocks.cancelTour }) },
}));
vi.mock("./commandCircuitStore", () => ({
  commandCircuitStore: {
    getState: () => ({ deactivate: mocks.cancelCircuit }),
  },
}));
vi.mock("./demoLoadStore", () => ({
  demoLoadStore: {
    getState: () => ({
      sourceUrl: null,
      sidecarSourceUrl: mocks.sidecarSourceUrl,
    }),
  },
}));
vi.mock("./watchFollow", () => ({ exitToFreeFly: vi.fn() }));
vi.mock("../director/cameraRig", () => ({
  DIRECTOR_ORBIT_TARGET_DAMPING: 0.1,
}));
vi.mock("../director/castSidecar", () => ({
  planFromSidecar: mocks.planFromSidecar,
}));
vi.mock("../director/castPipeline", () => ({
  createCastStream: mocks.createCastStream,
}));
vi.mock("./settingsStore", () => ({
  settingsStore: {
    getState: () => ({ localCastLookaheadMs: mocks.localCastLookaheadMs }),
  },
  setPreference: mocks.setPreference,
}));
vi.mock("../director/demoDirectorScanner", () => ({
  scanDemoDirector: vi.fn().mockResolvedValue({}),
}));
vi.mock("../stream/demoIndex", () => ({ sidecarUrl: vi.fn() }));

describe("camera startup independent of commentary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.seek.mockReturnValue(true);
    mocks.clipActive = false;
    mocks.sidecarSourceUrl = null;
    commentaryPlayback.startSec = null;
    demoDirectorStore.setState({
      status: "ready",
      plan: { shots: [], skipToSec: 100 } as unknown as ShotPlan,
    });
  });
  afterEach(() => {
    setCommentaryPreload(null);
    resetDirector();
    vi.unstubAllGlobals();
  });

  it.each(["absent", "pending", "throwing", "rejecting"])(
    "starts with %s audio preparation",
    async (mode) => {
      const preload = vi.fn(() => {
        if (mode === "pending") return new Promise<void>(() => {});
        if (mode === "throwing") throw new Error("Audio unavailable");
        if (mode === "rejecting")
          return Promise.reject(new Error("Audio unavailable"));
      });
      setCommentaryPreload(mode === "absent" ? null : preload);
      let settled = false;
      void startDirector().then(() => {
        settled = true;
      });
      // Several microtasks let the preload run and the start promise settle.
      // A pending audio request must never hold either camera startup or this promise.
      for (let n = 0; n < 5; n++) await Promise.resolve();
      expect(settled).toBe(true);
      expect(demoDirectorStore.getState()).toMatchObject({
        status: "playing",
        scanProgress: null,
      });
      expect(mocks.seek).toHaveBeenCalledExactlyOnceWith(100);
      expect(mocks.play).toHaveBeenCalledExactlyOnceWith("playing");
      expect(preload).toHaveBeenCalledTimes(mode === "absent" ? 0 : 1);
      expect(mocks.warn).toHaveBeenCalledTimes(
        mode === "throwing" || mode === "rejecting" ? 1 : 0,
      );
    },
  );

  it("does not move the camera again when late commentary metadata arrives", async () => {
    let ready!: () => void;
    setCommentaryPreload(
      () =>
        new Promise<void>((resolve) => {
          ready = () => {
            commentaryPlayback.startSec = 20;
            resolve();
          };
        }),
    );
    await startDirector();
    ready();
    await Promise.resolve();
    expect(mocks.seek).toHaveBeenCalledExactlyOnceWith(100);
    expect(demoDirectorStore.getState().status).toBe("playing");
  });

  it("cannot activate while a clip owns the camera", async () => {
    mocks.clipActive = true;
    await startDirector();
    expect(demoDirectorStore.getState().status).toBe("ready");
    expect(mocks.seek).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
  });

  it("keeps existing camera ownership and transport when its starting seek is canceled", async () => {
    mocks.seek.mockReturnValue(false);
    await startDirector();
    expect(mocks.seek).toHaveBeenCalledExactlyOnceWith(100);
    expect(mocks.cancelTour).not.toHaveBeenCalled();
    expect(mocks.cancelCircuit).not.toHaveBeenCalled();
    expect(demoDirectorStore.getState().status).toBe("ready");
    expect(mocks.play).not.toHaveBeenCalled();
  });

  it("cancels a pending activation even if a clip has already exited when preparation finishes", async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );
    mocks.sidecarSourceUrl = "https://demos.example/game.rec";
    mocks.planFromSidecar.mockReturnValue({
      shots: [{ endSec: 120 }],
      skipToSec: 100,
    });
    setDirectorDemoBuffer(new ArrayBuffer(4));
    demoDirectorStore.setState({ plan: null });
    const task = startDirector();
    expect(demoDirectorStore.getState().status).toBe("scanning");
    mocks.clipActive = true;
    exitDirector();
    mocks.clipActive = false;
    finish({ ok: true, json: async () => ({}) });
    await task;
    expect(demoDirectorStore.getState()).toMatchObject({
      status: "ready",
      planSource: "sidecar",
    });
    expect(mocks.seek).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
  });
});

function localStream(lookaheadSec = DIRECTOR_LOOKAHEAD_SEC) {
  const durationSec = 120;
  const plan: ShotPlan = {
    contractVersion: 1,
    gameMode: "ctf",
    lookaheadSec,
    shots: [],
    coverage: [],
  };
  let plannedToSec = 2;
  return {
    plan,
    shots: plan.shots,
    dataset: null,
    durationSec,
    get plannedToSec() {
      return plannedToSec;
    },
    get complete() {
      return plannedToSec === durationSec;
    },
    advanceTo: vi.fn<CastStream["advanceTo"]>(async (sec, shouldContinue) => {
      if (shouldContinue?.() === false) return;
      plannedToSec = Math.min(durationSec, sec + 2);
    }),
  };
}

describe("local CastGenius lookahead", () => {
  const buffer = new ArrayBuffer(4);
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    mocks.seek.mockReturnValue(true);
    mocks.localCastLookaheadMs = null;
    mocks.setPreference.mockImplementation((_key, ms: number | null) => {
      mocks.localCastLookaheadMs = ms;
    });
    mocks.sidecarSourceUrl = null;
    streamClock.time = 40;
    setDirectorDemoBuffer(buffer);
  });
  afterEach(() => {
    resetDirector();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("saves a lookahead without a demo and uses it when a local cast starts", async () => {
    resetDirector();
    await applyLocalCastLookahead(2_750);
    expect(mocks.setPreference).toHaveBeenCalledExactlyOnceWith(
      "localCastLookaheadMs",
      2_750,
    );
    expect(demoDirectorStore.getState().status).toBe("idle");
    expect(mocks.createCastStream).not.toHaveBeenCalled();

    setDirectorDemoBuffer(buffer);
    mocks.createCastStream.mockResolvedValueOnce(localStream(2.75));
    await startDirector();
    expect(mocks.createCastStream).toHaveBeenCalledExactlyOnceWith(
      buffer,
      expect.objectContaining({ lookaheadSec: 2.75 }),
    );
    expect(demoDirectorStore.getState()).toMatchObject({
      status: "playing",
      planSource: "local",
      plan: { lookaheadSec: 2.75 },
    });
  });

  it("rebuilds a cached local plan only when reactivated at a new lookahead", async () => {
    const original = localStream();
    const replacement = localStream(0);
    mocks.createCastStream
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(replacement);
    await startDirector();
    exitDirector();
    await applyLocalCastLookahead(0);
    expect(mocks.createCastStream).toHaveBeenCalledTimes(1);
    expect(demoDirectorStore.getState().plan).toBe(original.plan);

    mocks.sidecarSourceUrl = "https://demos.example/game.rec";
    const fetchSidecar = vi.fn();
    vi.stubGlobal("fetch", fetchSidecar);
    await startDirector();
    expect(fetchSidecar).not.toHaveBeenCalled();
    expect(mocks.createCastStream).toHaveBeenNthCalledWith(
      2,
      buffer,
      expect.objectContaining({ lookaheadSec: 0 }),
    );
    expect(demoDirectorStore.getState()).toMatchObject({
      status: "playing",
      plan: replacement.plan,
    });
  });

  it("starts with the latest preference when it changes while creating a plan", async () => {
    let finishOriginal!: (stream: ReturnType<typeof localStream>) => void;
    const preferred = localStream(4);
    mocks.createCastStream
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishOriginal = resolve)),
      )
      .mockResolvedValueOnce(preferred);
    const start = startDirector();
    await vi.waitFor(() =>
      expect(mocks.createCastStream).toHaveBeenCalledTimes(1),
    );
    await applyLocalCastLookahead(4_000);
    expect(demoDirectorStore.getState().status).toBe("scanning");
    finishOriginal(localStream());
    await start;
    expect(mocks.createCastStream).toHaveBeenNthCalledWith(
      2,
      buffer,
      expect.objectContaining({ lookaheadSec: 4 }),
    );
    expect(demoDirectorStore.getState()).toMatchObject({
      status: "playing",
      plan: preferred.plan,
    });
  });

  it("leaves an adopted cast and the browser preference alone", async () => {
    const archivePlan = localStream(3).plan;
    archivePlan.shots.push({
      kind: "followPlayer",
      targetId: 1,
      startSec: 0,
      endSec: 120,
      transitionIn: "cut",
      reason: "Opening",
    });
    mocks.sidecarSourceUrl = "https://demos.example/game.rec";
    mocks.planFromSidecar.mockReturnValue(archivePlan);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    await startDirector();
    await applyLocalCastLookahead(4_000);
    expect(demoDirectorStore.getState()).toMatchObject({
      status: "playing",
      planSource: "sidecar",
      localLookaheadPending: false,
    });
    expect(demoDirectorStore.getState().plan).toBe(archivePlan);
    expect(mocks.createCastStream).not.toHaveBeenCalled();
    expect(mocks.setPreference).not.toHaveBeenCalled();
  });

  it("applies zero lookahead in place and supersedes any old planning work", async () => {
    const original = localStream();
    const replacement = localStream(0);
    let finishOriginalAdvance!: () => void;
    original.advanceTo.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishOriginalAdvance = resolve;
        }),
    );
    mocks.createCastStream
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(replacement);
    await startDirector();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(original.advanceTo).toHaveBeenCalledTimes(1);
    mocks.play.mockClear();

    const replan = applyLocalCastLookahead(0);
    expect(demoDirectorStore.getState().localLookaheadPending).toBe(true);
    expect(demoDirectorStore.getState().plan).toBe(original.plan);
    await replan;
    finishOriginalAdvance();
    await Promise.resolve();

    expect(replacement.advanceTo).toHaveBeenCalledWith(
      40,
      expect.any(Function),
    );
    expect(demoDirectorStore.getState()).toMatchObject({
      status: "playing",
      plan: { lookaheadSec: 0 },
      localLookaheadPending: false,
      plannedToSec: 42,
    });
    expect(demoDirectorStore.getState().plan).toBe(replacement.plan);
    expect(streamClock.time).toBe(40);
    expect(mocks.seek).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
    expect(mocks.setPreference).toHaveBeenCalledExactlyOnceWith(
      "localCastLookaheadMs",
      0,
    );
  });

  it("clears an override equal to the configured default without rebuilding", async () => {
    mocks.localCastLookaheadMs = DIRECTOR_LOOKAHEAD_SEC * 1_000;
    mocks.createCastStream.mockResolvedValueOnce(localStream());
    await startDirector();
    await applyLocalCastLookahead(null);
    expect(mocks.createCastStream).toHaveBeenCalledTimes(1);
    expect(mocks.setPreference).toHaveBeenCalledExactlyOnceWith(
      "localCastLookaheadMs",
      null,
    );
  });

  it("preserves the current plan after a failed rebuild", async () => {
    const original = localStream();
    mocks.createCastStream
      .mockResolvedValueOnce(original)
      .mockRejectedValueOnce(new Error("Scan failed"));
    await startDirector();
    await applyLocalCastLookahead(3_000);
    expect(demoDirectorStore.getState()).toMatchObject({
      status: "playing",
      localLookaheadPending: false,
      localLookaheadError: "Couldn't update lookahead.",
    });
    expect(demoDirectorStore.getState().plan).toBe(original.plan);
    expect(mocks.setPreference).not.toHaveBeenCalled();
  });

  it("cancels a pending rebuild when the viewer exits the cast", async () => {
    const original = localStream();
    let finishReplacement!: (stream: ReturnType<typeof localStream>) => void;
    mocks.createCastStream
      .mockResolvedValueOnce(original)
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishReplacement = resolve)),
      );
    await startDirector();
    const replan = applyLocalCastLookahead(3_000);
    await vi.waitFor(() =>
      expect(mocks.createCastStream).toHaveBeenCalledTimes(2),
    );
    const signal = mocks.createCastStream.mock.calls[1][1]
      .signal as AbortSignal;
    exitDirector();
    expect(signal.aborted).toBe(true);
    finishReplacement(localStream(3));
    await replan;
    expect(demoDirectorStore.getState()).toMatchObject({
      status: "ready",
      localLookaheadPending: false,
    });
    expect(demoDirectorStore.getState().plan).toBe(original.plan);
    expect(mocks.setPreference).not.toHaveBeenCalled();
  });
});
