import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../manifest", () => ({
  getMissionInfo: () => ({ missionTypes: ["CTF"] }),
}));
vi.mock("../state/gameEntityStore", () => ({
  gameEntityStore: { getState: () => ({ dataSource: "map" }) },
  useDataSource: vi.fn(),
  useMissionName: vi.fn(),
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: { getState: () => ({}) },
  useLiveSelector: vi.fn(),
}));
vi.mock("../state/streamPlaybackStore", () => ({
  streamPlaybackStore: { getState: () => ({}) },
}));

import { commandCircuitStore } from "../state/commandCircuitStore";
import { syncCommandCircuitView } from "./useCommandCircuitUrlSync";

import { navigationViewKey, type NavigationQuery } from "./useQueryParams";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach((stop) => stop()));

function route(view: "cc" | null) {
  let query: NavigationQuery = {
    mode: "demo",
    demo: "a.rec",
    view,
    mission: null,
    t: null,
    address: null,
    name: null,
  };
  const patches: Partial<NavigationQuery>[] = [];
  const update = vi.fn(
    (fn: (current: NavigationQuery) => Partial<NavigationQuery>) => {
      const patch = fn(query);
      if (Object.keys(patch).length) patches.push(patch);
      query = { ...query, ...patch };
    },
  );
  return {
    get query() {
      return query;
    },
    patches,
    update,
    navigate(patch: Partial<NavigationQuery>) {
      query = { ...query, ...patch };
    },
    sync(ready = true) {
      const stop = syncCommandCircuitView(
        query.view,
        ready,
        navigationViewKey(query),
        update,
      );
      if (stop) cleanups.push(stop);
      return stop;
    },
  };
}

describe("command circuit URL synchronization", () => {
  beforeEach(() => commandCircuitStore.getState().deactivate());

  it("restores a CC link without mirroring the previous inactive render", () => {
    const link = route("cc");
    link.sync();
    expect(commandCircuitStore.getState().active).toBe(true);
    expect(link.update).not.toHaveBeenCalled();
    expect(link.query.view).toBe("cc");
  });

  it("preserves a pending CC link while the scene unloads and loads", () => {
    const link = route("cc");
    commandCircuitStore.getState().activate();
    link.sync(false);
    commandCircuitStore.getState().deactivate();
    expect(link.update).not.toHaveBeenCalled();
    link.sync();
    expect(commandCircuitStore.getState().active).toBe(true);
    expect(link.query.view).toBe("cc");
  });

  it("mirrors real transitions, including two toggles before React renders", async () => {
    const link = route(null);
    link.sync();
    commandCircuitStore.getState().toggle();
    commandCircuitStore.getState().toggle();
    commandCircuitStore.setState({ observerToggleRequested: true });
    await Promise.resolve();
    expect(link.patches).toEqual([]);
    expect(link.update).toHaveBeenCalledOnce();
    expect(link.query.view).toBeNull();
  });

  it("honors history returning to 3D without echoing the URL", () => {
    const link = route(null);
    commandCircuitStore.getState().activate();
    link.sync();
    expect(commandCircuitStore.getState().active).toBe(false);
    expect(link.update).not.toHaveBeenCalled();
  });

  it("cancels a pending write when the effect cleans up", async () => {
    const link = route(null);
    const stop = link.sync();
    commandCircuitStore.getState().activate();
    stop?.();
    await Promise.resolve();
    expect(link.update).not.toHaveBeenCalled();
  });

  it("ignores the old scene deactivating after a newer CC link was selected", async () => {
    const link = route("cc");
    const stop = link.sync();
    link.navigate({ demo: "b.rec" });
    commandCircuitStore.getState().deactivate();
    await Promise.resolve();
    expect(link.query).toMatchObject({ demo: "b.rec", view: "cc" });
    expect(link.patches).toEqual([]);
    stop?.();
    link.sync();
    expect(commandCircuitStore.getState().active).toBe(true);
  });

  it("does not undo history changing only the requested view", async () => {
    const link = route(null);
    link.sync();
    link.navigate({ view: "cc" });
    commandCircuitStore.getState().activate();
    commandCircuitStore.getState().deactivate();
    await Promise.resolve();
    expect(link.query.view).toBe("cc");
    expect(link.patches).toEqual([]);
  });

  it("does not retain listeners or rewrite the URL after effect cleanup", async () => {
    const link = route("cc");
    link.sync()?.();
    const remount = link.sync();
    commandCircuitStore.getState().deactivate();
    await Promise.resolve();
    expect(link.patches).toEqual([{ view: null }]);
    remount?.();
    commandCircuitStore.getState().activate();
    expect(link.update).toHaveBeenCalledOnce();
  });
});
