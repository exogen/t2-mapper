import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StreamRecording } from "../stream/types";
import {
  casterStore,
  CASTER_STORAGE_KEY,
  displayTeamName,
  type SavedCamera,
} from "./casterStore";
import { syncDemoCaster } from "./demoCaster";
import type { DemoGame } from "../../relay/demoMetadata";

const state = () => casterStore.getState();
const demo = () => ({ source: "demo" }) as StreamRecording;
const url = "https://demos.example/match.rec";

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  state().suspend();
});

afterEach(() => {
  state().suspend();
  vi.unstubAllGlobals();
});

it("isolates demo names from live server names and restores them on reload", () => {
  state().activate("example:28000", "3", "Katabatic");
  state().renameTeam(1, "Live team");
  syncDemoCaster(demo(), 2.5, url);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  state().renameTeam(1, "Demo team");
  state().suspend();
  syncDemoCaster(demo(), 2.5, url);
  expect(displayTeamName(1, "Storm")).toBe("Demo team");
  state().activate("example:28000", "3", "Katabatic");
  expect(displayTeamName(1, "Storm")).toBe("Live team");
});

it("restores recent demo missions on reload and backward seeks", () => {
  const recording = demo();
  syncDemoCaster(recording, 0, url);
  state().renameTeam(1, "First mission");
  const camera = {
    kind: "original",
    fov: 90,
    followBehindPlayer: false,
  } satisfies SavedCamera;
  state().saveCamera(3, camera);
  state().suspend();
  syncDemoCaster(demo(), 0, url);
  expect(displayTeamName(1, "Storm")).toBe("First mission");
  expect(state().settings?.quickCams[3]).toEqual(camera);
  syncDemoCaster(recording, 120, url);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(state().settings?.quickCams[3]).toBeUndefined();
  state().renameTeam(1, "Second mission");
  state().suspend();
  syncDemoCaster(demo(), 120, url);
  expect(displayTeamName(1, "Storm")).toBe("Second mission");
  syncDemoCaster(recording, 0, url);
  expect(displayTeamName(1, "Storm")).toBe("First mission");
  expect(state().settings?.quickCams[3]).toEqual(camera);
  syncDemoCaster(recording, 120, url);
  expect(displayTeamName(1, "Storm")).toBe("Second mission");
});

it("does not publish or write settings on each playback tick", () => {
  const recording = demo();
  syncDemoCaster(recording, 2.5, url);
  const persist = vi.spyOn(sessionStorage, "setItem");
  const notify = vi.fn();
  const unsubscribe = casterStore.subscribe(notify);
  syncDemoCaster(recording, 2.5, url);
  syncDemoCaster(recording, 2.5, url);
  unsubscribe();
  expect(persist).not.toHaveBeenCalled();
  expect(notify).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(CASTER_STORAGE_KEY)).toBeNull();
});

it("isolates different demos, including local files without a source URL", () => {
  const first = demo();
  syncDemoCaster(first, 0, null);
  state().renameTeam(1, "Local team");
  syncDemoCaster(demo(), 0, null);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  syncDemoCaster(demo(), 0, url);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  syncDemoCaster(first, 0, null);
  expect(displayTeamName(1, "Storm")).toBe("Local team");
});

it("keeps distinct local-demo scopes on HTTP/LAN hosts without randomUUID", () => {
  let seed = 0;
  vi.stubGlobal("crypto", {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(++seed),
  });
  const recording = demo();
  syncDemoCaster(recording, 0, null);
  const firstScope = state().context!.server;
  state().renameTeam(1, "Local team");
  syncDemoCaster(recording, 0, null);
  expect(state().context!.server).toBe(firstScope);
  expect(displayTeamName(1, "Storm")).toBe("Local team");
  syncDemoCaster(demo(), 0, null);
  expect(state().context!.server).not.toBe(firstScope);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
});

it("leaves live caster settings alone during live snapshot publication", () => {
  state().activate("example:28000", "3", "Katabatic");
  state().renameTeam(1, "Live team");
  const previous = state();
  syncDemoCaster({ source: "live" } as StreamRecording, 2.5, url);
  expect(state()).toBe(previous);
});

it("uses saved names, preserving explicit personal overrides even when they equal defaults", () => {
  const recording = demo();
  const game: DemoGame = {
    mission: "Katabatic",
    gameType: "CTF",
    startMs: 0,
    tournament: false,
    gameId: "game",
    presentationRevision: 1,
    title: "Final",
    teamNames: { 1: "Knights", 2: "Dragons" },
  };
  syncDemoCaster(recording, 0, url, [game]);
  expect(displayTeamName(1, "Storm")).toBe("Knights");
  expect(state().settings?.teamNames).toEqual({});
  state().renameTeam(1, "Storm");
  const updated = [
    { ...game, presentationRevision: 2, teamNames: { 1: "Wolves" } },
  ];
  syncDemoCaster(recording, 0, url, updated);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(state().settings?.teamNames).toEqual({ 1: "Storm" });
  state().renameTeam(1, "");
  expect(displayTeamName(1, "Storm")).toBe("Wolves");
});

it("matches saved metadata to the displayed mission through debrief and backward seeks", () => {
  const recording = demo();
  const games: DemoGame[] = [
    {
      mission: "Katabatic",
      gameType: "CTF",
      startMs: 0,
      tournament: false,
      title: "First",
      teamNames: { 1: "Knights" },
    },
    {
      mission: "Katabatic",
      gameType: "CTF",
      startMs: 90_000,
      tournament: false,
      title: "Rematch",
      teamNames: { 1: "Wolves" },
    },
  ];
  syncDemoCaster(recording, 5, url, games);
  expect(state().publishedGame?.presentation.title).toBe("First");
  state().renameTeam(1, "My team");
  // The next Phase1 is recorded at 90s, but the displayed mission marker
  // stays at 5s while the old game's debrief is on screen.
  syncDemoCaster(recording, 5, url, games);
  expect(displayTeamName(1)).toBe("My team");
  syncDemoCaster(recording, 100, url, games);
  expect(state().publishedGame?.presentation.title).toBe("Rematch");
  expect(displayTeamName(1)).toBe("Wolves");
  syncDemoCaster(recording, 5, url, games);
  expect(state().publishedGame?.presentation.title).toBe("First");
  expect(displayTeamName(1)).toBe("My team");
});

it("applies late metadata without publishing store updates on every playback tick", () => {
  const recording = demo();
  syncDemoCaster(recording, 0, url);
  const games: DemoGame[] = [
    {
      mission: "Katabatic",
      gameType: "CTF",
      startMs: 0,
      tournament: false,
      teamNames: { 1: "Knights" },
    },
  ];
  syncDemoCaster(recording, 0, url, games);
  expect(displayTeamName(1)).toBe("Knights");
  const notify = vi.fn();
  const unsubscribe = casterStore.subscribe(notify);
  syncDemoCaster(recording, 0, url, games);
  syncDemoCaster(recording, 0, url, games);
  unsubscribe();
  expect(notify).not.toHaveBeenCalled();
  syncDemoCaster(recording, 0, url);
  expect(state().publishedGame).toBeNull();
  expect(displayTeamName(1, "Storm")).toBe("Storm");
});
