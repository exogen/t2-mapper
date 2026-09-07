import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  demoDirectorStore,
  resetDirector,
  setCommentaryPreload,
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
  demoLoadStore: { getState: () => ({ sourceUrl: null }) },
}));
vi.mock("./watchFollow", () => ({ exitToFreeFly: vi.fn() }));
vi.mock("../director/cameraRig", () => ({
  DIRECTOR_ORBIT_TARGET_DAMPING: 0.1,
}));
vi.mock("../director/castSidecar", () => ({ planFromSidecar: vi.fn() }));
vi.mock("../stream/demoIndex", () => ({ sidecarUrl: vi.fn() }));

describe("camera startup independent of commentary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commentaryPlayback.startSec = null;
    demoDirectorStore.setState({
      status: "ready",
      plan: { shots: [], skipToSec: 100 } as unknown as ShotPlan,
    });
  });
  afterEach(() => {
    setCommentaryPreload(null);
    resetDirector();
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
});
