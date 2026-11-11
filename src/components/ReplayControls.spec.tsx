import { Children, isValidElement, type ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReplayState } from "../../relay/replayTypes";
import { streamClock } from "../state/streamPlaybackStore";
import { PlaybackSeekBar } from "./PlaybackSeekBar";
import { ReplayControls, ReplaySessionStatus } from "./ReplayControls";

const test = vi.hoisted(() => ({
  state: null as ReplayState | null,
  ready: true,
  connecting: false,
  uploading: false,
  uploadProgress: null as number | null,
  error: null as string | null,
  currentTime: 0,
  control: vi.fn(),
  leave: vi.fn(),
  hooks: [] as any[],
  cursor: 0,
  effects: [] as Array<() => void>,
  dirty: false,
}));

// A controlled hook runtime lets these tests exercise deferred scrub handlers
// and effect cleanup without substituting a different slider implementation.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => {
    const index = test.cursor++;
    return (test.hooks[index] ??= { current: initial });
  },
  useState: (initial: unknown) => {
    const index = test.cursor++;
    if (!(index in test.hooks)) test.hooks[index] = initial;
    return [
      test.hooks[index],
      (value: unknown) => {
        if (!Object.is(test.hooks[index], value)) {
          test.hooks[index] = value;
          test.dirty = true;
        }
      },
    ];
  },
  useEffect: (effect: () => void | (() => void), dependencies: unknown[]) => {
    const index = test.cursor++;
    const previous = test.hooks[index];
    if (
      !previous ||
      dependencies.some(
        (value, i) => !Object.is(value, previous.dependencies[i]),
      )
    ) {
      test.effects.push(() => {
        previous?.cleanup?.();
        test.hooks[index] = { dependencies, cleanup: effect() };
      });
    }
  },
}));
vi.mock("../state/replayConnectionStore", () => ({
  replayConnectionStore: { getState: () => test },
  useReplaySelector: (select: (state: typeof test) => unknown) => select(test),
}));
vi.mock("./usePlayback", () => ({ useCurrentTime: () => test.currentTime }));
vi.mock("./useAppNavigation", () => ({
  useAppNavigation: () => ({ demoIndex: test.leave }),
}));

let listeners: Map<string, Set<(event: any) => void>>;
beforeEach(() => {
  test.hooks = [];
  test.effects = [];
  test.control.mockClear();
  test.leave.mockClear();
  test.ready = true;
  test.connecting = false;
  test.uploading = false;
  test.uploadProgress = null;
  test.error = null;
  test.currentTime = 10;
  test.state = {
    sessionId: "room",
    demo: "demo.rec",
    epoch: 1,
    revision: 1,
    status: "paused",
    tick: 100,
    durationTicks: 1000,
    watcherCount: 2,
    isOwner: true,
  };
  listeners = new Map();
  vi.stubGlobal("window", {
    addEventListener(name: string, callback: (event: any) => void) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(callback);
    },
    removeEventListener(name: string, callback: (event: any) => void) {
      listeners.get(name)?.delete(callback);
    },
  });
});
afterEach(() => {
  for (const hook of test.hooks) hook?.cleanup?.();
  vi.unstubAllGlobals();
});

function render() {
  let node: ReturnType<typeof ReplayControls>;
  do {
    test.dirty = false;
    test.cursor = 0;
    node = ReplayControls();
    test.effects.splice(0).forEach((effect) => effect());
  } while (test.dirty);
  return node!;
}
function descendants(node: unknown): ReactElement<any>[] {
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<any>;
  return [
    element,
    ...Children.toArray(element.props.children).flatMap(descendants),
  ];
}
function slider(node = render()) {
  return descendants(node).find((element) => element.type === PlaybackSeekBar)!
    .props;
}
function play(node = render()) {
  return descendants(node).find((element) => element.type === "button")!.props;
}
function fire(name: string, event: unknown = {}) {
  for (const listener of listeners.get(name) ?? []) listener(event);
}

it("commits one tick-aligned seek on release and leaves seek playback policy to the relay", () => {
  let bar = slider();
  bar.onBeginScrub();
  bar.onValueChange(12);
  bar = slider();
  expect(bar.dragValue).toBe(12);
  bar.onValueChange(12.345);
  expect(test.control).not.toHaveBeenCalled();
  bar.onValueCommit(12.345);
  expect(test.control).toHaveBeenCalledExactlyOnceWith("seek", 386);
  bar.onValueCommit(12.345);
  expect(test.control).toHaveBeenCalledTimes(1);
  expect(slider().dragValue).toBeNull();
});

it.each(["session", "epoch", "revision", "ready", "owner"])(
  "cancels a scrub when %s changes and rejects a stale release",
  (change) => {
    const bar = slider();
    bar.onBeginScrub();
    bar.onValueChange(12);
    if (change === "session")
      test.state = { ...test.state!, sessionId: "other" };
    if (change === "epoch") test.state = { ...test.state!, epoch: 2 };
    if (change === "revision") test.state = { ...test.state!, revision: 2 };
    if (change === "ready") test.ready = false;
    if (change === "owner") test.state = { ...test.state!, isOwner: false };
    // The old callback cannot control a newer room even before React rerenders.
    bar.onValueCommit(12);
    expect(test.control).not.toHaveBeenCalled();
    expect(slider().dragValue).toBeNull();
  },
);

it.each(["pointercancel", "blur"])(
  "cancels an unfinished scrub on %s",
  (event) => {
    const bar = slider();
    bar.onBeginScrub();
    bar.onValueChange(12);
    slider();
    fire(event);
    bar.onValueCommit(12);
    expect(test.control).not.toHaveBeenCalled();
    expect(slider().dragValue).toBeNull();
  },
);

it("keeps the watcher timeline read-only with no transport keyboard handler", () => {
  test.state = { ...test.state!, isOwner: false, status: "playing" };
  const node = render();
  const bar = slider(node);
  expect(bar.disabled).toBe(true);
  expect(play(node).disabled).toBe(true);
  expect(listeners.get("keydown")?.size ?? 0).toBe(0);
  play(node).onClick();
  bar.onBeginScrub();
  bar.onValueCommit(12);
  expect(test.control).not.toHaveBeenCalled();
  expect(
    descendants(node).filter((element) => element.type === "button"),
  ).toHaveLength(1);
});

it("keeps the natural-EOF timeline seekable, clamps displayed time, and plays after seeking back", () => {
  test.state = { ...test.state!, status: "ended", tick: 1100 };
  let node = render();
  expect(slider(node)).toMatchObject({
    disabled: false,
    currentTime: 32,
    duration: 32,
  });
  expect(play(node)).toMatchObject({
    disabled: true,
    title: "Seek backwards to play again",
  });
  const bar = slider(node);
  bar.onBeginScrub();
  bar.onValueCommit(1);
  expect(test.control).toHaveBeenLastCalledWith("seek", 31);
  test.state = {
    ...test.state,
    status: "paused",
    tick: 31,
    epoch: 2,
    revision: 2,
  };
  node = render();
  play(node).onClick();
  expect(test.control).toHaveBeenLastCalledWith("play", undefined);
  test.state = { ...test.state, closed: true };
  expect(slider().disabled).toBe(true);
});

it("uses the owner's displayed tick for pause and ignores Space in fields", () => {
  test.state = { ...test.state!, status: "playing" };
  test.currentTime = 100;
  streamClock.time = 100;
  expect(slider().currentTime).toBe(32);
  const preventDefault = vi.fn();
  fire("keydown", {
    code: "Space",
    target: { closest: () => true },
    preventDefault,
  });
  expect(test.control).not.toHaveBeenCalled();
  fire("keydown", {
    code: "Space",
    target: { closest: () => false },
    preventDefault,
  });
  expect(test.control).toHaveBeenCalledExactlyOnceWith("pause", 1000);
  expect(preventDefault).toHaveBeenCalledOnce();
});

it.each(["option", "slider"])(
  "does not toggle replay when an ARIA %s owns Space",
  (role) => {
    render();
    const preventDefault = vi.fn();
    fire("keydown", {
      code: "Space",
      target: {
        closest: (selector: string) =>
          selector.includes(`[role="${role}"]`) ? {} : null,
      },
      preventDefault,
    });
    expect(test.control).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  },
);

it("leaves a canceled Space event to the control that handled it", () => {
  render();
  const preventDefault = vi.fn();
  fire("keydown", {
    code: "Space",
    defaultPrevented: true,
    target: { closest: () => null },
    preventDefault,
  });
  expect(test.control).not.toHaveBeenCalled();
  expect(preventDefault).not.toHaveBeenCalled();
});

it("keeps Space available on the playback scrubber", () => {
  render();
  const preventDefault = vi.fn();
  fire("keydown", {
    code: "Space",
    target: {
      closest: (selector: string) =>
        selector === '[role="slider"]' || selector === "[data-playback-seek]"
          ? {}
          : null,
    },
    preventDefault,
  });
  expect(test.control).toHaveBeenCalledExactlyOnceWith("play", undefined);
  expect(preventDefault).toHaveBeenCalledOnce();
});

it("keeps upload progress and Cancel on the loading card", () => {
  test.state = null;
  test.ready = false;
  test.connecting = true;
  test.uploading = true;
  test.uploadProgress = 0.25;
  const card = ReplaySessionStatus();
  const nodes = descendants(card);
  expect(
    nodes.find((node) => node.props.role === "progressbar")!.props[
      "aria-valuenow"
    ],
  ).toBe(25);
  const cancel = nodes.find((node) => node.type === "button")!.props;
  expect(cancel.children).toBe("Cancel");
  cancel.onClick();
  expect(test.leave).toHaveBeenCalledOnce();
  expect(render()).toBeNull();
});
