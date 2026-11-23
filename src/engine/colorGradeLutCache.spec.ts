import { expect, it } from "vitest";
import {
  Data3DTexture,
  FloatType,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";
import { performanceTuning } from "../performanceTuning";
import { ColorGradeLutCache } from "./colorGradeLutCache";

it("restores independent texture ownership with the exact decoded grade and sampling settings", () => {
  const cache = new ColorGradeLutCache(32);
  const backing = new Float32Array(128);
  const data = backing.subarray(1, 9);
  data.set([0.1, 0.2, 0.3, 1, 0.4, 0.5, 0.6, 1]);
  const loaded = new Data3DTexture(data, 2, 1, 1);
  loaded.type = FloatType;
  loaded.colorSpace = SRGBColorSpace;
  loaded.minFilter = LinearFilter;
  loaded.magFilter = LinearFilter;
  loaded.wrapR = RepeatWrapping;
  cache.remember("NightLUT", loaded);
  loaded.dispose();
  const restored = cache.restore("NightLUT")!;
  expect(restored).not.toBe(loaded);
  expect(restored.source).not.toBe(loaded.source);
  expect(restored.image).not.toBe(loaded.image);
  expect(restored.image.data).not.toBe(data);
  expect(restored.image.data).toEqual(data);
  expect(restored.image.data!.buffer.byteLength).toBe(32);
  expect(restored.image).toMatchObject({ width: 2, height: 1, depth: 1 });
  expect(restored).toMatchObject({
    type: FloatType,
    colorSpace: SRGBColorSpace,
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    wrapR: RepeatWrapping,
    version: 1,
  });
  data[0] = 42;
  expect(restored.image.data![0]).not.toBe(42);
  expect(cache.restore("NeutralLUT")).toBeUndefined();
  restored.dispose();
  cache.dispose();
});

it("keeps only one bounded payload and leaves oversize or disabled caching cold", () => {
  const cache = new ColorGradeLutCache(32);
  cache.remember("NightLUT", new Data3DTexture(new Uint8Array(32), 2, 2, 2));
  expect(readResourceMetrics()).toMatchObject({
    "postProcessingLutCache.ownedLutBytes": 32,
    "postProcessingLutCache.limitBytes": 32,
    "postProcessingLutCache.entries": 1,
  });
  cache.remember("NeutralLUT", new Data3DTexture(new Uint8Array(16), 2, 2, 1));
  expect(cache.restore("NightLUT")).toBeUndefined();
  expect(readResourceMetrics()["postProcessingLutCache.ownedLutBytes"]).toBe(
    16,
  );
  cache.remember("NightLUT", new Data3DTexture(new Uint8Array(33), 3, 1, 1));
  expect(cache.restore("NightLUT")).toBeUndefined();
  expect(cache.restore("NeutralLUT")).toBeUndefined();
  expect(readResourceMetrics()["postProcessingLutCache.ownedLutBytes"]).toBe(0);
  cache.dispose();
  const disabled = new ColorGradeLutCache(0);
  disabled.remember("NightLUT", new Data3DTexture(new Uint8Array(4), 1, 1, 1));
  expect(disabled.restore("NightLUT")).toBeUndefined();
  disabled.dispose();
});

it("clears payloads on ownership change and removes gauges on final disposal", () => {
  const cache = new ColorGradeLutCache();
  const texture = new Data3DTexture(new Uint8Array(4), 1, 1, 1);
  cache.remember("NightLUT", texture);
  cache.clear();
  expect(cache.restore("NightLUT")).toBeUndefined();
  expect(readResourceMetrics()).toMatchObject({
    "postProcessingLutCache.ownedLutBytes": 0,
    "postProcessingLutCache.limitBytes":
      performanceTuning.postProcessing.maxCachedLutCpuBytes,
  });
  cache.remember("NightLUT", texture);
  cache.dispose();
  cache.dispose();
  cache.remember("NightLUT", texture);
  expect(cache.restore("NightLUT")).toBeUndefined();
  expect(
    readResourceMetrics()["postProcessingLutCache.limitBytes"],
  ).toBeUndefined();
});
