import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DefaultLoadingManager, PerspectiveCamera } from "three";
import { loadBitmapTextureInstance } from "../assets/bitmapTextures";
import { imageWorkQueue } from "../assets/imageWorkQueue";
import { loadShapeImageLists } from "../iflAtlas";
import type { DTSModel } from "../dts/dtsModel";
import { DTSMaterialFlags } from "../dts/dtsTypes";
import { graphicsEffectsStore } from "../state/graphicsEffectsStore";
import { settingsStore } from "../state/settingsStore";
import { mountEngineCanvas, type EngineCanvas } from "./engineCanvas";
import type { EngineHost, GameEngine } from "./gameEngine";

const renderers = vi.hoisted(() => [] as MockRenderer[]);

interface MockRenderer {
  render: ReturnType<typeof vi.fn>;
  displayed: unknown[];
}

vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return {
    ...actual,
    Timer: class {
      connect() {}
      update() {}
      getDelta() {
        return 0.016;
      }
      getElapsed() {
        return 1;
      }
      dispose() {}
    },
    WebGLRenderer: class implements MockRenderer {
      domElement = Object.assign(new EventTarget(), {
        style: {},
        remove: vi.fn(),
      });
      shadowMap = { enabled: false, type: 0, needsUpdate: false };
      info = { autoReset: true, reset: vi.fn() };
      displayed: unknown[] = [];
      render = vi.fn((scene: InstanceType<typeof actual.Scene>) => {
        this.displayed.push(scene.userData.readReady?.());
      });
      setPixelRatio() {}
      setSize() {}
      dispose() {}
      forceContextLoss() {}
      constructor() {
        renderers.push(this);
      }
    },
  };
});

vi.mock("../diagnostics/browserDiagnostics", () => ({
  attachEngineDiagnostics: () => () => {},
}));
vi.mock("../loaders", () => ({
  iflTextureToUrl: (name: string, path: string) =>
    `https://canvas.test/${path}/${name}`,
  loadImageFrameList: async () => [{ name: "frame", frameCount: 1 }],
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

const png = new Blob([
  Uint8Array.from(
    atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    ),
    (char) => char.charCodeAt(0),
  ),
]);
const previousSettings = settingsStore.getState();
const previousEffects = graphicsEffectsStore.getState();
const canvases: EngineCanvas[] = [];
let callbacks: Map<number, FrameRequestCallback>;
let nextFrame: number;
let frameTime: number;
let sequence = 0;
let decodes: Array<ReturnType<typeof deferred<ImageBitmap>>>;

beforeEach(() => {
  sequence++;
  renderers.length = 0;
  callbacks = new Map();
  nextFrame = 0;
  frameTime = 0;
  decodes = [];
  settingsStore.setState({ renderOnDemand: true, fpsLimit: null });
  graphicsEffectsStore.setState({ enabled: false });
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {} }),
    }),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++nextFrame, callback);
    return nextFrame;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  vi.stubGlobal("ProgressEvent", Event);
  vi.stubGlobal("fetch", async () => new Response(png));
  vi.stubGlobal("createImageBitmap", () => {
    const decode = deferred<ImageBitmap>();
    decodes.push(decode);
    return decode.promise;
  });
});

afterEach(async () => {
  // Drain even after an assertion fails, so the global manager/queue cannot
  // carry an unfinished request into another lifecycle scenario.
  for (const decode of decodes)
    decode.resolve({ width: 1, height: 1 } as ImageBitmap);
  await vi.waitFor(() => {
    expect(imageWorkQueue.active).toBe(0);
    expect(imageWorkQueue.queued).toBe(0);
  });
  for (const canvas of canvases.splice(0)) canvas.dispose();
  settingsStore.setState(previousSettings, true);
  graphicsEffectsStore.setState(previousEffects, true);
  vi.unstubAllGlobals();
});

function drainFrames() {
  let frames = 0;
  while (callbacks.size) {
    if (++frames > 100) throw new Error("On-demand canvas did not settle");
    const ready = [...callbacks.values()];
    callbacks.clear();
    for (const callback of ready) callback((frameTime += 16));
  }
}

/** The host boundary is exercised by the real canvas; frame systems are idle. */
function engine(readReady: () => unknown) {
  let currentHost: EngineHost | null = null;
  return {
    cameras: { active: new PerspectiveCamera() },
    get currentHost() {
      return currentHost;
    },
    connect(host: EngineHost) {
      currentHost = host;
      host.scene.userData.readReady = readReady;
      return () => {
        if (currentHost === host) currentHost = null;
      };
    },
    beginFrame: (frame: object) => ({ ...frame, frame: 1 }),
    runFrame() {},
    endFrame() {},
  } as unknown as GameEngine;
}

function mount(current: GameEngine) {
  const container = {
    appendChild() {},
    getBoundingClientRect: () => ({ width: 320, height: 200 }),
  } as unknown as HTMLElement;
  const canvas = mountEngineCanvas(current, container);
  canvases.push(canvas);
  return canvas;
}

it("wakes an idle canvas for a late bitmap while other queued image work remains pending", async () => {
  const texture = loadBitmapTextureInstance(
    `https://canvas.test/late-${sequence}.png`,
  );
  loadBitmapTextureInstance(`https://canvas.test/blocker-${sequence}.png`);
  const current = engine(() => texture.image !== null);
  mount(current);
  drainFrames();
  expect(renderers[0].displayed.at(-1)).toBe(false);
  expect(callbacks.size).toBe(0);
  await vi.waitFor(() => expect(decodes).toHaveLength(2));
  decodes[0].resolve({ width: 1, height: 1 } as ImageBitmap);
  await vi.waitFor(() => expect(texture.image).not.toBeNull());
  expect(current.currentHost!.assetsLoading()).toBe(true);
  expect(callbacks.size).toBe(1);
  drainFrames();
  expect(renderers[0].displayed.at(-1)).toBe(true);

  decodes[1].resolve({ width: 1, height: 1 } as ImageBitmap);
  await vi.waitFor(() =>
    expect(current.currentHost!.assetsLoading()).toBe(false),
  );
  drainFrames();
});

it("renders an IFL published by promise continuations after the last image item ends", async () => {
  const model = {
    data: {
      names: [`late-${sequence}.ifl`],
      materials: [{ flags: DTSMaterialFlags.IflMaterial }],
      iflMaterials: [{ materialSlot: 0, nameIndex: 0 }],
      sequences: [],
    },
    scene: { imageAnimations: [] },
  } as unknown as DTSModel;
  mount(engine(() => model.scene.imageAnimations.length));
  drainFrames();
  expect(renderers[0].displayed.at(-1)).toBe(0);
  const pending = loadShapeImageLists(model);
  await vi.waitFor(() => expect(decodes).toHaveLength(1));
  expect(callbacks.size).toBe(0);
  decodes[0].resolve({ width: 1, height: 1 } as ImageBitmap);
  await pending;
  expect(callbacks.size).toBe(1);
  drainFrames();
  expect(renderers[0].displayed.at(-1)).toBe(1);
});

it("wakes only the current canvas and removes disposed listeners without disturbing its replacement", () => {
  const current = engine(() => true);
  const first = mount(current);
  drainFrames();
  const second = mount(current);
  drainFrames();
  renderers.forEach((renderer) => renderer.render.mockClear());

  DefaultLoadingManager.itemStart("overlapping-canvas");
  DefaultLoadingManager.itemEnd("overlapping-canvas");
  expect(callbacks.size).toBe(1);
  drainFrames();
  expect(renderers[0].render).not.toHaveBeenCalled();
  expect(renderers[1].render).toHaveBeenCalled();
  first.dispose();
  renderers[1].render.mockClear();

  DefaultLoadingManager.itemStart("replacement-canvas");
  DefaultLoadingManager.itemEnd("replacement-canvas");
  drainFrames();
  expect(renderers[1].render).toHaveBeenCalled();
  DefaultLoadingManager.itemStart("disposed-canvas");
  DefaultLoadingManager.itemEnd("disposed-canvas");
  expect(callbacks.size).toBe(1);
  second.dispose();
  expect(callbacks.size).toBe(0);
  DefaultLoadingManager.itemStart("after-disposal");
  DefaultLoadingManager.itemEnd("after-disposal");
  expect(callbacks.size).toBe(0);
});
