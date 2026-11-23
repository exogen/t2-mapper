import { expect, it, vi } from "vitest";
import {
  Data3DTexture,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from "three";
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";
import { createClipGraphicsEffectsStore } from "../state/graphicsEffectsStore";
import { CanvasEffectsController } from "./canvasEffectsController";
import type { createGamePostProcessing } from "./gamePostProcessing";

type EffectsModule = {
  createGamePostProcessing: typeof createGamePostProcessing;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(load?: () => Promise<EffectsModule>) {
  const pipelines: Array<ReturnType<typeof createGamePostProcessing>> = [];
  const create = vi.fn(
    (..._args: Parameters<typeof createGamePostProcessing>) => {
      const pipeline = {
        render: vi.fn(() => true),
        resize: vi.fn(),
        dispose: vi.fn(),
      };
      pipelines.push(pipeline);
      return pipeline;
    },
  );
  const invalidate = vi.fn();
  const controller = new CanvasEffectsController(
    {} as WebGLRenderer,
    new Scene(),
    invalidate,
    load ?? (() => Promise.resolve({ createGamePostProcessing: create })),
  );
  const store = createClipGraphicsEffectsStore({
    intensity: { vignette: 0.7 },
  });
  const camera = new PerspectiveCamera();
  return { controller, store, camera, pipelines, create, invalidate };
}

it("keeps the newest store when retiring a pipeline synchronously changes ownership again", async () => {
  const f = fixture();
  f.controller.setStore(f.store);
  await Promise.resolve();
  f.controller.render(f.camera, 0.016);
  const middle = createClipGraphicsEffectsStore({
    intensity: { vignette: 0.3 },
  });
  const latest = createClipGraphicsEffectsStore({
    intensity: { vignette: 0.9 },
  });
  vi.mocked(f.pipelines[0].dispose).mockImplementation(() =>
    f.controller.setStore(latest),
  );
  f.controller.setStore(middle);
  f.controller.render(f.camera, 0.016);
  expect(f.create.mock.calls.at(-1)?.[3]).toBe(latest);
  const invalidations = f.invalidate.mock.calls.length;
  middle.setState({ enabled: false });
  expect(f.invalidate).toHaveBeenCalledTimes(invalidations);
  f.controller.dispose();
});

it("releases the CPU grade and subscription even when GPU disposal throws", async () => {
  const f = fixture();
  f.controller.setStore(f.store);
  await Promise.resolve();
  f.controller.render(f.camera, 0.016);
  const cache = f.create.mock.calls[0][5]!;
  const texture = new Data3DTexture(new Uint8Array(32), 2, 2, 2);
  cache.remember("NightLUT", texture);
  vi.mocked(f.pipelines[0].dispose).mockImplementation(() => {
    throw new Error("GPU dispose observer");
  });
  expect(() => f.controller.dispose()).toThrow("GPU dispose observer");
  expect(
    readResourceMetrics()["postProcessingLutCache.ownedLutBytes"],
  ).toBeUndefined();
  expect(cache.restore("NightLUT")).toBeUndefined();
  const invalidations = f.invalidate.mock.calls.length;
  f.store.setState({ enabled: false });
  expect(f.invalidate).toHaveBeenCalledTimes(invalidations);
  f.controller.dispose();
  texture.dispose();
});

it("does not acknowledge a newly requested selection using a previous selection's frame", async () => {
  const f = fixture();
  f.controller.setStore(f.store);
  await Promise.resolve();
  f.controller.render(f.camera, 0.016);
  vi.mocked(f.pipelines[0].render).mockImplementationOnce(() => {
    f.store.setState({
      intensity: { ...f.store.getState().intensity, vignette: 0.2 },
      awaitingFirstFrame: true,
    });
    return true;
  });
  f.controller.render(f.camera, 0.016);
  expect(f.store.getState().awaitingFirstFrame).toBe(true);
  f.controller.render(f.camera, 0.016);
  expect(f.store.getState().awaitingFirstFrame).toBe(false);
  f.controller.dispose();
});

it("does not strand a new selection made synchronously from a module-error observer", async () => {
  const request = deferred<EffectsModule>();
  const next = deferred<EffectsModule>();
  const load = vi
    .fn()
    .mockReturnValueOnce(request.promise)
    .mockReturnValueOnce(next.promise);
  const f = fixture(load);
  f.store.setState({ colorGrade: "NightLUT" });
  f.controller.setStore(f.store);
  const unsubscribe = f.store.subscribe((settings) => {
    if (settings.colorGrade === "NightLUT" && settings.gradeStatus === "error")
      f.store.setState({
        colorGrade: "NeutralLUT",
        gradeStatus: "loading",
        awaitingFirstFrame: true,
      });
  });
  request.reject(new Error("module unavailable"));
  await request.promise.catch(() => {});
  expect(load).toHaveBeenCalledTimes(2);
  next.resolve({ createGamePostProcessing: f.create });
  await next.promise;
  expect(f.controller.render(f.camera, 0.016)).toBe(true);
  unsubscribe();
  f.controller.dispose();
});

it("keeps lazy import completion from allocating GPU work while disabled or disposed", async () => {
  const request = deferred<EffectsModule>();
  const f = fixture(() => request.promise);
  f.controller.setStore(f.store);
  expect(f.controller.render(f.camera, 0.016)).toBe(false);
  f.store.setState({ enabled: false });
  request.resolve({ createGamePostProcessing: f.create });
  await request.promise;
  expect(f.controller.render(f.camera, 0.016)).toBe(false);
  expect(f.create).not.toHaveBeenCalled();
  f.store.setState({ enabled: true });
  expect(f.controller.render(f.camera, 0.016)).toBe(true);
  f.controller.resize();
  expect(f.pipelines[0].resize).toHaveBeenCalledTimes(1);
  f.controller.dispose();
  f.controller.dispose();
  expect(f.pipelines[0].dispose).toHaveBeenCalledTimes(1);
  const invalidations = f.invalidate.mock.calls.length;
  f.store.setState({ vignette: false });
  expect(f.invalidate).toHaveBeenCalledTimes(invalidations);

  const late = deferred<EffectsModule>();
  const disposed = fixture(() => late.promise);
  disposed.controller.setStore(disposed.store);
  disposed.controller.dispose();
  const count = disposed.invalidate.mock.calls.length;
  late.resolve({ createGamePostProcessing: disposed.create });
  await late.promise;
  expect(disposed.invalidate).toHaveBeenCalledTimes(count);
  expect(disposed.controller.render(disposed.camera, 0.016)).toBe(false);
  expect(disposed.create).not.toHaveBeenCalled();
});

it("releases store-owned pipelines and CPU grades on selection/store changes and teardown", async () => {
  const f = fixture();
  f.controller.setStore(f.store);
  await Promise.resolve();
  f.controller.render(f.camera, 0.016);
  const cache = f.create.mock.calls[0][5]!;
  const texture = new Data3DTexture(new Uint8Array(32), 2, 2, 2);
  cache.remember("NightLUT", texture);
  f.store.setState({ enabled: false });
  expect(f.pipelines[0].dispose).toHaveBeenCalledTimes(1);
  expect(cache.restore("NightLUT")).toBeDefined();
  f.store.setState({ colorGrade: "NightLUT" });
  expect(cache.restore("NightLUT")).toBeUndefined();
  cache.remember("NightLUT", texture);
  const replacement = createClipGraphicsEffectsStore({
    intensity: { vignette: 0.8 },
    grade: { name: "NightLUT", intensity: 1 },
  });
  f.controller.setStore(replacement);
  expect(cache.restore("NightLUT")).toBeUndefined();
  f.controller.render(f.camera, 0.016);
  expect(f.create.mock.calls[1][3]).toBe(replacement);
  cache.remember("NightLUT", texture);
  f.controller.dispose();
  expect(f.pipelines[1].dispose).toHaveBeenCalledTimes(1);
  expect(
    readResourceMetrics()["postProcessingLutCache.ownedLutBytes"],
  ).toBeUndefined();
  texture.dispose();
});

it("acknowledges only a composed ready frame from the current settings owner", async () => {
  const f = fixture();
  f.controller.setStore(f.store);
  await Promise.resolve();
  f.store.setState({ gradeStatus: "loading" });
  expect(f.controller.render(f.camera, 0.016)).toBe(true);
  expect(f.store.getState().awaitingFirstFrame).toBe(true);
  f.store.setState({ gradeStatus: "idle" });
  f.controller.render(f.camera, 0.016);
  expect(f.store.getState().awaitingFirstFrame).toBe(false);
  const replacement = createClipGraphicsEffectsStore({
    intensity: { vignette: 0.4 },
  });
  const order: string[] = [];
  vi.mocked(f.pipelines[0].dispose).mockImplementation(() => {
    order.push("dispose");
  });
  vi.mocked(f.pipelines[0].render).mockImplementation(() => {
    order.push("render");
    f.controller.setStore(replacement);
    expect(f.pipelines[0].dispose).not.toHaveBeenCalled();
    order.push("render-end");
    return true;
  });
  f.controller.render(f.camera, 0.016);
  expect(order).toEqual(["render", "render-end", "dispose"]);
  expect(replacement.getState().awaitingFirstFrame).toBe(true);
  f.controller.render(f.camera, 0.016);
  expect(replacement.getState().awaitingFirstFrame).toBe(false);
  f.controller.dispose();
});

it("reports lazy-module failure and permits a later settings change to retry", async () => {
  const request = deferred<EffectsModule>();
  const next = deferred<EffectsModule>();
  const load = vi
    .fn()
    .mockReturnValueOnce(request.promise)
    .mockReturnValueOnce(next.promise);
  const f = fixture(load);
  f.store.setState({ colorGrade: "NightLUT" });
  f.controller.setStore(f.store);
  request.reject(new Error("module unavailable"));
  await request.promise.catch(() => {});
  expect(f.store.getState()).toMatchObject({
    gradeStatus: "error",
    awaitingFirstFrame: false,
  });
  expect(load).toHaveBeenCalledTimes(1);
  f.store.setState({ colorGrade: "NeutralLUT" });
  expect(load).toHaveBeenCalledTimes(2);
  next.resolve({ createGamePostProcessing: f.create });
  await next.promise;
  expect(f.controller.render(f.camera, 0.016)).toBe(true);
  f.controller.dispose();
});
