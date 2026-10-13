import { afterAll, afterEach, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => {
  // Just enough browser for the real input stack under Node: InputControls
  // listens on window at import, and r3f only uses layout effects when a
  // document can create elements.
  type Listener = (event: unknown) => void;
  const windowListeners = new Map<string, Set<Listener>>();
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
  const globals = {
    window: {
      ...eventTarget(windowListeners),
      document,
      devicePixelRatio: 1,
      location: { hash: "", search: "", href: "http://localhost/" },
      matchMedia: () => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {},
      }),
    },
    document,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => {},
    IS_REACT_ACT_ENVIRONMENT: true,
  };
  Object.assign(globalThis, globals);
  return {
    globals,
    touch: false,
    dispatch(type: string, event: unknown) {
      for (const fn of windowListeners.get(type) ?? []) fn(event);
    },
  };
});

vi.mock("./SettingsProvider", () => ({
  MIN_SPEED_MULTIPLIER: 0.01,
  MAX_SPEED_MULTIPLIER: 1,
  useSettings: () => ({ followBehindPlayer: false }),
  useControls: () => ({
    speedMultiplier: 1,
    setSpeedMultiplier() {},
    mouseSensitivity: 0.002,
    invertScroll: false,
    invertDrag: false,
    touchMode: "moveLookStick",
    invertJoystick: false,
  }),
}));
vi.mock("./CamerasProvider", () => ({
  useCameras: () => ({ setCameraIndex() {}, cameraCount: 0 }),
}));
vi.mock("./useTouchDevice", () => ({ useTouchDevice: () => browser.touch }));
vi.mock("./WelcomeSplash", () => ({ isWelcomeSplashOpen: () => false }));

import { act, advance, createRoot, useThree } from "@react-three/fiber";
import type { Camera } from "three";
import { InputConsumer } from "./InputConsumer";
import { InputBindings } from "./InputBindings";
import { InputProducer, InputProvider } from "./InputProducer";
import { TickProvider } from "./TickProvider";
import { FREE_FLY_INPUT, MOVABLE_CAMERA_INPUT } from "./inputMap";
import { inputControlsStore } from "./InputControls";
import { liveConnectionStore } from "../state/liveConnectionStore";

// advance() drives every live root, so a root left behind by a failed
// test would keep running (and clearing input) in the next one.
const unmounts: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const unmount of unmounts.splice(0)) await unmount();
  browser.dispatch("keyup", {
    code: "KeyW",
    metaKey: false,
    preventDefault() {},
  });
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

/**
 * The real live input pipeline (producers → drain → ticks → pose) in an r3f
 * root driven frame by frame, against a fake player adapter.
 */
async function mountLiveInput({ touch = false } = {}) {
  browser.touch = touch;
  const canvas = {
    addEventListener() {},
    removeEventListener() {},
    style: {},
    requestPointerLock() {},
  };
  const root = createRoot(canvas as never);
  unmounts.push(() => act(async () => root.unmount()));
  await root.configure({
    gl: {
      render() {},
      setPixelRatio() {},
      setSize() {},
      domElement: canvas,
    } as never,
    frameloop: "never",
    size: { width: 800, height: 600, top: 0, left: 0 },
    dpr: 1,
  });

  let frame = 0;
  let time = 0;
  let camera: Camera | undefined;
  const sent: SentMove[] = [];
  const adapter = {
    lastMoveAck: 0,
    serverUpdateId: 1,
    observerMode: "fly",
    snapshot: {
      camera: { yaw: 0, pitch: 0, position: [0, 0, 0], mode: "observer" },
      entities: [],
    },
    getSnapshot() {
      return this.snapshot;
    },
    submitMove(move: { y: number; yaw: number }, index: number) {
      sent.push({ frame, index, y: move.y, yaw: move.yaw });
    },
  };
  liveConnectionStore.setState({
    adapter,
    gameStatus: "connected",
    liveReady: true,
    role: "player",
    mapName: "Test",
    sendMoves() {},
    sendCommand() {},
  } as never);

  function CameraProbe() {
    camera = useThree((state) => state.camera);
    return null;
  }
  await act(async () => {
    root.render(
      <TickProvider>
        <InputProvider>
          <InputBindings map={FREE_FLY_INPUT} />
          <InputBindings map={MOVABLE_CAMERA_INPUT} />
          <InputProducer />
          <InputConsumer />
          <CameraProbe />
        </InputProvider>
      </TickProvider>,
    );
  });
  // InputProducer loads TouchHandler lazily.
  for (let i = 0; touch && i < 5; i++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  }

  return {
    sent,
    adapter,
    key(type: "keydown" | "keyup", code: string) {
      browser.dispatch(type, { code, metaKey: false, preventDefault() {} });
    },
    async step(seconds: number, { ack = true } = {}) {
      frame++;
      time += seconds;
      await act(async () => advance(time));
      if (ack && sent.length > 0) adapter.lastMoveAck = sent.at(-1)!.index + 1;
    },
    /**
     * The forward axis of each move collected in the latest frame.
     */
    forwardMoves() {
      return sent.filter((move) => move.frame === frame).map((move) => move.y);
    },
    cameraX() {
      return camera!.position.x;
    },
  };
}

it("moves on every tick of a slow frame while a key is held, and none once released", async () => {
  const live = await mountLiveInput();
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
  const live = await mountLiveInput();
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
  const live = await mountLiveInput({ touch: true });
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
