import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StreamRecording } from "../stream/types";
import {
  casterStore,
  CASTER_STORAGE_KEY,
  displayTeamName,
} from "./casterStore";
import { syncDemoCaster } from "./demoCaster";

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
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(sessionStorage.getItem(CASTER_STORAGE_KEY)).toBeNull();
});

it("restores the active demo mission on reload and discards it when seeking to another mission", () => {
  const recording = demo();
  syncDemoCaster(recording, null, url);
  state().renameTeam(1, "First mission");
  const camera = {
    kind: "original",
    label: "Original view",
    fov: 90,
    followBehindPlayer: false,
  } as const;
  state().saveCamera(3, camera);
  state().suspend();
  syncDemoCaster(demo(), null, url);
  expect(displayTeamName(1, "Storm")).toBe("First mission");
  expect(state().settings?.quickCams[3]).toEqual(camera);
  syncDemoCaster(recording, 120, url);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(state().settings?.quickCams[3]).toBeUndefined();
  state().renameTeam(1, "Second mission");
  state().suspend();
  syncDemoCaster(demo(), 120, url);
  expect(displayTeamName(1, "Storm")).toBe("Second mission");
  syncDemoCaster(recording, null, url);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  expect(state().settings?.quickCams).toEqual({});
  expect(sessionStorage.getItem(CASTER_STORAGE_KEY)).toBeNull();
  syncDemoCaster(recording, 120, url);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
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
  syncDemoCaster(first, null, null);
  state().renameTeam(1, "Local team");
  syncDemoCaster(demo(), null, null);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  syncDemoCaster(demo(), null, url);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
  syncDemoCaster(first, null, null);
  expect(displayTeamName(1, "Storm")).toBe("Storm");
});

it("leaves live caster settings alone during live snapshot publication", () => {
  state().activate("example:28000", "3", "Katabatic");
  state().renameTeam(1, "Live team");
  const previous = state();
  syncDemoCaster({ source: "live" } as StreamRecording, 2.5, url);
  expect(state()).toBe(previous);
});
