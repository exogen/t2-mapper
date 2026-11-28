import { afterEach, expect, it, vi } from "vitest";
import { loadHtmlTexture, retainHtmlTexture } from "./htmlTextures";
import { imageWorkQueue } from "./imageWorkQueue";
import { SceneAssets } from "./sceneAssets";

afterEach(() => vi.unstubAllGlobals());

it("promotes a queued HTML image without opening a second request", async () => {
  const started: Array<{ url: string; image: EventTarget }> = [];
  vi.stubGlobal("document", {
    createElement: () =>
      new (class extends EventTarget {
        set src(url: string) {
          started.push({ url, image: this });
        }
      })(),
  });
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => (release = resolve));
  const running = Array.from({ length: imageWorkQueue.concurrency }, () =>
    imageWorkQueue.run(() => blocked),
  );
  const assets = new SceneAssets();
  const optionalUrl = "https://textures.test/optional.png";
  const visibleUrl = "https://textures.test/visible.png";
  const optional = loadHtmlTexture(optionalUrl, assets, "speculative");
  const prefetched = loadHtmlTexture(visibleUrl, assets, "speculative");
  expect(loadHtmlTexture(visibleUrl, assets)).toBe(prefetched);
  expect(started).toHaveLength(0);

  release();
  await Promise.all(running);
  expect(started.map(({ url }) => url)).toEqual([visibleUrl, optionalUrl]);
  for (const { image } of started) image.dispatchEvent(new Event("load"));
  const [, visible] = await Promise.all([optional, prefetched]);
  expect(visible.image).toBe(started[0].image);
  assets.dispose();
});

it("preserves a matching installed image across generations and releases unused images", async () => {
  const createElement = vi.fn(
    () =>
      new (class extends EventTarget {
        set src(_url: string) {
          queueMicrotask(() => this.dispatchEvent(new Event("load")));
        }
      })(),
  );
  vi.stubGlobal("document", { createElement });
  const assets = new SceneAssets();
  const initial = assets.textures;
  const shared = "/shared.png";
  const [same, retired] = await Promise.all([
    loadHtmlTexture(shared, initial),
    loadHtmlTexture("/hd.png", initial),
  ]);
  const dispose = vi.fn();
  same.addEventListener("dispose", dispose);
  const cleanup = vi.fn();
  const prepare = vi.fn(() => cleanup);
  const stop = assets.bindTextures(prepare, (next) =>
    retainHtmlTexture(shared, next),
  );
  assets.refreshTextures();
  assets.refreshTextures();

  expect(prepare).toHaveBeenCalledOnce();
  expect(cleanup).not.toHaveBeenCalled();
  expect(prepare).toHaveBeenCalledWith(initial);
  expect(createElement).toHaveBeenCalledTimes(2);
  expect(retired.image).toBeNull();
  expect(await loadHtmlTexture(shared, assets.textures)).toBe(same);
  expect(dispose).not.toHaveBeenCalled();
  stop();
  assets.dispose();
  expect(dispose).toHaveBeenCalledOnce();
});
