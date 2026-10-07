import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  casterStore,
  CASTER_STORAGE_KEY,
  displayTeamName,
  type SavedCamera,
} from "./casterStore";

const state = () => casterStore.getState();
const server = "example:28000";
const camera: SavedCamera = {
  kind: "fly",
  label: "Base",
  fov: 90,
  followBehindPlayer: false,
  position: [1, 2, 3],
  quaternion: [0, 0, 0, 1],
};
const flagCamera = {
  kind: "flag",
  slot: 1,
  label: "Flag 1",
  fov: 90,
  followBehindPlayer: false,
  yaw: 0,
  pitch: 0,
  distance: 8,
} satisfies SavedCamera;

function createStorage() {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => entries.set(key, value),
    removeItem: (key: string) => entries.delete(key),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", createStorage());
  vi.stubGlobal("sessionStorage", createStorage());
  state().suspend();
});
afterEach(() => {
  state().suspend();
  vi.unstubAllGlobals();
});

it.each([1, 2] as const)(
  "persists, notifies and flashes when saving default flag camera %s",
  (slot) => {
    state().activate(server, "3", "Katabatic");
    const saved = { ...flagCamera, slot };
    const persist = vi.spyOn(sessionStorage, "setItem");
    const notify = vi.fn();
    const unsubscribe = casterStore.subscribe(notify);
    expect(state().saveCamera(slot, saved)).toBe(true);
    expect(state().settings?.quickCams[slot]).toEqual(saved);
    expect(state().lastCameraAction).toEqual({ slot });
    expect(persist).toHaveBeenCalledOnce();
    expect(notify).toHaveBeenCalledOnce();
    unsubscribe();
    persist.mockRestore();
  },
);

it("replaces a custom override with the requested default flag view", () => {
  state().activate(server, "3", "Katabatic");
  state().saveCamera(1, camera);
  expect(state().saveCamera(1, flagCamera)).toBe(true);
  expect(state().settings?.quickCams[1]).toEqual(flagCamera);
  expect(
    JSON.parse(sessionStorage.getItem(CASTER_STORAGE_KEY)!).quickCams,
  ).toEqual({ 1: flagCamera });
});

it("keeps different flag targets, other keys and command circuit views custom", () => {
  state().activate(server, "3", "Katabatic");
  const commandCircuit = { x: 40, z: 60, zoom: 4 };
  state().saveCamera(1, { ...flagCamera, commandCircuit });
  state().saveCamera(2, flagCamera);
  state().saveCamera(3, flagCamera);
  expect(state().settings?.quickCams).toEqual({
    1: { ...flagCamera, commandCircuit },
    2: flagCamera,
    3: flagCamera,
  });
});

it("restores team names and cameras after reloading or reconnecting to the same mission", () => {
  state().activate(server, "3", "missions/Katabatic.mis");
  state().renameTeam(1, "  Knights  ");
  state().saveCamera(1, camera);
  expect(state().lastCameraAction).toEqual({ slot: 1 });
  const persist = vi.spyOn(sessionStorage, "setItem");
  state().suspend();
  state().activate(server, "3", "Katabatic");
  expect(state().lastCameraAction).toBeNull();
  expect(displayTeamName(1, "Storm")).toBe("Knights");
  expect(state().settings?.quickCams[1]).toEqual(camera);
  expect(persist).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(1);
});

it("resets on the next mission even when the map name repeats", () => {
  state().activate(server, "3", "Katabatic");
  state().renameTeam(2, "Dragons");
  state().saveCamera(0, camera);
  state().activate(server, "4", "Katabatic");
  expect(state().settings).toMatchObject({ teamNames: {}, quickCams: {} });
  expect(state().lastCameraAction).toBeNull();
  expect(displayTeamName(2, "Inferno")).toBe("Inferno");
  expect(sessionStorage.getItem(CASTER_STORAGE_KEY)).toBeNull();
});

it("persists a followed player's base name without any roster or account identity", () => {
  state().activate(server, "3", "Katabatic");
  const follow: SavedCamera = {
    kind: "fp",
    label: "Player · First person",
    playerName: "Player",
    yaw: 0.4,
    pitch: 0.2,
    distance: 20,
    fov: 90,
    followBehindPlayer: false,
  };
  state().saveCamera(3, follow);
  state().suspend();
  state().activate(server, "3", "Katabatic");
  expect(state().settings?.quickCams[3]).toEqual(follow);
});

it("replaces the active server without retaining a history", () => {
  state().activate(server, "3", "Katabatic");
  state().renameTeam(1, "Knights");
  state().activate("second:28000", "3", "Katabatic");
  expect(sessionStorage.getItem(CASTER_STORAGE_KEY)).toBeNull();
  state().renameTeam(1, "Dragons");
  expect(sessionStorage.length).toBe(1);
  state().activate(server, "3", "Katabatic");
  expect(sessionStorage.getItem(CASTER_STORAGE_KEY)).toBeNull();
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  state().suspend();
  expect(displayTeamName(1, "Other server")).toBe("Other server");
});

it("does not persist anything until a name or camera is customized", () => {
  const persist = vi.spyOn(sessionStorage, "setItem");
  state().activate(server, "3", "Katabatic");
  state().renameTeams({});
  state().renameTeam(1, " ");
  state().saveCamera(5, null);
  state().activate(server, "3", "Katabatic");
  expect(persist).not.toHaveBeenCalled();
  expect(sessionStorage.length).toBe(0);
  state().renameTeam(1, "Knights");
  expect(persist).toHaveBeenCalledOnce();
  expect(sessionStorage.length).toBe(1);
});

it("removes the entry when every customization has been reset", () => {
  state().activate(server, "3", "Katabatic");
  state().renameTeam(1, "Knights");
  state().saveCamera(5, camera);
  state().renameTeam(1, " ");
  expect(JSON.parse(sessionStorage.getItem(CASTER_STORAGE_KEY)!)).toMatchObject(
    {
      teamNames: {},
      quickCams: { 5: camera },
    },
  );
  state().saveCamera(5, null);
  expect(sessionStorage.getItem(CASTER_STORAGE_KEY)).toBeNull();
  state().suspend();
  state().activate(server, "3", "Katabatic");
  expect(state().settings).toEqual({ teamNames: {}, quickCams: {} });
});

it("saves multiple team names and resets together while preserving other settings", () => {
  state().activate(server, "3", "Katabatic");
  state().renameTeam(2, "Old name");
  state().renameTeam(4, "Other team");
  state().saveCamera(5, camera);
  const persist = vi.spyOn(sessionStorage, "setItem");
  const notify = vi.fn();
  const unsubscribe = casterStore.subscribe(notify);
  state().renameTeams({ 1: "  Knights  ", 2: " ", 3: "Dragons" });
  unsubscribe();
  expect(state().settings?.teamNames).toEqual({
    1: "Knights",
    3: "Dragons",
    4: "Other team",
  });
  expect(state().settings?.quickCams[5]).toEqual(camera);
  expect(persist).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledOnce();
  persist.mockRestore();
});

it("keeps each tab independent, including after a reload or a mission change in another tab", () => {
  const firstTab = sessionStorage;
  const secondTab = createStorage();
  state().activate(server, "3", "Katabatic");
  state().renameTeam(1, "Knights");
  state().saveCamera(5, camera);
  state().suspend();
  vi.stubGlobal("sessionStorage", secondTab);
  state().activate(server, "3", "Katabatic");
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  state().activate(server, "4", "Katabatic");
  state().renameTeam(1, "Dragons");
  state().suspend();
  vi.stubGlobal("sessionStorage", firstTab);
  state().activate(server, "3", "Katabatic");
  expect(displayTeamName(1)).toBe("Knights");
  expect(state().settings?.quickCams[5]).toEqual(camera);
  expect(state().saveCamera(0, camera)).toBe(true);
  state().suspend();
  vi.stubGlobal("sessionStorage", secondTab);
  state().activate(server, "4", "Katabatic");
  expect(displayTeamName(1)).toBe("Dragons");
  expect(state().settings?.quickCams).toEqual({});
});

it("leaves global preferences and other localStorage entries alone", () => {
  localStorage.setItem("settings", '{"volume":0.5}');
  localStorage.setItem("other", "keep");
  state().activate(server, "3", "Katabatic");
  state().renameTeam(1, "Knights");
  expect(localStorage.length).toBe(2);
  expect(localStorage.getItem("settings")).toBe('{"volume":0.5}');
  expect(localStorage.getItem("other")).toBe("keep");
  expect(sessionStorage.length).toBe(1);
});

it("works in memory when browser storage is unavailable", () => {
  vi.stubGlobal("sessionStorage", {
    getItem: () => {
      throw Error("unavailable");
    },
    setItem: () => {
      throw Error("unavailable");
    },
    removeItem: () => {
      throw Error("unavailable");
    },
  });
  state().activate(server, "3", "Katabatic");
  expect(state().saveCamera(5, camera)).toBe(true);
  const firstSave = state().lastCameraAction;
  state().saveCamera(5, camera);
  const repeatedSave = state().lastCameraAction;
  expect(repeatedSave).not.toBe(firstSave);
  state().renameTeam(1, "Knights");
  expect(state().lastCameraAction).toBe(repeatedSave);
  expect(state().settings?.quickCams[5]).toEqual(camera);
  expect(displayTeamName(1)).toBe("Knights");
  state().saveCamera(5, null);
  expect(state().lastCameraAction).toBe(repeatedSave);
});

it("ignores incompatible stored cameras while preserving default flags, names and usable slots", () => {
  state().activate(server, "3", "Katabatic");
  state().renameTeam(1, "Knights");
  sessionStorage.setItem(
    CASTER_STORAGE_KEY,
    JSON.stringify({
      ...JSON.parse(sessionStorage.getItem(CASTER_STORAGE_KEY)!),
      quickCams: {
        0: camera,
        1: flagCamera,
        3: { kind: "fly", label: "Bad", fov: 90 },
        4: {
          kind: "follow",
          label: "Old roster identity",
          fov: 90,
          followBehindPlayer: false,
          yaw: 0,
          pitch: 0,
          distance: 20,
          player: { clientId: 7, connectionId: "first" },
        },
      },
    }),
  );
  state().suspend();
  state().activate(server, "3", "Katabatic");
  expect(state().settings?.quickCams).toEqual({ 0: camera, 1: flagCamera });
  expect(displayTeamName(1)).toBe("Knights");
});
