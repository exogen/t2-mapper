import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigationQuery } from "./useQueryParams";

const test = vi.hoisted(() => ({
  effects: [] as Array<() => void>,
  previous: { current: null as string | null },
  query: {} as NavigationQuery,
  load: vi.fn(),
  unload: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: () => test.previous,
  useEffect: (effect: () => void) => test.effects.push(effect),
}));
vi.mock("../manifest", () => ({
  getMissionInfo: () => ({ missionTypes: ["CTF"] }),
}));
vi.mock("./useQueryParams", async (original) => ({
  ...(await original<typeof import("./useQueryParams")>()),
  useNavigationQueryState: () => [test.query, vi.fn()],
}));
vi.mock("../stream/demoFileLoader", () => ({
  loadDemoReference: test.load,
  unloadDemo: test.unload,
}));
vi.mock("../state/engineStore", () => ({
  engineStore: { getState: () => ({ playback: { recording: null } }) },
}));
vi.mock("../state/gameEntityStore", () => ({
  gameEntityStore: { getState: () => ({ dataSource: "map" }) },
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: { getState: () => ({}) },
}));

import { demoLoadStore } from "../state/demoLoadStore";
import { useNavigationSync } from "./useNavigationSync";

function SyncNavigation() {
  useNavigationSync();
  test.effects.splice(0).forEach((effect) => effect());
}
beforeEach(() => {
  vi.clearAllMocks();
  test.previous.current = null;
  test.query = {
    mode: null,
    demo: null,
    mission: null,
    address: null,
    name: null,
    t: null,
    view: null,
  };
  demoLoadStore.setState(demoLoadStore.getInitialState(), true);
  test.unload.mockImplementation(() =>
    demoLoadStore.setState(demoLoadStore.getInitialState(), true),
  );
  test.load.mockImplementation((requestedDemo: string) =>
    demoLoadStore.setState({ requestedDemo }),
  );
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
});
