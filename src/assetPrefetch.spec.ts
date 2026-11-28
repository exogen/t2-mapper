import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DefaultLoadingManager, LoadingManager } from "three";
import { SceneAssets, sharedSceneAssets } from "./assets/sceneAssets";

const mocks = vi.hoisted(() => ({
  loadShape: vi.fn(async (_name: string) => {}),
  loadInterior: vi.fn(),
  loadTerrain: vi.fn(async (_name: string) => ({ textureNames: [] })),
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
vi.mock("./engine/terrainCache", () => ({
  loadTerrainAsset: mocks.loadTerrain,
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

import {
  readAssetPrefetchMetrics,
  startAssetPrefetch,
  stopAssetPrefetch,
} from "./assetPrefetch";

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
    sharedSceneAssets.textures,
    "speculative",
  );
});

it("starts recorded work and terrain before the generic attach delay", async () => {
  vi.useFakeTimers();
  const first = { assets: new SceneAssets(), manager: new LoadingManager() };
  const second = { assets: new SceneAssets(), manager: new LoadingManager() };
  let owner = first;
  let finish = () => {};
  const load = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
  const queue = startAssetPrefetch(
    () => [
      { kind: "shape", name: "background.dts" },
      { kind: "terrain", name: "ground.ter" },
    ],
    () => owner,
    () => ({ jobs: [{ key: "opening", load }], scanning: false }),
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledOnce();
  expect(mocks.loadTerrain).toHaveBeenCalledExactlyOnceWith(
    "ground.ter",
    first.assets,
  );
  expect(mocks.loadShape).not.toHaveBeenCalled();
  expect(queue.prioritySettled(["opening"])).toBe(false);
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(queue.prioritySettled(["opening"])).toBe(true);
  owner = second;
  first.assets.dispose();
  expect(queue.prioritySettled(["opening"])).toBe(false);
  queue.refresh();
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(2);
  expect(queue.prioritySettled(["opening"])).toBe(false);
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(queue.prioritySettled(["opening"])).toBe(true);
  second.assets.dispose();
});

it("reserves prefetch slots for opening assets ahead of terrain and background work", async () => {
  vi.useFakeTimers();
  mocks.constrained = true;
  let blockBackground = true;
  let release = () => {};
  const pending = new Promise<void>((resolve) => (release = resolve));
  const opening = ["mortar", "explosion", "debris"].map((key) => ({
    key,
    load: vi.fn(() => pending),
  }));
  const queue = startAssetPrefetch(
    () => [
      { kind: "shape", name: "background.dts" },
      { kind: "terrain", name: "ground.ter" },
    ],
    undefined,
    () => ({ jobs: opening, scanning: false, blockBackground }),
  );

  await vi.advanceTimersByTimeAsync(1_000);
  expect(opening[0].load).toHaveBeenCalledOnce();
  expect(opening[1].load).toHaveBeenCalledOnce();
  expect(opening[2].load).not.toHaveBeenCalled();
  expect(mocks.loadTerrain).not.toHaveBeenCalled();
  expect(mocks.loadShape).not.toHaveBeenCalled();
  expect(readAssetPrefetchMetrics()).toMatchObject({
    activeJobs: 2,
    concurrency: 2,
    recordedWaitingJobs: 1,
  });

  release();
  await vi.advanceTimersByTimeAsync(300);
  expect(opening[2].load).toHaveBeenCalledOnce();
  expect(mocks.loadTerrain).toHaveBeenCalledOnce();
  expect(mocks.loadShape).not.toHaveBeenCalled();
  expect(readAssetPrefetchMetrics().recordedWaitingJobs).toBe(0);

  blockBackground = false;
  queue.refresh();
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.loadShape).toHaveBeenCalledExactlyOnceWith(
    "background.dts",
    DefaultLoadingManager,
  );
  queue.stop();
  expect(readAssetPrefetchMetrics().recordedWaitingJobs).toBeNull();
});

it("keeps the attach delay when recorded lookahead is off or awaiting a snapshot", async () => {
  vi.useFakeTimers();
  const getAssets = vi.fn(() => [
    { kind: "shape" as const, name: "later.dts" },
  ]);
  const getPriority = vi.fn(() => null);
  const queue = startAssetPrefetch(getAssets, undefined, getPriority);
  await vi.advanceTimersByTimeAsync(300);
  expect(getPriority).toHaveBeenCalledOnce();
  expect(getAssets).not.toHaveBeenCalled();

  queue.refresh();
  await vi.advanceTimersByTimeAsync(699);
  expect(getPriority).toHaveBeenCalledTimes(2);
  expect(getAssets).not.toHaveBeenCalled();
  expect(mocks.loadShape).not.toHaveBeenCalled();

  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.loadShape).toHaveBeenCalledExactlyOnceWith(
    "later.dts",
    DefaultLoadingManager,
  );
});

it("shares an in-flight shape between ordinary prefetch and recorded priorities", async () => {
  vi.useFakeTimers();
  let resolveShape = () => {};
  mocks.loadShape.mockImplementationOnce(
    () => new Promise<void>((resolve) => (resolveShape = resolve)),
  );
  let recorded = false;
  const load = vi.fn(async () => {});
  const queue = startAssetPrefetch(
    () => [{ kind: "shape", name: "shared.dts" }],
    undefined,
    () =>
      recorded
        ? { jobs: [{ key: "shape:shared.dts", load }], scanning: false }
        : null,
  );
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.loadShape).toHaveBeenCalledOnce();
  recorded = true;
  queue.refresh();
  await vi.advanceTimersByTimeAsync(1);
  expect(load).not.toHaveBeenCalled();
  expect(queue.prioritySettled(["shape:shared.dts"])).toBe(false);
  resolveShape();
  await vi.advanceTimersByTimeAsync(1);
  expect(queue.prioritySettled(["shape:shared.dts"])).toBe(true);
});

it("leaves replacement prefetch running when the old owner stops", async () => {
  vi.useFakeTimers();
  const old = startAssetPrefetch(() => []);
  startAssetPrefetch(() => [{ kind: "shape", name: "replacement.dts" }]);
  old.stop();
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.loadShape).toHaveBeenCalledExactlyOnceWith(
    "replacement.dts",
    DefaultLoadingManager,
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
