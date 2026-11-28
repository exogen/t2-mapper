import { afterEach, expect, it, vi } from "vitest";
import { Texture } from "three";
import { DIFLoader, createDIFModel, type DIFModel } from "../dif/difLoader";
import { createDIFTestBuffer } from "../dif/difTestFixtures";
import { loadHtmlTexture } from "./htmlTextures";
import { loadInterior, loadInteriorDependencies } from "./interiorAssets";
import { SceneAssets } from "./sceneAssets";

vi.mock("./htmlTextures", () => ({ loadHtmlTexture: vi.fn() }));
vi.mock("../loaders", () => ({
  textureToUrl: (name: string) => `/textures/${name}.png`,
}));
vi.mock("../logger", () => ({ createLogger: () => ({ warn: vi.fn() }) }));

afterEach(() => vi.restoreAllMocks());

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

it("keeps parse pure and starts referenced images alongside embedded decoding", async () => {
  const assets = new SceneAssets();
  const model = createDIFModel(
    createDIFTestBuffer({ materialNames: ["test", "unused"] }).buffer,
  );
  expect(loadHtmlTexture).not.toHaveBeenCalled();
  const image = deferred<Texture>();
  vi.mocked(loadHtmlTexture).mockReturnValueOnce(image.promise);
  let embeddedReady!: (model: DIFModel) => void;
  const load = vi
    .spyOn(DIFLoader.prototype, "load")
    .mockImplementation(function (this: DIFLoader, _url, done) {
      expect(this.signal).toBe(assets.signal);
      this.onModelParsed?.(model);
      embeddedReady = done;
    });
  const ready = loadInterior("parallel.dif", assets);
  const dependenciesDone = vi.fn();
  const dependencies = loadInteriorDependencies("parallel.dif", assets).then(
    dependenciesDone,
  );
  expect(load).toHaveBeenCalledOnce();
  expect(loadHtmlTexture).toHaveBeenCalledExactlyOnceWith(
    "/textures/test.png",
    assets.textures,
    "speculative",
  );
  embeddedReady(model);
  await expect(ready).resolves.toBe(model);
  expect(dependenciesDone).not.toHaveBeenCalled();
  image.resolve(new Texture());
  await dependencies;
  expect(dependenciesDone).toHaveBeenCalledOnce();
  expect(await loadInterior("parallel.dif", assets)).toBe(model);
  assets.dispose();
});

it("warms replacement textures while the geometry and native lightmaps stay live", async () => {
  const assets = new SceneAssets();
  const model = createDIFModel(createDIFTestBuffer().buffer);
  const disposeGeometry = vi.spyOn(model.surfaceMeshes[0].geometry, "dispose");
  const disposeLightMap = vi.spyOn(model.lightMaps[0], "dispose");
  vi.mocked(loadHtmlTexture).mockResolvedValue(new Texture());
  const load = vi
    .spyOn(DIFLoader.prototype, "load")
    .mockImplementation(function (this: DIFLoader, _url, done) {
      this.onModelParsed?.(model);
      done(model);
    });
  const url = "refresh-textures.dif";
  await loadInteriorDependencies(url, assets);
  const oldTextures = assets.textures;
  assets.refreshTextures();
  expect(oldTextures.disposed).toBe(true);
  await loadInteriorDependencies(url, assets);
  expect(vi.mocked(loadHtmlTexture).mock.lastCall?.[1]).toBe(assets.textures);
  expect(await loadInterior(url, assets)).toBe(model);
  expect(load).toHaveBeenCalledOnce();
  expect(disposeGeometry).not.toHaveBeenCalled();
  expect(disposeLightMap).not.toHaveBeenCalled();
  assets.dispose();
  expect(disposeGeometry).toHaveBeenCalledOnce();
  expect(disposeLightMap).toHaveBeenCalledOnce();
});

it("forgets failed models so a subsequent load can retry", async () => {
  const model = createDIFModel(createDIFTestBuffer().buffer);
  vi.mocked(loadHtmlTexture).mockResolvedValue(new Texture());
  const load = vi
    .spyOn(DIFLoader.prototype, "load")
    .mockImplementationOnce((_url, _done, _progress, fail) =>
      fail?.(new Error("offline")),
    )
    .mockImplementationOnce(function (this: DIFLoader, _url, done) {
      this.onModelParsed?.(model);
      done(model);
    });
  await expect(loadInterior("retry-model.dif")).rejects.toThrow("offline");
  await expect(loadInterior("retry-model.dif")).resolves.toBe(model);
  await loadInteriorDependencies("retry-model.dif");
  expect(load).toHaveBeenCalledTimes(2);
});

it("retries failed image readiness without reparsing the cached model", async () => {
  const model = createDIFModel(createDIFTestBuffer().buffer);
  vi.mocked(loadHtmlTexture)
    .mockRejectedValueOnce(new Error("image offline"))
    .mockResolvedValue(new Texture());
  const load = vi
    .spyOn(DIFLoader.prototype, "load")
    .mockImplementation(function (this: DIFLoader, _url, done) {
      this.onModelParsed?.(model);
      done(model);
    });
  const failed = expect(
    loadInteriorDependencies("retry-images.dif"),
  ).rejects.toThrow("image offline");
  await expect(loadInterior("retry-images.dif")).resolves.toBe(model);
  await failed;
  await loadInteriorDependencies("retry-images.dif");
  expect(load).toHaveBeenCalledOnce();
  expect(await loadInterior("retry-images.dif")).toBe(model);
});

it("releases interior resources with their owner and loads them anew in a replacement", async () => {
  const owner = new SceneAssets();
  const replacement = new SceneAssets();
  const buffer = createDIFTestBuffer().buffer;
  const first = createDIFModel(buffer);
  const second = createDIFModel(buffer);
  const geometryDispose = vi.spyOn(first.surfaceMeshes[0].geometry, "dispose");
  const materialDispose = vi.spyOn(first.surfaceMeshes[0].material, "dispose");
  const lightMapDispose = vi.spyOn(first.lightMaps[0], "dispose");
  const collisionDispose = vi.spyOn(first.collision, "dispose");
  const replacementDispose = vi.spyOn(
    second.surfaceMeshes[0].geometry,
    "dispose",
  );
  const load = vi
    .spyOn(DIFLoader.prototype, "load")
    .mockImplementationOnce((_url, done) => done(first))
    .mockImplementationOnce((_url, done) => done(second));

  expect(await loadInterior("scoped.dif", owner)).toBe(first);
  expect(await loadInterior("scoped.dif", owner)).toBe(first);
  expect(await loadInterior("scoped.dif", replacement)).toBe(second);
  expect(load).toHaveBeenCalledTimes(2);

  owner.dispose();
  expect(geometryDispose).toHaveBeenCalledOnce();
  expect(materialDispose).toHaveBeenCalledOnce();
  expect(lightMapDispose).toHaveBeenCalledOnce();
  expect(collisionDispose).toHaveBeenCalledOnce();
  expect(replacementDispose).not.toHaveBeenCalled();
  expect(await loadInterior("scoped.dif", replacement)).toBe(second);
  replacement.dispose();
  expect(replacementDispose).toHaveBeenCalledOnce();
});

it("disposes a model that finishes after its owner was released", async () => {
  const assets = new SceneAssets();
  const model = createDIFModel(createDIFTestBuffer().buffer);
  const geometryDispose = vi.spyOn(model.surfaceMeshes[0].geometry, "dispose");
  let finish!: (model: DIFModel) => void;
  vi.spyOn(DIFLoader.prototype, "load").mockImplementation(function (
    this: DIFLoader,
    _url,
    done,
  ) {
    expect(this.signal).toBe(assets.signal);
    finish = done;
  });

  const ready = loadInterior("late-scoped.dif", assets);
  assets.dispose();
  expect(assets.signal.aborted).toBe(true);
  finish(model);
  await expect(ready).rejects.toHaveProperty("name", "AbortError");
  expect(geometryDispose).toHaveBeenCalledOnce();
});
