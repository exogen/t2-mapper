import { beforeEach, expect, it, vi } from "vitest";
import { LUT3DEffect, type Effect } from "postprocessing";
import {
  Data3DTexture,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from "three";
import { createClipGraphicsEffectsStore } from "../state/graphicsEffectsStore";
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";
import { EffectPipelineOwner } from "./effectPipelineOwner";
import { createGamePostProcessing } from "./gamePostProcessing";
import { ColorGradeLutCache } from "./colorGradeLutCache";
import { CanvasEffectsController } from "./canvasEffectsController";

const fixture = vi.hoisted(() => ({
  composers: [] as Array<{
    dispose: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
    setMainCamera: ReturnType<typeof vi.fn>;
    passes: Array<{ dispose(): void; stages?: readonly Effect[] }>;
  }>,
}));

vi.mock("postprocessing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("postprocessing")>();
  const { WebGLRenderTarget } = await import("three");
  return {
    ...actual,
    EffectComposer: class {
      inputBuffer = new WebGLRenderTarget(8, 8, { depthBuffer: false });
      outputBuffer = new WebGLRenderTarget(8, 8, { depthBuffer: false });
      passes: Array<{ dispose(): void; stages?: readonly Effect[] }> = [];
      render = vi.fn();
      setMainCamera = vi.fn();
      dispose = vi.fn(() => {
        for (const pass of this.passes) pass.dispose();
        this.passes.length = 0;
        this.inputBuffer.dispose();
        this.outputBuffer.dispose();
      });
      constructor() {
        fixture.composers.push(this);
      }
      addPass(pass: { dispose(): void }, index = this.passes.length) {
        this.passes.splice(index, 0, pass);
      }
      removePass(pass: { dispose(): void }) {
        this.passes.splice(this.passes.indexOf(pass), 1);
      }
      setSize() {}
    },
  };
});

beforeEach(() => {
  fixture.composers.length = 0;
});

function rendererFixture() {
  return {
    extensions: { has: () => true },
    autoClear: true,
    getDrawingBufferSize: (size: {
      set(width: number, height: number): unknown;
    }) => size.set(8, 8),
    getSize: (size: { set(width: number, height: number): unknown }) =>
      size.set(4, 4),
    render: vi.fn(),
    copyFramebufferToTexture: vi.fn(),
    setRenderTarget: vi.fn(),
  } as unknown as WebGLRenderer;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("releases composed targets and capture texture on master-off while preserving settings", () => {
  const store = createClipGraphicsEffectsStore({
    intensity: { vignette: 0.7 },
  });
  const renderer = rendererFixture();
  const camera = new PerspectiveCamera();
  const owner = new EffectPipelineOwner<
    ReturnType<typeof createGamePostProcessing>
  >();
  owner.setActive(true);
  const stop = store.subscribe((settings) => owner.setActive(settings.enabled));
  const create = () =>
    createGamePostProcessing(renderer, new Scene(), camera, store);
  owner.render(create, (pipeline) =>
    pipeline.render(camera, 0.016, store.getState()),
  );
  const capture = vi.mocked(renderer.copyFramebufferToTexture).mock.calls[0][0];
  const captureDisposed = vi.fn();
  capture.addEventListener("dispose", captureDisposed);
  expect(
    readResourceMetrics()["postProcessing.estimatedCoreTargetBytes"],
  ).toBeGreaterThan(0);
  store.setState({ enabled: false });
  expect(fixture.composers[0].dispose).toHaveBeenCalledTimes(1);
  expect(captureDisposed).toHaveBeenCalledTimes(1);
  expect(
    readResourceMetrics()["postProcessing.estimatedCoreTargetBytes"],
  ).toBeUndefined();
  expect(store.getState()).toMatchObject({
    vignette: true,
    intensity: { vignette: 0.7 },
  });
  store.setState({ enabled: true });
  expect(fixture.composers).toHaveLength(1);
  const nextCamera = new PerspectiveCamera();
  owner.render(create, (pipeline) =>
    pipeline.render(nextCamera, 0.016, store.getState()),
  );
  expect(fixture.composers).toHaveLength(2);
  expect(fixture.composers[1].setMainCamera).toHaveBeenCalledWith(nextCamera);
  owner.dispose();
  stop();
});

it("disposes a late grade result after disable without resurrecting status or metrics", async () => {
  const store = createClipGraphicsEffectsStore({
    intensity: {},
    grade: { name: "NightLUT", intensity: 0.6 },
  });
  const request = deferred<Data3DTexture>();
  const load = vi.fn(() => request.promise);
  const renderer = rendererFixture();
  const camera = new PerspectiveCamera();
  const pipeline = createGamePostProcessing(
    renderer,
    new Scene(),
    camera,
    store,
    load,
  );
  expect(pipeline.render(camera, 0.016, store.getState())).toBe(false);
  expect(store.getState().gradeStatus).toBe("loading");
  store.setState({ enabled: false });
  pipeline.dispose();
  pipeline.dispose();
  const late = new Data3DTexture(new Uint8Array(32), 2, 2, 2);
  const lateDisposed = vi.fn();
  late.addEventListener("dispose", lateDisposed);
  request.resolve(late);
  await request.promise;
  expect(lateDisposed).toHaveBeenCalledTimes(1);
  expect(store.getState()).toMatchObject({
    colorGrade: "NightLUT",
    gradeIntensity: 0.6,
    gradeStatus: "idle",
    enabled: false,
  });
  expect(fixture.composers[0].dispose).toHaveBeenCalledTimes(1);
  expect(
    pipeline.render(camera, 0.016, { ...store.getState(), enabled: true }),
  ).toBe(false);
  expect(
    readResourceMetrics()["postProcessing.estimatedLutTextureBytes"],
  ).toBeUndefined();
});

it("ignores stale grade failure after replacement and lets a new controller finish loading", async () => {
  const store = createClipGraphicsEffectsStore({
    intensity: {},
    grade: { name: "NightLUT", intensity: 1 },
  });
  const first = deferred<Data3DTexture>();
  const second = deferred<Data3DTexture>();
  const renderer = rendererFixture();
  const camera = new PerspectiveCamera();
  const old = createGamePostProcessing(
    renderer,
    new Scene(),
    camera,
    store,
    () => first.promise,
  );
  old.render(camera, 0.016, store.getState());
  old.dispose();
  const current = createGamePostProcessing(
    renderer,
    new Scene(),
    camera,
    store,
    () => second.promise,
  );
  current.render(camera, 0.016, store.getState());
  first.reject(new Error("old request failed"));
  await first.promise.catch(() => {});
  expect(store.getState().gradeStatus).toBe("loading");
  const lut = new Data3DTexture(new Uint8Array(32), 2, 2, 2);
  second.resolve(lut);
  await second.promise;
  expect(store.getState().gradeStatus).toBe("idle");
  expect(current.render(camera, 0.016, store.getState())).toBe(true);
  expect(readResourceMetrics()["postProcessing.estimatedLutTextureBytes"]).toBe(
    32,
  );
  const disposed = vi.fn();
  lut.addEventListener("dispose", disposed);
  current.dispose();
  expect(disposed).toHaveBeenCalledTimes(1);
});

it("composes the selected grade on the first warm re-enabled frame without retaining GPU targets off", async () => {
  const store = createClipGraphicsEffectsStore({
    intensity: { vignette: 0.7 },
    grade: { name: "NightLUT", intensity: 0.6 },
  });
  const request = deferred<Data3DTexture>();
  const load = vi.fn(() => request.promise);
  const cache = new ColorGradeLutCache(32);
  const renderer = rendererFixture();
  const camera = new PerspectiveCamera();
  const owner = new EffectPipelineOwner<
    ReturnType<typeof createGamePostProcessing>
  >();
  const stop = store.subscribe((settings) => owner.setActive(settings.enabled));
  owner.setActive(true);
  const create = () =>
    createGamePostProcessing(renderer, new Scene(), camera, store, load, cache);
  owner.render(create, (pipeline) =>
    pipeline.render(camera, 0.016, store.getState()),
  );
  expect(store.getState().gradeStatus).toBe("loading");
  const loaded = new Data3DTexture(new Uint8Array(32).fill(73), 2, 2, 2);
  const gpuDisposed = vi.fn();
  loaded.addEventListener("dispose", gpuDisposed);
  request.resolve(loaded);
  await request.promise;
  expect(
    owner.render(create, (pipeline) =>
      pipeline.render(camera, 0.016, store.getState()),
    ),
  ).toBe(true);
  store.setState({ enabled: false });
  expect(gpuDisposed).toHaveBeenCalledTimes(1);
  expect(fixture.composers[0].dispose).toHaveBeenCalledTimes(1);
  expect(
    readResourceMetrics()["postProcessing.estimatedCoreTargetBytes"],
  ).toBeUndefined();
  expect(readResourceMetrics()["postProcessingLutCache.ownedLutBytes"]).toBe(
    32,
  );
  store.setState({ enabled: true });
  // No promise/microtask gets a chance to repair this first visible frame.
  expect(
    owner.render(create, (pipeline) =>
      pipeline.render(camera, 0.016, store.getState()),
    ),
  ).toBe(true);
  const grade = fixture.composers[1].passes
    .flatMap((pass) => pass.stages ?? [])
    .find((effect) => effect instanceof LUT3DEffect) as LUT3DEffect;
  expect(grade).toBeDefined();
  expect(grade.lut).not.toBe(loaded);
  expect((grade.lut as Data3DTexture).image.data).toEqual(loaded.image.data);
  expect(grade.blendMode.opacity.value).toBe(0.6);
  expect(load).toHaveBeenCalledTimes(1);
  expect(store.getState().gradeStatus).toBe("idle");
  const warmGpuDisposed = vi.fn();
  grade.lut.addEventListener("dispose", warmGpuDisposed);
  owner.dispose();
  expect(warmGpuDisposed).toHaveBeenCalledTimes(1);
  expect(fixture.composers[1].dispose).toHaveBeenCalledTimes(1);
  expect(readResourceMetrics()["postProcessingLutCache.ownedLutBytes"]).toBe(
    32,
  );
  cache.dispose();
  expect(
    readResourceMetrics()["postProcessingLutCache.ownedLutBytes"],
  ).toBeUndefined();
  stop();
});

it("never caches a stale grade completion, even before the replacement frame renders", async () => {
  const store = createClipGraphicsEffectsStore({
    intensity: {},
    grade: { name: "NightLUT", intensity: 1 },
  });
  const request = deferred<Data3DTexture>();
  const cache = new ColorGradeLutCache(32);
  const camera = new PerspectiveCamera();
  const pipeline = createGamePostProcessing(
    rendererFixture(),
    new Scene(),
    camera,
    store,
    () => request.promise,
    cache,
  );
  pipeline.render(camera, 0.016, store.getState());
  store.setState({ colorGrade: "NeutralLUT" });
  const stale = new Data3DTexture(new Uint8Array(32), 2, 2, 2);
  const disposed = vi.fn();
  stale.addEventListener("dispose", disposed);
  request.resolve(stale);
  await request.promise;
  expect(disposed).toHaveBeenCalledTimes(1);
  expect(cache.restore("NightLUT")).toBeUndefined();
  expect(readResourceMetrics()["postProcessingLutCache.ownedLutBytes"]).toBe(0);
  pipeline.dispose();
  cache.dispose();
});

it("keeps the existing cold-load behavior when a grade exceeds the CPU cache cap", async () => {
  const store = createClipGraphicsEffectsStore({
    intensity: {},
    grade: { name: "NightLUT", intensity: 1 },
  });
  const first = deferred<Data3DTexture>();
  const second = deferred<Data3DTexture>();
  const load = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const cache = new ColorGradeLutCache(31);
  const camera = new PerspectiveCamera();
  const renderer = rendererFixture();
  const initial = createGamePostProcessing(
    renderer,
    new Scene(),
    camera,
    store,
    load,
    cache,
  );
  expect(initial.render(camera, 0.016, store.getState())).toBe(false);
  first.resolve(new Data3DTexture(new Uint8Array(32), 2, 2, 2));
  await first.promise;
  expect(initial.render(camera, 0.016, store.getState())).toBe(true);
  store.setState({ enabled: false });
  initial.dispose();
  expect(readResourceMetrics()["postProcessingLutCache.ownedLutBytes"]).toBe(0);
  store.setState({ enabled: true });
  const current = createGamePostProcessing(
    renderer,
    new Scene(),
    camera,
    store,
    load,
    cache,
  );
  expect(current.render(camera, 0.016, store.getState())).toBe(false);
  expect(store.getState().gradeStatus).toBe("loading");
  expect(load).toHaveBeenCalledTimes(2);
  second.resolve(new Data3DTexture(new Uint8Array(32), 2, 2, 2));
  await second.promise;
  expect(current.render(camera, 0.016, store.getState())).toBe(true);
  current.dispose();
  cache.dispose();
});

it("does not repopulate the CPU cache after a disabled controller finishes loading", async () => {
  const store = createClipGraphicsEffectsStore({
    intensity: {},
    grade: { name: "NightLUT", intensity: 1 },
  });
  const request = deferred<Data3DTexture>();
  const cache = new ColorGradeLutCache(32);
  const camera = new PerspectiveCamera();
  const pipeline = createGamePostProcessing(
    rendererFixture(),
    new Scene(),
    camera,
    store,
    () => request.promise,
    cache,
  );
  pipeline.render(camera, 0.016, store.getState());
  store.setState({ enabled: false });
  pipeline.dispose();
  const late = new Data3DTexture(new Uint8Array(32), 2, 2, 2);
  const disposed = vi.fn();
  late.addEventListener("dispose", disposed);
  request.resolve(late);
  await request.promise;
  expect(disposed).toHaveBeenCalledTimes(1);
  expect(cache.restore("NightLUT")).toBeUndefined();
  expect(readResourceMetrics()["postProcessingLutCache.ownedLutBytes"]).toBe(0);
  cache.dispose();
});

it("keeps warm first-frame grading across the canvas controller's GPU lifetime", async () => {
  const store = createClipGraphicsEffectsStore({
    intensity: { vignette: 0.7 },
    grade: { name: "NightLUT", intensity: 0.6 },
  });
  const request = deferred<Data3DTexture>();
  const load = vi.fn(() => request.promise);
  const camera = new PerspectiveCamera();
  const controller = new CanvasEffectsController(
    rendererFixture(),
    new Scene(),
    vi.fn(),
    () =>
      Promise.resolve({
        createGamePostProcessing: (
          renderer,
          scene,
          camera,
          store,
          _loader,
          cache,
        ) =>
          createGamePostProcessing(renderer, scene, camera, store, load, cache),
      }),
  );
  controller.setStore(store);
  await Promise.resolve();
  controller.render(camera, 0.016);
  const lut = new Data3DTexture(new Uint8Array(32).fill(73), 2, 2, 2);
  const gpuDisposed = vi.fn();
  lut.addEventListener("dispose", gpuDisposed);
  request.resolve(lut);
  await request.promise;
  expect(controller.render(camera, 0.016)).toBe(true);
  expect(store.getState().awaitingFirstFrame).toBe(false);
  store.setState({ enabled: false });
  expect(gpuDisposed).toHaveBeenCalledTimes(1);
  expect(
    readResourceMetrics()["postProcessing.estimatedCoreTargetBytes"],
  ).toBeUndefined();
  expect(readResourceMetrics()["postProcessingLutCache.ownedLutBytes"]).toBe(
    32,
  );
  store.setState({ enabled: true });
  expect(controller.render(camera, 0.016)).toBe(true);
  const grade = fixture.composers[1].passes
    .flatMap((pass) => pass.stages ?? [])
    .find((effect) => effect instanceof LUT3DEffect) as LUT3DEffect;
  expect((grade.lut as Data3DTexture).image.data).toEqual(lut.image.data);
  expect(load).toHaveBeenCalledTimes(1);
  controller.dispose();
  expect(
    readResourceMetrics()["postProcessingLutCache.ownedLutBytes"],
  ).toBeUndefined();
});
