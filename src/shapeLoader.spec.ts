import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingManager } from "three";
import { ShapeLoader } from "./shapeLoader";
import { DTSLoader } from "./dts/dtsLoader";
import { buildDTS } from "./dts/dtsBuilder";
import { createDTSTestShape } from "./dts/dtsTestFixtures";
import * as manifest from "./manifest";
import * as loaders from "./loaders";

afterEach(() => vi.restoreAllMocks());

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
    expect(load).toHaveBeenCalledTimes(1);
    complete(model);
    expect(await a).toBe(model);
    expect(await b).toBe(model);
    expect(await new ShapeLoader(manager).loadAsync("pooled.dts")).toBe(model);
    expect(load).toHaveBeenCalledTimes(1);
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
});
