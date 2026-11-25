import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DefaultLoadingManager, LoadingManager } from "three";
import { SceneAssets, sharedSceneAssets } from "./assets/sceneAssets";

const mocks = vi.hoisted(() => ({
  loadShape: vi.fn(async (_name: string) => {}),
  loadInterior: vi.fn(),
  loadHtmlTexture: vi.fn(async () => {}),
  constrained: false,
}));
vi.mock("./deviceConstraints", () => ({
  readDeviceSignals: () => ({}),
  classifyDevice: () => ({ constrained: mocks.constrained }),
}));
vi.mock("./engine/shapeCache", () => ({
  loadShapeDependencies: mocks.loadShape,
}));
vi.mock("./loaders", () => ({
  interiorToUrl: (name: string) => `/interiors/${name}`,
  shapeToUrl: (name: string) => `/shapes/${name}`,
  textureToUrl: (name: string) => `/textures/${name}.png`,
  terrainTextureToUrl: vi.fn(),
  loadTerrain: vi.fn(),
}));
vi.mock("./assets/interiorAssets", () => ({
  loadInteriorDependencies: mocks.loadInterior,
}));
vi.mock("./assets/htmlTextures", () => ({
  loadHtmlTexture: mocks.loadHtmlTexture,
}));

import { startAssetPrefetch, stopAssetPrefetch } from "./assetPrefetch";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.constrained = false;
  mocks.loadShape.mockImplementation(async () => {});
});

afterEach(() => {
  stopAssetPrefetch();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("requests explicit model-and-dependency readiness for prefetch jobs", async () => {
  vi.useFakeTimers();
  mocks.loadInterior.mockResolvedValueOnce(undefined);
  startAssetPrefetch(() => [
    { kind: "interior", name: "native-test.dif" },
    { kind: "shape", name: "native-test.dts" },
    { kind: "texture", name: "test" },
  ]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.loadInterior).toHaveBeenCalledWith(
    "/interiors/native-test.dif",
    sharedSceneAssets,
  );
  expect(mocks.loadShape).toHaveBeenCalledWith(
    "native-test.dts",
    DefaultLoadingManager,
  );
  expect(mocks.loadHtmlTexture).toHaveBeenCalledWith(
    "/textures/test.png",
    sharedSceneAssets,
  );
});

it("prefetches a shared filename again for a new scene in the same stream", async () => {
  vi.useFakeTimers();
  const first = { assets: new SceneAssets(), manager: new LoadingManager() };
  const second = { assets: new SceneAssets(), manager: new LoadingManager() };
  let owner = first;
  startAssetPrefetch(
    () => [{ kind: "shape", name: "shared.dts" }],
    () => owner,
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.loadShape).toHaveBeenCalledExactlyOnceWith(
    "shared.dts",
    first.manager,
  );
  first.assets.dispose();
  owner = second;
  await vi.advanceTimersByTimeAsync(5000);
  expect(mocks.loadShape).toHaveBeenCalledTimes(2);
  expect(mocks.loadShape).toHaveBeenLastCalledWith(
    "shared.dts",
    second.manager,
  );
  second.assets.dispose();
});

it.each([
  { constrained: false, limit: 4 },
  { constrained: true, limit: 2 },
])(
  "holds at most $limit unfinished jobs instead of launching a batch every tick",
  async ({ constrained, limit }) => {
    vi.useFakeTimers();
    mocks.constrained = constrained;
    const releases: Array<() => void> = [];
    mocks.loadShape.mockImplementation(
      () => new Promise<void>((resolve) => releases.push(resolve)),
    );
    const assets = Array.from({ length: 20 }, (_, i) => ({
      kind: "shape" as const,
      name: `model-${i}.dts`,
    }));
    try {
      startAssetPrefetch(() => assets);
      await vi.advanceTimersByTimeAsync(5000);
      expect(mocks.loadShape).toHaveBeenCalledTimes(limit);
      releases[0]();
      await vi.advanceTimersByTimeAsync(100);
      expect(mocks.loadShape).toHaveBeenCalledTimes(limit + 1);
      // Stopping removes interest in everything not already running.
      stopAssetPrefetch();
      for (const release of releases) release();
      await vi.advanceTimersByTimeAsync(5000);
      expect(mocks.loadShape).toHaveBeenCalledTimes(limit + 1);
    } finally {
      stopAssetPrefetch();
      for (const release of releases) release();
      await Promise.resolve();
    }
  },
);

it("counts old in-flight work against the limit after retargeting a stream", async () => {
  vi.useFakeTimers();
  const releases: Array<() => void> = [];
  mocks.loadShape.mockImplementation(
    () => new Promise<void>((resolve) => releases.push(resolve)),
  );
  try {
    startAssetPrefetch(() =>
      Array.from({ length: 10 }, (_, i) => ({
        kind: "shape" as const,
        name: `old-${i}`,
      })),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.loadShape).toHaveBeenCalledTimes(4);
    startAssetPrefetch(() => [{ kind: "shape", name: "new" }]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(mocks.loadShape).toHaveBeenCalledTimes(4);
    releases[0]();
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.loadShape).toHaveBeenLastCalledWith(
      "new",
      DefaultLoadingManager,
    );
    expect(mocks.loadShape).toHaveBeenCalledTimes(5);
  } finally {
    stopAssetPrefetch();
    for (const release of releases) release();
    await Promise.resolve();
  }
});

it("does not launch assets returned by a provider that stopped prefetching synchronously", async () => {
  vi.useFakeTimers();
  startAssetPrefetch(() => {
    stopAssetPrefetch();
    return [{ kind: "shape", name: "abandoned.dts" }];
  });
  await vi.advanceTimersByTimeAsync(5000);
  expect(mocks.loadShape).not.toHaveBeenCalled();
});

it("preserves the replacement provider and its timer when the old provider retargets synchronously", async () => {
  vi.useFakeTimers();
  startAssetPrefetch(() => {
    startAssetPrefetch(() => [{ kind: "shape", name: "current.dts" }]);
    return [{ kind: "shape", name: "abandoned.dts" }];
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.loadShape).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.loadShape).toHaveBeenCalledExactlyOnceWith(
    "current.dts",
    DefaultLoadingManager,
  );
});

it("stops the old launch loop if a synchronous cache/loader callback retargets the provider", async () => {
  vi.useFakeTimers();
  mocks.loadShape.mockImplementationOnce(async () => {
    startAssetPrefetch(() => [{ kind: "shape", name: "current.dts" }]);
  });
  startAssetPrefetch(() => [
    { kind: "shape", name: "already-started.dts" },
    { kind: "shape", name: "abandoned.dts" },
  ]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.loadShape.mock.calls.map(([name]) => name)).toEqual([
    "already-started.dts",
  ]);
  await vi.advanceTimersByTimeAsync(999);
  expect(mocks.loadShape).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.loadShape.mock.calls.map(([name]) => name)).toEqual([
    "already-started.dts",
    "current.dts",
  ]);
});
