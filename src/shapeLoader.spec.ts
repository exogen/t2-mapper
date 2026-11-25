import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileLoader, LoadingManager, Mesh, Texture } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ShapeLoader } from "./shapeLoader";
import { DTSLoader } from "./dts/dtsLoader";
import * as dts from "./dts/dts";
import { buildDTS } from "./dts/dtsBuilder";
import {
  createDSQTestBuffer,
  createDTSTestBuffer,
  createDTSTestShape,
} from "./dts/dtsTestFixtures";
import * as manifest from "./manifest";
import * as loaders from "./loaders";
import { loadBitmapTextureAsync } from "./assets/bitmapTextures";
import * as iflAtlas from "./iflAtlas";
import { bindSceneAssets, SceneAssets } from "./assets/sceneAssets";
import { getGroundEffectShape } from "./particles/groundEffectAssets";

vi.mock("./assets/bitmapTextures", () => ({
  loadBitmapTextureAsync: vi.fn(async () => new Texture()),
  loadBitmapTextureInstance: vi.fn(() => new Texture()),
}));

beforeEach(() => {
  vi.spyOn(loaders, "textureToUrl").mockImplementation(
    (name) => `/textures/${name}`,
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shared shape sources", () => {
  it("releases a scene's sources without touching another manager's model", async () => {
    const oldAssets = new SceneAssets();
    const newAssets = new SceneAssets();
    const manager = new LoadingManager();
    const map = new Texture();
    const oldModel = buildDTS(createDTSTestShape(), { texture: () => map });
    const newModel = buildDTS(createDTSTestShape());
    const models = [oldModel, newModel];
    vi.spyOn(DTSLoader.prototype, "load").mockImplementation((_url, done) => {
      done(models.shift()!);
    });
    const disposed = vi.fn();
    map.addEventListener("dispose", disposed);
    const url = "scope-model.dts";

    bindSceneAssets(manager, oldAssets);
    const old = new ShapeLoader(manager);
    expect(await old.loadAsync(url)).toBe(oldModel);
    const ground = getGroundEffectShape(url, oldAssets);
    expect(ground?.model).toEqual({
      data: oldModel.data,
      animations: oldModel.animations,
    });
    expect(ground?.model).not.toHaveProperty("scene");

    bindSceneAssets(manager, newAssets);
    const next = new ShapeLoader(manager);
    expect(await next.loadAsync(url)).toBe(newModel);
    oldAssets.dispose();
    expect(disposed).toHaveBeenCalledOnce();
    expect(old.peekModel(url)).toBeUndefined();
    expect(getGroundEffectShape(url, oldAssets)).toBeUndefined();
    expect(next.peekModel(url)).toBe(newModel);
    expect(getGroundEffectShape(url, newAssets)?.model.data).toBe(
      newModel.data,
    );
    newAssets.dispose();
  });

  it("disposes a late model without warming or publishing it into a replacement scope", async () => {
    const manager = new LoadingManager();
    const oldAssets = new SceneAssets();
    const newAssets = new SceneAssets();
    const url = "late-scope.dts";
    const map = new Texture();
    const oldModel = buildDTS(createDTSTestShape(), { texture: () => map });
    const newModel = buildDTS(createDTSTestShape());
    const complete: ((model: typeof oldModel) => void)[] = [];
    vi.spyOn(DTSLoader.prototype, "load").mockImplementation((_url, done) => {
      complete.push(done);
    });
    const warm = vi.spyOn(iflAtlas, "loadShapeImageLists");
    const dispose = vi.fn();
    map.addEventListener("dispose", dispose);
    bindSceneAssets(manager, oldAssets);
    const old = new ShapeLoader(manager)
      .loadDependencies(url)
      .catch((error) => error);

    oldAssets.dispose();
    bindSceneAssets(manager, newAssets);
    const next = new ShapeLoader(manager);
    const loaded = next.loadAsync(url);
    complete[0](oldModel);
    complete[1](newModel);
    expect(await old).toBe(oldAssets.signal.reason);
    expect(await loaded).toBe(newModel);
    expect(dispose).toHaveBeenCalledOnce();
    expect(warm).toHaveBeenCalledExactlyOnceWith(newModel, newAssets);
    expect(getGroundEffectShape(url, newAssets)?.model.data).toBe(
      newModel.data,
    );
    newAssets.dispose();
  });

  it.each(["image", "IFL"] as const)(
    "retries failed %s readiness without rebuilding a model",
    async (failedStage) => {
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
      const model = buildDTS(createDTSTestShape());
      const load = vi
        .spyOn(DTSLoader.prototype, "load")
        .mockImplementation((_url, done) => done(model));
      const stage =
        failedStage === "image"
          ? vi
              .mocked(loadBitmapTextureAsync)
              .mockRejectedValueOnce(new Error("offline"))
          : vi
              .spyOn(iflAtlas, "loadShapeImageLists")
              .mockRejectedValueOnce(new Error("offline"));
      const loader = new ShapeLoader(new LoadingManager());
      await expect(
        loader.loadDependencies(`retry-${failedStage}.dts`),
      ).rejects.toThrow("offline");
      await expect(
        loader.loadDependencies(`retry-${failedStage}.dts`),
      ).resolves.toBeUndefined();
      expect(load).toHaveBeenCalledOnce();
      expect(stage).toHaveBeenCalled();
      expect(warning).toHaveBeenCalledOnce();
    },
  );
  it("publishes a model before image readiness while prefetch waits for its dependencies", async () => {
    const model = buildDTS(createDTSTestShape());
    vi.spyOn(DTSLoader.prototype, "load").mockImplementation((_url, done) =>
      done(model),
    );
    let complete!: (texture: Texture) => void;
    vi.mocked(loadBitmapTextureAsync).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const loader = new ShapeLoader(new LoadingManager());
    const loaded = loader.loadAsync("progressive.dts");
    const finished = vi.fn();
    const dependencies = loader
      .loadDependencies("progressive.dts")
      .then(finished);
    await expect(loaded).resolves.toBe(model);
    expect(finished).not.toHaveBeenCalled();
    complete(new Texture());
    await dependencies;
    expect(finished).toHaveBeenCalledOnce();
  });

  it("repairs a failed ordinary texture on the cached model and its existing clones before retry readiness resolves", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const empty = new Texture();
    empty.repeat.set(3, 4);
    empty.anisotropy = 8;
    const model = buildDTS(createDTSTestShape(), { texture: () => empty });
    const instance = clone(model.scene);
    const recovered = new Texture({ width: 16, height: 16 });
    vi.spyOn(DTSLoader.prototype, "load").mockImplementation((_url, done) =>
      done(model),
    );
    vi.mocked(loadBitmapTextureAsync)
      .mockRejectedValueOnce(new Error("decode failed"))
      .mockResolvedValueOnce(recovered);
    const loader = new ShapeLoader(new LoadingManager());
    const ready = loader.loadAsync("retry-visible-texture.dts");
    await expect(
      loader.loadDependencies("retry-visible-texture.dts"),
    ).rejects.toThrow("decode failed");
    expect(await ready).toBe(model);
    expect(empty.image).toBeNull();
    await loader.loadDependencies("retry-visible-texture.dts");
    expect(empty.image).toBe(recovered.image);
    expect(empty.source).toBe(recovered.source);
    expect(model.materials[0].map).toBe(empty);
    const cloneSamplers: Texture[] = [];
    instance.traverse((object) => {
      if (object instanceof Mesh) {
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials)
          if ("map" in material && material.map instanceof Texture)
            cloneSamplers.push(material.map);
      }
    });
    expect(cloneSamplers).toContain(empty);
    expect(empty.repeat.toArray()).toEqual([3, 4]);
    expect(empty.anisotropy).toBe(8);
  });

  it("leaves an already populated custom sampler unchanged while warming canonical dependencies", async () => {
    const custom = new Texture({ width: 8, height: 8 });
    const model = buildDTS(createDTSTestShape(), { texture: () => custom });
    const source = custom.source;
    vi.spyOn(DTSLoader.prototype, "load").mockImplementation((_url, done) =>
      done(model),
    );
    vi.mocked(loadBitmapTextureAsync).mockResolvedValueOnce(
      new Texture({ width: 16, height: 16 }),
    );
    const loader = new ShapeLoader(new LoadingManager());
    await loader.loadDependencies("custom-populated-texture.dts");
    expect(model.materials[0].map).toBe(custom);
    expect(custom.source).toBe(source);
  });
  it("scans each manifest once while preserving DSQ prefix matching and ordering", () => {
    const paths = [
      "shapes/test_shape_z.dsq",
      "textures/test_shape_noise.png",
      "shapes/test_shape_a.dsq",
      "shapes/test_shape.dts",
      "shapes/test_idle.dsq",
      "shapes/unrelated_idle.dsq",
    ];
    const resources = Object.fromEntries(
      paths.map((path) => [path, [path, [""]]]),
    ) as ReturnType<typeof manifest.getResourceMap>;
    const ownKeys = vi.fn(Reflect.ownKeys);
    const getResources = vi
      .spyOn(manifest, "getResourceMap")
      .mockReturnValue(new Proxy<typeof resources>(resources, { ownKeys }));
    vi.spyOn(loaders, "getUrlForPath").mockImplementation((path) => `/${path}`);
    const first = new ShapeLoader();
    const second = new ShapeLoader();
    expect(first.sequenceResolver!("/shapes/Test_Shape.dts")).toEqual([
      { url: "/shapes/test_shape_a.dsq", name: "a" },
      { url: "/shapes/test_shape_z.dsq", name: "z" },
    ]);
    expect(second.sequenceResolver!("/shapes/test.dts")).toEqual([
      { url: "/shapes/test_idle.dsq", name: "idle" },
      { url: "/shapes/test_shape_a.dsq", name: "shape_a" },
      { url: "/shapes/test_shape_z.dsq", name: "shape_z" },
    ]);
    expect(ownKeys).toHaveBeenCalledOnce();
    getResources.mockReturnValue({ "shapes/test_new.dsq": ["test_new.dsq"] });
    expect(first.sequenceResolver!("test.dts")).toEqual([
      { url: "/shapes/test_new.dsq", name: "new" },
    ]);
  });
  it("shares an in-flight and completed source across loader instances", async () => {
    const model = buildDTS(createDTSTestShape());
    let complete!: (value: typeof model) => void;
    const load = vi
      .spyOn(DTSLoader.prototype, "load")
      .mockImplementation((_url, done) => {
        complete = done;
      });
    const manager = new LoadingManager();
    const a = new ShapeLoader(manager).loadAsync("pooled.dts");
    const b = new ShapeLoader(manager).loadAsync("pooled.dts");
    const lookup = new ShapeLoader(manager);
    expect(load).toHaveBeenCalledTimes(1);
    expect(lookup.peekModel("pooled.dts")).toBeUndefined();
    complete(model);
    expect(lookup.peekModel("pooled.dts")).toBe(model);
    expect(await a).toBe(model);
    expect(await b).toBe(model);
    expect(await new ShapeLoader(manager).loadAsync("pooled.dts")).toBe(model);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shares the native shape and external sequence with simulation", async () => {
    const fetch = vi
      .spyOn(FileLoader.prototype, "loadAsync")
      .mockImplementation(async (url) => {
        if (url === "test-look.dsq") return createDSQTestBuffer();
        if (url === "test-empty.dsq") return new ArrayBuffer(0);
        return createDTSTestBuffer();
      });
    const manager = new LoadingManager();
    const makeLoader = () =>
      new ShapeLoader(manager)
        .setSequenceResolver(() => [
          { url: "test-look.dsq", name: "look" },
          { url: "test-empty.dsq" },
        ])
        .setTextureResolver(() => null);
    const visual = makeLoader();
    const source = makeLoader().loadShapeData("shared-raw.dts");
    const model = await visual.loadAsync("shared-raw.dts");
    expect(model.data).toBe(await source);
    expect(makeLoader().peekShapeData("shared-raw.dts")).toBe(model.data);
    expect(
      model.data.sequences.map((s) => model.data.names[s.nameIndex]),
    ).toEqual(["look"]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("skips parsing for a retired scene while its replacement uses the same download", async () => {
    const url = "https://assets.test/scene-transition.dts";
    let finish!: (response: Response) => void;
    const fetchAsset = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const parse = vi.spyOn(dts, "parseDTS");
    const sequences = vi.fn(() => []);
    const oldManager = new LoadingManager();
    const oldAssets = new SceneAssets();
    bindSceneAssets(oldManager, oldAssets);
    const old = new ShapeLoader(oldManager).setSequenceResolver(sequences);
    const retired = old.loadShapeData(url);
    oldAssets.dispose();

    const nextManager = new LoadingManager();
    const nextAssets = new SceneAssets();
    bindSceneAssets(nextManager, nextAssets);
    const next = new ShapeLoader(nextManager).setSequenceResolver(() => []);
    const replacement = next.loadShapeData(url);
    const response = new Response(createDTSTestBuffer());
    // Use FileLoader's non-streaming path in Node.
    Object.defineProperty(response, "body", { value: undefined });
    finish(response);
    await expect(retired).rejects.toBe(oldAssets.signal.reason);
    expect(await replacement).toBe(next.peekShapeData(url));
    expect(fetchAsset).toHaveBeenCalledOnce();
    expect(parse).toHaveBeenCalledOnce();
    expect(sequences).not.toHaveBeenCalled();
    nextAssets.dispose();
  });

  it("skips animation decoding when a scene closes during its download", async () => {
    let finish!: (bytes: ArrayBuffer) => void;
    const sequence = new Promise<ArrayBuffer>((resolve) => {
      finish = resolve;
    });
    const fetchAsset = vi
      .spyOn(FileLoader.prototype, "loadAsync")
      .mockResolvedValueOnce(createDTSTestBuffer())
      .mockReturnValueOnce(sequence);
    const manager = new LoadingManager();
    const assets = new SceneAssets();
    bindSceneAssets(manager, assets);
    const loader = new ShapeLoader(manager).setSequenceResolver(() => [
      { url: "animation.dsq" },
    ]);
    const loaded = loader.loadShapeData("animated.dts");
    await vi.waitFor(() =>
      expect(fetchAsset).toHaveBeenCalledWith("animation.dsq"),
    );
    assets.dispose();
    // Parsing these bytes would throw a format error.
    finish(new ArrayBuffer(1));
    await expect(loaded).rejects.toBe(assets.signal.reason);
    expect(loader.peekShapeData("animated.dts")).toBeUndefined();
  });

  it("evicts failed requests so a later request can retry", async () => {
    const model = buildDTS(createDTSTestShape());
    const load = vi
      .spyOn(DTSLoader.prototype, "load")
      .mockImplementationOnce((_url, _done, _progress, fail) =>
        fail?.(new Error("offline")),
      )
      .mockImplementationOnce((_url, done) => done(model));
    const loader = new ShapeLoader(new LoadingManager());
    await expect(loader.loadAsync("retry.dts")).rejects.toThrow("offline");
    expect(await loader.loadAsync("retry.dts")).toBe(model);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("aborts a stalled native download so the same URL can retry", async () => {
    vi.useFakeTimers();
    const url = "https://assets.test/stalled.dts";
    const response = new Response(null);
    Object.defineProperty(response, "body", { value: undefined });
    response.arrayBuffer = async () => createDTSTestBuffer();
    const fetchAsset = vi
      .spyOn(globalThis, "fetch")
      .mockImplementationOnce((input) => {
        const request = input as Request;
        return new Promise((_resolve, reject) => {
          request.signal.addEventListener("abort", () =>
            reject(request.signal.reason),
          );
        });
      })
      .mockResolvedValueOnce(response);
    const loader = new ShapeLoader(new LoadingManager()).setSequenceResolver(
      () => [],
    );
    const failed = expect(loader.loadShapeData(url)).rejects.toThrow();
    await vi.runAllTimersAsync();
    await failed;
    expect(await loader.loadShapeData(url)).toBe(loader.peekShapeData(url));
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });

  it("times out stalled animation downloads even after a sibling fails", async () => {
    vi.useFakeTimers();
    const shapeUrl = "https://assets.test/sibling.dts";
    const missingUrl = "https://assets.test/sibling-missing.dsq";
    const stalledUrl = "https://assets.test/sibling-stalled.dsq";
    let stalledRequest: Request | undefined;
    const response = new Response(createDTSTestBuffer());
    Object.defineProperty(response, "body", { value: undefined });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const request = input as Request;
      if (request.url === shapeUrl) return response;
      if (request.url === missingUrl)
        return new Response(null, { status: 404 });
      stalledRequest = request;
      return new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () =>
          reject(request.signal.reason),
        );
      });
    });
    const loader = new ShapeLoader(new LoadingManager()).setSequenceResolver(
      () => [{ url: missingUrl }, { url: stalledUrl }],
    );
    await expect(loader.loadShapeData(shapeUrl)).rejects.toThrow("404");
    expect(stalledRequest?.signal.aborted).toBe(false);
    await vi.runAllTimersAsync();
    expect(stalledRequest?.signal.aborted).toBe(true);
  });
});
