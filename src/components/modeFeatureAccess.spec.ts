import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { applyModeFeatureAccess } from "./modeFeatureAccess";
import type { AppMode } from "./useQueryParams";
import { cameraTourStore } from "../state/cameraTourStore";
import {
  createSettingsStore,
  selectDebugMode,
  selectFogEnabled,
  setPreference,
  type SettingsStore,
} from "../state/settingsStore";

let store: SettingsStore;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify({ debugMode: true, fogEnabled: false }),
    setItem: vi.fn(),
  });
  store = createSettingsStore();
  cameraTourStore.getState().cancel();
});

afterEach(() => {
  cameraTourStore.getState().cancel();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const effective = () => ({
  ...store.getState().access,
  debugMode: selectDebugMode(store.getState()),
  fogEnabled: selectFogEnabled(store.getState()),
});

it.each<AppMode>(["map", "demo", "live"])(
  "allows all three features in development %s mode",
  (mode) => {
    vi.stubEnv("NODE_ENV", "development");
    applyModeFeatureAccess(mode, mode, null, store);
    expect(effective()).toEqual({
      canShowDebugVisuals: true,
      canShowEntityList: true,
      canDisableFog: true,
      debugMode: true,
      fogEnabled: false,
    });
  },
);

it("keeps both persisted debug visuals and disabled fog working in production map mode", () => {
  applyModeFeatureAccess("map", null, null, store);
  expect(effective()).toEqual({
    canShowDebugVisuals: true,
    canShowEntityList: true,
    canDisableFog: true,
    debugMode: true,
    fogEnabled: false,
  });
  setPreference("debugMode", false, store);
  setPreference("fogEnabled", true, store);
  expect(effective().debugMode).toBe(false);
  expect(effective().fogEnabled).toBe(true);
});

it("blocks debug features while allowing the fog URL override in production demo mode", () => {
  applyModeFeatureAccess("demo", null, false, store);
  expect(effective()).toEqual({
    canShowDebugVisuals: false,
    canShowEntityList: false,
    canDisableFog: true,
    debugMode: false,
    fogEnabled: false,
  });
});

it("forces fog on in production live mode despite preferences, URL overrides, and setters", () => {
  applyModeFeatureAccess("live", null, false, store);
  expect(effective().canDisableFog).toBe(false);
  expect(effective().fogEnabled).toBe(true);
  setPreference("fogEnabled", false, store);
  setPreference("debugMode", true, store);
  expect(effective().fogEnabled).toBe(true);
  expect(effective().debugMode).toBe(false);
});

it("reapplies restrictions during navigation and preserves the underlying map preferences", () => {
  applyModeFeatureAccess("live", "map", null, store);
  expect(effective().fogEnabled).toBe(true);
  applyModeFeatureAccess("map", "live", null, store);
  expect(effective().fogEnabled).toBe(true);
  applyModeFeatureAccess("map", "demo", null, store);
  expect(effective().debugMode).toBe(false);
  expect(effective().canShowEntityList).toBe(false);
  expect(effective().fogEnabled).toBe(false);
  applyModeFeatureAccess("map", "map", null, store);
  expect(effective().debugMode).toBe(true);
  expect(effective().fogEnabled).toBe(false);
  expect(store.getState().debugMode).toBe(true);
  expect(store.getState().fogEnabled).toBe(false);
});

it("cancels entity-list tours when switching to production demo mode", () => {
  applyModeFeatureAccess("map", null, null, store);
  cameraTourStore
    .getState()
    .flyTo({ entityId: "test", label: "Test", position: [0, 0, 0] }, "debug");
  applyModeFeatureAccess("demo", null, null, store);
  expect(cameraTourStore.getState().animation).toBeNull();
});

it("preserves ordinary map tours when applying the debug restriction", () => {
  applyModeFeatureAccess("map", null, null, store);
  cameraTourStore
    .getState()
    .flyTo({ entityId: "test", label: "Test", position: [0, 0, 0] });
  applyModeFeatureAccess("demo", null, null, store);
  expect(cameraTourStore.getState().animation?.tourType).toBe("feature");
});
