import { describe, expect, it, vi } from "vitest";

vi.mock("../manifest", () => ({
  getMissionInfo: () => ({ missionTypes: ["CTF"] }),
}));

import {
  clearEndedServerQuery,
  navigationViewKey,
  normalizeNavigationQuery,
  type NavigationQuery,
} from "./useQueryParams";

const empty: NavigationQuery = {
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

describe("navigation URL updates", () => {
  it("does not write an already canonical route", () => {
    for (const mode of ["map", "demo", "live", "replay"] as const) {
      expect(normalizeNavigationQuery({ ...empty, mode })).toEqual({});
    }
    expect(normalizeNavigationQuery(empty)).toEqual({});
  });

  it("infers a share link's mode without rewriting its time or view", () => {
    expect(
      normalizeNavigationQuery({ ...empty, demo: "a.rec", t: 25, view: "cc" }),
    ).toEqual({ mode: "demo" });
    expect(normalizeNavigationQuery({ ...empty, name: "A" })).toEqual({
      mode: "live",
    });
    expect(normalizeNavigationQuery({ ...empty, replay: "room" })).toEqual({
      mode: "replay",
    });
  });

  it("only removes fields incompatible with the current mode", () => {
    expect(
      normalizeNavigationQuery({
        ...empty,
        mode: "live",
        mission: { missionName: "RiverDance" },
        demo: "old.rec",
        t: 25,
        address: "127.0.0.1:28000",
        name: "Old server",
      }),
    ).toEqual({ mission: null, demo: null, t: null, name: null });
  });

  it("preserves a user listing, including invalid IDs for an explicit error state", () => {
    for (const user of ["126767979894407168", "invalid", ""]) {
      expect(
        normalizeNavigationQuery({ ...empty, mode: "demo", user }),
      ).toEqual({});
      expect(normalizeNavigationQuery({ ...empty, user })).toEqual({
        mode: "demo",
      });
    }
  });

  it("clears a user listing when a demo or another mode is selected", () => {
    for (const mode of ["map", "live", "replay"] as const) {
      expect(
        normalizeNavigationQuery({
          ...empty,
          mode,
          user: "126767979894407168",
        }),
      ).toEqual({ user: null });
    }
    expect(
      normalizeNavigationQuery({
        ...empty,
        mode: "demo",
        demo: "a.rec",
        user: "126767979894407168",
      }),
    ).toEqual({ user: null });
  });

  it("ties view changes to the selection and view, but not a copied timestamp", () => {
    const query: NavigationQuery = {
      ...empty,
      mode: "demo",
      demo: "a.rec",
      view: "cc",
    };
    expect(navigationViewKey({ ...query, t: 20 })).toBe(
      navigationViewKey(query),
    );
    expect(navigationViewKey({ ...query, mode: null })).toBe(
      navigationViewKey(query),
    );
    for (const change of [
      { demo: "b.rec" },
      { user: "126767979894407168" },
      { view: null },
      { mode: "live" as const },
    ]) {
      expect(navigationViewKey({ ...query, ...change })).not.toBe(
        navigationViewKey(query),
      );
    }
  });
});

describe("session-end URL cleanup", () => {
  const server = {
    serverAddress: "127.0.0.1:28000",
    serverName: "A",
    servers: [{ address: "127.0.0.1:28000", name: "A" }],
  };
  it("clears the ending server by name or normalized address", () => {
    for (const selection of [{ name: "A" }, { address: " 127.0.0.1 " }]) {
      expect(
        clearEndedServerQuery({ ...empty, mode: "live", ...selection }, server),
      ).toEqual({ name: null, address: null });
    }
  });
  it("does not clear a newer server or a different mode", () => {
    for (const query of [
      { ...empty, mode: "live" as const, name: "B" },
      { ...empty, mode: "live" as const, address: "127.0.0.2:28000" },
      { ...empty, mode: "demo" as const, demo: "a.rec" },
    ])
      expect(clearEndedServerQuery(query, server)).toEqual({});
  });
  it("can clear a failed name-based join before serverName arrives", () => {
    expect(
      clearEndedServerQuery(
        { ...empty, mode: "live", name: "A" },
        { ...server, serverName: undefined },
      ),
    ).toEqual({ name: null, address: null });
  });
});
