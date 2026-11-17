import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EngineStoreState } from "../state/engineStore";
import type { StreamRecording } from "../stream/types";

const test = vi.hoisted(() => ({
  frames: [] as Array<() => void>,
  effects: [] as Array<() => void>,
  findPlayer: vi.fn(),
  demoParam: "test.rec",
  sourceUrl: "/test.rec",
  clip: null as string | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (current: unknown) => ({ current }),
  useEffect: (fn: () => void) => test.effects.push(fn),
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
  useDemoQueryState: () => [test.demoParam],
  useDemoTimeQueryState: () => [500],
  useNavigationQueryState: () => [{ clip: test.clip }],
}));
vi.mock("../stream/demoIndex", () => ({
  DEMOS_BASE_URL: "/",
  demoDownloadUrl: (name: string) => `/${name}`,
}));
vi.mock("../state/watchFollow", () => ({
  findLivingEntityByTargetId: test.findPlayer,
  exitToFreeFly() {},
  followFlag() {},
}));

import { addPlaybackSeekGuard, engineStore } from "../state/engineStore";
import {
  resetStreamPlayback,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";
import { DemoMomentLoader } from "./DemoMomentLoader";

let demo: StreamRecording;
let now = 0;
const state = () => engineStore.getState();
const frame = () => test.frames.forEach((fn) => fn());
beforeEach(() => {
  test.demoParam = "test.rec";
  test.sourceUrl = "/test.rec";
  test.clip = null;
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.stubGlobal("window", { location: { hash: "#f7~1,2,8" } });
  test.findPlayer.mockReset().mockReturnValue(null);
  demo = {
    source: "demo",
    duration: 1000,
    streamingPlayback: {},
  } as StreamRecording;
  state().setRecording(demo);
  state().setPlaybackStatus("playing");
  streamPlaybackStore.setState({ playback: demo.streamingPlayback });
  DemoMomentLoader();
  test.effects.splice(0).forEach((fn) => fn());
});
afterEach(() => {
  test.frames.length = 0;
  state().setRecording(null);
  resetStreamPlayback();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("leaves the initial seek to the clip loader when a clip route is active", () => {
  test.clip = "clip-id";
  const nonce = state().playback.seekNonce;
  DemoMomentLoader();
  test.effects.splice(0).forEach((fn) => fn());
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
    DemoMomentLoader();
    test.effects.splice(0).forEach((fn) => fn());
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
  state().setPlaybackStatus("playing");
  const previousNonce = state().playback.seekNonce;
  DemoMomentLoader();
  test.effects.splice(0).forEach((fn) => fn());
  expect(state().playback.seekNonce).toBe(previousNonce + 1);
  expect(state().playback.seekTime).toBe(500);
});
