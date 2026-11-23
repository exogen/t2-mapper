import { afterEach, expect, it, vi } from "vitest";
import { Texture } from "three";
import { DIFLoader, createDIFModel, type DIFModel } from "../dif/difLoader";
import { createDIFTestBuffer } from "../dif/difTestFixtures";
import { loadHtmlTexture } from "./htmlTextures";
import { loadInterior, loadInteriorDependencies } from "./interiorAssets";

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
      this.onModelParsed?.(model);
      embeddedReady = done;
    });
  const ready = loadInterior("parallel.dif");
  const dependenciesDone = vi.fn();
  const dependencies =
    loadInteriorDependencies("parallel.dif").then(dependenciesDone);
  expect(load).toHaveBeenCalledOnce();
  expect(loadHtmlTexture).toHaveBeenCalledExactlyOnceWith("/textures/test.png");
  embeddedReady(model);
  await expect(ready).resolves.toBe(model);
  expect(dependenciesDone).not.toHaveBeenCalled();
  image.resolve(new Texture());
  await dependencies;
  expect(dependenciesDone).toHaveBeenCalledOnce();
  expect(await loadInterior("parallel.dif")).toBe(model);
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
