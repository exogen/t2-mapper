import { afterEach, describe, expect, it, vi } from "vitest";
import { FileLoader, LoadingManager } from "three";
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("shared shape sources", () => {
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
