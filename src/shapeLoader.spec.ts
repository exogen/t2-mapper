import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileLoader, LoadingManager, Mesh, Texture } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { ShapeLoader } from "./shapeLoader";
import { DTSLoader } from "./dts/dtsLoader";
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
});
