import { expect, it, vi } from "vitest";
import type { ClipTake } from "../../relay/clipTypes";
import { startAssetPrefetch } from "../assetPrefetch";
import type { DemoResourceScanResult } from "../stream/demoResourceLookahead";
import type { StreamSnapshot, StreamingPlayback } from "../stream/types";
import type { GameEngine } from "./gameEngine";
import { startRecordedAssetPrefetch } from "./recordedAssetPrefetch";

const clip = vi.hoisted(() => ({ active: null as ClipTake | null }));

vi.mock("../assetPrefetch", () => ({
  startAssetPrefetch: vi.fn(),
}));
vi.mock("../state/clipStore", () => ({
  clipStore: {
    getState: () => ({ ...clip, draft: null, playheadMs: 0 }),
    subscribe: () => () => {},
  },
}));
vi.mock("../state/engineStore", () => ({
  engineStore: {
    getState: () => ({ playback: { status: "paused", seekNonce: 0, rate: 1 } }),
    subscribe: () => () => {},
  },
}));
vi.mock("../state/settingsStore", () => ({
  MAX_RESOURCE_LOOKAHEAD_MS: 30_000,
  settingsStore: {
    getState: () => ({ resourceLookaheadMs: 5_000 }),
    subscribe: () => () => {},
  },
}));
vi.mock("./demoResourceWarmup", () => ({
  warmDemoResource: vi.fn(),
}));

it("includes terrain and genuinely new resources in the bounded opening batch", () => {
  const terrainKey = "terrain:damnation.ter";
  let terrainReady = false;
  const queue = {
    refresh: vi.fn(),
    prioritySettled: vi.fn(
      (keys: readonly string[]) => terrainReady || !keys.includes(terrainKey),
    ),
    stop: vi.fn(),
  };
  vi.mocked(startAssetPrefetch).mockReturnValueOnce(queue);
  const snapshot = {
    timeSec: 10,
    entities: Array.from({ length: 30 }, (_, index) => ({
      shapeHint: `current_${index}.dts`,
    })),
  } as unknown as StreamSnapshot;
  const engine = {
    streamSnapshot: { current: snapshot },
  } as unknown as GameEngine;
  const future = Array.from({ length: 10 }, (_, index) => ({
    kind: "particleTexture" as const,
    name: `future_${index}`,
  }));
  const scan = {
    hints: [
      { kind: "shape", name: "current_0.dts" },
      ...Array.from({ length: 8 }, (_, index) => ({
        kind: "shape",
        name: `current_${17 + index}.dts`,
      })),
      future[0],
      ...future,
    ],
    complete: true,
  };
  const inventory = [
    { kind: "terrain", name: "damnation.ter" },
    { kind: "terrain", name: "damnation.ter" },
    { kind: "interior", name: "base.dif" },
  ];
  const getPreloadAssets = vi.fn(() => inventory);
  const stream = {
    getPreloadAssets,
    getResourceLookahead: () => scan,
  } as unknown as StreamingPlayback;

  const stop = startRecordedAssetPrefetch(engine, stream);
  const [getAssets, , getPriority] = vi
    .mocked(startAssetPrefetch)
    .mock.calls.at(-1)!;
  const batch = getPriority?.();
  expect(getAssets()).toBe(inventory);
  expect(getPreloadAssets).toHaveBeenCalledOnce();
  const keys = batch?.jobs.map(({ key }) => key) ?? [];
  expect(keys.slice(0, 2)).toEqual([
    "shape:current_0.dts",
    "recorded:particleTexture:future_0",
  ]);
  expect(
    keys.slice(0, 23).filter((key) => key.startsWith("recorded:")),
  ).toEqual(
    future.slice(0, 8).map((hint) => `recorded:particleTexture:${hint.name}`),
  );
  expect(new Set(keys).size).toBe(40);
  expect(keys).not.toContain(terrainKey);
  expect(engine.recordedResourcesReady?.()).toBe(false);
  expect(queue.prioritySettled).toHaveBeenCalledExactlyOnceWith([
    terrainKey,
    ...keys.slice(0, 23),
  ]);
  terrainReady = true;
  expect(getPriority?.()?.jobs).toBe(batch?.jobs);
  expect(engine.recordedResourcesReady?.()).toBe(true);

  stop();
  expect(queue.stop).toHaveBeenCalledOnce();
});

it("gates clip startup on observed effect jobs before queuing other prefetch", () => {
  let effectsReady = false;
  const queue = {
    refresh: vi.fn(),
    prioritySettled: vi.fn(() => effectsReady),
    stop: vi.fn(),
  };
  vi.mocked(startAssetPrefetch).mockReturnValueOnce(queue);
  const snapshot = {
    timeSec: 10,
    entities: [
      { shapeHint: "player.dts" },
      { shapeHint: "mortar_projectile.dts", className: "GrenadeProjectile" },
    ],
  } as unknown as StreamSnapshot;
  const engine = { streamSnapshot: { current: snapshot } } as GameEngine;
  let scan: DemoResourceScanResult = { complete: false, hints: [] };
  const stream = {
    getPreloadAssets: () => [{ kind: "terrain", name: "damnation.ter" }],
    getResourceLookahead: () => scan,
  } as unknown as StreamingPlayback;
  clip.active = {
    samples: [
      {
        timeMs: 0,
        demoTimeSec: 10,
        position: [0, 0, 0],
        quaternion: [0, 0, 0, 1],
      },
      {
        timeMs: 3_000,
        demoTimeSec: 13,
        position: [0, 0, 0],
        quaternion: [0, 0, 0, 1],
      },
    ],
  } as ClipTake;
  const stop = startRecordedAssetPrefetch(engine, stream);
  try {
    const getPriority = vi.mocked(startAssetPrefetch).mock.calls.at(-1)?.[2];
    expect(getPriority?.()).toMatchObject({
      blockBackground: true,
      jobs: [{ key: "recorded:effectShape:mortar_projectile.dts" }],
    });
    expect(engine.recordedResourcesReady?.()).toBe(false);
    scan = {
      complete: true,
      hints: [
        { kind: "shape", name: "mortar_explosion.dts" },
        { kind: "particleTexture", name: "special/Smoke/bigSmoke" },
        {
          kind: "effectShape",
          name: "mortar_explosion.dts",
          observedEffect: true,
        },
        {
          kind: "particleTexture",
          name: "special/Smoke/bigSmoke",
          observedEffect: true,
        },
      ],
    };
    const effectKeys = [
      "recorded:effectShape:mortar_projectile.dts",
      "recorded:effect:particleTexture:special/Smoke/bigSmoke",
      "recorded:effectShape:mortar_explosion.dts",
    ];
    const blocked = getPriority?.();
    expect(blocked?.blockBackground).toBe(true);
    expect(blocked?.jobs.map(({ key }) => key)).toEqual(effectKeys);
    expect(engine.recordedResourcesReady?.()).toBe(false);
    expect(queue.prioritySettled).toHaveBeenLastCalledWith([
      "terrain:damnation.ter",
      ...effectKeys,
      "shape:player.dts",
    ]);
    effectsReady = true;
    const unblocked = getPriority?.();
    expect(unblocked?.blockBackground).toBe(false);
    expect(unblocked?.jobs.map(({ key }) => key)).toEqual([
      ...effectKeys,
      "shape:player.dts",
    ]);
    expect(engine.recordedResourcesReady?.()).toBe(true);
  } finally {
    stop();
    clip.active = null;
  }
});

it("keeps recorded hints available when the general asset inventory fails", () => {
  vi.mocked(startAssetPrefetch).mockReturnValueOnce({
    refresh: vi.fn(),
    prioritySettled: vi.fn().mockReturnValue(true),
    stop: vi.fn(),
  });
  const engine = {
    streamSnapshot: { current: { timeSec: 10, entities: [] } },
  } as unknown as GameEngine;
  const getPreloadAssets = vi.fn(() => {
    throw new Error("Inventory unavailable");
  });
  const stream = {
    getPreloadAssets,
    getResourceLookahead: () => ({
      hints: [{ kind: "shape", name: "projectile.dts" }],
      complete: true,
    }),
  } as unknown as StreamingPlayback;

  const stop = startRecordedAssetPrefetch(engine, stream);
  const [getAssets, , getPriority] = vi
    .mocked(startAssetPrefetch)
    .mock.calls.at(-1)!;
  expect(getPriority?.()?.jobs.map(({ key }) => key)).toEqual([
    "shape:projectile.dts",
  ]);
  expect(getAssets()).toEqual([]);
  expect(getPreloadAssets).toHaveBeenCalledOnce();
  expect(engine.recordedResourcesReady?.()).toBe(true);
  stop();
});
