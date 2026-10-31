import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearFogEnabledOverride,
  createSettingsStore,
  selectDebugMode,
  selectFogEnabled,
  setPreference,
  updateHudPreference,
  type HudPosition,
  type SettingsStore,
} from "./settingsStore";

function stubSaved(saved: object) {
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify(saved),
    setItem: vi.fn(),
  });
}

function lastSaved() {
  return JSON.parse(vi.mocked(localStorage.setItem).mock.lastCall![1]);
}

beforeEach(() => {
  vi.useFakeTimers();
  stubSaved({ debugMode: true, fogEnabled: false });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("defaults to showing the classic Match HUD and persists its preferences independently of mini scores", () => {
  const store = createSettingsStore();
  expect(store.getState().matchHudStyle).toBe("classic");
  expect(store.getState().showMatchHud).toBe(true);
  setPreference("matchHudStyle", "broadcast", store);
  setPreference("showMatchHud", false, store);
  const state = store.getState();
  expect(state.matchHudStyle).toBe("broadcast");
  expect(state.showMatchHud).toBe(false);
  expect(state.hudPreferences.score).toEqual({
    enabled: false,
    position: "left",
  });
  vi.advanceTimersByTime(1000);
  expect(lastSaved().matchHudStyle).toBe("broadcast");
  expect(lastSaved().showMatchHud).toBe(false);
});

it("debounces saves and writes only once preferences change", () => {
  const store = createSettingsStore();
  vi.advanceTimersByTime(1000);
  expect(localStorage.setItem).not.toHaveBeenCalled();
  setPreference("fov", 100, store);
  setPreference("fov", (fov) => fov + 5, store);
  vi.advanceTimersByTime(499);
  expect(localStorage.setItem).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  expect(lastSaved().fov).toBe(105);
  // Mode restrictions and URL overrides aren't preferences.
  store.setState({ fogEnabledOverride: true });
  vi.advanceTimersByTime(1000);
  expect(localStorage.setItem).toHaveBeenCalledTimes(1);
});

it("restores a hidden Broadcast Match HUD without losing its style", () => {
  stubSaved({ showMatchHud: false, matchHudStyle: "broadcast" });
  const state = createSettingsStore().getState();
  expect(state.matchHudStyle).toBe("broadcast");
  expect(state.showMatchHud).toBe(false);
});

it("defaults to Classic scores and persists Competition independently of the HUD layout", () => {
  const store = createSettingsStore();
  expect(store.getState().scoreStyle).toBe("classic");
  setPreference("scoreStyle", "competition", store);
  expect(store.getState().scoreStyle).toBe("competition");
  expect(store.getState().matchHudStyle).toBe("classic");
  vi.advanceTimersByTime(1000);
  expect(lastSaved().scoreStyle).toBe("competition");
});

it("restores the Competition score preference", () => {
  stubSaved({ scoreStyle: "competition" });
  expect(createSettingsStore().getState().scoreStyle).toBe("competition");
});

it("ignores invalid saved values", () => {
  stubSaved({
    scoreStyle: "fancy",
    renderScale: 0.3,
    fpsLimit: 29.5,
    speedMultiplier: 5,
    clickToCycle: "yes",
  });
  const state = createSettingsStore().getState();
  expect(state.scoreStyle).toBe("classic");
  expect(state.renderScale).toBe(1);
  expect(state.fpsLimit).toBeNull();
  expect(state.speedMultiplier).toBe(1);
  expect(state.clickToCycle).toBe(true);
});

it("leaves the sidebar closed until the touch check restores it", () => {
  stubSaved({ sidebarOpen: true });
  expect(createSettingsStore().getState().sidebarOpen).toBe(false);
});

it("defaults to showing unassigned quick cam slots and persists hiding them", () => {
  const store = createSettingsStore();
  expect(store.getState().quickCamHideUnassignedSlots).toBe(false);
  setPreference("quickCamHideUnassignedSlots", true, store);
  vi.advanceTimersByTime(1000);
  expect(lastSaved().quickCamHideUnassignedSlots).toBe(true);
});

it.each([true, false])(
  "restores the global hide-unassigned preference %s",
  (value) => {
    stubSaved({ quickCamHideUnassignedSlots: value });
    expect(createSettingsStore().getState().quickCamHideUnassignedSlots).toBe(
      value,
    );
  },
);

it("applies mode restrictions and the URL override without touching the preferences", () => {
  const store = createSettingsStore();
  expect(selectDebugMode(store.getState())).toBe(true);
  expect(selectFogEnabled(store.getState())).toBe(false);

  store.setState({
    access: {
      canDisableFog: false,
      canShowDebugVisuals: false,
      canShowEntityList: false,
    },
    fogEnabledOverride: false,
  });
  expect(selectDebugMode(store.getState())).toBe(false);
  expect(selectFogEnabled(store.getState())).toBe(true);
  setPreference("fogEnabled", false, store);
  setPreference("debugMode", true, store);
  expect(selectFogEnabled(store.getState())).toBe(true);
  expect(selectDebugMode(store.getState())).toBe(false);

  store.setState({
    access: {
      canDisableFog: true,
      canShowDebugVisuals: true,
      canShowEntityList: true,
    },
    fogEnabledOverride: true,
  });
  expect(selectFogEnabled(store.getState())).toBe(true);
  clearFogEnabledOverride(store);
  expect(selectFogEnabled(store.getState())).toBe(false);
  expect(selectDebugMode(store.getState())).toBe(true);
});

it.each([
  [{ showScoreHud: true }, "left", true],
  [{ showScoreHud: false, scoreHudStyle: "solid" }, "left", false],
  [{ scoreHudStyle: "transparent" }, "left", false],
  [{}, "left", false],
  [{ showScoreHud: true, scoreHudPosition: "right" }, "right", true],
  [{ scoreHudPosition: "right" }, "right", false],
  [{ showScoreHud: false, scoreHudPosition: "right" }, "right", false],
])(
  "restores mini score HUD preferences from %j as %s, enabled %s",
  (saved, position, enabled) => {
    stubSaved(saved);
    const { hudPreferences } = createSettingsStore().getState();
    expect(hudPreferences.score).toEqual({ position, enabled });
    expect(hudPreferences.quickCam).toEqual({
      position: "left",
      enabled: false,
    });
  },
);

it.each([
  [{}, "left", false],
  [{ showQuickCamHud: true }, "left", true],
  [{ quickCamHudPosition: "right" }, "right", false],
  [{ showQuickCamHud: true, quickCamHudPosition: "right" }, "right", true],
  [{ showQuickCamHud: false, quickCamHudPosition: "right" }, "right", false],
])(
  "restores quick cam HUD preferences from %j as %s, enabled %s",
  (saved, position, enabled) => {
    stubSaved(saved);
    expect(createSettingsStore().getState().hudPreferences.quickCam).toEqual({
      position,
      enabled,
    });
  },
);

it.each<HudPosition>(["left", "right"])(
  "gives the most recently selected HUD the %s position and persists both choices",
  (position) => {
    const store: SettingsStore = createSettingsStore();
    const huds = () => store.getState().hudPreferences;
    updateHudPreference("score", { position }, store);
    updateHudPreference("quickCam", { position }, store);
    expect(huds().score.enabled).toBe(false);
    expect(huds().quickCam.enabled).toBe(false);
    updateHudPreference("score", { enabled: true }, store);
    updateHudPreference("quickCam", { enabled: true }, store);
    expect(huds().score).toEqual({ position, enabled: false });
    expect(huds().quickCam).toEqual({ position, enabled: true });

    updateHudPreference("score", { enabled: true }, store);
    expect(huds().score).toEqual({ position, enabled: true });
    expect(huds().quickCam.enabled).toBe(false);

    const opposite = position === "left" ? "right" : "left";
    updateHudPreference("quickCam", { position: opposite }, store);
    updateHudPreference("quickCam", { enabled: true }, store);
    expect(huds().score.position).toBe(position);
    expect(huds().quickCam.position).toBe(opposite);
    vi.advanceTimersByTime(500);
    expect(lastSaved()).toMatchObject({
      scoreHudPosition: position,
      quickCamHudPosition: opposite,
      showScoreHud: true,
      showQuickCamHud: true,
    });

    updateHudPreference("quickCam", { enabled: false }, store);
    expect(huds().quickCam).toEqual({ position: opposite, enabled: false });
    updateHudPreference("quickCam", { enabled: true }, store);
    expect(huds().score.enabled).toBe(true);
    expect(huds().quickCam.enabled).toBe(true);

    updateHudPreference("quickCam", { position }, store);
    expect(huds().score).toEqual({ position, enabled: false });
    expect(huds().quickCam).toEqual({ position, enabled: true });
  },
);

it("restores both HUD positions and the mini score style", () => {
  stubSaved({
    showScoreHud: true,
    showQuickCamHud: true,
    scoreHudPosition: "right",
    quickCamHudPosition: "left",
    scoreHudStyle: "transparent",
  });
  const state = createSettingsStore().getState();
  expect(state.hudPreferences.score).toEqual({
    position: "right",
    enabled: true,
  });
  expect(state.hudPreferences.quickCam).toEqual({
    position: "left",
    enabled: true,
  });
  expect(state.scoreHudStyle).toBe("transparent");
});
