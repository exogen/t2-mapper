import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  demoDirectorStore,
  exitDirector,
  resetDirector,
  setCommentaryPreload,
  setDirectorDemoBuffer,
  startDirector,
} from "./demoDirectorStore";
import { commentaryPlayback } from "./streamPlaybackStore";
import type { ShotPlan } from "../director/types";

const mocks = vi.hoisted(() => ({
  seek: vi.fn(),
  play: vi.fn(),
  cancelTour: vi.fn(),
  cancelCircuit: vi.fn(),
  warn: vi.fn(),
  clipActive: false,
  sidecarSourceUrl: null as string | null,
  planFromSidecar: vi.fn(),
}));
vi.mock("./clipStore", () => ({
  clipStore: { getState: () => ({ active: mocks.clipActive }) },
}));
vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), warn: mocks.warn }),
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
    expect(demoDirectorStore.getState().status).toBe("ready");
    expect(mocks.seek).not.toHaveBeenCalled();
    expect(mocks.play).not.toHaveBeenCalled();
  });
});
