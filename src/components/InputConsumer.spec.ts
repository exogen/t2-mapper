import { afterAll, afterEach, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => {
  // Just enough browser for the real input stack under Node: InputControls
  // listens on window at import.
  type Listener = (event: unknown) => void;
  const windowListeners = new Map<string, Set<Listener>>();
  const api = {
    globals: {} as Record<string, unknown>,
    touch: false,
    dispatch(type: string, event: unknown) {
      for (const fn of windowListeners.get(type) ?? []) fn(event);
    },
  };
  const eventTarget = (listeners: Map<string, Set<Listener>>) => ({
    addEventListener(type: string, fn: Listener) {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(fn));
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn);
    },
  });
  const document = {
    ...eventTarget(new Map()),
    createElement: () => ({ style: {} }),
    activeElement: null,
    body: null,
    pointerLockElement: null,
    exitPointerLock() {},
  };
  const globals = (api.globals = {
    window: {
      ...eventTarget(windowListeners),
      document,
      devicePixelRatio: 1,
      location: { hash: "", search: "", href: "http://localhost/" },
      matchMedia: () => ({
        get matches() {
          return api.touch;
        },
        addEventListener() {},
        removeEventListener() {},
      }),
    },
    document,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  Object.assign(globalThis, globals);
  return api;
});

const preferences = vi.hoisted(() => ({
  followBehindPlayer: false,
  speedMultiplier: 1,
  mouseSensitivity: 0.002,
  invertScroll: false,
  invertDrag: false,
  touchMode: "moveLookStick" as "moveLookStick" | "dualStick",
  invertJoystick: false,
}));

vi.mock("../state/settingsStore", () => ({
  MIN_SPEED_MULTIPLIER: 0.01,
  MAX_SPEED_MULTIPLIER: 1,
  setPreference(
    key: "speedMultiplier",
    action: number | ((previous: number) => number),
  ) {
    preferences[key] =
      typeof action === "function" ? action(preferences[key]) : action;
  },
  settingsStore: {
    getState: () => preferences,
    subscribe: () => () => {},
  },
}));

import { PerspectiveCamera, Scene, Vector3 } from "three";
import { GameEngine } from "../engine/gameEngine";
import { installInputBindings } from "../engine/inputBindings";
import { installInputConsumer } from "../engine/inputConsumer";
import { installKeyboardMouseInput } from "../engine/keyboardMouseInput";
import { installTouchInput } from "../engine/touchInput";
import { combineCleanups } from "../engine/storeReaction";
import { FREE_FLY_INPUT, MOVABLE_CAMERA_INPUT } from "./inputMap";
import { inputControlsStore } from "./InputControls";
import { liveConnectionStore } from "../state/liveConnectionStore";
import { joystickState } from "../state/joystickState";
import {
  MAX_ORBIT_DISTANCE,
  MIN_ORBIT_DISTANCE,
  resetStreamPlayback,
  streamPlaybackStore,
} from "../state/streamPlaybackStore";

// Systems left installed by a failed test would keep running (and
// clearing input) in the next one.
const unmounts: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await unmount();
  for (const code of ["KeyW", "KeyS"]) {
    browser.dispatch("keyup", { code, metaKey: false, preventDefault() {} });
  }
  joystickState.move.force = 0;
  joystickState.look.force = 0;
  resetStreamPlayback();
  inputControlsStore.setState({ actions: {} });
});
afterAll(() => {
  for (const key of Object.keys(browser.globals)) {
    delete (globalThis as Record<string, unknown>)[key];
  }
});

/**
 * Fly speed per tick: 80 × the engine's 1/32 position scale.
 */
const TICK_STEP = 2.5;

interface SentMove {
  frame: number;
  index: number;
  y: number;
  yaw: number;
}

interface TestSnapshot {
  camera: {
    yaw: number;
    pitch: number;
    position: number[];
    mode: string;
    orbitDistance?: number;
    orbitTargetId?: string;
  };
  entities: { id: string; position: number[] }[];
}

/**
 * The real input pipeline (producers → drain → ticks → pose) on an engine
 * driven frame by frame, optionally against a fake live player adapter.
 */
async function mountInput({
  touch = false,
  live = true,
  speedMultiplier = 1,
  touchMode = "moveLookStick" as typeof preferences.touchMode,
  invertScroll = false,
} = {}) {
  browser.touch = touch;
  preferences.speedMultiplier = speedMultiplier;
  preferences.touchMode = touchMode;
  preferences.invertScroll = invertScroll;
  const canvasListeners = new Map<string, (event: unknown) => void>();
  const canvas = {
    addEventListener(type: string, listener: (event: unknown) => void) {
      canvasListeners.set(type, listener);
    },
    removeEventListener(type: string) {
      canvasListeners.delete(type);
    },
    style: {},
    requestPointerLock() {},
  };

  let frame = 0;
  let time = 0;
  const camera = new PerspectiveCamera();
  const sent: SentMove[] = [];
  const adapter = {
    lastMoveAck: 0,
    serverUpdateId: 1,
    observerMode: "fly",
    snapshot: {
      camera: { yaw: 0, pitch: 0, position: [0, 0, 0], mode: "observer" },
      entities: [],
    } as TestSnapshot,
    getSnapshot() {
      return this.snapshot;
    },
    submitMove(move: { y: number; yaw: number }, index: number) {
      sent.push({ frame, index, y: move.y, yaw: move.yaw });
    },
  };
  liveConnectionStore.setState({
    adapter: live ? adapter : null,
    gameStatus: live ? "connected" : null,
    liveReady: live,
    role: live ? "player" : null,
    mapName: "Test",
    sendMoves() {},
    sendCommand() {},
  } as never);

  const engine = new GameEngine();
  const scene = new Scene();
  const renderer = { domElement: canvas } as never;
  engine.connect({
    renderer,
    scene,
    invalidate() {},
    assetsLoading: () => false,
  });
  const stopSystems = combineCleanups(
    installTouchInput(engine),
    installKeyboardMouseInput(engine),
    installInputConsumer(engine),
    installInputBindings(engine, FREE_FLY_INPUT),
    installInputBindings(engine, MOVABLE_CAMERA_INPUT),
  );
  unmounts.push(async () => stopSystems());

  return {
    sent,
    adapter,
    camera,
    key(type: "keydown" | "keyup", code: string) {
      browser.dispatch(type, { code, metaKey: false, preventDefault() {} });
    },
    wheel(deltaY: number) {
      canvasListeners.get("wheel")!({
        deltaX: 0,
        deltaY,
        offsetX: 0,
        offsetY: 0,
      });
    },
    async step(seconds: number, { ack = true } = {}) {
      frame++;
      time += seconds;
      engine.scheduler.runAll(
        engine.beginFrame({
          delta: seconds,
          elapsed: time,
          camera,
          renderer,
          scene,
        }),
      );
      if (ack && sent.length > 0) adapter.lastMoveAck = sent.at(-1)!.index + 1;
    },
    /**
     * The forward axis of each move collected in the latest frame.
     */
    forwardMoves() {
      return sent.filter((move) => move.frame === frame).map((move) => move.y);
    },
    cameraX() {
      return camera.position.x;
    },
  };
}

it("moves on every tick of a slow frame while a key is held, and none once released", async () => {
  const live = await mountInput();
  live.key("keydown", "KeyW");
  await live.step(1 / 60);
  await live.step(0.32);
  expect(live.forwardMoves()).toEqual(Array(10).fill(1));

  // Released right before the next slow frame: no tick repeats it.
  live.key("keyup", "KeyW");
  await live.step(0.32);
  expect(live.forwardMoves()).toEqual(Array(10).fill(0));
});

it("keeps interpolating through server packets that agree with the prediction", async () => {
  const live = await mountInput();
  live.key("keydown", "KeyW");
  await live.step(1 / 60, { ack: false });
  const xs: number[] = [];
  for (let frame = 0; frame < 40; frame++) {
    // 16 packets/s at 60 fps, each acking all but the last 3 moves with the
    // server camera exactly where the acked moves put it.
    if (frame % 4 === 0 && live.sent.length > 3) {
      const ack = live.sent.at(-1)!.index - 2;
      const y = live.sent
        .filter((move) => move.index < ack)
        .reduce((sum, move) => sum + move.y * TICK_STEP, 0);
      live.adapter.snapshot = {
        camera: { yaw: 0, pitch: 0, position: [0, y, 0], mode: "observer" },
        entities: [],
      };
      live.adapter.serverUpdateId++;
      live.adapter.lastMoveAck = ack;
    }
    await live.step(1 / 60, { ack: false });
    xs.push(live.cameraX());
  }
  // Ticks are 32 ms apart, so the camera covers TICK_STEP per 32 ms.
  for (let i = 11; i < xs.length; i++) {
    expect(xs[i] - xs[i - 1]).toBeCloseTo(TICK_STEP / 0.032 / 60, 3);
  }
});

it("reads touch drag-look before the keyboard handler clears the raw deltas", async () => {
  const live = await mountInput({ touch: true });
  for (let i = 0; i < 4; i++) {
    inputControlsStore.setState((prev) => ({
      ...prev,
      actions: {
        ...prev.actions,
        touchLook: { touching: true, dragging: true, deltaX: 50, deltaY: 0 },
      },
    }));
    await live.step(1 / 30);
  }
  expect(live.sent.reduce((sum, move) => sum + move.yaw, 0)).not.toBe(0);
});

function touchGesture(
  deltaX: number,
  deltaY: number,
  pinchScale?: number,
  active = true,
) {
  inputControlsStore.setState(({ actions }) => ({
    actions: {
      ...actions,
      touchLook: { touching: active, dragging: active, deltaX, deltaY },
      orbitPinchZoom: {
        pinching: active && pinchScale != null,
        deltaX: 0,
        deltaY: 0,
        x: 0,
        y: 0,
        deltaDistance: 0,
        deltaScale: pinchScale ?? 1,
      },
    },
  }));
}

it.each(["moveLookStick", "dualStick"] as const)(
  "orbits a followed target with a canvas drag in %s mode, consuming the drag once",
  async (touchMode) => {
    const local = await mountInput({ live: false, touch: true, touchMode });
    streamPlaybackStore.setState({
      playback: {} as never,
      cameraMode: "orbitOverride",
      orbitOverrideYaw: 0,
      orbitOverridePitch: 0,
    });
    touchGesture(50, 25);
    await local.step(1 / 60);
    expect(streamPlaybackStore.getState().orbitOverrideYaw).toBeCloseTo(0.2);
    expect(streamPlaybackStore.getState().orbitOverridePitch).toBeCloseTo(0.1);
    await local.step(1 / 60);
    expect(streamPlaybackStore.getState().orbitOverrideYaw).toBeCloseTo(0.2);
    expect(streamPlaybackStore.getState().orbitOverridePitch).toBeCloseTo(0.1);
  },
);

it("pinches orbit distance in both directions without rotating, replaying deltas, or exceeding the zoom limits", async () => {
  const local = await mountInput({ live: false, touch: true });
  streamPlaybackStore.setState({
    playback: {} as never,
    cameraMode: "orbitOverride",
    orbitOverrideDistance: 8,
    orbitOverrideYaw: 0,
    orbitOverridePitch: 0,
  });
  // Raw handlers keep two-finger motion out of the single-finger deltas.
  touchGesture(0, 0, 2);
  await local.step(1 / 60);
  const closer = streamPlaybackStore.getState().orbitOverrideDistance;
  expect(closer).toBe(4);
  expect(streamPlaybackStore.getState().orbitOverrideYaw).toBe(0);
  expect(streamPlaybackStore.getState().orbitOverridePitch).toBe(0);
  await local.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(closer);

  touchGesture(0, 0, 0.5);
  await local.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBeCloseTo(8);
  touchGesture(0, 0, 1_000_000);
  await local.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(
    MIN_ORBIT_DISTANCE,
  );
  touchGesture(0, 0, 0.000001);
  await local.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(
    MAX_ORBIT_DISTANCE,
  );
});

it("shares native live follow distance and limits between wheel and pinch, preserving zoom through server corrections", async () => {
  const live = await mountInput({ touch: true });
  live.adapter.snapshot = {
    camera: {
      yaw: 0,
      pitch: 0,
      position: [0, 0, 0],
      mode: "third-person",
      orbitDistance: 6,
      orbitTargetId: "target",
    },
    entities: [{ id: "target", position: [5, 7, 11] }],
  };
  await live.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(6);

  const flySpeed = preferences.speedMultiplier;
  live.wheel(-100);
  const wheelDistance = streamPlaybackStore.getState().orbitOverrideDistance;
  expect(wheelDistance).toBeLessThan(6);
  expect(preferences.speedMultiplier).toBe(flySpeed);

  touchGesture(0, 0, 2);
  await live.step(1 / 60);
  const distance = streamPlaybackStore.getState().orbitOverrideDistance;
  const target = new Vector3(7, 11, 5);
  expect(distance).toBeCloseTo(wheelDistance / 2);
  expect(live.camera.position.distanceTo(target)).toBeCloseTo(distance);

  live.adapter.serverUpdateId++;
  live.adapter.snapshot = {
    ...live.adapter.snapshot,
    camera: { ...live.adapter.snapshot.camera, orbitDistance: 6 },
  };
  await live.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(distance);
  expect(live.camera.position.distanceTo(target)).toBeCloseTo(distance);

  live.wheel(1_000_000);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(
    MAX_ORBIT_DISTANCE,
  );
  touchGesture(0, 0, 1_000_000);
  await live.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(
    MIN_ORBIT_DISTANCE,
  );
  touchGesture(0, 0, 0.000001);
  await live.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(
    MAX_ORBIT_DISTANCE,
  );
  live.wheel(-1_000_000);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(
    MIN_ORBIT_DISTANCE,
  );
});

it("consumes a completed quick pinch once, then accepts a fresh drag", async () => {
  const local = await mountInput({ live: false, touch: true });
  streamPlaybackStore.setState({
    playback: {} as never,
    cameraMode: "orbitOverride",
    orbitOverrideDistance: 8,
    orbitOverrideYaw: 0,
    orbitOverridePitch: 0,
  });
  touchGesture(0, 0, 2, false);
  await local.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(4);
  expect(streamPlaybackStore.getState().orbitOverrideYaw).toBe(0);
  expect(streamPlaybackStore.getState().orbitOverridePitch).toBe(0);
  await local.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(4);

  touchGesture(10, 5);
  await local.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideYaw).toBeCloseTo(0.04);
  expect(streamPlaybackStore.getState().orbitOverridePitch).toBeCloseTo(0.02);
});

it("consumes the final drag after release without repeating it on later frames", async () => {
  const local = await mountInput({ live: false, touch: true });
  streamPlaybackStore.setState({
    playback: {} as never,
    cameraMode: "orbitOverride",
    orbitOverrideYaw: 0,
    orbitOverridePitch: 0,
  });
  touchGesture(50, 25, undefined, false);
  await local.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideYaw).toBeCloseTo(0.2);
  expect(streamPlaybackStore.getState().orbitOverridePitch).toBeCloseTo(0.1);
  await local.step(1 / 60);
  expect(streamPlaybackStore.getState().orbitOverrideYaw).toBeCloseTo(0.2);
  expect(streamPlaybackStore.getState().orbitOverridePitch).toBeCloseTo(0.1);
});

it.each(["original", "firstPersonOverride", "freeFly"] as const)(
  "does not change orbit distance or angles from stale follow gestures in %s mode",
  async (cameraMode) => {
    const local = await mountInput({ live: false, touch: true });
    streamPlaybackStore.setState({
      playback: {} as never,
      cameraMode,
      orbitOverrideDistance: 8,
      orbitOverrideYaw: 0,
      orbitOverridePitch: 0,
    });
    touchGesture(50, 25, 2);
    await local.step(1 / 60);
    expect(streamPlaybackStore.getState().orbitOverrideDistance).toBe(8);
    expect(streamPlaybackStore.getState().orbitOverrideYaw).toBe(0);
    expect(streamPlaybackStore.getState().orbitOverridePitch).toBe(0);
  },
);

it.each([
  [0.01, 12.5],
  [0.15, 37.5],
])(
  "preserves the original local WASD speed at multiplier %s",
  async (speedMultiplier, unitsPerSecond) => {
    const local = await mountInput({ live: false, speedMultiplier });
    local.key("keydown", "KeyW");
    await local.step(0.25);
    expect(local.camera.position.z).toBeCloseTo(-unitsPerSecond * 0.25);
  },
);

it.each([
  ["KeyW", 1],
  ["KeyS", -1],
] as const)(
  "keeps all 100 slider positions moving through every server speed step with %s",
  async (key, direction) => {
    const live = await mountInput();
    live.key("keydown", key);
    await live.step(1 / 60);
    const speeds: number[] = [];
    for (let position = 1; position <= 100; position++) {
      preferences.speedMultiplier = position / 100;
      await live.step(0.032);
      const moves = live.forwardMoves();
      expect(moves).not.toHaveLength(0);
      const speed = moves[0] * direction;
      expect(speed).toBeGreaterThanOrEqual(speeds.at(-1) ?? 1 / 16);
      speeds.push(speed);
    }
    expect(speeds[0]).toBe(1 / 16);
    expect(speeds.at(-1)).toBe(1);
    expect([...new Set(speeds)]).toEqual(
      Array.from({ length: 16 }, (_, index) => (index + 1) / 16),
    );
  },
);

it.each([false, true])(
  "moves the wheel one sidebar step at every position and clamps overshoot (inverted: %s)",
  async (invertScroll) => {
    const local = await mountInput({ live: false, invertScroll });
    const scrollSign = invertScroll ? -1 : 1;
    for (let position = 1; position <= 100; position++) {
      preferences.speedMultiplier = position / 100;
      local.wheel(-scrollSign);
      expect(preferences.speedMultiplier).toBe(
        Math.min(100, position + 1) / 100,
      );
      preferences.speedMultiplier = position / 100;
      local.wheel(scrollSign);
      expect(preferences.speedMultiplier).toBe(Math.max(1, position - 1) / 100);
    }
    preferences.speedMultiplier = 0.05;
    local.wheel(1_000_000 * scrollSign);
    expect(preferences.speedMultiplier).toBe(0.01);
    preferences.speedMultiplier = 0.95;
    local.wheel(-1_000_000 * scrollSign);
    expect(preferences.speedMultiplier).toBe(1);
  },
);

it.each([
  ["dualStick", 11.6],
  ["moveLookStick", 11],
] as const)(
  "preserves the original minimum local joystick speed in %s mode",
  async (touchMode, unitsPerSecond) => {
    const local = await mountInput({
      live: false,
      touch: true,
      touchMode,
      speedMultiplier: 0.01,
    });
    joystickState.move.angle = Math.PI / 2;
    joystickState.move.force = 1;
    await local.step(0.25);
    expect(local.camera.position.length()).toBeCloseTo(unitsPerSecond * 0.25);
  },
);
