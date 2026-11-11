import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { InputBindings } from "./InputBindings";
import {
  clearInputDeltas,
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
  MOVABLE_CAMERA_INPUT,
  PLAYER_ORBIT_INPUT,
  QUICK_CAM_INPUT,
} from "./inputMap";

const test = vi.hoisted(() => {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      activeElement: null,
      pointerLockElement: null,
      hidden: false,
    }),
  );
  return {
    canvas: Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
    }),
    effects: [] as (() => void | (() => void))[],
    cleanups: [] as (() => void)[],
  };
});

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void | (() => void)) => test.effects.push(effect),
}));
vi.mock("./useEngine", () => ({
  useEngine: () => ({
    withHost(start: (host: unknown) => (() => void) | void) {
      const cleanup = start({ renderer: { domElement: test.canvas } });
      return () => cleanup?.();
    },
  }),
}));

function mount(map: readonly InputMapEntry[] = DEMO_MODE_INPUT) {
  InputBindings({ map });
  for (const effect of test.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) test.cleanups.push(cleanup);
  }
}

function key(
  type: "keydown" | "keyup",
  code: string,
  {
    target,
    preventDefault = false,
  }: {
    target?: EventTarget;
    preventDefault?: boolean;
  } = {},
) {
  const event = Object.assign(new Event(type, { cancelable: true }), { code });
  if (target) Object.defineProperty(event, "target", { value: target });
  if (preventDefault) event.preventDefault();
  window.dispatchEvent(event);
}

function keyboardElement(tagName: string, role?: string, playbackSeek = false) {
  const element = Object.assign(new EventTarget(), {
    tagName,
    closest(selector: string): EventTarget | null {
      if (selector === "[data-playback-seek]") {
        return playbackSeek ? element : null;
      }
      return role && selector.includes(`[role="${role}"]`) ? element : null;
    },
  });
  return element;
}

function watch(action: string) {
  const callback = vi.fn();
  test.cleanups.push(subscribeAction(action, callback));
  return callback;
}

beforeEach(() => {
  Object.assign(document, {
    activeElement: null,
    pointerLockElement: null,
    hidden: false,
  });
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

it("toggles the follow lock with Shift-Up without looking up", () => {
  // Only the arrow keys: this test's canvas stub has no gestures.
  mount(MOVABLE_CAMERA_INPUT.slice(0, 4));
  mount(PLAYER_ORBIT_INPUT);
  const toggle = watch("toggleFollowBehindPlayer");
  const look = watch("lookUp");
  key("keydown", "ShiftLeft");
  key("keydown", "ArrowUp");
  expect(toggle).toHaveBeenCalledOnce();
  expect(inputControlsStore.getState().actions.lookUp).toEqual({
    pressed: false,
  });
  key("keyup", "ArrowUp");
  key("keyup", "ShiftLeft");
  // Shift pressed while looking up is no toggle.
  key("keydown", "ArrowUp");
  key("keydown", "ShiftLeft");
  expect(look).toHaveBeenCalledOnce();
  expect(toggle).toHaveBeenCalledOnce();
});

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

it.each([
  ["SELECT", undefined],
  ["BUTTON", "combobox"],
  ["DIV", "listbox"],
  ["DIV", "option"],
] as const)(
  "keeps typeahead in a focused %s/%s out of game shortcuts",
  (tag, role) => {
    mount(FOLLOW_KEYBOARD_INPUT);
    Object.assign(document, { activeElement: keyboardElement(tag, role) });
    const next = watch("nextPlayerKey");
    key("keydown", "KeyN");
    expect(next).not.toHaveBeenCalled();
    expect(inputControlsStore.getState().keys.has("KeyN")).toBe(false);
  },
);

it("keeps settings slider adjustments and letter keys out of camera controls", () => {
  mount(MOVABLE_CAMERA_INPUT.slice(0, 4));
  mount(FOLLOW_KEYBOARD_INPUT);
  Object.assign(document, {
    activeElement: keyboardElement("BUTTON", "slider"),
  });
  const look = watch("lookUp");
  const next = watch("nextPlayerKey");
  key("keydown", "ArrowUp");
  key("keydown", "KeyN");
  expect(look).not.toHaveBeenCalled();
  expect(next).not.toHaveBeenCalled();
  expect(inputControlsStore.getState().keys.size).toBe(0);
});

it("ignores the original widget target after its handler has moved focus to the page", () => {
  mount(FOLLOW_KEYBOARD_INPUT);
  const body = keyboardElement("BODY");
  Object.assign(document, { body, activeElement: body });
  const next = watch("nextPlayerKey");
  key("keydown", "KeyN", { target: keyboardElement("DIV", "option") });
  expect(next).not.toHaveBeenCalled();
  expect(inputControlsStore.getState().keys.has("KeyN")).toBe(false);
});

it("preserves camera arrows on the playback scrubber even when Radix stepping was prevented", () => {
  mount(MOVABLE_CAMERA_INPUT.slice(0, 4));
  const thumb = keyboardElement("SPAN", "slider", true);
  Object.assign(document, { activeElement: thumb });
  const look = watch("lookUp");
  key("keydown", "ArrowUp", { target: thumb, preventDefault: true });
  expect(look).toHaveBeenCalledOnce();
  expect(inputControlsStore.getState().actions.lookUp).toEqual({
    pressed: true,
  });
});

it("preserves letter shortcuts on ordinary buttons while reserving their native arrow keys", () => {
  mount(MOVABLE_CAMERA_INPUT.slice(0, 4));
  mount(FOLLOW_KEYBOARD_INPUT);
  Object.assign(document, { activeElement: keyboardElement("BUTTON") });
  const next = watch("nextPlayerKey");
  const look = watch("lookUp");
  key("keydown", "KeyN");
  expect(next).toHaveBeenCalledOnce();
  key("keyup", "KeyN");
  key("keydown", "ArrowUp");
  expect(look).not.toHaveBeenCalled();
});

it("releases a held game key after focus moves into a keyboard widget", () => {
  mount(FREE_FLY_INPUT.slice(0, -1));
  key("keydown", "KeyW");
  expect(inputControlsStore.getState().actions.moveForward).toEqual({
    pressed: true,
  });
  const widget = keyboardElement("BUTTON", "combobox");
  Object.assign(document, { activeElement: widget });
  key("keyup", "KeyW", { target: widget, preventDefault: true });
  expect(inputControlsStore.getState().actions.moveForward).toEqual({
    pressed: false,
  });
  expect(inputControlsStore.getState().keys.has("KeyW")).toBe(false);
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

const TOUCH_CAMERA_INPUT = [
  { name: "touchCamera", keys: { type: "touch" } },
  { name: "cameraPinch", keys: { type: "pinch" } },
] as const satisfies readonly InputMapEntry[];

function touch(
  target: EventTarget,
  type: string,
  points: readonly (readonly [number, number, number])[],
) {
  const event = Object.assign(new Event(type, { cancelable: true }), {
    changedTouches: points.map(([identifier, clientX, clientY]) => ({
      identifier,
      clientX,
      clientY,
    })),
  });
  target.dispatchEvent(event);
  return event;
}

it.each([1, 2])(
  "continues dragging without a jump after pinch finger %s lifts",
  (lifted) => {
    mount(TOUCH_CAMERA_INPUT);
    touch(test.canvas, "touchstart", [[1, 10, 20]]);
    touch(test.canvas, "touchstart", [[2, 100, 20]]);
    touch(document, "touchmove", [
      [1, 30, 40],
      [2, 140, 60],
    ]);
    expect(inputControlsStore.getState().actions.touchCamera).toMatchObject({
      deltaX: 0,
      deltaY: 0,
    });
    clearInputDeltas();
    touch(document, "touchend", [lifted === 1 ? [1, 30, 40] : [2, 140, 60]]);
    touch(document, "touchmove", [lifted === 1 ? [2, 147, 69] : [1, 37, 49]]);
    expect(inputControlsStore.getState().actions.touchCamera).toMatchObject({
      touching: true,
      dragging: true,
      deltaX: 7,
      deltaY: 9,
    });
    expect(inputControlsStore.getState().actions.cameraPinch).toMatchObject({
      pinching: false,
      deltaScale: 1,
    });
  },
);

it("retains final drag and pinch movement through normal release until consumed", () => {
  mount(TOUCH_CAMERA_INPUT);
  touch(test.canvas, "touchstart", [[1, 10, 20]]);
  touch(document, "touchmove", [[1, 20, 30]]);
  touch(document, "touchend", [[1, 25, 35]]);
  expect(inputControlsStore.getState().actions.touchCamera).toEqual({
    touching: false,
    dragging: false,
    deltaX: 15,
    deltaY: 15,
  });
  clearInputDeltas();
  touch(test.canvas, "touchstart", [
    [1, 0, 0],
    [2, 100, 0],
  ]);
  touch(document, "touchmove", [[2, 200, 0]]);
  touch(document, "touchend", [
    [1, 0, 0],
    [2, 220, 0],
  ]);
  expect(inputControlsStore.getState().actions.cameraPinch).toMatchObject({
    pinching: false,
    deltaDistance: 120,
    deltaScale: 2.2,
  });
  clearInputDeltas();
  expect(inputControlsStore.getState().actions.cameraPinch).toMatchObject({
    deltaDistance: 0,
    deltaScale: 1,
  });
});

it.each([100, 200])(
  "reports the same pinch scale when doubling a %s px span",
  (span) => {
    mount(TOUCH_CAMERA_INPUT);
    touch(test.canvas, "touchstart", [
      [1, 0, 0],
      [2, span, 0],
    ]);
    touch(document, "touchmove", [[2, span * 2, 0]]);
    expect(inputControlsStore.getState().actions.cameraPinch).toMatchObject({
      deltaScale: 2,
    });
  },
);

it("does not capture movement from an unrelated overlay finger", () => {
  mount(TOUCH_CAMERA_INPUT);
  touch(test.canvas, "touchstart", [[1, 10, 20]]);
  expect(touch(document, "touchmove", [[99, 50, 60]]).defaultPrevented).toBe(
    false,
  );
  expect(inputControlsStore.getState().actions.touchCamera).toMatchObject({
    deltaX: 0,
    deltaY: 0,
  });
  expect(touch(document, "touchmove", [[1, 15, 30]]).defaultPrevented).toBe(
    true,
  );
});

it.each(["touchcancel", "blur", "hidden"])(
  "discards pending gestures and old contact IDs on %s",
  (interruption) => {
    mount(TOUCH_CAMERA_INPUT);
    touch(test.canvas, "touchstart", [[1, 10, 20]]);
    touch(document, "touchmove", [[1, 20, 30]]);
    touch(test.canvas, "touchstart", [[2, 100, 30]]);
    touch(document, "touchmove", [[2, 200, 30]]);
    if (interruption === "touchcancel") {
      touch(document, "touchcancel", [[1, 20, 30]]);
    } else if (interruption === "blur") {
      window.dispatchEvent(new Event("blur"));
    } else {
      Object.assign(document, { hidden: true });
      document.dispatchEvent(new Event("visibilitychange"));
    }
    touch(document, "touchmove", [[1, 60, 80]]);
    expect(inputControlsStore.getState().actions.touchCamera).toEqual({
      touching: false,
      dragging: false,
      deltaX: 0,
      deltaY: 0,
    });
    expect(inputControlsStore.getState().actions.cameraPinch).toMatchObject({
      pinching: false,
      deltaDistance: 0,
      deltaScale: 1,
    });
  },
);
