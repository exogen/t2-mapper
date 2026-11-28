import { BoxGeometry, Group, Mesh, Scene, type WebGLRenderer } from "three";
import { expect, it, vi } from "vitest";
import {
  registerInteriorCollider,
  unregisterInteriorCollider,
} from "../collision/worldCollision";
import { performanceTuning } from "../performanceTuning";
import { engineStore } from "../state/engineStore";
import { gameEntityStore } from "../state/gameEntityStore";
import { liveConnectionStore } from "../state/liveConnectionStore";
import {
  liveDirectorStore,
  resetLiveDirector,
} from "../state/liveDirectorStore";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { LiveStreamAdapter } from "../stream/liveStreaming";
import type { RelayClient } from "../stream/relayClient";
import type { StreamRecording } from "../stream/types";
import { FramePriority } from "./framePriority";
import { GameEngine } from "./gameEngine";
import { installEntityViews } from "./entityViews";
import * as shapeCache from "./shapeCache";
import { StreamPlaybackSession } from "./streamPlayback";
import { createRecordingFromParser } from "../stream/demoStreaming";
import { fakeDemoParser } from "../stream/streamTestFixtures";
import { settingsStore } from "../state/settingsStore";

it("leaves prefetch stopped when a demo fails to initialize", () => {
  const recording = createRecordingFromParser(fakeDemoParser(), {
    checkpoints: false,
  });
  const engine = new GameEngine();
  const reset = vi
    .spyOn(recording.streamingPlayback, "reset")
    .mockImplementation(() => {
      throw new Error("Failed demo initialization");
    });
  engineStore.getState().setRecording(recording);
  try {
    expect(() => new StreamPlaybackSession(engine, recording)).toThrow(
      "Failed demo initialization",
    );
    expect(engine.recordedResourcesReady).toBeUndefined();
  } finally {
    reset.mockRestore();
    engineStore.getState().setRecording(null);
    gameEntityStore.getState().endStreaming();
  }
});

it("wakes an idle on-demand seek and ignores obsolete or disposed sessions", () => {
  const recording = createRecordingFromParser(fakeDemoParser(), {
    checkpoints: false,
  });
  const replacement = createRecordingFromParser(fakeDemoParser(), {
    checkpoints: false,
  });
  const engine = new GameEngine();
  const invalidate = vi.spyOn(engine, "invalidate");
  const previousOnDemand = settingsStore.getState().renderOnDemand;
  settingsStore.setState({ renderOnDemand: true });
  engineStore.getState().setRecording(recording);
  const session = new StreamPlaybackSession(engine, recording);
  let disposed = false;
  try {
    invalidate.mockClear();
    expect(engineStore.getState().seekPlayback(1)).toBe(true);
    expect(invalidate).toHaveBeenCalledOnce();

    engineStore.getState().setRecording(replacement);
    invalidate.mockClear();
    engineStore.getState().seekPlayback(2);
    expect(invalidate).not.toHaveBeenCalled();

    session.dispose();
    disposed = true;
    engineStore.getState().setRecording(recording);
    invalidate.mockClear();
    engineStore.getState().seekPlayback(3);
    expect(invalidate).not.toHaveBeenCalled();
  } finally {
    if (!disposed) session.dispose();
    invalidate.mockRestore();
    settingsStore.setState({ renderOnDemand: previousOnDemand });
    engineStore.getState().setRecording(null);
    gameEntityStore.getState().endStreaming();
  }
});

it("keeps the live world and its prefetch across rehydration, and renews them on mission change", async () => {
  const stream = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
  stream.missionName = "Harvester";
  let generation = stream.worldGeneration;
  const snapshot = stream.getSnapshot();
  const readSnapshot = () => ({
    ...snapshot,
    playbackRevision: stream.playbackRevision,
  });
  vi.spyOn(stream, "worldGeneration", "get").mockImplementation(
    () => generation,
  );
  vi.spyOn(stream, "getSnapshot").mockImplementation(readSnapshot);
  vi.spyOn(stream, "stepToTime").mockImplementation(readSnapshot);
  const sharedShape = { kind: "shape", name: "shared.dts" } as const;
  const lateShape = { kind: "shape", name: "late.dts" } as const;
  const getPreloadAssets = vi
    .spyOn(stream, "getPreloadAssets")
    .mockReturnValue([sharedShape]);
  const loadDependencies = vi
    .spyOn(shapeCache, "loadShapeDependencies")
    .mockResolvedValue(undefined);
  const recording: StreamRecording = {
    source: "live",
    duration: Infinity,
    missionName: stream.missionName,
    gameType: null,
    serverDisplayName: null,
    recorderName: null,
    recordingDate: null,
    streamingPlayback: stream,
  };
  const engine = new GameEngine();
  const stopViews = installEntityViews(engine);
  engineStore.getState().setRecording(recording);
  vi.useFakeTimers();
  const session = new StreamPlaybackSession(engine, recording);
  const { hdTexturesEnabled } = settingsStore.getState();
  let frame = 0;
  const draw = () =>
    engine.scheduler.run(FramePriority.StreamPlayback, {
      camera: engine.cameras.perspective,
      delta: 1 / 60,
      elapsed: ++frame / 60,
      frame,
      renderer: {} as WebGLRenderer,
      scene: new Scene(),
    });
  try {
    const assets = engine.sceneAssets;
    const textures = assets.textures;
    const manager = engine.assetLoadingManager;
    const { startDelayMs, refillDelayMs, rescanDelayMs } =
      performanceTuning.assetPrefetch;
    expect(getPreloadAssets).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(startDelayMs + refillDelayMs);
    expect(loadDependencies.mock.calls).toEqual([[sharedShape.name, manager]]);

    const release = vi.fn();
    engine.onSceneAssetsRelease(release);
    generation++;
    stream.playbackRevision++;
    stream.missionSequence = "1";
    draw();
    expect(engine.sceneAssets).toBe(assets);
    getPreloadAssets.mockReturnValue([sharedShape, lateShape]);
    await vi.advanceTimersByTimeAsync(rescanDelayMs);
    expect(loadDependencies.mock.calls).toEqual([
      [sharedShape.name, manager],
      [lateShape.name, manager],
    ]);

    settingsStore.setState({ hdTexturesEnabled: !hdTexturesEnabled });
    draw();
    expect(engine.sceneAssets).toBe(assets);
    expect(assets.disposed).toBe(false);
    expect(textures.disposed).toBe(true);
    const switchedTextures = assets.textures;
    expect(switchedTextures.disposed).toBe(false);
    expect(release).not.toHaveBeenCalled();
    expect(engineStore.getState().playback.recording).toBe(recording);

    generation++;
    stream.missionSequence = "2";
    stream.missionName = "BeachBlitz";
    draw();
    expect(assets.disposed).toBe(true);
    expect(switchedTextures.disposed).toBe(true);
    expect(release).toHaveBeenCalledOnce();
    const nextAssets = engine.sceneAssets;
    expect(nextAssets).not.toBe(assets);
    const nextManager = engine.assetLoadingManager;
    expect(nextManager).not.toBe(manager);
    getPreloadAssets.mockReturnValue([sharedShape]);
    await vi.advanceTimersByTimeAsync(rescanDelayMs);
    expect(loadDependencies).toHaveBeenCalledTimes(3);
    expect(loadDependencies).toHaveBeenLastCalledWith(
      sharedShape.name,
      nextManager,
    );

    engineStore.getState().setRecording(null);
    draw();
    expect(engine.sceneAssets).toBe(nextAssets);
    expect(nextAssets.disposed).toBe(false);
    session.dispose();
    getPreloadAssets.mockClear();
    await vi.advanceTimersByTimeAsync(rescanDelayMs * 2);
    expect(getPreloadAssets).not.toHaveBeenCalled();
    expect(loadDependencies).toHaveBeenCalledTimes(3);
  } finally {
    session.dispose();
    loadDependencies.mockRestore();
    vi.useRealTimers();
    engineStore.getState().setRecording(null);
    stopViews();
    settingsStore.setState({ hdTexturesEnabled });
    gameEntityStore.getState().endStreaming();
  }
});

it.each([false, true])(
  "waits for mission identity after a seek while ghosting (different mission=%s)",
  (differentMission) => {
    const recording = createRecordingFromParser(fakeDemoParser(), {
      checkpoints: false,
    });
    const stream = recording.streamingPlayback;
    let generation = stream.worldGeneration ?? 0;
    let snapshot = {
      ...stream.getSnapshot(),
      missionReadySec: 1,
      ghostAlwaysDoneSec: 1 as number | null,
    };
    vi.spyOn(stream, "worldGeneration", "get").mockImplementation(
      () => generation,
    );
    vi.spyOn(stream, "canStartSeek", "get").mockReturnValue(true);
    vi.spyOn(stream, "findSceneReadyTime").mockReturnValue(0);
    vi.spyOn(stream, "stepToTime").mockImplementation((timeSec) => ({
      ...snapshot,
      timeSec,
    }));
    const engine = new GameEngine();
    const scene = new Scene();
    const stopViews = installEntityViews(engine);
    engineStore.getState().setRecording(recording);
    const session = new StreamPlaybackSession(engine, recording);
    let frame = 0;
    const draw = () =>
      engine.scheduler.run(FramePriority.StreamPlayback, {
        camera: engine.cameras.perspective,
        delta: 1 / 60,
        elapsed: ++frame / 60,
        frame,
        renderer: {} as WebGLRenderer,
        scene,
      });
    try {
      const assets = engine.sceneAssets;
      // EndGhosting clears the ghost-ready time, while missionReadySec still
      // describes the old mission until MsgClientReady arrives.
      generation++;
      snapshot = { ...snapshot, ghostAlwaysDoneSec: null };
      expect(engineStore.getState().seekPlayback(10)).toBe(true);
      draw();
      expect(engine.sceneAssets).toBe(assets);

      // The terrain/ghosting data finishes without another world reset.
      snapshot = {
        ...snapshot,
        ghostAlwaysDoneSec: differentMission ? 11 : 1,
      };
      draw();
      expect(assets.disposed).toBe(differentMission);
    } finally {
      session.dispose();
      engineStore.getState().setRecording(null);
      stopViews();
      gameEntityStore.getState().endStreaming();
    }
  },
);

it("retracts and restores the same follow arm for manual and directed live shots", () => {
  const stream = new LiveStreamAdapter({} as RelayClient, { mode: "watch" });
  const snapshot = stream.getSnapshot();
  vi.spyOn(stream, "getSnapshot").mockReturnValue({
    ...snapshot,
    entities: [
      { id: "player", type: "Player", ghostIndex: 3, position: [0, 0, 0] },
    ],
  });
  const recording: StreamRecording = {
    source: "live",
    duration: Infinity,
    missionName: null,
    gameType: null,
    serverDisplayName: null,
    recorderName: null,
    recordingDate: null,
    streamingPlayback: stream,
  };
  const engine = new GameEngine();
  const scene = new Scene();
  const camera = engine.cameras.perspective;
  const root = new Group();
  const player = new Group();
  player.name = "player";
  root.add(player);
  scene.add(root);
  const wall = new Mesh(new BoxGeometry(0.5, 8, 20));
  wall.position.set(-4, 2, 0);
  wall.updateMatrixWorld();
  let frame = 0;
  const draw = () => {
    const context = {
      camera,
      delta: 1 / 60,
      elapsed: ++frame / 60,
      frame,
      renderer: {} as WebGLRenderer,
      scene,
    };
    engine.scheduler.run(FramePriority.StreamPlayback, context);
    engine.scheduler.run(FramePriority.CameraStream, context);
  };

  engineStore.getState().setRecording(recording);
  const previousRole = liveConnectionStore.getState().role;
  liveConnectionStore.setState({ role: "watcher" });
  const session = new StreamPlaybackSession(engine, recording);
  try {
    const blockedPositions = [];
    for (const directed of [false, true]) {
      if (directed) liveDirectorStore.setState({ status: "playing" });
      registerInteriorCollider("follow-wall", [wall]);
      streamPlaybackStore.setState((state) => ({
        root,
        cameraMode: "orbitOverride",
        followEntityId: player.name,
        orbitOverrideDistance: 24,
        orbitOverridePitch: 0,
        orbitOverrideYaw: 0,
        orbitSnapNonce: state.orbitSnapNonce + 1,
      }));
      draw();
      expect(camera.position.x).toBeGreaterThan(-3.75);
      expect(camera.position.x).toBeLessThan(-1);
      blockedPositions.push(camera.position.toArray());

      unregisterInteriorCollider("follow-wall");
      for (let i = 0; i < 60; i++) draw();
      expect(camera.position.x).toBeLessThan(-23);
    }
    expect(blockedPositions[0]).toEqual(blockedPositions[1]);
  } finally {
    unregisterInteriorCollider("follow-wall");
    wall.geometry.dispose();
    session.dispose();
    resetLiveDirector();
    liveConnectionStore.setState({ role: previousRole });
    engineStore.getState().setRecording(null);
    gameEntityStore.getState().endStreaming();
  }
});
