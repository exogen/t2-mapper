import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsProvider, useDebug, useSettings } from "./SettingsProvider";
import { cameraTourStore } from "../state/cameraTourStore";
import type { AppMode } from "./useQueryParams";
import type { DataSource } from "../state/gameEntityStore";

const hooks = vi.hoisted(() => ({
  states: [] as {
    value: unknown;
    set: (value: unknown) => void;
  }[],
  refs: [] as { current: unknown }[],
  effects: [] as {
    deps?: readonly unknown[];
    cleanup?: () => void;
  }[],
  pending: [] as (() => void)[],
  stateIndex: 0,
  refIndex: 0,
  effectIndex: 0,
  mode: "map" as AppMode,
  dataSource: null as DataSource | null,
  fogOverride: null as boolean | null,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = hooks.stateIndex++;
    const state = (hooks.states[index] ??= {
      value: typeof initial === "function" ? initial() : initial,
      set: (value: unknown) => {
        state.value = typeof value === "function" ? value(state.value) : value;
      },
    });
    return [state.value, state.set];
  },
  useRef: (current: unknown) => (hooks.refs[hooks.refIndex++] ??= { current }),
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void | (() => void), deps: readonly unknown[]) => {
    const slot = (hooks.effects[hooks.effectIndex++] ??= {});
    if (
      !slot.deps ||
      deps.some((value, index) => !Object.is(value, slot.deps![index]))
    ) {
      hooks.pending.push(() => {
        slot.cleanup?.();
        slot.cleanup = effect() || undefined;
      });
    }
    slot.deps = deps;
  },
}));
vi.mock("./useQueryParams", () => ({
  useModeQueryState: () => [hooks.mode],
  useFogQueryState: () => [
    hooks.fogOverride,
    (value: boolean | null) => {
      hooks.fogOverride = value;
    },
  ],
}));
vi.mock("./useTouchDevice", () => ({ useTouchDevice: () => false }));
vi.mock("./audioPlaybackRate", () => ({ setAdjustAudioSpeedFlag() {} }));
vi.mock("../state/gameEntityStore", () => ({
  useDataSource: () => hooks.dataSource,
}));

function render() {
  hooks.stateIndex = hooks.refIndex = hooks.effectIndex = 0;
  const tree = SettingsProvider({ children: null });
  const settings = tree.props.value as ReturnType<typeof useSettings>;
  const debug = tree.props.children.props.value as ReturnType<typeof useDebug>;
  for (const effect of hooks.pending.splice(0)) effect();
  return { settings, debug };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify({ debugMode: true, fogEnabled: false }),
    setItem: vi.fn(),
  });
  hooks.states = [];
  hooks.refs = [];
  hooks.effects = [];
  hooks.pending = [];
  hooks.mode = "map";
  hooks.dataSource = null;
  hooks.fogOverride = null;
  cameraTourStore.getState().cancel();
});

afterEach(() => {
  for (const effect of hooks.effects) effect.cleanup?.();
  cameraTourStore.getState().cancel();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each<AppMode>(["map", "demo", "live"])(
  "allows all three features in development %s mode",
  (mode) => {
    vi.stubEnv("NODE_ENV", "development");
    hooks.mode = mode;
    hooks.dataSource = mode;
    render();
    const { settings, debug } = render();
    expect(debug.canShowDebugVisuals).toBe(true);
    expect(debug.canShowEntityList).toBe(true);
    expect(debug.debugMode).toBe(true);
    expect(settings.canDisableFog).toBe(true);
    expect(settings.fogEnabled).toBe(false);
  },
);

it("keeps both persisted debug visuals and disabled fog working in production map mode", () => {
  render();
  const { settings, debug } = render();
  expect(debug.canShowDebugVisuals).toBe(true);
  expect(debug.canShowEntityList).toBe(true);
  expect(debug.debugMode).toBe(true);
  expect(settings.canDisableFog).toBe(true);
  expect(settings.fogEnabled).toBe(false);
  debug.setDebugMode(false);
  settings.setFogEnabled(true);
  const next = render();
  expect(next.debug.debugMode).toBe(false);
  expect(next.settings.fogEnabled).toBe(true);
});

it("blocks debug features while allowing the fog URL override in production demo mode", () => {
  hooks.mode = "demo";
  hooks.fogOverride = false;
  render();
  const { settings, debug } = render();
  expect(debug.canShowDebugVisuals).toBe(false);
  expect(debug.canShowEntityList).toBe(false);
  expect(debug.debugMode).toBe(false);
  expect(settings.canDisableFog).toBe(true);
  expect(settings.fogEnabled).toBe(false);
});

it("forces fog on in production live mode despite preferences, URL overrides, and setters", () => {
  hooks.mode = "live";
  hooks.fogOverride = false;
  render();
  const { settings, debug } = render();
  expect(debug.canShowDebugVisuals).toBe(false);
  expect(debug.canShowEntityList).toBe(false);
  expect(settings.canDisableFog).toBe(false);
  expect(settings.fogEnabled).toBe(true);
  settings.setFogEnabled(false);
  debug.setDebugMode(true);
  const next = render();
  expect(next.settings.fogEnabled).toBe(true);
  expect(next.debug.debugMode).toBe(false);
});

it("reapplies restrictions during navigation and preserves the underlying map preferences", () => {
  render();
  render();
  hooks.mode = "live";
  hooks.dataSource = "map";
  expect(render().settings.fogEnabled).toBe(true);
  hooks.mode = "map";
  hooks.dataSource = "live";
  expect(render().settings.fogEnabled).toBe(true);
  hooks.dataSource = "demo";
  const demo = render();
  expect(demo.debug.debugMode).toBe(false);
  expect(demo.debug.canShowEntityList).toBe(false);
  expect(demo.settings.fogEnabled).toBe(false);
  hooks.dataSource = "map";
  const map = render();
  expect(map.debug.debugMode).toBe(true);
  expect(map.settings.fogEnabled).toBe(false);
  vi.advanceTimersByTime(1000);
  const saved = JSON.parse(vi.mocked(localStorage.setItem).mock.lastCall![1]);
  expect(saved.debugMode).toBe(true);
  expect(saved.fogEnabled).toBe(false);
});

it("cancels entity-list tours when switching to production demo mode", () => {
  render();
  cameraTourStore.getState().flyTo(
    {
      entityId: "test",
      label: "Test",
      position: [0, 0, 0],
    },
    "debug",
  );
  hooks.mode = "demo";
  render();
  expect(cameraTourStore.getState().animation).toBeNull();
});

it("preserves ordinary map tours when applying the debug restriction", () => {
  render();
  cameraTourStore.getState().flyTo({
    entityId: "test",
    label: "Test",
    position: [0, 0, 0],
  });
  hooks.mode = "demo";
  render();
  expect(cameraTourStore.getState().animation?.tourType).toBe("feature");
});
