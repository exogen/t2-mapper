import {
  isValidElement,
  type DependencyList,
  type ReactElement,
  type ReactNode,
} from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GameEngine } from "../engine/gameEngine";
import { streamPlaybackStore } from "../state/streamPlaybackStore";
import { MobileCameraDrawer } from "./MobileCameraDrawer";
import { useMobileCameraActions } from "./useMobileCameraActions";
import styles from "./MobileCameraDrawer.module.css";

const fixture = vi.hoisted(() => ({
  owner: "input" as "input" | "commandCircuit" | "tour" | "director",
  touchMode: "moveLookStick" as "dualStick" | "moveLookStick",
  open: true,
  mounted: true,
  show: vi.fn(),
  hide: vi.fn(),
  refs: [] as { current: unknown }[],
  refIndex: 0,
  effectIndex: 0,
  effects: [] as {
    index: number;
    run: () => void | (() => void);
    deps?: DependencyList;
  }[],
  activeEffects: new Map<
    number,
    { deps?: DependencyList; cleanup?: () => void }
  >(),
  setInputState: vi.fn(),
  suppressMovement: vi.fn(),
  releaseMovement: vi.fn(),
  actions: {
    modes: [] as {
      id: string;
      label: string;
      active: boolean;
      enabled: boolean;
    }[],
    selectMode: vi.fn((_mode: string) => true),
    flags: [
      { slot: 1, teamId: 1, label: "Storm flag" },
      { slot: 2, teamId: 2, label: "Inferno flag" },
    ],
    canFollowFlags: true,
    followFlag: vi.fn(() => true),
    canCyclePlayers: true,
    previousPlayer: vi.fn(),
    nextPlayer: vi.fn(),
    canFindTarget: true,
    findTarget: vi.fn(),
    canSeek: true,
    rewind30: vi.fn(),
    rewind5: vi.fn(),
    forward5: vi.fn(),
    forward30: vi.fn(),
  },
}));

// Like TouchJoystick's Node tests, collect effects explicitly rather than
// relying on a DOM implementation. Browser checks cover Ariakit's focus trap.
vi.mock("react", async (original) => {
  const collectEffect = (
    run: () => void | (() => void),
    deps?: DependencyList,
  ) => {
    const index = fixture.effectIndex++;
    const previous = fixture.activeEffects.get(index);
    if (
      previous &&
      deps &&
      previous.deps?.length === deps.length &&
      deps.every((value, i) => Object.is(value, previous.deps![i]))
    ) {
      return;
    }
    fixture.effects.push({ index, run, deps });
  };
  return {
    ...(await original<typeof import("react")>()),
    useRef: (initial: unknown) =>
      (fixture.refs[fixture.refIndex++] ??= { current: initial }),
    useEffect: collectEffect,
    useLayoutEffect: collectEffect,
  };
});
vi.mock("@ariakit/react", () => ({
  Dialog: "dialog",
  DialogDismiss: "button",
  useDialogStore: () => fixture,
  useStoreState: (_store: unknown, key: "open" | "mounted") => fixture[key],
}));
vi.mock("react-icons/lu", () => ({
  LuChevronLeft: () => null,
  LuChevronRight: () => null,
}));
vi.mock("react-icons/io", () => ({ IoMdCloseCircle: () => null }));
vi.mock("react-icons/fa", () => ({ FaSearch: () => null }));
vi.mock("react-icons/md", () => ({
  MdFastForward: () => null,
  MdFastRewind: () => null,
}));
vi.mock("react-icons/pi", () => ({ PiFlagBannerFill: () => null }));
vi.mock("react-icons/tb", () => ({ TbDeviceGamepad2Filled: () => null }));
vi.mock("zustand", async (original) => ({
  ...(await original<typeof import("zustand")>()),
  useStore: (
    store: { getState(): unknown },
    selector: (state: unknown) => unknown,
  ) => selector(store.getState()),
}));
vi.mock("../state/cameraOwner", () => ({
  useCameraOwner: () => fixture.owner,
}));
vi.mock("./SettingsProvider", () => ({
  useControls: () => ({ touchMode: fixture.touchMode }),
}));
vi.mock("../state/inputControls", () => ({
  inputControlsStore: { setState: fixture.setInputState },
}));
vi.mock("../engine/suppressCameraMovement", () => ({
  suppressCameraMovement: fixture.suppressMovement,
}));
vi.mock("./useMobileCameraActions", () => ({
  useMobileCameraActions: vi.fn(() => fixture.actions),
}));

type Element = ReactElement<Record<string, any>>;

function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as Element;
  if (typeof element.type === "function") {
    const component = element.type as (props: Element["props"]) => ReactNode;
    return elements(component(element.props));
  }
  return [element, ...elements(element.props.children)];
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return isValidElement<{ children?: ReactNode }>(node)
    ? text(node.props.children)
    : "";
}

let engine: GameEngine;

function render(onOpenChange?: (open: boolean) => void) {
  fixture.effects = [];
  fixture.refIndex = 0;
  fixture.effectIndex = 0;
  const tree = elements(MobileCameraDrawer({ engine, onOpenChange }));
  // Commit effects belonging to removed children before flushing the parent's
  // new effects, matching React's cleanup order when the leave animation ends.
  for (const [index, effect] of fixture.activeEffects) {
    if (index < fixture.effectIndex) continue;
    effect.cleanup?.();
    fixture.activeEffects.delete(index);
  }
  if (fixture.refIndex === 0) fixture.refs = [];
  return {
    tree,
    button(label: string) {
      const button = tree.find(
        (element) =>
          element.type === "button" &&
          (element.props["aria-label"] ?? text(element.props.children)) ===
            label,
      );
      expect(button, `button ${label}`).toBeDefined();
      return button!;
    },
  };
}

function mountEffects() {
  for (const effect of fixture.effects.splice(0)) {
    fixture.activeEffects.get(effect.index)?.cleanup?.();
    const cleanup = effect.run();
    fixture.activeEffects.set(effect.index, {
      deps: effect.deps,
      cleanup: cleanup || undefined,
    });
  }
}

function unmount() {
  for (const effect of fixture.activeEffects.values()) effect.cleanup?.();
  fixture.activeEffects.clear();
  fixture.effects = [];
  fixture.refs = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  fixture.owner = "input";
  fixture.touchMode = "moveLookStick";
  fixture.open = true;
  fixture.mounted = true;
  fixture.refs = [];
  fixture.effects = [];
  fixture.suppressMovement.mockReturnValue(fixture.releaseMovement);
  fixture.show.mockImplementation(() => {
    fixture.open = fixture.mounted = true;
  });
  fixture.hide.mockImplementation(() => {
    fixture.open = false;
  });
  Object.assign(fixture.actions, {
    modes: [
      { id: "original", label: "Original view", active: false, enabled: true },
      { id: "freeFly", label: "Free-fly", active: false, enabled: true },
      { id: "orbitOverride", label: "Follow", active: true, enabled: true },
      {
        id: "firstPersonOverride",
        label: "First person",
        active: false,
        enabled: true,
      },
    ],
    canFollowFlags: true,
    flags: [
      { slot: 1, teamId: 1, label: "Storm flag" },
      { slot: 2, teamId: 2, label: "Inferno flag" },
    ],
    canCyclePlayers: true,
    canFindTarget: true,
    canSeek: true,
  });
  fixture.actions.selectMode.mockReset().mockReturnValue(true);
  fixture.actions.followFlag.mockReturnValue(true);
  streamPlaybackStore.setState({ followFlagSlot: null });
  engine = {} as GameEngine;
  vi.stubGlobal("document", {
    pointerLockElement: null,
    exitPointerLock: vi.fn(),
  });
});

afterEach(() => {
  unmount();
  vi.unstubAllGlobals();
});

it.each(["input", "commandCircuit"] as const)(
  "offers an accessible launcher without mounting modal input handling for %s",
  (owner) => {
    fixture.owner = owner;
    fixture.open = false;
    fixture.mounted = false;
    const { tree, button } = render();
    const launcher = button("Camera controls");
    expect(launcher.props["aria-haspopup"]).toBe("dialog");
    expect(launcher.props["aria-expanded"]).toBe(false);
    expect(tree.some((element) => element.type === "dialog")).toBe(false);
    expect(useMobileCameraActions).not.toHaveBeenCalled();
    mountEffects();
    expect(fixture.setInputState).not.toHaveBeenCalled();
    expect(fixture.suppressMovement).not.toHaveBeenCalled();
    launcher.props.onClick();
    expect(fixture.show).toHaveBeenCalledOnce();
  },
);

it.each(["tour", "director"] as const)(
  "does not offer manual camera controls while %s owns the camera",
  (owner) => {
    fixture.owner = owner;
    expect(render().tree).toHaveLength(0);
    expect(fixture.effects).toHaveLength(0);
  },
);

it.each(["dualStick", "moveLookStick"] as const)(
  "centers the launcher only for dual joysticks (%s)",
  (touchMode) => {
    fixture.touchMode = touchMode;
    const launcher = render().button("Camera controls");
    expect(launcher.props.className).toBe(
      touchMode === "dualStick"
        ? `${styles.Launcher} ${styles.LauncherCentered}`
        : styles.Launcher,
    );
  },
);

it("labels actual flag targets and their selected state", () => {
  streamPlaybackStore.setState({ followFlagSlot: 2 });
  const { tree, button } = render();
  const storm = button("Follow Storm flag");
  const inferno = button("Follow Inferno flag");
  expect(storm.props["aria-pressed"]).toBe(false);
  expect(inferno.props["aria-pressed"]).toBe(true);
  expect(text(storm)).toBe("Storm flag");
  expect(text(inferno)).toBe("Inferno flag");
  expect(button("Camera controls").props["aria-expanded"]).toBe(true);
  const dialog = tree.find((element) => element.type === "dialog")!;
  expect(dialog.props["aria-label"]).toBe("Camera controls");
  expect(dialog.props.finalFocus).toBe(button("Camera controls").props.ref);
  expect(dialog.props.store).toBe(fixture);
});

it("offers individual camera modes and marks the active choice", () => {
  const { button } = render();
  for (const mode of fixture.actions.modes) {
    const control = button(mode.label);
    expect(control.props["aria-pressed"]).toBe(mode.active);
    expect(control.props["data-active"]).toBe(mode.active);
    expect(control.props.disabled).toBe(false);
  }
  expect(button("Follow").props["aria-pressed"]).toBe(true);
});

it("omits camera modes that the action hook does not offer", () => {
  fixture.actions.modes = fixture.actions.modes.filter(
    (mode) => mode.id !== "original" && mode.id !== "firstPersonOverride",
  );
  const { tree, button } = render();
  const labels = tree
    .filter((element) => element.type === "button")
    .map((element) => text(element));
  expect(labels).not.toContain("Original view");
  expect(labels).not.toContain("First person");
  expect(button("Free-fly").props.disabled).toBe(false);
  expect(button("Follow").props.disabled).toBe(false);
});

it("places target search between player steps before flag controls", () => {
  const { tree, button } = render();
  const sections = tree
    .filter((element) => element.type === "section")
    .map((element) => element.props["aria-label"]);
  expect(sections).toEqual(["Camera mode", "Player cameras", "Flag cameras"]);
  const players = tree.find(
    (element) => element.props["aria-label"] === "Player cameras",
  )!;
  expect(
    elements(players.props.children)
      .filter((element) => element.type === "button")
      .map((element) => element.props["aria-label"] ?? text(element)),
  ).toEqual(["Previous player", "Select target", "Next player"]);
  const search = button("Select target");
  expect(search.props.title).toBe("Select target");
  expect(search.props["aria-haspopup"]).toBe("dialog");
  expect(search.props.disabled).toBe(false);
});

it("keeps the compact drawer labeled without visible section headings", () => {
  const { tree } = render();
  expect(
    tree.some(
      (element) =>
        (typeof element.type === "string" && /^h[1-6]$/.test(element.type)) ||
        element.props.role === "heading",
    ),
  ).toBe(false);
  expect(
    tree.some(
      (element) =>
        element.props.role === "group" &&
        element.props["aria-label"] === "Playback seeking",
    ),
  ).toBe(true);
  for (const label of ["Camera mode", "Flag cameras", "Player cameras"]) {
    expect(tree.some((element) => element.props["aria-label"] === label)).toBe(
      true,
    );
  }
});

it("focuses the opening dialog without scrolling the game view", () => {
  const dialog = render().tree.find((element) => element.type === "dialog")!;
  const focus = vi.fn();
  expect(dialog.props.autoFocusOnShow({ focus })).toBe(false);
  expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  expect(dialog.props.autoFocusOnShow(null)).toBe(false);
});

it("disables unavailable actions and omits unsupported flag cameras", () => {
  Object.assign(fixture.actions, {
    canFollowFlags: false,
    canCyclePlayers: false,
    canFindTarget: false,
    canSeek: false,
  });
  fixture.actions.modes.forEach((mode) => {
    mode.enabled = false;
  });
  const { tree, button } = render();
  for (const label of [
    "Original view",
    "Free-fly",
    "Follow",
    "First person",
    "Previous player",
    "Select target",
    "Next player",
    "Rewind 30 seconds",
    "Rewind 5 seconds",
    "Fast forward 5 seconds",
    "Fast forward 30 seconds",
  ]) {
    expect(button(label).props.disabled).toBe(true);
  }
  expect(
    tree.some((element) => element.props["aria-label"] === "Flag cameras"),
  ).toBe(false);
});

it("omits the flag section when no targets are in scope", () => {
  fixture.actions.flags = [];
  const { tree } = render();
  expect(
    tree.some((element) => element.props["aria-label"] === "Flag cameras"),
  ).toBe(false);
  expect(tree.some((element) => text(element) === "No flags in scope.")).toBe(
    false,
  );
});

it.each([
  ["Original view", "selectMode", "original"],
  ["Free-fly", "selectMode", "freeFly"],
  ["Follow", "selectMode", "orbitOverride"],
  ["First person", "selectMode", "firstPersonOverride"],
  ["Previous player", "previousPlayer", undefined],
  ["Select target", "findTarget", undefined],
  ["Next player", "nextPlayer", undefined],
] as const)(
  "dispatches %s after closing and releasing the input filter",
  (label, action, mode) => {
    const { button } = render();
    mountEffects();
    expect(fixture.suppressMovement).toHaveBeenCalledExactlyOnceWith(engine);
    button(label).props.onClick();
    expect(fixture.hide).toHaveBeenCalledOnce();
    expect(fixture.actions[action]).not.toHaveBeenCalled();

    const closing = render();
    mountEffects();
    expect(closing.tree.some((element) => element.type === "dialog")).toBe(
      true,
    );
    expect(fixture.releaseMovement).not.toHaveBeenCalled();
    expect(fixture.actions[action]).not.toHaveBeenCalled();

    fixture.mounted = false;
    render();
    mountEffects();
    expect(fixture.actions[action]).toHaveBeenCalledOnce();
    expect(fixture.actions[action].mock.calls).toEqual([mode ? [mode] : []]);
    expect(fixture.releaseMovement).toHaveBeenCalledOnce();
    expect(fixture.releaseMovement.mock.invocationCallOrder[0]).toBeLessThan(
      fixture.actions[action].mock.invocationCallOrder[0],
    );
  },
);

it.each(["source", "owner"] as const)(
  "cancels a pending selection when the drawer is removed by a %s change",
  (change) => {
    const { button } = render();
    mountEffects();
    button("Next player").props.onClick();
    if (change === "owner") {
      fixture.owner = "tour";
      render();
      mountEffects();
    } else {
      // The source/mission key remounts the complete drawer instance.
      unmount();
    }
    expect(fixture.releaseMovement).toHaveBeenCalledOnce();
    expect(fixture.actions.nextPlayer).not.toHaveBeenCalled();

    fixture.owner = "input";
    fixture.open = false;
    fixture.mounted = false;
    render();
    mountEffects();
    expect(fixture.actions.nextPlayer).not.toHaveBeenCalled();
  },
);

it("releases held keys and pointer lock before installing the movement guard", () => {
  Object.assign(document, { pointerLockElement: {} });
  render();
  mountEffects();
  expect(fixture.setInputState).toHaveBeenCalledExactlyOnceWith({
    keys: new Set(),
  });
  expect(document.exitPointerLock).toHaveBeenCalledOnce();
  expect(fixture.suppressMovement).toHaveBeenCalledExactlyOnceWith(engine);
  expect(fixture.setInputState.mock.invocationCallOrder[0]).toBeLessThan(
    fixture.suppressMovement.mock.invocationCallOrder[0],
  );
});

it.each([false, true])(
  "follows the chosen flag and closes only on success (%s)",
  (success) => {
    fixture.actions.followFlag.mockReturnValue(success);
    render().button("Follow Inferno flag").props.onClick();
    expect(fixture.actions.followFlag).toHaveBeenCalledExactlyOnceWith(2);
    expect(fixture.hide).toHaveBeenCalledTimes(success ? 1 : 0);
  },
);

it.each([
  ["Rewind 30 seconds", "rewind30"],
  ["Rewind 5 seconds", "rewind5"],
  ["Fast forward 5 seconds", "forward5"],
  ["Fast forward 30 seconds", "forward30"],
] as const)(
  "delegates %s and keeps the drawer open for repeated seeking",
  (label, action) => {
    const { button } = render();
    button(label).props.onClick();
    button(label).props.onClick();
    expect(fixture.actions[action]).toHaveBeenCalledTimes(2);
    expect(fixture.hide).not.toHaveBeenCalled();
  },
);

it("offers only seek, camera modes, player and the first two flag controls", () => {
  const { tree } = render();
  expect(
    tree
      .filter((element) => element.type === "button")
      .map(
        (element) =>
          element.props["aria-label"] ?? text(element.props.children),
      )
      .sort(),
  ).toEqual(
    [
      "Camera controls",
      "Close camera controls",
      "Rewind 30 seconds",
      "Rewind 5 seconds",
      "Fast forward 5 seconds",
      "Fast forward 30 seconds",
      "Original view",
      "Free-fly",
      "Follow",
      "First person",
      "Previous player",
      "Select target",
      "Next player",
      "Follow Storm flag",
      "Follow Inferno flag",
    ].sort(),
  );
});

it("keeps visibility active through closing and prevents reopening until hidden", () => {
  const onOpenChange = vi.fn();
  fixture.open = false;
  fixture.mounted = false;
  render(onOpenChange);
  mountEffects();
  expect(onOpenChange).not.toHaveBeenCalled();
  expect(fixture.suppressMovement).not.toHaveBeenCalled();

  fixture.open = true;
  fixture.mounted = true;
  render(onOpenChange);
  mountEffects();
  expect(onOpenChange.mock.calls).toEqual([[true]]);
  expect(fixture.suppressMovement).toHaveBeenCalledExactlyOnceWith(engine);

  fixture.hide();
  const closing = render(onOpenChange);
  mountEffects();
  expect(closing.tree.some((element) => element.type === "dialog")).toBe(true);
  expect(closing.button("Camera controls").props["aria-expanded"]).toBe(false);
  expect(closing.button("Camera controls").props["aria-disabled"]).toBe(true);
  closing.button("Camera controls").props.onClick();
  expect(fixture.show).not.toHaveBeenCalled();
  expect(onOpenChange.mock.calls).toEqual([[true]]);
  expect(fixture.suppressMovement).toHaveBeenCalledOnce();
  expect(fixture.releaseMovement).not.toHaveBeenCalled();

  fixture.mounted = false;
  const hidden = render(onOpenChange);
  mountEffects();
  expect(hidden.tree.some((element) => element.type === "dialog")).toBe(false);
  expect(onOpenChange.mock.calls).toEqual([[true], [false]]);
  expect(fixture.releaseMovement).toHaveBeenCalledOnce();
});
