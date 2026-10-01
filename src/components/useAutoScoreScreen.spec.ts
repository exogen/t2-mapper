import { beforeEach, expect, it, vi } from "vitest";
import { useAutoScoreScreen } from "./useAutoScoreScreen";
import { setStreamSnapshot } from "../state/streamSnapshotStore";
import type { StreamSnapshot } from "../stream/types";

const hooks = vi.hoisted(() => ({
  refs: [] as { current: unknown }[],
  index: 0,
  deps: null as readonly unknown[] | null,
  effect: null as (() => void) | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useRef: (current: unknown) => (hooks.refs[hooks.index++] ??= { current }),
  useEffect: (effect: () => void, deps: readonly unknown[]) => {
    if (
      !hooks.deps ||
      deps.some((value, i) => !Object.is(value, hooks.deps![i]))
    )
      hooks.effect = effect;
    hooks.deps = deps;
  },
}));
vi.mock("../state/streamSnapshotStore", async (original) => {
  const actual =
    await original<typeof import("../state/streamSnapshotStore")>();
  return {
    ...actual,
    useStreamSnapshot: (
      selector: (snapshot: StreamSnapshot | null) => unknown,
    ) => selector(actual.streamSnapshotStore.getState().snapshot),
  };
});

const setOpen = vi.fn();
function flushEffect() {
  const effect = hooks.effect;
  hooks.effect = null;
  effect?.();
}
function render(
  timeSec: number | null,
  matchStarted = true,
  matchEnded = false,
) {
  setStreamSnapshot(
    timeSec == null
      ? null
      : ({ timeSec, matchStarted, matchEnded } as StreamSnapshot),
  );
  hooks.index = 0;
  useAutoScoreScreen(setOpen);
  flushEffect();
}
beforeEach(() => {
  hooks.refs = [];
  hooks.deps = null;
  hooks.effect = null;
  setOpen.mockClear();
  setStreamSnapshot(null);
});

it("keeps the score screen closed through a welcome burst and opens at a witnessed MissionEnd", () => {
  render(100);
  render(102); // Welcome messages leave matchEnded false.
  render(110);
  expect(setOpen).not.toHaveBeenCalled();
  render(115, true, true);
  expect(setOpen).toHaveBeenCalledExactlyOnceWith(true);
  setOpen.mockClear(); // A manual close must survive later debrief snapshots.
  render(120, true, true);
  expect(setOpen).not.toHaveBeenCalled();
});

it("does not pop the screen when joining or hydrating an already-ended match", () => {
  render(100, true, true);
  render(120, true, true);
  expect(setOpen).not.toHaveBeenCalled();
});

it("closes for the next mission and can witness a second match end", () => {
  render(0);
  render(10, true, true);
  render(15, false);
  render(20);
  render(30, true, true);
  expect(setOpen.mock.calls).toEqual([[true], [false], [true]]);
});

it("closes when rewinding out of debrief and rearms for forward playback", () => {
  render(0);
  render(10, true, true);
  render(0);
  render(10, true, true);
  expect(setOpen.mock.calls).toEqual([[true], [false], [true]]);
});

it("does not auto-open after observing only the final seconds", () => {
  render(100);
  render(102, true, true);
  expect(setOpen).not.toHaveBeenCalled();
});

it("closes and disarms when the recording is unloaded", () => {
  render(0);
  render(10, true, true);
  render(null);
  render(100, true, true);
  expect(setOpen.mock.calls).toEqual([[true], [false]]);
});
