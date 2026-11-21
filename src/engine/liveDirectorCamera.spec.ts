import { Scene, type WebGLRenderer } from "three";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { LiveCastPlanBatch } from "../../relay/liveCastTypes";
import { resolveCameraOwner } from "../state/cameraOwner";
import { exitDirector } from "../state/demoDirectorStore";
import { engineStore } from "../state/engineStore";
import {
  activateLiveDirector,
  applyLiveDirectorPlan,
  applyLiveDirectorTick,
  findLiveDirectorShotIndex,
  liveDirectorStore,
  liveDirectorTimeAt,
  resetLiveDirector,
  setLiveDirectorTransport,
  startLiveDirector,
} from "../state/liveDirectorStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import type { StreamRecording } from "../stream/types";
import { startEngineSystems } from "./engineSystems";
import { FramePriority } from "./framePriority";
import { GameEngine } from "./gameEngine";

vi.hoisted(() => {
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: new URL("http://localhost/"),
      matchMedia: () => Object.assign(new EventTarget(), { matches: false }),
    }),
  );
  vi.stubGlobal("document", new EventTarget());
});
vi.mock("./audioSystem", () => ({ installAudio: () => {} }));
vi.mock("./chatSounds", () => ({ installChatSounds: () => {} }));
vi.mock("./lightPool", () => ({ installLightPool: () => {} }));
vi.mock("./streamEffects", () => ({ installStreamEffects: () => {} }));
vi.mock("./streamPlayback", () => ({
  StreamPlaybackSession: class {
    dispose() {}
  },
}));

const opening: LiveCastPlanBatch = {
  gameId: "game",
  epoch: 1,
  plannedThroughTick: 250,
  shots: [
    {
      startTick: 125,
      shot: {
        kind: "fixedOrbit",
        center: [0, 0, 10],
        radius: 20,
        startAngle: 0,
        angularSpeed: 0.5,
        startSec: 0,
        endSec: 4,
        transitionIn: "cut",
      },
    },
  ],
};

afterEach(() => {
  engineStore.getState().setRecording(null);
  resetLiveDirector();
  setLiveDirectorTransport(() => {});
  streamClock.time = 0;
});
afterAll(() => vi.unstubAllGlobals());

describe("live director camera", () => {
  it("takes control only after activation and gives it back on manual exit", () => {
    const transport = vi.fn();
    setLiveDirectorTransport(transport);
    startLiveDirector();
    expect(transport.mock.calls).toEqual([[true]]);
    expect(activateLiveDirector()).toBe(false);
    expect(resolveCameraOwner()).toBe("input");
    applyLiveDirectorPlan(opening);
    expect(liveDirectorStore.getState().status).toBe("loading");
    expect(activateLiveDirector()).toBe(false);
    applyLiveDirectorTick(124, 0);
    expect(activateLiveDirector()).toBe(false);
    applyLiveDirectorTick(125, 0);
    expect(activateLiveDirector()).toBe(true);
    expect(resolveCameraOwner()).toBe("director");
    exitDirector();
    expect(resolveCameraOwner()).toBe("input");
    expect(transport.mock.calls).toEqual([[true], [false]]);
  });

  it("holds the committed shot through gaps and ignores stale epoch updates", () => {
    startLiveDirector();
    applyLiveDirectorPlan(opening);
    applyLiveDirectorTick(125, 0);
    activateLiveDirector();
    const { shots } = liveDirectorStore.getState();
    expect(findLiveDirectorShotIndex(shots, 3.99)).toBe(-1);
    expect(findLiveDirectorShotIndex(shots, 4)).toBe(0);
    expect(findLiveDirectorShotIndex(shots, 99)).toBe(0);
    applyLiveDirectorPlan({ ...opening, plannedThroughTick: 130 });
    applyLiveDirectorPlan({ ...opening, epoch: 0, ended: true });
    expect(liveDirectorStore.getState()).toMatchObject({
      status: "playing",
      ended: false,
    });
    expect(liveDirectorStore.getState().shots).toBe(shots);

    resetLiveDirector();
    startLiveDirector();
    applyLiveDirectorPlan({ ...opening, epoch: 2 });
    expect(liveDirectorStore.getState()).toMatchObject({
      status: "loading",
      identity: { gameId: "game", epoch: 2 },
    });
    expect(resolveCameraOwner()).toBe("input");
  });

  it.each([false, true])(
    "can join the last committed shot while planning lags or ends (ended=%s)",
    (ended) => {
      startLiveDirector();
      applyLiveDirectorTick(251, 0);
      applyLiveDirectorPlan({ ...opening, ended });

      expect(activateLiveDirector()).toBe(true);
      expect(resolveCameraOwner()).toBe("director");
    },
  );

  it("limits unconfirmed camera movement and resumes smoothly after a delivery stall", () => {
    startLiveDirector();
    applyLiveDirectorTick(1000, 0);
    expect(liveDirectorTimeAt(0.125)).toBeCloseTo(32.125);
    expect(liveDirectorTimeAt(5)).toBeCloseTo(32.256);

    applyLiveDirectorTick(1008, 5);
    expect(liveDirectorTimeAt(5)).toBeCloseTo(32.256);
    expect(liveDirectorTimeAt(5.125)).toBeCloseTo(32.381);
  });

  it("uses the real first-person follow mode for a player shot and goes back to orbit on the next cut", () => {
    const engine = new GameEngine();
    const uninstall = startEngineSystems(engine);
    gameEntityStore.getState().beginStreaming("live");
    gameEntityStore.getState().setAllStreamEntities([
      {
        id: "capper",
        renderType: "Player",
        className: "Player",
        targetId: 9,
      },
    ]);
    const scene = new Scene();
    const renderAt = (tick: number, frame: number) => {
      applyLiveDirectorTick(tick, 0);
      engine.scheduler.run(FramePriority.CameraDirector, {
        camera: engine.cameras.perspective,
        delta: 1 / 60,
        elapsed: 0,
        frame,
        renderer: {} as WebGLRenderer,
        scene,
      });
    };
    try {
      engineStore.getState().setRecording({
        source: "live",
        duration: Infinity,
        streamingPlayback: {},
      } as StreamRecording);
      startLiveDirector();
      const follow = {
        kind: "followPlayer",
        targetId: 9,
        startSec: 4,
        endSec: 8,
        transitionIn: "cut",
      } as const;
      applyLiveDirectorPlan({
        ...opening,
        shots: [
          { startTick: 125, shot: { ...follow, firstPerson: true } },
          { startTick: 250, shot: follow },
        ],
      });
      renderAt(125, 1);
      activateLiveDirector();
      renderAt(125, 2);
      expect(streamPlaybackStore.getState()).toMatchObject({
        followEntityId: "capper",
        cameraMode: "firstPersonOverride",
      });
      renderAt(250, 3);
      expect(streamPlaybackStore.getState()).toMatchObject({
        followEntityId: "capper",
        cameraMode: "orbitOverride",
      });
    } finally {
      uninstall();
      gameEntityStore.getState().endStreaming();
    }
  });

  it("drives the installed live camera and cuts only at a released source tick", () => {
    const engine = new GameEngine();
    const camera = engine.cameras.perspective;
    const scene = new Scene();
    const uninstall = startEngineSystems(engine);
    let frames = 0;
    const frame = (localSec: number, delta: number) => {
      streamClock.time = localSec;
      engine.scheduler.run(FramePriority.CameraDirector, {
        camera,
        delta,
        elapsed: localSec,
        frame: ++frames,
        renderer: {} as WebGLRenderer,
        scene,
      });
    };
    const bearing = () => Math.atan2(camera.position.z, camera.position.x);

    try {
      engineStore.getState().setRecording({
        source: "live",
        duration: Infinity,
        streamingPlayback: {},
      } as StreamRecording);
      startLiveDirector();
      applyLiveDirectorPlan(opening);
      applyLiveDirectorTick(200, 1);
      activateLiveDirector();
      frame(1, 1 / 60);
      expect(bearing()).toBeCloseTo(1.2);

      // Replayed starts must not reseat the camera or advance a stalled clock.
      applyLiveDirectorPlan(opening);
      frame(1, 1 / 20);
      expect(bearing()).toBeCloseTo(1.2);

      frame(1.2, 1 / 60);
      expect(bearing()).toBeCloseTo(1.3);

      // A missed cut skips straight to the current point on the shot's path.
      applyLiveDirectorPlan({
        ...opening,
        shots: [
          {
            startTick: 225,
            shot: {
              kind: "sweep",
              from: [0, 0, 100],
              to: [40, 0, 100],
              target: [20, 20, 100],
              moveSec: 4,
              moveOffsetSec: 0.5,
              startSec: 0,
              endSec: 4,
              easing: "linear",
              pathSolved: true,
              transitionIn: "cut",
            },
          },
        ],
      });
      applyLiveDirectorTick(224, 1.768);
      frame(2, 1 / 60);
      expect(bearing()).toBeCloseTo(1.7);
      // The renderer was suspended while the next half second of picture arrived.
      // Skip to the current sweep phase now that its tick has been released.
      applyLiveDirectorTick(250, 2);
      frame(2, 1 / 60);
      expect(camera.position.z).toBeCloseTo(13);

      engineStore.getState().setRecording(null);
      frame(3, 1 / 60);
      expect(camera.position.z).toBeCloseTo(13);
    } finally {
      uninstall();
    }
  });
});
