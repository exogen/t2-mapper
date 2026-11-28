import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearFogEnabledOverride,
  createSettingsStore,
  DEFAULT_RESOURCE_LOOKAHEAD_MS,
  MAX_RESOURCE_LOOKAHEAD_MS,
  selectDebugMode,
  selectFogEnabled,
  setPreference,
  updateHudPreference,
  type HudPosition,
  type SettingsStore,
} from "./settingsStore";
import {
  DEFAULT_PLAYER_INTERPOLATION,
  RETAIL_PLAYER_INTERPOLATION,
} from "../stream/playerInterpolation";

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

it.each([
  ["iPhone", false],
  ["Mozilla/5.0 (Macintosh) Version/27.0.1 Safari/605.1.15", false],
  ["Desktop", true],
] as const)(
  "defaults HD textures for %s and remembers an override",
  (userAgent, expected) => {
    vi.stubGlobal("navigator", { userAgent, hardwareConcurrency: 8 });
    stubSaved({ hdTexturesEnabled: "invalid" });
    const store = createSettingsStore();
    expect(store.getState()).toMatchObject({
      hdTexturesEnabled: expected,
      hdTexturesDefaultEnabled: expected,
    });
    const onReload = vi.fn(() =>
      expect(lastSaved().hdTexturesEnabled).toBe(!expected),
    );
    store.subscribe((state) => state.hdTexturesEnabled, onReload);
    setPreference("hdTexturesEnabled", !expected, store);
    expect(onReload).toHaveBeenCalledOnce();
    stubSaved(lastSaved());
    expect(createSettingsStore().getState()).toMatchObject({
      hdTexturesEnabled: !expected,
      hdTexturesDefaultEnabled: expected,
    });
  },
);

it("keeps the HD texture default automatic when another preference is saved", () => {
  vi.stubGlobal("navigator", { userAgent: "Desktop", hardwareConcurrency: 8 });
  const store = createSettingsStore();
  setPreference("invertLookY", true, store);
  vi.advanceTimersByTime(500);
  expect(lastSaved()).not.toHaveProperty("hdTexturesEnabled");
  stubSaved(lastSaved());
  vi.stubGlobal("navigator", { userAgent: "iPhone" });
  expect(createSettingsStore().getState()).toMatchObject({
    hdTexturesEnabled: false,
    invertLookY: true,
  });
});

it("restores the earlier HD texture preference and gives the current key priority", () => {
  stubSaved({ useHdTexturePack: false });
  expect(createSettingsStore().getState().hdTexturesEnabled).toBe(false);
  stubSaved({ useHdTexturePack: false, hdTexturesEnabled: true });
  expect(createSettingsStore().getState().hdTexturesEnabled).toBe(true);
});

it("defaults to normal vertical look and restores the saved inversion", () => {
  const store = createSettingsStore();
  expect(store.getState().invertLookY).toBe(false);
  setPreference("invertLookY", true, store);
  vi.advanceTimersByTime(500);
  expect(lastSaved().invertLookY).toBe(true);
  stubSaved(lastSaved());
  expect(createSettingsStore().getState().invertLookY).toBe(true);
});

it("remembers clip recording help alongside the other preferences", () => {
  const store = createSettingsStore();
  expect(store.getState().hasSeenClipRecordingHelp).toBe(false);
  setPreference("hasSeenClipRecordingHelp", true, store);
  expect(store.getState().hasSeenClipRecordingHelp).toBe(true);
  vi.advanceTimersByTime(500);
  expect(lastSaved().hasSeenClipRecordingHelp).toBe(true);
  stubSaved(lastSaved());
  expect(createSettingsStore().getState().hasSeenClipRecordingHelp).toBe(true);
});

it.each([true, false])("restores the clip recording help flag %s", (value) => {
  stubSaved({ hasSeenClipRecordingHelp: value });
  expect(createSettingsStore().getState().hasSeenClipRecordingHelp).toBe(value);
});

it.each([null, 1, "true", {}])(
  "ignores the invalid clip recording help flag %j",
  (value) => {
    stubSaved({ hasSeenClipRecordingHelp: value });
    expect(createSettingsStore().getState().hasSeenClipRecordingHelp).toBe(
      false,
    );
  },
);

it("remembers whether paused demos pause clip recording", () => {
  const store = createSettingsStore();
  expect(store.getState().pauseClipRecordingWhenDemoPaused).toBe(true);
  setPreference("pauseClipRecordingWhenDemoPaused", false, store);
  vi.advanceTimersByTime(500);
  expect(lastSaved().pauseClipRecordingWhenDemoPaused).toBe(false);
  stubSaved(lastSaved());
  const restored = createSettingsStore();
  expect(restored.getState().pauseClipRecordingWhenDemoPaused).toBe(false);
  setPreference("pauseClipRecordingWhenDemoPaused", true, restored);
  vi.advanceTimersByTime(500);
  expect(lastSaved().pauseClipRecordingWhenDemoPaused).toBe(true);

  stubSaved({ pauseClipRecordingWhenDemoPaused: "true" });
  expect(
    createSettingsStore().getState().pauseClipRecordingWhenDemoPaused,
  ).toBe(true);
});

it("retains the aim correction preference and drops the old smoothing flag on save", () => {
  stubSaved({ aimCorrection: false, aimSmoothing: true });
  const store = createSettingsStore();
  expect(store.getState().aimCorrection).toBe(false);
  setPreference("aimCorrection", true, store);
  vi.advanceTimersByTime(500);
  expect(lastSaved().aimCorrection).toBe(true);
  expect(lastSaved()).not.toHaveProperty("aimSmoothing");
});

it.each([0, 2_125.5])(
  "saves and restores a local CastGenius lookahead of %s ms",
  (lookaheadMs) => {
    const store = createSettingsStore();
    expect(store.getState().localCastLookaheadMs).toBeNull();
    setPreference("localCastLookaheadMs", lookaheadMs, store);
    vi.advanceTimersByTime(500);
    stubSaved(lastSaved());
    const restored = createSettingsStore();
    expect(restored.getState().localCastLookaheadMs).toBe(lookaheadMs);

    setPreference("localCastLookaheadMs", null, restored);
    vi.advanceTimersByTime(500);
    stubSaved(lastSaved());
    expect(createSettingsStore().getState().localCastLookaheadMs).toBeNull();
  },
);

it.each([-1, "2000", true, {}])(
  "ignores an invalid saved local CastGenius lookahead %j",
  (lookaheadMs) => {
    stubSaved({ localCastLookaheadMs: lookaheadMs });
    expect(createSettingsStore().getState().localCastLookaheadMs).toBeNull();
  },
);

it.each([0, 12_500, MAX_RESOURCE_LOOKAHEAD_MS])(
  "saves and restores a resource lookahead of %s ms",
  (lookaheadMs) => {
    const store = createSettingsStore();
    expect(store.getState().resourceLookaheadMs).toBe(
      DEFAULT_RESOURCE_LOOKAHEAD_MS,
    );
    setPreference("resourceLookaheadMs", lookaheadMs, store);
    vi.advanceTimersByTime(500);
    stubSaved(lastSaved());
    expect(createSettingsStore().getState().resourceLookaheadMs).toBe(
      lookaheadMs,
    );
  },
);

it.each([-1, 0.5, MAX_RESOURCE_LOOKAHEAD_MS + 1, "5000", true, {}])(
  "ignores an invalid saved resource lookahead %j",
  (lookaheadMs) => {
    stubSaved({ resourceLookaheadMs: lookaheadMs });
    expect(createSettingsStore().getState().resourceLookaheadMs).toBe(
      DEFAULT_RESOURCE_LOOKAHEAD_MS,
    );
  },
);

it("persists followed team IFF separately for each view mode", () => {
  const store = createSettingsStore();
  expect(store.getState()).toMatchObject({
    followTeamIff: false,
    firstPersonTeamIff: false,
  });
  setPreference("followTeamIff", true, store);
  vi.advanceTimersByTime(500);
  stubSaved(lastSaved());
  const restored = createSettingsStore();
  expect(restored.getState()).toMatchObject({
    followTeamIff: true,
    firstPersonTeamIff: false,
  });
  setPreference("firstPersonTeamIff", true, restored);
  vi.advanceTimersByTime(500);
  stubSaved(lastSaved());
  expect(createSettingsStore().getState()).toMatchObject({
    followTeamIff: true,
    firstPersonTeamIff: true,
  });
});

it("rejects inherited keys as saved observer palettes", () => {
  stubSaved({ observerTeamColors: "toString" });
  expect(createSettingsStore().getState().observerTeamColors).toBe(
    "blueOrange",
  );
});

it("defaults to matching flag teams and persists the possession choice", () => {
  const store = createSettingsStore();
  expect(store.getState().flagColorMode).toBe("matchTeam");
  setPreference("flagColorMode", "possession", store);
  vi.advanceTimersByTime(500);
  stubSaved(lastSaved());
  expect(createSettingsStore().getState().flagColorMode).toBe("possession");
});

it("ignores an unknown saved flag color mode", () => {
  stubSaved({ flagColorMode: "observer" });
  expect(createSettingsStore().getState().flagColorMode).toBe("matchTeam");
});

it.each(["holdPosition", "delay"] as const)(
  "saves and restores the flag return camera choice %s",
  (value) => {
    const store = createSettingsStore();
    expect(store.getState().flagReturnCamera).toBe("followHome");
    setPreference("flagReturnCamera", value, store);
    vi.advanceTimersByTime(500);
    stubSaved(lastSaved());
    expect(createSettingsStore().getState().flagReturnCamera).toBe(value);
  },
);

it("follows the flag home when its saved camera choice is invalid", () => {
  stubSaved({ flagReturnCamera: "hold" });
  expect(createSettingsStore().getState().flagReturnCamera).toBe("followHome");
});

it("defaults to the existing IFF distance and restores the slider value", () => {
  const store = createSettingsStore();
  expect(store.getState().iffMaxDistance).toBe(150);
  setPreference("iffMaxDistance", 400, store);
  vi.advanceTimersByTime(500);
  stubSaved(lastSaved());
  expect(createSettingsStore().getState().iffMaxDistance).toBe(400);
});

it.each([
  [40, 50],
  [420, 400],
  [425, 450],
  [1200, 1000],
  ["500", 150],
])("restores saved IFF distance %s as %s", (value, expected) => {
  stubSaved({ iffMaxDistance: value });
  expect(createSettingsStore().getState().iffMaxDistance).toBe(expected);
});

it("defaults to the tuned interpolation and persists the selected settings", () => {
  const store = createSettingsStore();
  expect(store.getState().playerInterpolation).toEqual({
    maxLatencyTicks: 0,
    maxPredictionTicks: 30,
    maxWarpTicks: 2,
    minWarpTicks: 0,
  });
  const next = {
    maxLatencyTicks: 1.5,
    maxPredictionTicks: 4,
    maxWarpTicks: 1,
    minWarpTicks: 0.25,
  };
  setPreference("playerInterpolation", next, store);
  vi.advanceTimersByTime(500);
  expect(lastSaved().playerInterpolationOverride).toEqual(next);
  stubSaved(lastSaved());
  expect(createSettingsStore().getState().playerInterpolation).toEqual(next);
});

it("upgrades the previous implicit defaults and remembers an explicit retail override", () => {
  stubSaved({ playerInterpolation: RETAIL_PLAYER_INTERPOLATION });
  const store = createSettingsStore();
  expect(store.getState().playerInterpolation).toBe(
    DEFAULT_PLAYER_INTERPOLATION,
  );
  setPreference("playerInterpolation", RETAIL_PLAYER_INTERPOLATION, store);
  vi.advanceTimersByTime(500);
  stubSaved(lastSaved());
  expect(createSettingsStore().getState().playerInterpolation).toEqual(
    RETAIL_PLAYER_INTERPOLATION,
  );
  setPreference("playerInterpolation", DEFAULT_PLAYER_INTERPOLATION, store);
  vi.advanceTimersByTime(500);
  expect(lastSaved()).not.toHaveProperty("playerInterpolationOverride");
  expect(lastSaved()).not.toHaveProperty("playerInterpolation");
});

it("restores safe values for invalid or partial player interpolation settings", () => {
  stubSaved({
    playerInterpolation: {
      maxLatencyTicks: 1.4,
      maxPredictionTicks: "20",
      maxWarpTicks: 0,
      minWarpTicks: 2.8,
    },
  });
  expect(createSettingsStore().getState().playerInterpolation).toEqual({
    maxLatencyTicks: 1.4,
    maxPredictionTicks: 30,
    maxWarpTicks: 1,
    minWarpTicks: 2.8,
  });
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

it.each([
  [180, 150],
  [140, 140],
])("restores saved FOV %s as %s", (fov, expected) => {
  stubSaved({ fov });
  expect(createSettingsStore().getState().fov).toBe(expected);
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

it.each([
  [0.305239898989899, 0.31],
  [0.37373737373737376, 0.37],
  [0.001, 0.01],
  [0.15, 0.15],
])(
  "restores saved fly speed %s to the controls' percentage step %s",
  (saved, expected) => {
    stubSaved({ speedMultiplier: saved });
    expect(createSettingsStore().getState().speedMultiplier).toBe(expected);
  },
);

it("leaves the sidebar closed until the touch check restores it", () => {
  stubSaved({ sidebarOpen: true });
  expect(createSettingsStore().getState().sidebarOpen).toBe(false);
});

it("defaults to normal Quick Cam recall and remembers detaching on repeat", () => {
  const store = createSettingsStore();
  expect(store.getState().quickCamDetachOnRecall).toBe(false);
  setPreference("quickCamDetachOnRecall", true, store);
  vi.advanceTimersByTime(500);
  stubSaved(lastSaved());
  expect(createSettingsStore().getState().quickCamDetachOnRecall).toBe(true);
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
