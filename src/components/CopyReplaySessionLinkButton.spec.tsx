import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CopyReplaySessionLinkButton } from "./CopyReplaySessionLinkButton";

const fixture = vi.hoisted(() => ({
  connection: {
    sessionId: "room-one" as string | null,
    state: { isOwner: true, ownerToken: "private-creator-token" },
  },
  writeText: vi.fn(),
}));
const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  refs: [] as { current: unknown }[],
  effects: [] as {
    deps: readonly unknown[];
    cleanup?: (() => void) | void;
  }[],
  stateIndex: 0,
  refIndex: 0,
  effectIndex: 0,
}));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState(initial: unknown) {
    const index = hooks.stateIndex++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [
      hooks.values[index],
      (value: unknown) => (hooks.values[index] = value),
    ];
  },
  useRef(initial: unknown) {
    return (hooks.refs[hooks.refIndex++] ??= { current: initial });
  },
  useEffect(effect: () => void | (() => void), deps: readonly unknown[]) {
    const index = hooks.effectIndex++;
    const previous = hooks.effects[index];
    if (
      previous &&
      deps.every((value, i) => Object.is(value, previous.deps[i]))
    )
      return;
    previous?.cleanup?.();
    hooks.effects[index] = { deps, cleanup: effect() };
  },
}));
vi.mock("../state/replayConnectionStore", () => ({
  replayConnectionStore: { getState: () => fixture.connection },
  useReplaySelector: (
    selector: (state: typeof fixture.connection) => unknown,
  ) => selector(fixture.connection),
}));

function render() {
  hooks.stateIndex = hooks.refIndex = hooks.effectIndex = 0;
  return CopyReplaySessionLinkButton();
}

function elements(node: ReactNode): ReactElement<Record<string, any>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, any>>(node)) return [];
  return [node, ...elements(node.props.children)];
}

function button() {
  return elements(render()).find((element) => element.type === "button")!;
}

function unmount() {
  for (const effect of hooks.effects) effect.cleanup?.();
  hooks.effects = [];
}

beforeEach(() => {
  hooks.values = [];
  hooks.refs = [];
  hooks.effects = [];
  fixture.connection.sessionId = "room-one";
  fixture.connection.state.isOwner = true;
  fixture.writeText.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    location: {
      href: "https://example.com/t2-mapper/?demo=a.rec&ownerToken=secret&t=9#camera",
    },
  });
  vi.stubGlobal("navigator", { clipboard: { writeText: fixture.writeText } });
});

afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([true, false])(
  "copies a public invitation for owner=%s",
  async (isOwner) => {
    fixture.connection.state.isOwner = isOwner;
    const action = button();
    expect(action.props.disabled).toBe(false);
    await action.props.onClick();
    expect(fixture.writeText).toHaveBeenCalledExactlyOnceWith(
      "https://example.com/t2-mapper/?replay=room-one",
    );
    expect(button().props["data-copied"]).toBe("true");
    vi.advanceTimersByTime(1100);
    expect(button().props["data-copied"]).toBe("false");
  },
);

it("disables copying before a session exists and ignores a click after leaving", async () => {
  const action = button();
  fixture.connection.sessionId = null;
  await action.props.onClick();
  expect(button().props.disabled).toBe(true);
  expect(fixture.writeText).not.toHaveBeenCalled();
});

it("uses the current session ID when a room changes before rerendering", async () => {
  const action = button();
  fixture.connection.sessionId = "replacement-room";
  await action.props.onClick();
  expect(fixture.writeText).toHaveBeenCalledExactlyOnceWith(
    "https://example.com/t2-mapper/?replay=replacement-room",
  );
});

it.each(["denied", "unavailable"])(
  "provides a selectable public link when clipboard is %s",
  async (reason) => {
    if (reason === "denied")
      fixture.writeText.mockRejectedValue(new Error("Denied"));
    else vi.stubGlobal("navigator", {});
    await button().props.onClick();
    const input = elements(render()).find(
      (element) => element.type === "input",
    )!;
    expect(input.props.readOnly).toBe(true);
    expect(input.props.autoFocus).toBe(true);
    expect(input.props.value).toBe(
      "https://example.com/t2-mapper/?replay=room-one",
    );
    const select = vi.fn();
    input.props.onFocus({ currentTarget: { select } });
    input.props.onClick({ currentTarget: { select } });
    expect(select).toHaveBeenCalledTimes(2);
    expect(button().props["data-copied"]).toBe("false");
  },
);

it("clears copy feedback on unmount and ignores late clipboard results", async () => {
  await button().props.onClick();
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
  let resolve!: () => void;
  fixture.writeText.mockImplementation(
    () => new Promise<void>((done) => (resolve = done)),
  );
  const pending = button().props.onClick();
  unmount();
  resolve();
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});

it("does not show stale copy failures after changing sessions", async () => {
  let reject!: (error: Error) => void;
  fixture.writeText.mockImplementation(
    () => new Promise<void>((_, fail) => (reject = fail)),
  );
  const pending = button().props.onClick();
  fixture.connection.sessionId = "replacement-room";
  render();
  reject(new Error("Denied"));
  await pending;
  expect(elements(render()).some((element) => element.type === "input")).toBe(
    false,
  );
});
