import { beforeEach, describe, expect, it, vi } from "vitest";

const test = vi.hoisted(() => ({
  setQuery: vi.fn(),
  dropHash: vi.fn(),
  cancelTour: vi.fn(),
  leaveReplay: vi.fn(),
  createReplay: vi.fn(),
  createLocalReplay: vi.fn(),
  leaveServer: vi.fn(),
  disconnectRelay: vi.fn(),
  unloadDemo: vi.fn(),
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("./useQueryParams", () => ({
  useNavigationQueryState: () => [{}, test.setQuery],
  dropLocationHash: test.dropHash,
}));
vi.mock("../state/cameraTourStore", () => ({
  cameraTourStore: { getState: () => ({ cancel: test.cancelTour }) },
}));
vi.mock("../state/engineStore", () => ({
  engineStore: { getState: () => ({}) },
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: {
    getState: () => ({
      leaveServer: test.leaveServer,
      disconnectRelay: test.disconnectRelay,
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

// useMemo is evaluated by the controlled hook runtime above.
const NavigationActions = () => useAppNavigation();

beforeEach(() => vi.clearAllMocks());

describe("shared replay navigation", () => {
  it("starts a loaded demo at its selected tick without carrying local time/camera route state", () => {
    const navigation = NavigationActions();
    navigation.createReplay("tribesforever:22945", 12_345);
    expect(test.createReplay).toHaveBeenCalledExactlyOnceWith(
      "tribesforever:22945",
      12_345,
    );
    expect(test.setQuery).toHaveBeenCalledExactlyOnceWith({
      mode: "replay",
      mission: null,
      demo: null,
      replay: null,
      t: null,
      address: null,
      name: null,
      view: null,
    });
    expect(test.dropHash).toHaveBeenCalledOnce();
    expect(test.leaveReplay).toHaveBeenCalledOnce();
    expect(test.leaveServer).toHaveBeenCalledOnce();
    expect(test.disconnectRelay).toHaveBeenCalledOnce();
    expect(test.unloadDemo).toHaveBeenCalledOnce();
  });

  it("returns to the demo browser without a standalone replay index action", () => {
    const navigation = NavigationActions();
    expect(navigation).not.toHaveProperty("replayIndex");
    navigation.demoIndex();
    expect(test.setQuery).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "demo", replay: null }),
    );
    expect(test.leaveReplay).toHaveBeenCalledOnce();
    expect(test.createReplay).not.toHaveBeenCalled();
  });

  it("hands captured local bytes to the upload flow after clearing the old demo route", () => {
    const buffer = new ArrayBuffer(32);
    const navigation = NavigationActions();
    navigation.createLocalReplay(buffer, "Local.rec", 40);
    expect(test.setQuery).toHaveBeenCalledWith(
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
});
