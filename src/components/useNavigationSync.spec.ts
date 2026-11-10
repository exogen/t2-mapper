import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigationQuery } from "./useQueryParams";

const test = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  previous: { current: null as string | null },
  replayPrevious: { current: null as string | null },
  recording: null as { source: string } | null,
  refIndex: 0,
  replay: { sessionId: null as string | null, join: vi.fn(), leave: vi.fn() },
  query: {} as NavigationQuery,
  setQuery: vi.fn(),
  load: vi.fn(),
  unload: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => (test.refIndex++ === 0 ? test.previous : test.replayPrevious),
  useEffect: (effect: () => void) => test.effects.push(effect),
}));
vi.mock("../manifest", () => ({
  getMissionInfo: () => ({ missionTypes: ["CTF"] }),
}));
vi.mock("./useQueryParams", async (original) => ({
  ...(await original<typeof import("./useQueryParams")>()),
  useNavigationQueryState: () => [test.query, test.setQuery],
}));
vi.mock("../stream/demoFileLoader", () => ({
  loadDemoReference: test.load,
  unloadDemo: test.unload,
}));
vi.mock("../state/engineStore", () => ({
  engineStore: {
    getState: () => ({ playback: { recording: test.recording } }),
  },
}));
vi.mock("../state/gameEntityStore", () => ({
  gameEntityStore: { getState: () => ({ dataSource: "map" }) },
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: { getState: () => ({}) },
}));
vi.mock("../state/replayConnectionStore", () => ({
  replayConnectionStore: { getState: () => test.replay },
  useReplaySelector: (selector: (state: typeof test.replay) => unknown) =>
    selector(test.replay),
}));

import { demoLoadStore } from "../state/demoLoadStore";
import { useNavigationSync } from "./useNavigationSync";

function SyncNavigation() {
  // eslint-disable-next-line react-hooks/immutability -- Reset the controlled hook runtime before each simulated render.
  test.refIndex = 0;
  useNavigationSync();
  test.effects.splice(0).forEach((effect) => effect());
}
beforeEach(() => {
  vi.clearAllMocks();
  test.previous.current = null;
  test.replayPrevious.current = null;
  test.recording = null;
  test.replay.sessionId = null;
  test.replay.leave.mockImplementation(() => {
    test.replay.sessionId = null;
  });
  test.replay.join.mockImplementation((id: string) => {
    test.replay.sessionId = id;
  });
  test.query = {
    mode: null,
    demo: null,
    user: null,
    replay: null,
    mission: null,
    address: null,
    name: null,
    t: null,
    view: null,
  };
  demoLoadStore.setState(demoLoadStore.getInitialState(), true);
  test.unload.mockImplementation(() => {
    test.recording = null;
    demoLoadStore.setState(demoLoadStore.getInitialState(), true);
  });
  test.load.mockImplementation((requestedDemo: string) =>
    demoLoadStore.setState({ requestedDemo }),
  );
});

describe("replay URL loading", () => {
  it("joins invitations once without loading the recording in the browser", () => {
    test.query.replay = "room-one";
    SyncNavigation();
    SyncNavigation();
    expect(test.replay.join).toHaveBeenCalledExactlyOnceWith("room-one");
    expect(test.load).not.toHaveBeenCalled();
    test.query.replay = "room-two";
    SyncNavigation();
    expect(test.replay.join).toHaveBeenLastCalledWith("room-two");
    test.query.mode = "replay";
    test.query.replay = null;
    SyncNavigation();
    expect(test.replay.sessionId).toBeNull();
  });

  it("publishes a created session ID and keeps it attached when its URL arrives", () => {
    test.query.mode = "replay";
    SyncNavigation();
    expect(test.setQuery).not.toHaveBeenCalled();
    expect(test.replay.leave).not.toHaveBeenCalled();

    // The creator receives this identifier asynchronously after starting from a demo.
    test.replay.sessionId = "new-room";
    SyncNavigation();
    expect(test.setQuery).toHaveBeenCalledExactlyOnceWith({
      replay: "new-room",
    });
    test.query.replay = "new-room";
    SyncNavigation();
    expect(test.replay.join).not.toHaveBeenCalled();
    expect(test.replay.leave).not.toHaveBeenCalled();
  });

  it("does not restore an old invitation after browser history removes it", () => {
    test.query.mode = "replay";
    test.query.replay = "old-room";
    SyncNavigation();
    test.setQuery.mockClear();
    test.query.replay = null;
    SyncNavigation();
    expect(test.replay.leave).toHaveBeenCalledOnce();
    expect(test.replay.sessionId).toBeNull();
    expect(test.setQuery).not.toHaveBeenCalledWith({ replay: "old-room" });
  });
});

describe("demo URL loading", () => {
  it("loads qualified links once and follows history between sources", () => {
    test.query.demo = "tribesforever:22945";
    SyncNavigation();
    SyncNavigation();
    expect(test.load).toHaveBeenCalledExactlyOnceWith("tribesforever:22945");
    test.query.demo = "published.rec";
    SyncNavigation();
    expect(test.load).toHaveBeenLastCalledWith("published.rec");
    test.query.demo = null;
    test.query.mode = "demo";
    SyncNavigation();
    expect(demoLoadStore.getState().requestedDemo).toBeNull();
  });

  it("does not restart a load already initiated by navigation", () => {
    test.query.demo = "tribesforever:22945";
    demoLoadStore.setState({ requestedDemo: test.query.demo });
    SyncNavigation();
    expect(test.load).not.toHaveBeenCalled();
    expect(test.unload).not.toHaveBeenCalled();
  });

  it("does not eject a local file when its preceding URL parameter clears", () => {
    test.query.demo = "tribesforever:22945";
    SyncNavigation();
    demoLoadStore.setState({ requestedDemo: null, phase: "parsing" });
    test.unload.mockClear();
    test.query.demo = null;
    test.query.mode = "demo";
    SyncNavigation();
    expect(test.unload).not.toHaveBeenCalled();
  });

  it("clears a failed qualified load when leaving demo mode", () => {
    test.query.mode = "map";
    demoLoadStore.setState({ requestedDemo: "unknown:1", phase: "error" });
    SyncNavigation();
    expect(test.unload).toHaveBeenCalledOnce();
  });

  it("unloads a local demo when history opens a user listing", () => {
    test.query.mode = "demo";
    test.query.user = "126767979894407168";
    test.recording = { source: "demo" };
    SyncNavigation();
    SyncNavigation();
    expect(test.unload).toHaveBeenCalledOnce();
    expect(test.load).not.toHaveBeenCalled();
  });

  it("does not load or eject anything for a user listing with no recording", () => {
    test.query.mode = "demo";
    test.query.user = "126767979894407168";
    SyncNavigation();
    test.query.user = "123456789012345678";
    SyncNavigation();
    expect(test.unload).not.toHaveBeenCalled();
    expect(test.load).not.toHaveBeenCalled();
    expect(test.setQuery).not.toHaveBeenCalled();
  });
});
