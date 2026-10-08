import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  SettingsProvider,
  useDebug,
  useSettings,
  type HudPosition,
} from "./SettingsProvider";
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

it("defaults to showing the classic Match HUD and persists its preferences independently of mini scores", () => {
  render();
  const { settings } = render();
  expect(settings.matchHudStyle).toBe("classic");
  expect(settings.showMatchHud).toBe(true);
  settings.setMatchHudStyle("broadcast");
  settings.setShowMatchHud(false);
  const next = render().settings;
  expect(next.matchHudStyle).toBe("broadcast");
  expect(next.showMatchHud).toBe(false);
  expect(next.showScoreHud).toBe(false);
  expect(next.scoreHudPosition).toBe("left");
  vi.advanceTimersByTime(1000);
  const saved = JSON.parse(vi.mocked(localStorage.setItem).mock.lastCall![1]);
  expect(saved.matchHudStyle).toBe("broadcast");
  expect(saved.showMatchHud).toBe(false);
});

it("restores a hidden Broadcast Match HUD without losing its style", () => {
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({ showMatchHud: false, matchHudStyle: "broadcast" }),
    setItem: vi.fn(),
  });
  render();
  const { settings } = render();
  expect(settings.matchHudStyle).toBe("broadcast");
  expect(settings.showMatchHud).toBe(false);
});

it("defaults to Classic scores and persists Competition independently of the HUD layout", () => {
  render();
  const { settings } = render();
  expect(settings.scoreStyle).toBe("classic");
  settings.setScoreStyle("competition");
  const next = render().settings;
  expect(next.scoreStyle).toBe("competition");
  expect(next.matchHudStyle).toBe("classic");
  vi.advanceTimersByTime(1000);
  const saved = JSON.parse(vi.mocked(localStorage.setItem).mock.lastCall![1]);
  expect(saved.scoreStyle).toBe("competition");
});

it("restores the Competition score preference", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => JSON.stringify({ scoreStyle: "competition" }),
    setItem: vi.fn(),
  });
  render();
  expect(render().settings.scoreStyle).toBe("competition");
});

it("defaults to showing unassigned quick cam slots and persists hiding them across modes", () => {
  render();
  const { settings } = render();
  expect(settings.quickCamHideUnassignedSlots).toBe(false);
  settings.setQuickCamHideUnassignedSlots(true);
  for (const mode of ["live", "demo", "map"] as const) {
    hooks.mode = mode;
    hooks.dataSource = mode;
    expect(render().settings.quickCamHideUnassignedSlots).toBe(true);
  }
  vi.advanceTimersByTime(1000);
  const saved = JSON.parse(vi.mocked(localStorage.setItem).mock.lastCall![1]);
  expect(saved.quickCamHideUnassignedSlots).toBe(true);
});

it.each([true, false])(
  "restores the global hide-unassigned preference %s",
  (value) => {
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify({ quickCamHideUnassignedSlots: value }),
      setItem: vi.fn(),
    });
    render();
    expect(render().settings.quickCamHideUnassignedSlots).toBe(value);
  },
);

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
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(saved),
      setItem: vi.fn(),
    });
    render();
    const { settings } = render();
    expect(settings.scoreHudPosition).toBe(position);
    expect(settings.showScoreHud).toBe(enabled);
    expect(settings.quickCamHudPosition).toBe("left");
    expect(settings.showQuickCamHud).toBe(false);
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
    vi.stubGlobal("localStorage", {
      getItem: () => JSON.stringify(saved),
      setItem: vi.fn(),
    });
    render();
    const { settings } = render();
    expect(settings.quickCamHudPosition).toBe(position);
    expect(settings.showQuickCamHud).toBe(enabled);
  },
);

it.each<HudPosition>(["left", "right"])(
  "gives the most recently selected HUD the %s position and persists both choices",
  (position) => {
    render();
    let { settings } = render();
    settings.setScoreHudPosition(position);
    settings.setQuickCamHudPosition(position);
    settings = render().settings;
    expect(settings.showScoreHud).toBe(false);
    expect(settings.showQuickCamHud).toBe(false);
    settings.setShowScoreHud(true);
    settings.setShowQuickCamHud(true);
    settings = render().settings;
    expect(settings.showScoreHud).toBe(false);
    expect(settings.showQuickCamHud).toBe(true);
    expect(settings.scoreHudPosition).toBe(position);
    expect(settings.quickCamHudPosition).toBe(position);

    settings.setShowScoreHud(true);
    settings = render().settings;
    expect(settings.scoreHudPosition).toBe(position);
    expect(settings.showScoreHud).toBe(true);
    expect(settings.showQuickCamHud).toBe(false);

    const opposite = position === "left" ? "right" : "left";
    settings.setQuickCamHudPosition(opposite);
    settings.setShowQuickCamHud(true);
    settings = render().settings;
    expect(settings.scoreHudPosition).toBe(position);
    expect(settings.quickCamHudPosition).toBe(opposite);
    vi.advanceTimersByTime(500);
    const saved = JSON.parse(vi.mocked(localStorage.setItem).mock.lastCall![1]);
    expect(saved.scoreHudPosition).toBe(position);
    expect(saved.quickCamHudPosition).toBe(opposite);
    expect(saved.showScoreHud).toBe(true);
    expect(saved.showQuickCamHud).toBe(true);

    settings.setShowQuickCamHud(false);
    settings = render().settings;
    expect(settings.scoreHudPosition).toBe(position);
    expect(settings.quickCamHudPosition).toBe(opposite);
    expect(settings.showQuickCamHud).toBe(false);
    settings.setShowQuickCamHud(true);
    settings = render().settings;
    expect(settings.quickCamHudPosition).toBe(opposite);
    expect(settings.showScoreHud).toBe(true);
    expect(settings.showQuickCamHud).toBe(true);

    settings.setQuickCamHudPosition(position);
    settings = render().settings;
    expect(settings.showScoreHud).toBe(false);
    expect(settings.scoreHudPosition).toBe(position);
    expect(settings.showQuickCamHud).toBe(true);
  },
);

it("restores both HUD positions and the mini score style", () => {
  vi.stubGlobal("localStorage", {
    getItem: () =>
      JSON.stringify({
        showScoreHud: true,
        showQuickCamHud: true,
        scoreHudPosition: "right",
        quickCamHudPosition: "left",
        scoreHudStyle: "transparent",
      }),
    setItem: vi.fn(),
  });
  render();
  const { settings } = render();
  expect(settings.scoreHudPosition).toBe("right");
  expect(settings.quickCamHudPosition).toBe("left");
  expect(settings.showScoreHud).toBe(true);
  expect(settings.showQuickCamHud).toBe(true);
  expect(settings.scoreHudStyle).toBe("transparent");
});
