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
  fov: 90,
  followBehindPlayer: false,
  position: [1, 2, 3],
  quaternion: [0, 0, 0, 1],
};
const flagCamera = {
  kind: "flag",
  slot: 1,
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

function storedEntries() {
  return JSON.parse(sessionStorage.getItem(CASTER_STORAGE_KEY)!).entries;
}

function storedMission(overrides: Record<string, unknown> = {}) {
  return {
    server,
    mission: JSON.stringify(["3", "katabatic"]),
    teamNames: { 1: "Knights" },
    quickCams: { 0: camera },
    ...overrides,
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
  expect(storedEntries()[0].quickCams).toEqual({ 1: flagCamera });
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

it("starts the next mission empty even when the map repeats and retains the previous mission", () => {
  state().activate(server, "3", "Katabatic");
  state().renameTeam(2, "Dragons");
  state().saveCamera(0, camera);
  state().activate(server, "4", "Katabatic");
  expect(state().settings).toMatchObject({ teamNames: {}, quickCams: {} });
  expect(state().lastCameraAction).toBeNull();
  expect(displayTeamName(2, "Inferno")).toBe("Inferno");
  expect(storedEntries()).toHaveLength(2);
  state().activate(server, "3", "Katabatic");
  expect(displayTeamName(2, "Inferno")).toBe("Dragons");
  expect(state().settings?.quickCams[0]).toEqual(camera);
});

it("keeps explicit personal names above saved labels even when they equal the server defaults", () => {
  state().activate(server, "3", "Katabatic");
  state().setPublishedGame({
    id: "game",
    revision: 1,
    presentation: { teamNames: { 1: "Knights", 2: "Dragons" } },
  });
  expect(displayTeamName(1, "Storm")).toBe("Knights");
  state().renameTeams({ 1: "Storm", 2: "Inferno" });
  state().setPublishedGame({
    id: "game",
    revision: 2,
    presentation: { teamNames: { 1: "New team", 2: "Other team" } },
  });
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(displayTeamName(2, "Inferno")).toBe("Inferno");
  expect(storedEntries()[0].teamNames).toEqual({ 1: "Storm", 2: "Inferno" });
  state().renameTeam(1, "");
  expect(displayTeamName(1, "Storm")).toBe("New team");
  state().setPublishedGame(null);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(displayTeamName(2, "Inferno")).toBe("Inferno");
});

it("does not turn shared game details into personal session-storage overrides", () => {
  state().activate(server, "3", "Katabatic");
  state().setPublishedGame({
    id: "game",
    revision: 1,
    presentation: { title: "Finals", teamNames: { 1: "Knights" } },
  });
  expect(sessionStorage.getItem(CASTER_STORAGE_KEY)).toBeNull();
  state().saveCamera(0, camera);
  expect(storedEntries()[0]).toEqual(storedMission({ teamNames: {} }));
  state().suspend();
  state().activate(server, "3", "Katabatic");
  expect(state().publishedGame).toBeNull();
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(state().settings?.quickCams[0]).toEqual(camera);
});

it("ignores regressing shared revisions and clears shared details when the mission changes", () => {
  state().activate(server, "3", "Katabatic");
  const latest = {
    id: "game",
    revision: 2,
    presentation: { teamNames: { 1: "Latest" } },
  };
  state().setPublishedGame(latest);
  state().setPublishedGame({
    ...latest,
    revision: 1,
    presentation: { teamNames: { 1: "Old" } },
  });
  expect(displayTeamName(1, "Storm")).toBe("Latest");
  state().activate(server, "4", "Katabatic");
  expect(state().publishedGame).toBeNull();
  expect(state().teamNames).toEqual({});
});

it("persists a followed player's base name without any roster or account identity", () => {
  state().activate(server, "3", "Katabatic");
  const follow: SavedCamera = {
    kind: "player",
    mode: "firstPerson",
    player: { kind: "name", rawName: "Player", match: "base" },
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

it.each([
  ["follow", "follow"],
  ["fp", "firstPerson"],
] as const)(
  "migrates legacy %s cameras using structured fields only",
  (kind, mode) => {
    state().activate(server, "3", "Katabatic");
    state().renameTeam(1, "Knights");
    const player = {
      playerName: "CC: Player · Follow",
      yaw: 0.4,
      pitch: 0.2,
      distance: 20,
      fov: 90,
      followBehindPlayer: true,
      commandCircuit: { x: 40, z: 60, zoom: 4 },
    };
    const original = { kind: "original", fov: 90, followBehindPlayer: false };
    sessionStorage.setItem(
      CASTER_STORAGE_KEY,
      JSON.stringify({
        ...storedEntries()[0],
        version: 1,
        quickCams: {
          0: { ...camera, label: "CC: Free-fly" },
          1: { ...flagCamera, label: "Command circuit · Flag 1" },
          2: { ...original, label: "Original view" },
          3: { kind, ...player, label: "Unrelated presentation text" },
        },
      }),
    );
    state().suspend();
    state().activate(server, "3", "Katabatic");
    expect(state().settings).toEqual({
      teamNames: { 1: "Knights" },
      quickCams: {
        0: camera,
        1: flagCamera,
        2: original,
        3: {
          kind: "player",
          mode,
          player: { kind: "name", rawName: player.playerName, match: "base" },
          yaw: player.yaw,
          pitch: player.pitch,
          distance: player.distance,
          fov: player.fov,
          followBehindPlayer: player.followBehindPlayer,
          commandCircuit: player.commandCircuit,
        },
      },
    });
    state().renameTeam(2, "Dragons");
    const stored = JSON.parse(sessionStorage.getItem(CASTER_STORAGE_KEY)!);
    expect(stored.version).toBe(4);
    expect(stored.entries[0].quickCams).toEqual(state().settings?.quickCams);
  },
);

it("preserves released v2 player bindings without depending on their display label", () => {
  state().activate(server, "3", "Katabatic");
  state().renameTeam(1, "Knights");
  const saved = {
    kind: "player",
    mode: "follow",
    playerName: "Alice",
    displayName: "Old tag Alice",
    yaw: 0.4,
    pitch: 0.2,
    distance: 20,
    fov: 90,
    followBehindPlayer: false,
  };
  sessionStorage.setItem(
    CASTER_STORAGE_KEY,
    JSON.stringify({
      ...storedEntries()[0],
      version: 2,
      quickCams: { 3: saved },
    }),
  );
  state().suspend();
  state().activate(server, "3", "Katabatic");
  const {
    playerName: _playerName,
    displayName: _displayName,
    ...camera
  } = saved;
  expect(state().settings?.quickCams[3]).toEqual({
    ...camera,
    player: { kind: "name", rawName: "Alice", match: "base" },
  });
});

it("restores recent missions independently across servers", () => {
  state().activate(server, "3", "Katabatic");
  state().renameTeam(1, "Knights");
  state().activate("second:28000", "3", "Katabatic");
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  state().renameTeam(1, "Dragons");
  expect(sessionStorage.length).toBe(1);
  state().activate(server, "3", "Katabatic");
  expect(storedEntries()).toHaveLength(2);
  expect(displayTeamName(1, "Storm")).toBe("Knights");
  state().activate("second:28000", "3", "Katabatic");
  expect(displayTeamName(1, "Storm")).toBe("Dragons");
  state().suspend();
  expect(displayTeamName(1, "Other server")).toBe("Other server");
});

it("keeps five missions in most-recently-viewed order", () => {
  for (let sequence = 1; sequence <= 6; sequence++) {
    state().activate(server, String(sequence), "Katabatic");
    state().renameTeam(1, `Mission ${sequence}`);
  }
  expect(storedEntries()).toHaveLength(5);
  expect(
    storedEntries().map(
      (entry: { mission: string }) => JSON.parse(entry.mission)[0],
    ),
  ).toEqual(["6", "5", "4", "3", "2"]);

  state().activate(server, "2", "Katabatic");
  expect(displayTeamName(1)).toBe("Mission 2");
  state().activate(server, "7", "Katabatic");
  state().renameTeam(1, "Mission 7");
  expect(
    storedEntries().map(
      (entry: { mission: string }) => JSON.parse(entry.mission)[0],
    ),
  ).toEqual(["7", "2", "6", "5", "4"]);
  state().activate(server, "3", "Katabatic");
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  state().activate(server, "2", "Katabatic");
  expect(displayTeamName(1)).toBe("Mission 2");
});

it("counts uncustomized mission visits toward the retention limit", () => {
  state().activate(server, "1", "Katabatic");
  state().renameTeam(1, "First mission");
  for (let sequence = 2; sequence <= 5; sequence++)
    state().activate(server, String(sequence), "Katabatic");
  expect(storedEntries()).toHaveLength(5);

  state().activate(server, "6", "Katabatic");
  expect(sessionStorage.getItem(CASTER_STORAGE_KEY)).toBeNull();
  state().activate(server, "1", "Katabatic");
  expect(displayTeamName(1, "Storm")).toBe("Storm");
});

it("resets only the current mission's customization without discarding other history", () => {
  state().activate(server, "1", "Katabatic");
  state().renameTeam(1, "First mission");
  state().activate(server, "2", "Katabatic");
  state().renameTeam(1, "Second mission");
  state().renameTeam(1, "");
  expect(storedEntries()).toHaveLength(1);
  expect(storedEntries()[0].teamNames).toEqual({ 1: "First mission" });
  state().suspend();
  state().activate(server, "1", "Katabatic");
  expect(displayTeamName(1)).toBe("First mission");
});

it.each([1, 2, 3])(
  "migrates a version %s single-mission entry into the history when edited",
  (version) => {
    const mission = JSON.stringify(["3", "katabatic"]);
    sessionStorage.setItem(
      CASTER_STORAGE_KEY,
      JSON.stringify({
        version,
        server,
        mission,
        teamNames: { 1: "Legacy team" },
        quickCams: { 1: camera },
      }),
    );
    state().activate(server, "3", "missions/Katabatic.mis");
    expect(displayTeamName(1)).toBe("Legacy team");
    expect(state().settings?.quickCams[1]).toEqual(camera);
    state().renameTeam(2, "Another team");
    expect(JSON.parse(sessionStorage.getItem(CASTER_STORAGE_KEY)!)).toEqual({
      version: 4,
      entries: [
        {
          server,
          mission,
          teamNames: { 1: "Legacy team", 2: "Another team" },
          quickCams: { 1: camera },
        },
      ],
    });
  },
);

it.each([
  ["truncated JSON", '{"version":4,"entries":['],
  ["null", "null"],
  ["a primitive", "true"],
  ["an array", "[]"],
  ["an unversioned format", JSON.stringify(storedMission())],
  [
    "an unknown version",
    JSON.stringify({
      version: 999,
      entries: [storedMission()],
      ...storedMission(),
    }),
  ],
  [
    "a string version",
    JSON.stringify({ version: "4", entries: [storedMission()] }),
  ],
  [
    "a legacy shape marked as current",
    JSON.stringify({ version: 4, ...storedMission() }),
  ],
  [
    "a current shape marked as legacy",
    JSON.stringify({ version: 3, entries: [storedMission()] }),
  ],
  ["a missing entry list", JSON.stringify({ version: 4 })],
  [
    "a non-array entry list",
    JSON.stringify({ version: 4, entries: storedMission() }),
  ],
])("ignores %s and allows fresh customization", (_label, raw) => {
  sessionStorage.setItem(CASTER_STORAGE_KEY, raw);
  sessionStorage.setItem("other", "keep");
  expect(() => state().activate(server, "3", "Katabatic")).not.toThrow();
  expect(state().settings).toEqual({ teamNames: {}, quickCams: {} });
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  state().renameTeam(1, "Fresh name");
  expect(JSON.parse(sessionStorage.getItem(CASTER_STORAGE_KEY)!)).toEqual({
    version: 4,
    entries: [storedMission({ teamNames: { 1: "Fresh name" }, quickCams: {} })],
  });
  expect(sessionStorage.getItem("other")).toBe("keep");
});

it.each([1, 2, 3, 4])(
  "rejects array-shaped settings in version %s",
  (version) => {
    for (const overrides of [
      { teamNames: ["Wrong shape"] },
      { quickCams: [camera] },
    ]) {
      const entry = storedMission(overrides);
      sessionStorage.setItem(
        CASTER_STORAGE_KEY,
        JSON.stringify(
          version === 4 ? { version, entries: [entry] } : { version, ...entry },
        ),
      );
      state().activate(server, "3", "Katabatic");
      expect(state().settings).toEqual({ teamNames: {}, quickCams: {} });
      state().suspend();
    }
  },
);

it("skips corrupt history entries without losing a valid mission or trusting duplicates", () => {
  sessionStorage.setItem(
    CASTER_STORAGE_KEY,
    JSON.stringify({
      version: 4,
      entries: [
        null,
        false,
        [],
        {},
        storedMission({ server: 42 }),
        storedMission({ mission: null }),
        storedMission({ teamNames: null }),
        storedMission({ quickCams: "bad" }),
        storedMission(),
        storedMission({ teamNames: { 1: "Duplicate" } }),
      ],
    }),
  );
  state().activate(server, "3", "Katabatic");
  expect(displayTeamName(1, "Storm")).toBe("Knights");
  expect(state().settings?.quickCams).toEqual({ 0: camera });
  state().renameTeam(2, "Dragons");
  expect(storedEntries()).toEqual([
    storedMission({ teamNames: { 1: "Knights", 2: "Dragons" } }),
  ]);
});

it("discards invalid names and keys while retaining usable names and cameras", () => {
  sessionStorage.setItem(
    CASTER_STORAGE_KEY,
    JSON.stringify({
      version: 4,
      entries: [
        storedMission({
          teamNames: {
            0: "Observers",
            1: "Knights",
            2: { name: "Wrong type" },
            3: null,
            4: "",
            5: "   ",
            "01": "Alias",
            "-1": "Negative",
            "1.5": "Fractional",
            "9007199254740992": "Unsafe integer",
            bad: "Invalid key",
            ["__proto__"]: "Invalid key",
          },
          quickCams: {
            0: camera,
            1: flagCamera,
            2: { ...camera, position: [1, 2] },
            3: { ...flagCamera, kind: "follow", playerName: "Legacy shape" },
            10: camera,
            "01": camera,
            bad: camera,
            ["__proto__"]: camera,
          },
        }),
      ],
    }),
  );
  state().activate(server, "3", "Katabatic");
  expect(state().settings).toEqual({
    teamNames: { 0: "Observers", 1: "Knights" },
    quickCams: { 0: camera, 1: flagCamera },
  });
  expect(displayTeamName(2, "Inferno")).toBe("Inferno");
  state().setPublishedGame({
    id: "game",
    revision: 1,
    presentation: { teamNames: { 4: "Saved name" } },
  });
  expect(displayTeamName(4, "Server name")).toBe("Saved name");
  state().saveCamera(4, camera);
  expect(storedEntries()).toEqual([
    storedMission({
      teamNames: { 0: "Observers", 1: "Knights" },
      quickCams: { 0: camera, 1: flagCamera, 4: camera },
    }),
  ]);
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
  expect(storedEntries()[0]).toMatchObject({
    teamNames: {},
    quickCams: { 5: camera },
  });
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

it.each(["getItem", "setItem", "removeItem"] as const)(
  "keeps controls usable when storage %s throws",
  (method) => {
    vi.spyOn(sessionStorage, method).mockImplementation(() => {
      throw new Error("Storage unavailable or full");
    });
    expect(() => state().activate(server, "3", "Katabatic")).not.toThrow();
    state().renameTeam(1, "Knights");
    expect(displayTeamName(1)).toBe("Knights");
    expect(state().saveCamera(5, camera)).toBe(true);
    expect(state().settings?.quickCams[5]).toEqual(camera);
    state().renameTeam(1, "");
    expect(state().saveCamera(5, null)).toBe(true);
    expect(state().settings).toEqual({ teamNames: {}, quickCams: {} });
    state().renameTeam(1, "Still usable");
    expect(displayTeamName(1)).toBe("Still usable");
  },
);

it("ignores incompatible stored cameras while preserving default flags, names and usable slots", () => {
  state().activate(server, "3", "Katabatic");
  state().renameTeam(1, "Knights");
  sessionStorage.setItem(
    CASTER_STORAGE_KEY,
    JSON.stringify({
      ...storedEntries()[0],
      version: 3,
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
        5: {
          kind: "player",
          mode: "invalid",
          playerName: "Player",
          displayName: "Player",
          fov: 90,
          followBehindPlayer: false,
          yaw: 0,
          pitch: 0,
          distance: 20,
        },
        6: { ...camera, commandCircuit: "CC: Bad view" },
      },
    }),
  );
  state().suspend();
  state().activate(server, "3", "Katabatic");
  expect(state().settings?.quickCams).toEqual({ 0: camera, 1: flagCamera });
  expect(displayTeamName(1)).toBe("Knights");
});
