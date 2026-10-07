import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { InputBindings } from "./InputBindings";
import {
  inputControlsStore,
  subscribeAction,
  type InputMapEntry,
} from "./InputControls";
import {
  COMMAND_CIRCUIT_STREAM_INPUT,
  DEMO_MODE_INPUT,
  FOLLOW_KEYBOARD_INPUT,
  FREE_FLY_INPUT,
  LIVE_FOLLOW_INPUT,
  QUICK_CAM_INPUT,
} from "./inputMap";

const test = vi.hoisted(() => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      activeElement: null,
      pointerLockElement: null,
    }),
  );
  return {
    canvas: new EventTarget(),
    effects: [] as (() => void | (() => void))[],
    cleanups: [] as (() => void)[],
  };
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => test.effects.push(effect),
}));
vi.mock("@react-three/fiber", () => ({
  useThree: (selector: (state: unknown) => unknown) =>
    selector({ gl: { domElement: test.canvas } }),
}));

function mount(map: readonly InputMapEntry[] = DEMO_MODE_INPUT) {
  InputBindings({ map });
  for (const effect of test.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) test.cleanups.push(cleanup);
  }
}

function key(type: "keydown" | "keyup", code: string) {
  window.dispatchEvent(Object.assign(new Event(type), { code }));
}

function watch(action: string) {
  const callback = vi.fn();
  test.cleanups.push(subscribeAction(action, callback));
  return callback;
}

beforeEach(() => {
  Object.assign(document, { activeElement: null, pointerLockElement: null });
  inputControlsStore.setState({ keys: new Set(), actions: {} });
  mount();
});
afterEach(() => {
  for (const cleanup of test.cleanups.splice(0).reverse()) cleanup();
});
afterAll(() => vi.unstubAllGlobals());

it.each([0, 1, 2, 9])(
  "saves camera %s with Shift without also recalling it",
  (slot) => {
    mount(QUICK_CAM_INPUT);
    const save = watch(`saveQuickCam${slot}`);
    const recall = watch(`quickCam${slot}`);
    key("keydown", "ShiftLeft");
    key("keydown", `Digit${slot}`);
    key("keydown", `Digit${slot}`);
    key("keyup", "ShiftLeft");
    key("keyup", `Digit${slot}`);
    expect(save).toHaveBeenCalledOnce();
    expect(recall).not.toHaveBeenCalled();
    key("keydown", `Digit${slot}`);
    expect(recall).toHaveBeenCalledOnce();
  },
);

it.each([
  ["BracketLeft", "seekBackward", "seekBackwardLarge"],
  ["BracketRight", "seekForward", "seekForwardLarge"],
])(
  "does not seek an extra five seconds when Shift is released before %s",
  (code, small, large) => {
    const shortSeek = watch(small);
    const longSeek = watch(large);
    key("keydown", "ShiftLeft");
    key("keydown", code);
    expect(longSeek).toHaveBeenCalledOnce();
    key("keyup", "ShiftLeft");
    key("keyup", code);
    expect(shortSeek).not.toHaveBeenCalled();
    expect(longSeek).toHaveBeenCalledOnce();
    key("keydown", code);
    expect(shortSeek).toHaveBeenCalledOnce();
  },
);

it("does not start a thirty-second seek when Shift is pressed after the bracket", () => {
  const shortSeek = watch("seekBackward");
  const longSeek = watch("seekBackwardLarge");
  key("keydown", "BracketLeft");
  key("keydown", "ShiftLeft");
  expect(shortSeek).toHaveBeenCalledOnce();
  expect(longSeek).not.toHaveBeenCalled();
});

it.each(["ControlLeft", "AltLeft"])(
  "does not seek when releasing %s from a modified bracket",
  (modifier) => {
    const seek = watch("seekForward");
    key("keydown", modifier);
    key("keydown", "BracketRight");
    key("keyup", modifier);
    expect(seek).not.toHaveBeenCalled();
  },
);

it("ignores held-key repeats but accepts another press after release", () => {
  const seek = watch("seekForward");
  key("keydown", "BracketRight");
  key("keydown", "BracketRight");
  expect(seek).toHaveBeenCalledOnce();
  key("keyup", "BracketRight");
  key("keydown", "BracketRight");
  expect(seek).toHaveBeenCalledTimes(2);
});

it("updates held movement state when modifiers change without firing another press", () => {
  // Only key bindings are needed for this test's canvas stub.
  mount(FREE_FLY_INPUT.slice(0, -1));
  const move = watch("moveForward");
  key("keydown", "KeyW");
  expect(inputControlsStore.getState().actions.moveForward).toEqual({
    pressed: true,
  });
  key("keydown", "ShiftLeft");
  expect(inputControlsStore.getState().actions.moveForward).toEqual({
    pressed: false,
  });
  key("keyup", "ShiftLeft");
  expect(inputControlsStore.getState().actions.moveForward).toEqual({
    pressed: true,
  });
  expect(move).toHaveBeenCalledOnce();
});

it("does not treat a held key as a fresh press when bindings remount", () => {
  key("keydown", "BracketRight");
  for (const cleanup of test.cleanups.splice(0)) cleanup();
  const seek = watch("seekForward");
  mount();
  expect(seek).not.toHaveBeenCalled();
  expect(inputControlsStore.getState().actions.seekForward).toEqual({
    pressed: true,
  });
  key("keyup", "BracketRight");
  key("keydown", "BracketRight");
  expect(seek).toHaveBeenCalledOnce();
});

it.each([
  ["3D", false],
  ["3D", true],
  ["CC", false],
  ["CC", true],
] as const)(
  "cycles players with N / Shift-N in %s (pointer locked: %s)",
  (mode, locked) => {
    Object.assign(document, {
      pointerLockElement: locked ? test.canvas : null,
    });
    mount(mode === "CC" ? COMMAND_CIRCUIT_STREAM_INPUT : FOLLOW_KEYBOARD_INPUT);
    const next = watch(mode === "CC" ? "observeNextPlayer" : "nextPlayerKey");
    const previous = watch(
      mode === "CC" ? "observePrevPlayer" : "prevPlayerKey",
    );
    for (const arrow of ["ArrowLeft", "ArrowRight"]) {
      key("keydown", arrow);
      key("keyup", arrow);
    }
    expect(next).not.toHaveBeenCalled();
    expect(previous).not.toHaveBeenCalled();
    key("keydown", "KeyN");
    key("keydown", "KeyN");
    expect(next).toHaveBeenCalledOnce();
    key("keyup", "KeyN");
    key("keydown", "ShiftLeft");
    key("keydown", "KeyN");
    expect(previous).toHaveBeenCalledOnce();
    // Releasing Shift first must not cycle forward again.
    key("keyup", "ShiftLeft");
    key("keyup", "KeyN");
    expect(next).toHaveBeenCalledOnce();
    expect(previous).toHaveBeenCalledOnce();
  },
);

it("does not confuse held cycling keys with pending mouse clicks", () => {
  Object.assign(document, { pointerLockElement: test.canvas });
  mount(FOLLOW_KEYBOARD_INPUT);
  mount(LIVE_FOLLOW_INPUT);
  const keyCycle = watch("nextPlayerKey");
  const mouseCycle = watch("nextPlayer");
  key("keydown", "KeyN");
  document.dispatchEvent(Object.assign(new Event("mouseup"), { button: 0 }));
  expect(keyCycle).toHaveBeenCalledOnce();
  expect(mouseCycle).not.toHaveBeenCalled();
  test.canvas.dispatchEvent(
    Object.assign(new Event("mousedown"), {
      button: 0,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
    }),
  );
  key("keyup", "KeyN");
  document.dispatchEvent(Object.assign(new Event("mouseup"), { button: 0 }));
  expect(mouseCycle).toHaveBeenCalledOnce();
});

it("ignores cycling keys while typing into a text field", () => {
  mount(FOLLOW_KEYBOARD_INPUT);
  Object.assign(document, {
    activeElement: { tagName: "INPUT", type: "text" },
  });
  const next = watch("nextPlayerKey");
  const previous = watch("prevPlayerKey");
  key("keydown", "KeyN");
  key("keyup", "KeyN");
  key("keydown", "ShiftLeft");
  key("keydown", "KeyN");
  expect(next).not.toHaveBeenCalled();
  expect(previous).not.toHaveBeenCalled();
});

it("starts with fresh gesture state when the listener effect is reattached", () => {
  InputBindings({ map: [{ name: "touchCamera", keys: { type: "touch" } }] });
  const effect = test.effects.pop()!;
  const cleanup = effect();
  const touch = (target: EventTarget, type: string, x: number, y: number) =>
    target.dispatchEvent(
      Object.assign(new Event(type), {
        changedTouches: [{ identifier: 1, clientX: x, clientY: y }],
      }),
    );
  touch(test.canvas, "touchstart", 10, 20);
  touch(document, "touchmove", 15, 30);
  expect(inputControlsStore.getState().actions.touchCamera).toMatchObject({
    touching: true,
    deltaX: 5,
    deltaY: 10,
  });
  cleanup?.();
  const nextCleanup = effect();
  if (nextCleanup) test.cleanups.push(nextCleanup);

  // Old touches must not resume moving the camera after listeners restart.
  touch(document, "touchmove", 30, 50);
  expect(inputControlsStore.getState().actions.touchCamera).toEqual({
    touching: false,
    dragging: false,
    deltaX: 0,
    deltaY: 0,
  });
  touch(test.canvas, "touchstart", 30, 50);
  touch(document, "touchmove", 35, 60);
  expect(inputControlsStore.getState().actions.touchCamera).toMatchObject({
    touching: true,
    deltaX: 5,
    deltaY: 10,
  });
});
