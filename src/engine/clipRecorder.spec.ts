import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Scene } from "three";
import type { AccountUser } from "../../relay/accountTypes";
import type { ClipSample, ClipTake } from "../../relay/clipTypes";
import { MAX_CLIP_DURATION_MS, sampleClipTake } from "../../relay/clipTypes";
import { clipStore } from "../state/clipStore";
import { appAccountStore } from "../state/appAccountStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { engineStore } from "../state/engineStore";
import { streamClock, streamPlaybackStore } from "../state/streamPlaybackStore";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import type { StreamSnapshot, StreamingPlayback } from "../stream/types";
import { streamRenderFrame } from "../stream/interpolateEntity";
import { gameEntityStore } from "../state/gameEntityStore";
import { commandCircuitStore } from "../state/commandCircuitStore";
import { resolveCameraOwner } from "../state/cameraOwner";
import { CameraRig } from "./cameraRig";
import { FrameScheduler, type FrameContext } from "./frameScheduler";
import { FramePriority } from "./framePriority";
import { InputQueue } from "./inputQueue";
import { installClipRecorder } from "./clipRecorder";
import { installDemoCameraSelection } from "./demoCameraSelection";
import { installCommandCircuit } from "./commandCircuit";
import { syncFollowCameraMode } from "./followControls";
import type { GameEngine } from "./gameEngine";

vi.mock("../stream/demoIndex", () => ({
  DEMOS_BASE_URL: "https://demos.example/demos",
}));
const input = vi.hoisted(() => ({
  actions: {} as Record<
    string,
    { pressed?: boolean; deltaY?: number; x?: number; y?: number }
  >,
  subscribers: new Map<string, Set<() => void>>(),
}));
vi.mock("../state/inputControls", () => ({
  clearInputDeltas: vi.fn(),
  inputControlsStore: { getState: () => ({ actions: input.actions }) },
  isPressed: (actions: typeof input.actions, name: string) =>
    !!actions[name]?.pressed,
  subscribeAction: vi.fn((name: string, callback: () => void) => {
    let subscribers = input.subscribers.get(name);
    if (!subscribers) input.subscribers.set(name, (subscribers = new Set()));
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  }),
}));
const sample = (
  timeMs: number,
  demoTimeSec: number,
  overrides: Partial<ClipSample> = {},
): ClipSample => ({
  timeMs,
  demoTimeSec,
  position: [timeMs / 100, 2, 3],
  quaternion: [0, 0, 0, 1],
  fov: 70,
  aspect: 1.5,
  projection: "perspective",
  cameraMode: "freeFly",
  targetId: null,
  flagSlot: null,
  rate: 1,
  playing: true,
  ...overrides,
});
const take = (samples = [sample(0, 10), sample(1000, 11)]): ClipTake => ({
  version: 1,
  sourceDemo: "game.rec",
  samples,
});
const cleanups: (() => void)[] = [];
const pointerLockDocument = {
  pointerLockElement: null as object | null,
  exitPointerLock: vi.fn(),
};
beforeEach(() => {
  input.actions = {};
  input.subscribers.clear();
  pointerLockDocument.pointerLockElement = null;
  pointerLockDocument.exitPointerLock.mockClear();
  vi.stubGlobal("document", pointerLockDocument);
  clipStore.getState().discard();
  clipStore.getState().stopPlayback();
  const stream = {} as StreamingPlayback;
  engineStore.getState().setRecording({
    source: "demo",
    duration: 100,
    streamingPlayback: stream,
  } as never);
  demoLoadStore.setState({
    sourceUrl: "https://demos.example/demos/game.rec",
    phase: "idle",
    requestedDemo: "game.rec",
    requestedUrl: null,
  });
  appAccountStore.setState({
    user: { discordId: "126767979894407168" } as AccountUser,
    pending: null,
  });
  streamClock.time = 10;
  streamPlaybackStore.setState(streamPlaybackStore.getInitialState(), true);
  streamPlaybackStore.setState({ playback: stream });
  setStreamSnapshot({} as StreamSnapshot);
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  clipStore.getState().discard();
  clipStore.getState().stopPlayback();
  engineStore.getState().setRecording(null);
  commandCircuitStore.setState({ active: false });
  gameEntityStore.getState().endStreaming();
  vi.unstubAllGlobals();
});
function fixture() {
  const engine = {
    scheduler: new FrameScheduler(),
    cameras: new CameraRig(),
    input: new InputQueue(),
    invalidate: vi.fn(),
  } as unknown as GameEngine;
  engine.cameras.resize(800, 400);
  cleanups.push(installClipRecorder(engine));
  const frame = (delta = 0.04) =>
    ({
      delta,
      elapsed: 0,
      frame: 1,
      camera: engine.cameras.active,
      scene: new Scene(),
    }) as unknown as FrameContext;
  return { engine, frame };
}

it("replays recorded source rates and camera movement through deliberate pauses", () => {
  const { engine, frame } = fixture();
  clipStore
    .getState()
    .play(
      take([
        sample(0, 10, { rate: 2 }),
        sample(1000, 12, { rate: 2, playing: false }),
        sample(1500, 12),
        sample(2500, 13),
      ]),
    );
  engine.scheduler.run(FramePriority.ClipTransport, frame(1));
  expect(engineStore.getState().playback).toMatchObject({
    status: "playing",
    rate: 2,
  });
  streamClock.time = 12;
  engine.scheduler.run(FramePriority.ClipCamera, frame(1));
  expect(clipStore.getState().playheadMs).toBe(1000);
  engine.scheduler.run(FramePriority.ClipTransport, frame(0.5));
  expect(engineStore.getState().playback.status).toBe("paused");
  engine.scheduler.run(FramePriority.ClipCamera, frame(0.5));
  expect(clipStore.getState().playheadMs).toBe(1500);
  expect(engine.cameras.active.position.x).toBe(15);
  engine.scheduler.run(FramePriority.ClipTransport, frame(0.25));
  expect(engineStore.getState().playback).toMatchObject({
    status: "playing",
    rate: 1,
  });
  streamClock.time = 12.25;
  engine.scheduler.run(FramePriority.ClipCamera, frame(0.25));
  expect(clipStore.getState().playheadMs).toBe(1750);
});

it("captures command-circuit toggles, real pan/zoom input, and restores them through scrubbing", () => {
  vi.stubGlobal("window", { location: { hash: "" } });
  const { engine, frame } = fixture();
  gameEntityStore.getState().beginStreaming("demo");
  cleanups.push(installCommandCircuit(engine));
  engine.cameras.perspective.position.set(1, 2, 3);
  clipStore.getState().start();
  engine.scheduler.runAll(frame());

  commandCircuitStore.getState().activate();
  engine.scheduler.runAll(frame(0.01));
  const initialZoom = engine.cameras.ortho.zoom;
  const initialX = engine.cameras.ortho.position.x;
  input.actions.commandPanUp = { pressed: true };
  engine.scheduler.runAll(frame());
  expect(engine.cameras.ortho.position.x).toBeGreaterThan(initialX);
  input.actions = { commandZoom: { deltaY: -100, x: 400, y: 200 } };
  for (const callback of input.subscribers.get("commandZoom") ?? []) callback();
  engine.scheduler.runAll(frame());
  expect(engine.cameras.ortho.zoom).toBeGreaterThan(initialZoom);
  commandCircuitStore.getState().deactivate();
  engine.scheduler.runAll(frame(0.01));
  clipStore.getState().stop();
  const recorded = clipStore.getState().draft!;
  expect(recorded.samples.map((sample) => sample.projection)).toEqual([
    "perspective",
    "orthographic",
    "orthographic",
    "orthographic",
    "perspective",
  ]);
  expect(recorded.samples[1]).toMatchObject({
    cut: true,
    timeMs: 10,
    cameraMode: "commandCircuit",
  });
  expect(recorded.samples.at(-1)).toMatchObject({ cut: true, timeMs: 100 });
  expect(recorded.samples[3].viewHeight).toBeLessThan(
    recorded.samples[1].viewHeight!,
  );
  clipStore.getState().discard();
  input.actions = {};
  clipStore.getState().play(recorded);
  clipStore.getState().pause();
  for (const time of [0, 10, 50, 90, 100, 70, 5]) {
    expect(clipStore.getState().seek(time)).toBe(true);
    const playback = engineStore.getState().playback;
    engineStore
      .getState()
      .completePlaybackSeek(playback.recording!, playback.seekNonce, "paused");
    engine.scheduler.runAll(frame(0));
    const expected = sampleClipTake(recorded, time);
    const orthographic = expected.projection === "orthographic";
    expect(commandCircuitStore.getState().active).toBe(orthographic);
    expect(engine.cameras.active).toBe(
      orthographic ? engine.cameras.ortho : engine.cameras.perspective,
    );
    engine.cameras.active.position
      .toArray()
      .forEach((value, axis) =>
        expect(value).toBeCloseTo(expected.position[axis], 5),
      );
    engine.cameras.active.quaternion
      .toArray()
      .forEach((value, axis) =>
        expect(value).toBeCloseTo(expected.quaternion[axis], 6),
      );
    if (orthographic)
      expect(
        (engine.cameras.ortho.top - engine.cameras.ortho.bottom) /
          engine.cameras.ortho.zoom,
      ).toBeCloseTo(expected.viewHeight!, 6);
  }
});

it("records the final camera pose and movement while source playback is paused", () => {
  const { engine, frame } = fixture();
  pointerLockDocument.pointerLockElement = {};
  clipStore.getState().start();
  expect(pointerLockDocument.exitPointerLock).not.toHaveBeenCalled();
  engine.cameras.perspective.position.set(1, 2, 3);
  engine.scheduler.run(FramePriority.ClipCamera, frame());
  engine.cameras.perspective.position.set(4, 5, 6);
  engine.scheduler.run(FramePriority.ClipCamera, frame());
  clipStore.getState().stop();
  expect(pointerLockDocument.exitPointerLock).toHaveBeenCalledTimes(1);
  const draft = clipStore.getState().draft!;
  expect(draft.samples).toHaveLength(2);
  expect(draft.samples.map((sample) => sample.demoTimeSec)).toEqual([10, 10]);
  expect(draft.samples[1]).toMatchObject({
    timeMs: 40,
    position: [4, 5, 6],
    playing: false,
  });
  expect(draft.samples[1].fov).toBe(engine.cameras.perspective.fov);
});

it.each(["firstPersonOverride", "orbitOverride"] as const)(
  "cuts recorded %s at death and at a new body for the same player",
  (cameraMode) => {
    const { engine, frame } = fixture();
    const player = {
      id: "player-body",
      renderType: "Player" as const,
      className: "Player",
      targetId: 7,
    };
    const camera = engine.cameras.perspective;
    gameEntityStore.getState().setStreamEntity(player);
    streamPlaybackStore.setState({
      cameraMode,
      followEntityId: player.id,
      followTargetId: player.targetId,
    });
    expect(clipStore.getState().start()).toBe(true);
    camera.position.set(1, 2, 3);
    camera.quaternion.identity();
    engine.scheduler.run(FramePriority.ClipCamera, frame());

    gameEntityStore.getState().setStreamEntity({ ...player, damageState: 1 });
    camera.position.set(10, 2, 3);
    camera.quaternion.set(0, 1, 0, 0);
    engine.scheduler.run(FramePriority.ClipCamera, frame(0.01));

    const respawn = { ...player, id: "respawned-body" };
    gameEntityStore.getState().setStreamEntity(respawn);
    streamPlaybackStore.setState({ followEntityId: respawn.id });
    camera.position.set(100, 2, 3);
    camera.quaternion.set(0, 0, 0, 1);
    engine.scheduler.run(FramePriority.ClipCamera, frame(0.01));

    // The old body's death and the replacement can arrive in one frame.
    const nextBody = { ...player, id: "next-body" };
    gameEntityStore.getState().setStreamEntity(nextBody);
    streamPlaybackStore.setState({ followEntityId: nextBody.id });
    camera.position.set(200, 2, 3);
    engine.scheduler.run(FramePriority.ClipCamera, frame(0.01));
    clipStore.getState().stop();

    const recorded = clipStore.getState().draft!;
    expect(recorded.samples).toMatchObject([
      { timeMs: 0, targetId: 7 },
      { timeMs: 10, targetId: 7, cut: true },
      { timeMs: 20, targetId: 7, cut: true },
      { timeMs: 30, targetId: 7, cut: true },
    ]);
    for (const [time, x, yaw] of [
      [5, 1, 0],
      [10, 10, 1],
      [15, 10, 1],
      [20, 100, 0],
      [25, 100, 0],
      [30, 200, 0],
    ]) {
      const pose = sampleClipTake(recorded, time);
      expect(pose.position).toEqual([x, 2, 3]);
      expect(pose.quaternion).toEqual([0, yaw, 0, 1 - yaw]);
    }
  },
);

it("preserves interpolation during a recorded flag hand-off", () => {
  const { engine, frame } = fixture();
  const carrier = {
    id: "carrier",
    renderType: "Player" as const,
    className: "Player",
  };
  gameEntityStore.getState().setStreamEntity(carrier);
  streamPlaybackStore.setState({
    cameraMode: "orbitOverride",
    followFlagSlot: 1,
    followEntityId: carrier.id,
  });
  expect(clipStore.getState().start()).toBe(true);
  engine.cameras.perspective.position.set(1, 2, 3);
  engine.scheduler.run(FramePriority.ClipCamera, frame());

  streamPlaybackStore.setState({ followEntityId: "flag" });
  engine.cameras.perspective.position.set(3, 2, 3);
  engine.scheduler.run(FramePriority.ClipCamera, frame());
  clipStore.getState().stop();

  const recorded = clipStore.getState().draft!;
  expect(recorded.samples[1].cut).toBeUndefined();
  expect(sampleClipTake(recorded, 20).position).toEqual([2, 2, 3]);
});

it("records a perspective toggle on one body without inserting a camera cut", () => {
  const { engine, frame } = fixture();
  const body = {
    id: "player",
    renderType: "Player" as const,
    className: "Player",
    targetId: 7,
  };
  gameEntityStore.getState().setStreamEntity(body);
  streamPlaybackStore.setState({
    cameraMode: "orbitOverride",
    followEntityId: body.id,
    followTargetId: 7,
  });
  expect(clipStore.getState().start()).toBe(true);
  engine.cameras.perspective.position.x = 1;
  engine.scheduler.run(FramePriority.ClipCamera, frame());
  streamPlaybackStore.setState({ cameraMode: "firstPersonOverride" });
  engine.cameras.perspective.position.x = 3;
  engine.scheduler.run(FramePriority.ClipCamera, frame(0.01));
  clipStore.getState().stop();

  const recorded = clipStore.getState().draft!;
  expect(recorded.samples[1].cut).toBeUndefined();
  expect(recorded.samples[1].firstPersonPose).toBe(false);
  expect(sampleClipTake(recorded, 5).position[0]).toBe(2);
});

it("records the end of a pullback separately from steady orbit even between regular samples", () => {
  const { engine, frame } = fixture();
  const body = {
    id: "player",
    renderType: "Player" as const,
    className: "Player",
    targetId: 7,
  };
  gameEntityStore.getState().setStreamEntity(body);
  streamPlaybackStore.setState({
    cameraMode: "firstPersonOverride",
    followEntityId: body.id,
    followTargetId: 7,
  });
  expect(clipStore.getState().start()).toBe(true);
  const { firstPersonPlayerId, maskFirstPersonPose } = streamRenderFrame;
  try {
    streamRenderFrame.firstPersonPlayerId = body.id;
    streamRenderFrame.maskFirstPersonPose = true;
    engine.scheduler.run(FramePriority.ClipCamera, frame());
    streamPlaybackStore.setState({ cameraMode: "orbitOverride" });
    streamRenderFrame.maskFirstPersonPose = false;
    engine.scheduler.run(FramePriority.ClipCamera, frame(0.01));
    streamRenderFrame.firstPersonPlayerId = null;
    engine.scheduler.run(FramePriority.ClipCamera, frame(0.01));
    clipStore.getState().stop();
    const recorded = clipStore.getState().draft!;
    expect(
      recorded.samples.map(({ timeMs, firstPersonPose, cut }) => ({
        timeMs,
        firstPersonPose,
        cut,
      })),
    ).toEqual([
      { timeMs: 0, firstPersonPose: true, cut: undefined },
      { timeMs: 10, firstPersonPose: false, cut: undefined },
      { timeMs: 20, firstPersonPose: undefined, cut: undefined },
    ]);
  } finally {
    Object.assign(streamRenderFrame, {
      firstPersonPlayerId,
      maskFirstPersonPose,
    });
  }
});

it.each(["firstPersonOverride", "orbitOverride"] as const)(
  "keeps a camera cut when toggling away from %s on an already dead body",
  (cameraMode) => {
    const { engine, frame } = fixture();
    const body = {
      id: "corpse",
      renderType: "Player" as const,
      className: "Player",
      targetId: 7,
      damageState: 1,
    };
    gameEntityStore.getState().setStreamEntity(body);
    streamPlaybackStore.setState({
      cameraMode,
      followEntityId: body.id,
      followTargetId: 7,
    });
    expect(clipStore.getState().start()).toBe(true);
    engine.cameras.perspective.position.x = 1;
    engine.scheduler.run(FramePriority.ClipCamera, frame());
    streamPlaybackStore.setState({
      cameraMode:
        cameraMode === "orbitOverride"
          ? "firstPersonOverride"
          : "orbitOverride",
    });
    engine.cameras.perspective.position.x = 3;
    engine.scheduler.run(FramePriority.ClipCamera, frame(0.01));
    clipStore.getState().stop();

    const recorded = clipStore.getState().draft!;
    expect(recorded.samples[1].cut).toBe(true);
    expect(sampleClipTake(recorded, 5).position[0]).toBe(1);
    expect(sampleClipTake(recorded, 10).position[0]).toBe(3);
  },
);

it("starts a fresh time origin after discarding a take between rendered frames", () => {
  const { engine, frame } = fixture();
  clipStore.getState().start();
  engine.scheduler.run(FramePriority.ClipCamera, frame());
  engine.scheduler.run(FramePriority.ClipCamera, frame());
  clipStore.getState().stop();
  expect(clipStore.getState().start()).toBe(false);
  clipStore.getState().discard();
  clipStore.getState().start();
  engine.scheduler.run(FramePriority.ClipCamera, frame());
  engine.scheduler.run(FramePriority.ClipCamera, frame());
  clipStore.getState().stop();
  expect(
    clipStore.getState().draft!.samples.map((sample) => sample.timeMs),
  ).toEqual([0, 40]);
  expect(pointerLockDocument.exitPointerLock).not.toHaveBeenCalled();
});

it("automatically stops at the shared recording limit with an exact final sample", () => {
  const { engine, frame } = fixture();
  pointerLockDocument.pointerLockElement = {};
  clipStore.getState().start();
  engine.scheduler.run(FramePriority.ClipCamera, frame());
  engine.scheduler.run(
    FramePriority.ClipCamera,
    frame(MAX_CLIP_DURATION_MS / 1000 + 1),
  );
  const state = clipStore.getState();
  expect(state.recording).toBe(false);
  expect(state.draft?.samples.at(-1)?.timeMs).toBe(MAX_CLIP_DURATION_MS);
  expect(state.elapsedMs).toBe(MAX_CLIP_DURATION_MS);
  expect(pointerLockDocument.exitPointerLock).toHaveBeenCalledTimes(1);
});

it("owns the final camera and preserves horizontal FOV framing on another aspect ratio", () => {
  const { engine, frame } = fixture();
  clipStore.getState().play(take());
  expect(resolveCameraOwner()).toBe("clip");
  engine.scheduler.run(FramePriority.ClipTransport, frame(0.5));
  expect(engineStore.getState().playback.rate).toBe(1);
  streamClock.time = 10.5;
  engine.cameras.perspective.position.set(999, 999, 999);
  engine.scheduler.run(FramePriority.ClipCamera, frame(0.5));
  expect(engine.cameras.active.position.toArray()).toEqual([5, 2, 3]);
  expect(clipStore.getState().playheadMs).toBe(500);
  expect(engine.cameras.perspective.fov).toBeCloseTo(
    (2 * Math.atan((Math.tan((70 * Math.PI) / 360) * 1.5) / 2) * 180) / Math.PI,
  );
});

it.each(["ready", "timeout"])(
  "holds the starting frame while effects initialize, then plays on %s",
  (resume) => {
    const { engine, frame } = fixture();
    clipStore.getState().play({
      ...take(),
      graphicsEffects: { intensity: { bloom: 0.5 } },
    });
    const effects = clipStore.getState().playbackEffects!;
    expect(effects.getState().awaitingFirstFrame).toBe(true);
    engine.scheduler.run(FramePriority.ClipTransport, frame(0.1));
    engine.scheduler.run(FramePriority.ClipCamera, frame(0.1));
    expect(engineStore.getState().playback.status).toBe("paused");
    expect(clipStore.getState().playheadMs).toBe(0);

    if (resume === "ready") effects.setState({ awaitingFirstFrame: false });
    const next = { ...frame(0.1), elapsed: resume === "ready" ? 0.2 : 10 };
    engine.scheduler.run(FramePriority.ClipTransport, next);
    expect(engineStore.getState().playback.status).toBe("playing");
    expect(effects.getState().awaitingFirstFrame).toBe(false);
    streamClock.time = 10.1;
    engine.scheduler.run(FramePriority.ClipCamera, next);
    expect(clipStore.getState().playheadMs).toBe(100);
  },
);

it("uses a replacement clip's camera track even at the same playhead time", () => {
  const { engine, frame } = fixture();
  for (const x of [1, 9]) {
    clipStore
      .getState()
      .play(
        take([
          sample(0, 10, { position: [x, 2, 3] }),
          sample(1000, 11, { position: [x, 2, 3] }),
        ]),
      );
    engine.scheduler.run(FramePriority.ClipTransport, frame(0));
    engine.scheduler.run(FramePriority.CameraSelect, frame(0));
    expect(engine.clipCameraSample?.position).toEqual([x, 2, 3]);
    engine.scheduler.run(FramePriority.ClipCamera, frame(0));
    expect(engine.cameras.active.position.toArray()).toEqual([x, 2, 3]);
    expect(engine.clipCameraSample).toBeNull();
  }
});

it("restores the ordinary playback speed after the final partial clip frame", () => {
  const { engine, frame } = fixture();
  engineStore.getState().setPlaybackRate(2);
  clipStore.getState().play(take());
  clipStore.setState({ playheadMs: 950 });
  streamClock.time = 10.95;
  engine.scheduler.run(FramePriority.ClipTransport, frame(0.1));
  expect(engineStore.getState().playback.rate).toBeCloseTo(0.5);
  streamClock.time = 11;
  engine.scheduler.run(FramePriority.ClipCamera, frame(0.1));
  expect(clipStore.getState().playing).toBe(false);
  clipStore.getState().stopPlayback();
  expect(engineStore.getState().playback.rate).toBe(2);
});

it("locks a stopped draft to its trim range and retains the selected head through asynchronous source seeks", () => {
  const { engine, frame } = fixture();
  engineStore.getState().setPlaybackRate(2);
  clipStore.getState().start();
  clipStore.getState().appendSample(sample(0, 10));
  clipStore.getState().appendSample(sample(1000, 11));
  streamClock.time = 11;
  clipStore.getState().stop();
  expect(resolveCameraOwner()).toBe("clip");
  clipStore.getState().setTrimRange(200, 800);
  clipStore.getState().resume();
  engine.scheduler.run(FramePriority.ClipTransport, frame(0.1));
  engine.scheduler.run(FramePriority.ClipCamera, frame(0.1));
  expect(clipStore.getState()).toMatchObject({
    playheadMs: 200,
    playing: true,
  });
  const playback = engineStore.getState().playback;
  engineStore
    .getState()
    .completePlaybackSeek(playback.recording!, playback.seekNonce, "paused");
  streamClock.time = 10.2;
  engine.scheduler.run(FramePriority.ClipTransport, frame(1));
  streamClock.time = 10.8;
  engine.scheduler.run(FramePriority.ClipCamera, frame(1));
  expect(clipStore.getState()).toMatchObject({
    playheadMs: 800,
    playing: false,
  });
  expect(clipStore.getState().draft).not.toBeNull();
  expect(resolveCameraOwner()).toBe("clip");
  clipStore.getState().discard();
  expect(resolveCameraOwner()).toBe("input");
  expect(engineStore.getState().playback.rate).toBe(2);
});

it("does not restore the previous demo's speed when a different demo replaces the clip", () => {
  const { engine, frame } = fixture();
  engineStore.getState().setPlaybackRate(2);
  clipStore.getState().play(take());
  engine.scheduler.run(FramePriority.ClipTransport, frame(0.1));
  engineStore
    .getState()
    .setRecording({ source: "demo", duration: 50 } as never);
  expect(clipStore.getState().active).toBeNull();
  expect(engineStore.getState().playback.rate).toBe(1);
});

it("keeps recorded first-person mode through normal follow selection while the clip owns the camera", () => {
  const { engine, frame } = fixture();
  cleanups.push(installDemoCameraSelection(engine));
  gameEntityStore.getState().beginStreaming("demo");
  gameEntityStore
    .getState()
    .setAllStreamEntities([
      { id: "player", renderType: "Player", className: "Player", targetId: 7 },
    ]);
  streamPlaybackStore.setState({ followCameraMode: "orbitOverride" });
  clipStore
    .getState()
    .play(
      take([
        sample(0, 10, { cameraMode: "firstPersonOverride", targetId: 7 }),
        sample(1000, 11, { cameraMode: "firstPersonOverride", targetId: 7 }),
      ]),
    );
  engine.scheduler.run(FramePriority.ClipTransport, frame(0.1));
  streamClock.time = 10.1;
  gameEntityStore.getState().setAllStreamEntities([
    {
      id: "respawned-player",
      renderType: "Player",
      className: "Player",
      targetId: 7,
    },
  ]);
  engine.scheduler.run(FramePriority.CameraSelect, frame(0.1));
  expect(streamPlaybackStore.getState()).toMatchObject({
    cameraMode: "firstPersonOverride",
    followEntityId: "respawned-player",
  });
  engine.scheduler.run(FramePriority.CameraSelect, frame(0.1));
  expect(streamPlaybackStore.getState().cameraMode).toBe("firstPersonOverride");
  // The same real follow sync does prefer the ordinary orbit mode once clip ownership ends.
  clipStore.getState().stopPlayback();
  expect(syncFollowCameraMode()).toBe(true);
  expect(streamPlaybackStore.getState().cameraMode).toBe("orbitOverride");
});

it("restores orthographic framing and holds the final frame without leaking camera ownership after exit", () => {
  const { engine, frame } = fixture();
  clipStore.getState().play(
    take([
      sample(0, 10, {
        projection: "orthographic",
        viewHeight: 100,
        cameraMode: "commandCircuit",
      }),
      sample(1000, 10, {
        projection: "orthographic",
        viewHeight: 100,
        cameraMode: "commandCircuit",
      }),
    ]),
  );
  engine.scheduler.run(FramePriority.ClipTransport, frame(1));
  engine.scheduler.run(FramePriority.CameraSelect, frame(1));
  engine.scheduler.run(FramePriority.ClipCamera, frame(1));
  expect(engine.cameras.active).toBe(engine.cameras.ortho);
  expect(engine.cameras.ortho.zoom).toBe(4);
  expect(clipStore.getState().playing).toBe(false);
  clipStore.getState().stopPlayback();
  expect(resolveCameraOwner()).toBe("commandCircuit");
});
