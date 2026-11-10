import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NavigationQuery } from "./useQueryParams";

type QueryPatch = Partial<NavigationQuery>;
type QueryUpdate = QueryPatch | ((query: NavigationQuery) => QueryPatch);

const test = vi.hoisted(() => ({
  setQuery: vi.fn(),
  dropHash: vi.fn(),
  cancelTour: vi.fn(),
  leaveReplay: vi.fn(),
  createReplay: vi.fn(),
  createLocalReplay: vi.fn(),
  leaveServer: vi.fn(),
  disconnectRelay: vi.fn(),
  watchServer: vi.fn(),
  disconnectServer: vi.fn(),
  setRecording: vi.fn(),
  unloadDemo: vi.fn(),
  query: {} as NavigationQuery,
  patches: [] as QueryPatch[],
  pending: [] as Array<{
    search: URLSearchParams;
    resolve: (search: URLSearchParams) => void;
  }>,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("../manifest", () => ({
  getMissionInfo: () => ({ missionTypes: ["CTF"] }),
}));
vi.mock("./useQueryParams", async (original) => ({
  ...(await original<typeof import("./useQueryParams")>()),
  useNavigationQueryState: () => [test.query, test.setQuery],
  dropLocationHash: test.dropHash,
}));
vi.mock("../state/cameraTourStore", () => ({
  cameraTourStore: { getState: () => ({ cancel: test.cancelTour }) },
}));
vi.mock("../state/engineStore", () => ({
  engineStore: { getState: () => ({ setRecording: test.setRecording }) },
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: {
    getState: () => ({
      leaveServer: test.leaveServer,
      disconnectRelay: test.disconnectRelay,
      watchServer: test.watchServer,
      disconnectServer: test.disconnectServer,
      servers: [{ name: "Tournament Server", address: "127.0.0.1:28000" }],
    }),
  },
}));
vi.mock("../state/replayConnectionStore", () => ({
  replayConnectionStore: {
    getState: () => ({
      leave: test.leaveReplay,
      create: test.createReplay,
      createLocal: test.createLocalReplay,
    }),
  },
}));
vi.mock("../stream/demoFileLoader", () => ({
  loadDemoFile: vi.fn(),
  loadDemoReference: vi.fn(),
  unloadDemo: test.unloadDemo,
}));

import { useAppNavigation } from "./useAppNavigation";
import { serializeNavigationQuery } from "./useQueryParams";

// useMemo is evaluated by the controlled hook runtime above.
const NavigationActions = () => useAppNavigation();

function setRoute(query: QueryPatch, hash = "") {
  test.query = { ...test.query, ...query };
  window.location.search = serializeNavigationQuery(test.query);
  window.location.hash = hash;
}

async function flushNavigation() {
  const pending = test.pending.shift()!;
  window.location.search = pending.search.toString();
  pending.resolve(pending.search);
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
  test.query = {
    mode: null,
    mission: null,
    demo: null,
    user: null,
    replay: null,
    t: null,
    address: null,
    name: null,
    view: null,
  };
  test.patches = [];
  test.pending = [];
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      location: new URL("http://localhost:3000/"),
    }),
  );
  test.dropHash.mockImplementation(() => {
    window.location.hash = "";
  });
  test.setQuery.mockImplementation((update: QueryUpdate) => {
    const patch = typeof update === "function" ? update(test.query) : update;
    test.patches.push(patch);
    test.query = { ...test.query, ...patch };
    const search = new URLSearchParams(serializeNavigationQuery(test.query));
    return new Promise<URLSearchParams>((resolve) => {
      test.pending.push({ search, resolve });
    });
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("shared replay navigation", () => {
  it("starts a loaded demo at its selected tick without carrying local time/camera route state", () => {
    const navigation = NavigationActions();
    navigation.createReplay("tribesforever:22945", 12_345);
    expect(test.createReplay).toHaveBeenCalledExactlyOnceWith(
      "tribesforever:22945",
      12_345,
    );
    expect(test.patches).toEqual([
      {
        mode: "replay",
        mission: null,
        demo: null,
        user: null,
        replay: null,
        t: null,
        address: null,
        name: null,
        view: null,
      },
    ]);
    expect(test.leaveReplay).toHaveBeenCalledOnce();
    expect(test.leaveServer).toHaveBeenCalledOnce();
    expect(test.disconnectRelay).toHaveBeenCalledOnce();
    expect(test.unloadDemo).toHaveBeenCalledOnce();
  });

  it("returns to the demo browser without a standalone replay index action", () => {
    const navigation = NavigationActions();
    expect(navigation).not.toHaveProperty("replayIndex");
    navigation.demoIndex();
    expect(test.patches).toContainEqual(
      expect.objectContaining({ mode: "demo", replay: null }),
    );
    expect(test.leaveReplay).toHaveBeenCalledOnce();
    expect(test.createReplay).not.toHaveBeenCalled();
  });

  it("hands captured local bytes to the upload flow after clearing the old demo route", () => {
    const buffer = new ArrayBuffer(32);
    const navigation = NavigationActions();
    navigation.createLocalReplay(buffer, "Local.rec", 40);
    expect(test.patches).toContainEqual(
      expect.objectContaining({ mode: "replay", demo: null, replay: null }),
    );
    expect(test.unloadDemo).toHaveBeenCalledOnce();
    expect(test.createLocalReplay).toHaveBeenCalledExactlyOnceWith(
      buffer,
      "Local.rec",
      40,
    );
    expect(test.createReplay).not.toHaveBeenCalled();
  });

  it("opens a user's demos without carrying a loaded recording or server session", () => {
    NavigationActions().userDemos("126767979894407168");
    expect(test.patches).toEqual([
      {
        mode: "demo",
        mission: null,
        demo: null,
        user: "126767979894407168",
        replay: null,
        t: null,
        address: null,
        name: null,
        view: null,
      },
    ]);
    expect(test.cancelTour).toHaveBeenCalledOnce();
    expect(test.leaveReplay).toHaveBeenCalledOnce();
    expect(test.leaveServer).toHaveBeenCalledOnce();
    expect(test.disconnectRelay).toHaveBeenCalledOnce();
    expect(test.unloadDemo).toHaveBeenCalledOnce();
  });

  it("clears the user filter when selecting another destination", () => {
    const navigation = NavigationActions();
    navigation.demoIndex();
    navigation.selectDemo("published.rec");
    navigation.selectMission({ missionName: "RiverDance" });
    navigation.serverBrowser();
    navigation.watchServer("127.0.0.1:28000");
    navigation.disconnectServer();
    navigation.createReplay("published.rec");
    for (const query of test.patches)
      expect(query).toHaveProperty("user", null);
  });
});

describe("navigation history", () => {
  it("pushes explicit destination changes instead of replacing the app entry", () => {
    const navigation = NavigationActions();
    navigation.demoIndex();
    navigation.userDemos("126767979894407168");
    navigation.selectDemo("published.rec");
    navigation.selectMission({ missionName: "RiverDance" });
    navigation.serverBrowser();
    navigation.watchServer("127.0.0.1:28000");
    navigation.disconnectServer();
    navigation.createReplay("published.rec");
    for (const [, options] of test.setQuery.mock.calls)
      expect(options).toEqual({ history: "push" });
  });

  it("does not enqueue unchanged route fields when a destination is selected again", () => {
    setRoute({ mode: "demo", user: "126767979894407168" });
    NavigationActions().userDemos("126767979894407168");
    expect(test.patches).toEqual([{}]);
  });

  it("compares mission URLs by their serialized value, not object identity", () => {
    setRoute({ mode: "map", mission: { missionName: "RiverDance" } });
    NavigationActions().selectMission({
      missionName: "RiverDance",
      missionType: "CTF",
    });
    expect(test.patches).toEqual([{}]);
  });

  it("preserves the previous entry's camera hash until the new route is committed", async () => {
    setRoute(
      { mode: "map", mission: { missionName: "RiverDance" } },
      "#camera",
    );
    NavigationActions().demoIndex();
    expect(window.location.hash).toBe("#camera");
    expect(test.dropHash).not.toHaveBeenCalled();
    await flushNavigation();
    expect(window.location.search).toBe("?mode=demo");
    expect(test.dropHash).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe("");
    expect(window.location.origin).toBe("http://localhost:3000");
  });

  it("creates a new entry when only the destination's camera hash changes", async () => {
    setRoute({ mode: "demo", demo: "published.rec" }, "#camera");
    NavigationActions().selectDemo("published.rec");
    expect(test.patches[0]).toHaveProperty("demo", "published.rec");
    expect(test.dropHash).not.toHaveBeenCalled();
    await flushNavigation();
    expect(test.dropHash).toHaveBeenCalledOnce();
  });

  it("does not clear the restored hash when history cancels a pending same-mode navigation", async () => {
    setRoute({ mode: "demo", demo: "first.rec" }, "#camera");
    NavigationActions().selectDemo("second.rec");
    // Back restores the old route, then nuqs aborts the pending URL write.
    setRoute({ mode: "demo", demo: "first.rec" }, "#camera");
    window.dispatchEvent(new Event("popstate"));
    test.pending.shift()!.resolve(new URLSearchParams());
    await Promise.resolve();
    expect(test.dropHash).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#camera");
  });

  it("does not remove a newer camera hash after the queued route commits", async () => {
    setRoute({ mode: "map", mission: { missionName: "RiverDance" } }, "#old");
    NavigationActions().demoIndex();
    window.location.hash = "#new";
    await flushNavigation();
    expect(test.dropHash).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#new");
  });
});
