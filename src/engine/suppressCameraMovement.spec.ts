import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  inputControlsStore,
  type PinchState,
  type TouchState,
} from "../state/inputControls";
import { joystickState } from "../state/joystickState";
import { FramePriority } from "./framePriority";
import { FrameScheduler, type FrameContext } from "./frameScheduler";
import type { GameEngine } from "./gameEngine";
import { InputQueue, type InputFrame } from "./inputQueue";
import { suppressCameraMovement } from "./suppressCameraMovement";

const fixture = vi.hoisted(() => {
  // The real input store attaches its central key listeners at module load.
  vi.stubGlobal("window", new EventTarget());
  return {
    live: {
      role: null as "player" | "watcher" | null,
      gameStatus: null as "connected" | null,
      liveReady: false,
    },
    inputMode: "fly" as "local" | "fly" | "follow",
  };
});

vi.mock("../state/inputModeStore", () => ({
  inputModeStore: { getState: () => ({ mode: fixture.inputMode }) },
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: { getState: () => fixture.live },
}));

let scheduler: FrameScheduler;
let input: InputQueue;
let engine: GameEngine;
let release: (() => void) | undefined;
const context = {} as FrameContext;
const movement: InputFrame = {
  deltaYaw: 0.4,
  deltaPitch: -0.2,
  x: 1,
  y: -1,
  z: 0.5,
  triggers: [],
  delta: 1 / 60,
};

function install() {
  release = suppressCameraMovement(engine);
  return release;
}

function setGestures(scale = 2) {
  inputControlsStore.setState({
    actions: {
      touchLook: {
        touching: true,
        dragging: true,
        deltaX: 10,
        deltaY: 20,
      } satisfies TouchState,
      orbitPinchZoom: {
        pinching: true,
        deltaX: 10,
        deltaY: 20,
        x: 50,
        y: 60,
        deltaDistance: 30,
        deltaScale: scale,
      } satisfies PinchState,
    },
  });
}

function pinch() {
  return inputControlsStore.getState().actions.orbitPinchZoom as PinchState;
}

beforeEach(() => {
  Object.assign(fixture.live, {
    role: null,
    gameStatus: null,
    liveReady: false,
  });
  fixture.inputMode = "fly";
  inputControlsStore.setState({ keys: new Set(), actions: {} });
  joystickState.move.force = joystickState.look.force = 0;
  scheduler = new FrameScheduler();
  input = new InputQueue();
  engine = { scheduler, input } as GameEngine;
  release = undefined;
});

afterEach(() => release?.());
afterAll(() => vi.unstubAllGlobals());

it("blocks direct pinch and queued movement while contacts continue sampling", () => {
  const directPinchZoom = vi.fn();
  const sampleTouch = vi.fn(() => {
    if (pinch().deltaScale !== 1) directPinchZoom(pinch().deltaScale);
    input.push(movement);
  });
  // Producers already exist when a modal installs its guard. The pre-touch
  // stage must run first even though its callback was registered later.
  scheduler.add(FramePriority.InputTouch, sampleTouch);
  scheduler.add(FramePriority.InputKeyboardMouse, () => {
    input.push(movement);
    setGestures(3);
  });
  const consumed: number[] = [];
  scheduler.add(FramePriority.CameraInput, () => {
    consumed.push(input.frames.length);
    input.clear();
  });
  setGestures();
  joystickState.move.force = joystickState.look.force = 0.8;
  const stop = install();
  expect(joystickState.move.force).toBe(0);
  expect(joystickState.look.force).toBe(0);
  expect(inputControlsStore.getState().actions.touchLook).toMatchObject({
    touching: true,
    dragging: true,
    deltaX: 0,
    deltaY: 0,
  });
  expect(pinch()).toMatchObject({
    pinching: true,
    x: 50,
    y: 60,
    deltaX: 0,
    deltaY: 0,
    deltaDistance: 0,
    deltaScale: 1,
  });

  setGestures();
  joystickState.move.force = joystickState.look.force = 0.5;
  scheduler.runAll(context);
  expect(sampleTouch).toHaveBeenCalledOnce();
  expect(directPinchZoom).not.toHaveBeenCalled();
  expect(consumed).toEqual([0]);
  // Gestures written after touch sampling are cleared too, before later rigs.
  expect(pinch().deltaScale).toBe(1);
  expect(joystickState.move.force).toBe(0);
  expect(joystickState.look.force).toBe(0);

  input.push(movement);
  setGestures();
  stop();
  expect(input.frames).toHaveLength(0);
  expect(pinch().deltaScale).toBe(1);
  setGestures();
  scheduler.runAll(context);
  expect(sampleTouch).toHaveBeenCalledTimes(2);
  expect(directPinchZoom).toHaveBeenCalledExactlyOnceWith(2);
  expect(consumed).toEqual([0, 2]);
  expect(pinch().deltaScale).toBe(3);
});

it.each(["fly", "follow"] as const)(
  "preserves native observer commands without movement until and during release (%s)",
  (mode) => {
    Object.assign(fixture.live, {
      role: "player",
      gameStatus: "connected",
      liveReady: true,
    });
    fixture.inputMode = mode;
    const command: InputFrame = {
      ...movement,
      triggers: [true, true, true, true, true, true],
    };
    const otherTriggers = {
      ...movement,
      triggers: [false, true, false, false, true, true],
    };
    scheduler.add(FramePriority.InputTouch, () => input.push(movement));
    scheduler.add(FramePriority.InputKeyboardMouse, () => {
      // An asynchronous player selection can finish after a modal reopens.
      input.push(command);
      input.push(otherTriggers);
    });
    const delivered: InputFrame[][] = [];
    scheduler.add(FramePriority.CameraInput, () => {
      delivered.push([...input.frames]);
      input.clear();
    });
    const stop = install();
    scheduler.runAll(context);
    const expected = {
      ...command,
      deltaYaw: 0,
      deltaPitch: 0,
      x: 0,
      y: 0,
      z: 0,
      triggers: [true, false, true, true, false, false],
    };
    expect(delivered).toEqual([[expected]]);

    input.push(movement);
    input.push(command);
    input.push(otherTriggers);
    stop();
    expect(input.frames).toEqual([expected]);
    expect(command.deltaYaw).toBe(0.4);
    expect(command.triggers).toEqual([true, true, true, true, true, true]);
  },
);

it.each([
  ["watcher", "watcher", "connected", true, "follow"],
  ["disconnected observer", "player", null, true, "fly"],
  ["unready observer", "player", "connected", false, "follow"],
  ["local player", "player", "connected", true, "local"],
] as const)(
  "clears every queued command after becoming a %s",
  (_label, role, gameStatus, liveReady, mode) => {
    Object.assign(fixture.live, {
      role: "player",
      gameStatus: "connected",
      liveReady: true,
    });
    fixture.inputMode = "follow";
    const command = {
      ...movement,
      triggers: [true, true, true, true, true, true],
    };
    scheduler.add(FramePriority.InputKeyboardMouse, () => input.push(command));
    const stop = install();
    // Read current readiness rather than a snapshot from installation time.
    Object.assign(fixture.live, { role, gameStatus, liveReady });
    fixture.inputMode = mode;
    scheduler.runAll(context);
    expect(input.frames).toHaveLength(0);
    input.push(command);
    stop();
    expect(input.frames).toHaveLength(0);
  },
);

it("releases once without clearing new input on a repeated cleanup", () => {
  const stop = install();
  input.push(movement);
  stop();
  expect(input.frames).toHaveLength(0);
  input.push(movement);
  stop();
  expect(input.frames).toEqual([movement]);
});
