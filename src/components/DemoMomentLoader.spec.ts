import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EngineStoreState } from "../state/engineStore";
import type { StreamRecording } from "../stream/types";

const test = vi.hoisted(() => ({
  frames: [] as Array<() => void>,
  effects: [] as Array<() => void>,
  findPlayer: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (current: unknown) => ({ current }),
  useEffect: (fn: () => void) => test.effects.push(fn),
}));
vi.mock("@react-three/fiber", () => ({
  useFrame: (fn: () => void) => test.frames.push(fn),
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
    selector({ sourceUrl: "test.rec" }),
}));
vi.mock("./useQueryParams", () => ({
  useDemoQueryState: () => ["test"],
  useDemoTimeQueryState: () => [500],
}));
vi.mock("../stream/demoIndex", () => ({ demoDownloadUrl: () => "test.rec" }));
vi.mock("../state/watchFollow", () => ({
  findLivingEntityByTargetId: test.findPlayer,
  exitToFreeFly() {},
  followFlag() {},
}));

import { engineStore } from "../state/engineStore";
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
