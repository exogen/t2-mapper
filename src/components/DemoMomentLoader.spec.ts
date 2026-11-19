import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PerspectiveCamera, Quaternion, Vector3 } from "three";
import type { EngineStoreState } from "../state/engineStore";
import type { StreamEntity, StreamRecording } from "../stream/types";

const test = vi.hoisted(() => ({
  frames: [] as Array<() => void>,
  effects: [] as Array<() => void>,
  effectCleanup: null as (() => void) | null,
  effectDeps: null as readonly unknown[] | null,
  refs: [] as { current: unknown }[],
  refIndex: 0,
  findPlayer: vi.fn(),
  followFlag: vi.fn(),
  exitToFreeFly: vi.fn(),
  startProjectileTracking: vi.fn(),
  demoParam: "test.rec",
  sourceUrl: "/test.rec",
  clip: null as string | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (current: unknown) => (test.refs[test.refIndex++] ??= { current }),
  useEffect: (fn: () => (() => void) | void, deps: readonly unknown[]) => {
    if (
      test.effectDeps?.length === deps.length &&
      test.effectDeps.every((value, i) => Object.is(value, deps[i]))
    )
      return;
    test.effectDeps = deps;
    test.effects.push(() => {
      test.effectCleanup?.();
      test.effectCleanup = fn() ?? null;
    });
  },
}));
vi.mock("./useEngine", () => ({
  useEngineFrame: (_stage: number, fn: () => void) => test.frames.push(fn),
}));
vi.mock("zustand", () => ({
  useStore: (
    store: { getState(): unknown },
    selector: (state: unknown) => unknown,
  ) => selector(store.getState()),
}));
vi.mock("../state/engineStore", async (original) => {
  const actual = await original<typeof import("../state/engineStore")>();
  return {
    ...actual,
    useEngineSelector: (selector: (state: EngineStoreState) => unknown) =>
      selector(actual.engineStore.getState()),
  };
});
vi.mock("../state/demoLoadStore", () => ({
  useDemoLoad: (selector: (s: { sourceUrl: string }) => unknown) =>
    selector({ sourceUrl: test.sourceUrl }),
}));
vi.mock("./useQueryParams", () => ({
  useNavigationQueryState: () => [{ demo: test.demoParam, clip: test.clip }],
}));
vi.mock("../stream/demoIndex", () => ({
  DEMOS_BASE_URL: "/",
  demoDownloadUrl: (name: string) => `/${name}`,
}));
vi.mock("../state/watchFollow", () => ({
  findLivingEntityByTargetId: test.findPlayer,
  exitToFreeFly: test.exitToFreeFly,
  followFlag: test.followFlag,
}));
vi.mock("../engine/projectileFollow", () => ({
  startProjectileTracking: test.startProjectileTracking,
}));

import { addPlaybackSeekGuard, engineStore } from "../state/engineStore";
import { cameraRegistry } from "../state/cameraRegistry";
import {
  resetStreamPlayback,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { streamRenderFrame } from "../stream/interpolateEntity";
import { encodeDemoMoment, type DemoMomentCamera } from "./demoMoment";
import { DemoMomentLoader } from "./DemoMomentLoader";

let demo: StreamRecording;
let now = 0;
const state = () => engineStore.getState();
const frame = () => test.frames.forEach((fn) => fn());
const shot = {
  id: "restored-flight",
  type: "Projectile",
  ghostIndex: 12,
  spawnTimeSec: 499.968,
  position: [10, 20, 30],
  projectileSourceName: "Scout",
} satisfies StreamEntity;
const projectileView = {
  kind: "projectile",
  ghostIndex: shot.ghostIndex,
  spawnTick: 15_624,
  yaw: 1,
  pitch: 0.25,
  distance: 6,
  fallback: {
    kind: "fly",
    position: new Vector3(1, 2, 3),
    quaternion: new Quaternion(0, 0.6, 0, 0.8),
  },
} satisfies DemoMomentCamera;

function renderLoader(remount = true) {
  test.refIndex = 0;
  if (remount) {
    test.effectCleanup?.();
    test.effectCleanup = null;
    test.effectDeps = null;
    test.refs.length = 0;
  }
  DemoMomentLoader();
  test.effects.splice(0).forEach((fn) => fn());
}

function loadMoment(camera: DemoMomentCamera, timeSec = 500) {
  const { t, hash } = encodeDemoMoment({ camera, timeSec });
  window.location.search = `?${new URLSearchParams({ demo: test.demoParam, t: String(t) })}`;
  window.location.hash = hash;
  test.frames.length = 0;
  renderLoader();
}

beforeEach(() => {
  test.demoParam = "test.rec";
  test.sourceUrl = "/test.rec";
  test.clip = null;
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: { search: "?demo=test.rec&t=500", hash: "#f7~1,2,8" },
    }),
  );
  test.findPlayer.mockReset().mockReturnValue(null);
  test.followFlag.mockReset().mockReturnValue(true);
  test.exitToFreeFly.mockReset();
  test.startProjectileTracking.mockReset().mockReturnValue(true);
  demo = {
    source: "demo",
    duration: 1000,
    streamingPlayback: {},
  } as StreamRecording;
  state().setRecording(demo);
  state().setPlaybackStatus("playing");
  streamPlaybackStore.setState({ playback: demo.streamingPlayback });
  renderLoader();
});
afterEach(() => {
  test.effectCleanup?.();
  test.effectCleanup = null;
  test.frames.length = 0;
  state().setRecording(null);
  resetStreamPlayback();
  cameraRegistry.perspective = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("leaves the initial seek to the clip loader when a clip route is active", () => {
  test.clip = "clip-id";
  const nonce = state().playback.seekNonce;
  renderLoader();
  expect(state().playback.seekNonce).toBe(nonce);
});

it("leaves the camera unchanged when a timestamp seek is canceled", () => {
  test.frames.length = 0;
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  streamPlaybackStore.setState({
    cameraMode: "freeFly",
    followTargetId: 8,
  });
  const beforePlayback = state().playback;
  const beforeCamera = streamPlaybackStore.getState();
  const removeGuard = addPlaybackSeekGuard(() => false);
  try {
    renderLoader();
    test.findPlayer.mockReturnValue("new-body");
    frame();
    expect(state().playback).toBe(beforePlayback);
    expect(streamPlaybackStore.getState()).toBe(beforeCamera);
  } finally {
    removeGuard();
  }
});

it("waits for the destination scene and gives the player its full timeout after a long seek", () => {
  test.findPlayer.mockReturnValue("old-body");
  now = 60_000;
  frame();
  expect(test.findPlayer).not.toHaveBeenCalled();
  test.findPlayer.mockReturnValue(null);
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  now += 29_000;
  test.findPlayer.mockReturnValue("destination-body");
  frame();
  expect(streamPlaybackStore.getState()).toMatchObject({
    followEntityId: "destination-body",
    followTargetId: 7,
    orbitOverrideYaw: 1,
  });
});

it.each(["seek", "unload", "replace"])(
  "cancels a pending follow after %s",
  (action) => {
    if (action === "seek") state().seekPlayback(100);
    else state().setRecording(action === "unload" ? null : { ...demo });
    frame();
    test.findPlayer.mockReturnValue("unrelated-body");
    state().completePlaybackSeek(demo, state().playback.seekNonce);
    frame();
    expect(test.findPlayer).not.toHaveBeenCalled();
    expect(streamPlaybackStore.getState().followEntityId).toBeNull();
  },
);

it("still expires when a player never appears after the seek", () => {
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  now = 30_001;
  frame();
  test.findPlayer.mockReturnValue("too-late");
  frame();
  expect(streamPlaybackStore.getState().followEntityId).toBeNull();
});

it("applies timestamp links to qualified demos", () => {
  test.demoParam = "tribesforever:22945";
  test.sourceUrl = "https://tribesforever.com/demo/22945/download";
  window.location.search = "?demo=tribesforever%3A22945&t=500";
  state().setPlaybackStatus("playing");
  const previousNonce = state().playback.seekNonce;
  renderLoader();
  expect(state().playback.seekNonce).toBe(previousNonce + 1);
  expect(state().playback.seekTime).toBe(500);
});

it("restores original view at a timestamp", () => {
  streamPlaybackStore.setState({
    cameraMode: "orbitOverride",
    followEntityId: "old-flag",
    followFlagSlot: 1,
  });
  loadMoment({ kind: "original" });
  frame();
  expect(streamPlaybackStore.getState().cameraMode).toBe("orbitOverride");
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  expect(streamPlaybackStore.getState()).toMatchObject({
    cameraMode: "original",
    followEntityId: null,
    followFlagSlot: null,
  });
});

it("does not reapply the moment when demo duration grows after copying a link", () => {
  const nonce = state().playback.seekNonce;
  state().completePlaybackSeek(demo, nonce);
  // Copy changes the URL without dispatching a browser navigation event.
  const { t, hash } = encodeDemoMoment({
    camera: projectileView,
    timeSec: 510.1875,
  });
  window.location.search = `?demo=test.rec&t=${t}`;
  window.location.hash = hash;
  demo.duration += 1;
  state().refreshRecordingDuration(demo);
  renderLoader(false);

  expect(state().playback.seekNonce).toBe(nonce);
});

it("applies a same-time camera hash change once, even when both events fire", () => {
  const nonce = state().playback.seekNonce;
  window.location.hash = "#p8~1,0.25,6";
  window.dispatchEvent(new Event("popstate"));
  window.dispatchEvent(new Event("hashchange"));
  expect(state().playback.seekNonce).toBe(nonce + 1);

  state().completePlaybackSeek(demo, nonce + 1);
  test.findPlayer.mockReturnValue("new-body");
  frame();
  expect(streamPlaybackStore.getState()).toMatchObject({
    cameraMode: "firstPersonOverride",
    followTargetId: 8,
  });
});

it.each(["?demo=other.rec&t=600", "?demo=test.rec&clip=other&t=600"])(
  "ignores browser navigation away from the current moment route (%s)",
  (search) => {
    const nonce = state().playback.seekNonce;
    window.location.search = search;
    window.dispatchEvent(new Event("popstate"));
    state().completePlaybackSeek(demo, nonce);
    frame();

    expect(state().playback.seekNonce).toBe(nonce);
    expect(test.findPlayer).not.toHaveBeenCalled();
  },
);

it("applies a free-fly link's camera pose", () => {
  const camera = new PerspectiveCamera();
  cameraRegistry.perspective = camera;
  loadMoment(projectileView.fallback);
  frame();
  expect(test.exitToFreeFly).not.toHaveBeenCalled();
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  expect(test.exitToFreeFly).toHaveBeenCalledOnce();
  expect(camera.position).toEqual(projectileView.fallback.position);
  expect(camera.quaternion.toArray()).toEqual(
    projectileView.fallback.quaternion.toArray(),
  );
});

it("waits for the seek destination before finding a flag", () => {
  loadMoment({ kind: "flag", slot: 2, yaw: 1, pitch: 0.25, distance: 6 });
  frame();
  expect(test.followFlag).not.toHaveBeenCalled();
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  expect(test.followFlag).toHaveBeenCalledExactlyOnceWith(2);
  expect(streamPlaybackStore.getState()).toMatchObject({
    orbitOverrideYaw: 1,
    orbitOverridePitch: 0.25,
    orbitOverrideDistance: 6,
  });
});

it("leaves the orbit alone until a linked flag enters scope", () => {
  loadMoment({ kind: "flag", slot: 2, yaw: 1, pitch: 0.25, distance: 6 });
  test.followFlag.mockReturnValue(false);
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  expect(streamPlaybackStore.getState().orbitOverrideYaw).toBe(0);

  test.followFlag.mockReturnValue(true);
  frame();
  expect(streamPlaybackStore.getState().orbitOverrideYaw).toBe(1);
});

it("restores the first-person view of the destination player", () => {
  loadMoment({ kind: "fp", targetId: 7, yaw: 1, pitch: 0.25, distance: 6 });
  test.findPlayer.mockReturnValue("destination-body");
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  expect(streamPlaybackStore.getState()).toMatchObject({
    cameraMode: "firstPersonOverride",
    followTargetId: 7,
    followEntityId: "destination-body",
  });
});

it("restores the exact flight and its orbit after a fractional seek", () => {
  loadMoment(projectileView, 500.1875);
  expect(state().playback.seekTime).toBe(500.1875);
  streamRenderFrame.current = new Map([[shot.id, shot]]);
  frame();
  expect(test.startProjectileTracking).not.toHaveBeenCalled();

  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  frame();
  expect(test.startProjectileTracking).toHaveBeenCalledExactlyOnceWith(
    shot.id,
    shot.projectileSourceName,
    expect.objectContaining({ yaw: 1, pitch: 0.25, distance: 6 }),
  );
});

it("uses the fixed pose when that ghost slot now contains a different flight", () => {
  const camera = new PerspectiveCamera();
  cameraRegistry.perspective = camera;
  loadMoment(projectileView, 500.1875);
  streamRenderFrame.current = new Map([
    [shot.id, { ...shot, spawnTimeSec: 500.16 }],
  ]);
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  expect(test.startProjectileTracking).not.toHaveBeenCalled();
  expect(test.exitToFreeFly).toHaveBeenCalledOnce();
  expect(camera.position).toEqual(projectileView.fallback.position);
  expect(camera.quaternion.toArray()).toEqual(
    projectileView.fallback.quaternion.toArray(),
  );
});

it("waits for a successful retry of a failed linked seek", () => {
  loadMoment(projectileView, 500.1875);
  streamRenderFrame.current = new Map([[shot.id, shot]]);
  state().failPlaybackSeek(demo, state().playback.seekNonce);
  frame();
  expect(test.startProjectileTracking).not.toHaveBeenCalled();
  expect(test.exitToFreeFly).not.toHaveBeenCalled();

  state().seekPlayback(500.1875, "reconstruction");
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  expect(test.startProjectileTracking).toHaveBeenCalledOnce();
});

it("ignores a projectile link when a new user seek supersedes it", () => {
  loadMoment(projectileView, 500.1875);
  streamRenderFrame.current = new Map([[shot.id, shot]]);
  state().seekPlayback(600);
  state().completePlaybackSeek(demo, state().playback.seekNonce);
  frame();
  expect(test.startProjectileTracking).not.toHaveBeenCalled();
  expect(test.exitToFreeFly).not.toHaveBeenCalled();
});
