import { expect, it, vi } from "vitest";
import { SRGBColorSpace, Texture } from "three";
import {
  observeFailedBitmapTexture,
  repairBitmapSource,
} from "./bitmapSourceRecovery";

it("repairs independent failed samplers and their upload versions without changing material settings", () => {
  const model = new Texture();
  const first = new Texture(),
    second = new Texture();
  first.source = second.source = model.source;
  first.repeat.set(3, 4);
  first.anisotropy = 8;
  first.colorSpace = SRGBColorSpace;
  first.flipY = false;
  for (const texture of [model, first, second])
    observeFailedBitmapTexture(texture);
  const loaded = new Texture({ width: 16, height: 16 });
  loaded.needsUpdate = true;
  const oldSource = model.source;
  repairBitmapSource(oldSource, loaded);
  for (const texture of [model, first, second]) {
    expect(texture.source).toBe(loaded.source);
    expect(texture.image).toBe(loaded.image);
    expect(texture.version).toBeGreaterThan(0);
  }
  expect(oldSource.data).toBe(loaded.image);
  expect(oldSource.version).toBe(1);
  expect(loaded.source.version).toBe(1);
  expect(first.repeat.toArray()).toEqual([3, 4]);
  expect(first.anisotropy).toBe(8);
  expect(first.colorSpace).toBe(SRGBColorSpace);
  expect(first.flipY).toBe(false);
});

it("unlinks disposed samplers and old groups when a sampler registers after retargeting", () => {
  const texture = new Texture();
  const oldSource = texture.source;
  const remove = vi.spyOn(texture, "removeEventListener");
  observeFailedBitmapTexture(texture);
  texture.source = new Texture().source;
  const newSource = texture.source;
  observeFailedBitmapTexture(texture);
  expect(remove).toHaveBeenCalledOnce();
  const oldRecovery = new Texture({ width: 1, height: 1 });
  repairBitmapSource(oldSource, oldRecovery);
  expect(texture.source).toBe(newSource);
  expect(texture.version).toBe(0);
  texture.dispose();
  expect(remove).toHaveBeenCalledTimes(2);
  repairBitmapSource(newSource, new Texture({ width: 2, height: 2 }));
  expect(texture.source).toBe(newSource);
  expect(texture.version).toBe(0);
});

it("never retargets a recovered or manually rebound sampler on a late repeated repair", () => {
  const texture = new Texture();
  const failedSource = texture.source;
  const remove = vi.spyOn(texture, "removeEventListener");
  observeFailedBitmapTexture(texture);
  const fallback = new Texture({ width: 1, height: 1 });
  texture.source = fallback.source;
  repairBitmapSource(failedSource, new Texture({ width: 2, height: 2 }));
  expect(texture.source).toBe(fallback.source);
  expect(texture.version).toBe(0);
  expect(remove).toHaveBeenCalledOnce();
  repairBitmapSource(failedSource, new Texture({ width: 3, height: 3 }));
  expect(texture.source).toBe(fallback.source);
  expect(remove).toHaveBeenCalledOnce();
});
