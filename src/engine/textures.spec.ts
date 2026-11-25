import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClampToEdgeWrapping,
  DefaultLoadingManager,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type WebGLRenderer,
} from "three";
import { loadTextures } from "./textures";
import { loadHtmlTexture } from "../assets/htmlTextures";
import { loadBitmapTextureAsync } from "../assets/bitmapTextures";
import { SceneAssets } from "../assets/sceneAssets";
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";

vi.mock("../logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

// Exercise the HTML-element path without browser decoding.
class TestImage extends EventTarget {
  width = 0;
  height = 0;
  complete = false;
  crossOrigin = "";
  private source = "";

  get src() {
    return this.source;
  }

  set src(value: string) {
    this.source = value;
    images.push(this);
  }

  removeAttribute(name: string) {
    if (name === "src") this.source = "";
  }

  succeed(width = 8, height = 4) {
    this.width = width;
    this.height = height;
    this.complete = true;
    this.dispatchEvent(new Event("load"));
  }

  fail() {
    this.dispatchEvent(new Event("error"));
  }
}

const previousManagerCallbacks = {
  onStart: DefaultLoadingManager.onStart,
  onLoad: DefaultLoadingManager.onLoad,
  onError: DefaultLoadingManager.onError,
};
const complete = vi.fn();
const error = vi.fn();
const start = vi.fn();
const createImage = vi.fn(() => new TestImage());
let images: TestImage[];
let sequence = 0;
const url = () => `https://view-textures.test/${sequence}.png`;

beforeEach(() => {
  sequence++;
  images = [];
  createImage.mockReset().mockImplementation(() => new TestImage());
  complete.mockClear();
  error.mockClear();
  start.mockClear();
  DefaultLoadingManager.onStart = start;
  DefaultLoadingManager.onLoad = complete;
  DefaultLoadingManager.onError = error;
  vi.stubGlobal("document", { createElement: createImage });
});

afterEach(() => {
  Object.assign(DefaultLoadingManager, previousManagerCallbacks);
  DefaultLoadingManager.setURLModifier();
  vi.unstubAllGlobals();
});

describe("view texture ownership", () => {
  it("cancels queued texture loads when the scene is released", async () => {
    const concurrency = readResourceMetrics()["imageWorkQueue.concurrency"]!;
    const active = Array.from({ length: concurrency }, (_, index) =>
      loadHtmlTexture(`${url()}?active=${index}`),
    );
    const outgoing = new SceneAssets();
    const fetchImage = vi.fn();
    vi.stubGlobal("fetch", fetchImage);
    const discarded = [
      expect(loadHtmlTexture(`${url()}?html`, outgoing)).rejects.toMatchObject({
        name: "AbortError",
      }),
      expect(
        loadBitmapTextureAsync(`${url()}?bitmap`, outgoing),
      ).rejects.toMatchObject({
        cause: { name: "AbortError" },
      }),
    ];
    expect(readResourceMetrics()["imageWorkQueue.queued"]).toBe(2);
    outgoing.dispose();
    const queuedAfterRelease = readResourceMetrics()["imageWorkQueue.queued"];
    expect(complete).not.toHaveBeenCalled();
    for (const image of images) image.succeed();
    await Promise.all([...active, ...discarded]);

    expect(queuedAfterRelease).toBe(0);
    expect(images).toHaveLength(concurrency);
    expect(fetchImage).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });

  it("releases settled images and rejects late work without affecting a replacement scene", async () => {
    const old = new SceneAssets();
    const next = new SceneAssets();
    const before = readResourceMetrics();
    const earlyBitmap = { width: 4, height: 4, close: vi.fn() };
    const lateBitmap = { width: 8, height: 8, close: vi.fn() };
    const newBitmap = { width: 8, height: 4, close: vi.fn() };
    let finishLateBitmap!: (value: typeof lateBitmap) => void;
    const decode = vi
      .fn()
      .mockResolvedValueOnce(earlyBitmap)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishLateBitmap = resolve;
          }),
      )
      .mockResolvedValueOnce(newBitmap);
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Blob())),
    );

    const ready = await loadBitmapTextureAsync(`${url()}?ready`, old);
    const onDispose = vi.fn();
    ready.addEventListener("dispose", onDispose);
    const oldBitmap = loadBitmapTextureAsync(url(), old).catch(
      (error: unknown) => error,
    );
    await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(2));
    const oldHtml = loadHtmlTexture(url(), old).catch(
      (error: unknown) => error,
    );
    old.dispose();
    expect(earlyBitmap.close).toHaveBeenCalledOnce();
    expect(onDispose).toHaveBeenCalledOnce();
    expect(ready.image).toBe(null);

    const nextBitmap = loadBitmapTextureAsync(url(), next);
    const nextHtml = loadHtmlTexture(url(), next);
    expect(images[0].src).toBe("");
    finishLateBitmap(lateBitmap);
    await vi.waitFor(() => expect(images).toHaveLength(2));
    images[1].succeed();
    expect(await oldBitmap).toBeInstanceOf(Error);
    expect(await oldHtml).toMatchObject({ name: "AbortError" });
    expect(lateBitmap.close).toHaveBeenCalledOnce();
    expect((await nextBitmap).image).toBe(newBitmap);
    expect((await nextHtml).image).toBe(images[1]);
    expect(newBitmap.close).not.toHaveBeenCalled();
    next.dispose();
    expect(newBitmap.close).toHaveBeenCalledOnce();
    const after = readResourceMetrics();
    for (const prefix of ["bitmapTextureCache", "imageTextureCache"]) {
      expect(after[`${prefix}.cacheEntries`]).toBe(
        before[`${prefix}.cacheEntries`],
      );
      expect(after[`${prefix}.estimatedDecodedImageBytes`]).toBe(
        before[`${prefix}.estimatedDecodedImageBytes`],
      );
    }
  });

  it("frees stalled bitmap and HTML requests when their scene is replaced", async () => {
    const old = new SceneAssets();
    const next = new SceneAssets();
    const concurrency = readResourceMetrics()["imageWorkQueue.concurrency"]!;
    const fetchImage = vi
      .fn<(url: string, init: { signal: AbortSignal }) => Promise<Response>>(
        async () => new Response(new Blob()),
      )
      .mockImplementationOnce(
        (_url: string, { signal }: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), {
              once: true,
            });
          }),
      );
    const bitmap = { width: 1, height: 1, close: vi.fn() };
    vi.stubGlobal("fetch", fetchImage);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));

    const discarded = [
      expect(loadBitmapTextureAsync(url(), old)).rejects.toMatchObject({
        cause: { name: "AbortError" },
      }),
      ...Array.from({ length: concurrency - 1 }, (_, i) =>
        expect(loadHtmlTexture(`${url()}?${i}`, old)).rejects.toMatchObject({
          name: "AbortError",
        }),
      ),
    ];
    const nextBitmap = loadBitmapTextureAsync(url(), next);
    const nextHtml = loadHtmlTexture(`${url()}?0`, next);
    expect(fetchImage).toHaveBeenCalledOnce();
    expect(images).toHaveLength(concurrency - 1);
    expect(readResourceMetrics()["imageWorkQueue.queued"]).toBe(2);

    old.dispose();
    expect(images.every((image) => !image.src)).toBe(true);
    await Promise.all(discarded);
    await vi.waitFor(() => expect(images).toHaveLength(concurrency));
    const nextImage = images.at(-1)!;
    nextImage.succeed();
    await expect(nextBitmap).resolves.toHaveProperty("image", bitmap);
    await expect(nextHtml).resolves.toHaveProperty("image", nextImage);
    expect(fetchImage.mock.calls).toEqual([
      [url(), { signal: old.signal }],
      [url(), { signal: next.signal }],
    ]);
    expect(error).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
    expect(readResourceMetrics()["imageWorkQueue.active"]).toBe(0);
    next.dispose();
  });

  it("preserves HTML loader defaults and independently accounts shape bitmap images", async () => {
    const before = readResourceMetrics();
    const bitmap = { width: 8, height: 4 } as ImageBitmap;
    const decode = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob())));
    vi.stubGlobal("createImageBitmap", decode);

    const view = loadHtmlTexture(url());
    expect(loadHtmlTexture(url())).toBe(view);
    const shape = loadBitmapTextureAsync(url());
    images[0].succeed();
    const [viewTexture, shapeTexture] = await Promise.all([view, shape]);
    expect(viewTexture.image).toBe(images[0]);
    expect(shapeTexture.image).toBe(bitmap);
    expect(viewTexture.source).not.toBe(shapeTexture.source);
    expect(viewTexture.flipY).toBe(true);
    expect(shapeTexture.flipY).toBe(false);
    expect(viewTexture.premultiplyAlpha).toBe(false);
    expect(viewTexture.colorSpace).toBe(NoColorSpace);
    expect(viewTexture.wrapS).toBe(ClampToEdgeWrapping);
    expect(images[0].crossOrigin).toBe("anonymous");
    shapeTexture.colorSpace = SRGBColorSpace;
    shapeTexture.wrapS = RepeatWrapping;
    shapeTexture.repeat.set(3, 4);
    expect(viewTexture.colorSpace).toBe(NoColorSpace);
    expect(viewTexture.wrapS).toBe(ClampToEdgeWrapping);
    expect(viewTexture.repeat.toArray()).toEqual([1, 1]);
    expect(decode).toHaveBeenCalledExactlyOnceWith(expect.any(Blob), {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(readResourceMetrics()).toMatchObject({
      "imageTextureCache.pendingEntries": 0,
      "imageTextureCache.decodedSources":
        before["imageTextureCache.decodedSources"]! + 1,
      "imageTextureCache.estimatedDecodedImageBytes":
        before["imageTextureCache.estimatedDecodedImageBytes"]! + 128,
      "bitmapTextureCache.estimatedDecodedImageBytes":
        before["bitmapTextureCache.estimatedDecodedImageBytes"]! + 128,
    });
    expect(
      readResourceMetrics()["imageTextureCache.sharedSourceEntries"],
    ).toBeUndefined();
    expect(
      readResourceMetrics()["textureSourceLoads.crossCacheSources"],
    ).toBeUndefined();
  });

  it("bounds image creation and keeps the manager active while view jobs wait", async () => {
    const concurrency = readResourceMetrics()["imageWorkQueue.concurrency"]!;
    const loads = Array.from({ length: concurrency + 2 }, (_, index) =>
      loadHtmlTexture(`${url()}?queued=${index}`),
    );
    expect(images).toHaveLength(concurrency);
    expect(readResourceMetrics()).toMatchObject({
      "imageWorkQueue.active": concurrency,
      "imageWorkQueue.queued": 2,
      "imageTextureCache.pendingEntries": concurrency + 2,
    });
    for (let index = 0; index < loads.length; index++) {
      await vi.waitFor(() => expect(images.length).toBeGreaterThan(index));
      images[index].succeed();
      await loads[index];
      if (index < loads.length - 1) expect(complete).not.toHaveBeenCalled();
    }
    expect(start).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    expect(readResourceMetrics()).toMatchObject({
      "imageWorkQueue.active": 0,
      "imageWorkQueue.queued": 0,
      "imageTextureCache.pendingEntries": 0,
    });
  });

  it("evicts failed requests and balances queued ownership on retry", async () => {
    const failed = loadHtmlTexture(url());
    const rejected = expect(failed).rejects.toBeInstanceOf(Event);
    images[0].fail();
    await rejected;
    expect(error).toHaveBeenCalledExactlyOnceWith(url());
    expect(complete).toHaveBeenCalledOnce();
    expect(readResourceMetrics()["imageTextureCache.pendingEntries"]).toBe(0);

    const retry = loadHtmlTexture(url());
    expect(retry).not.toBe(failed);
    expect(images).toHaveLength(2);
    images[1].succeed();
    await expect(retry).resolves.toHaveProperty("image", images[1]);
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("shares the work budget with shape fetch and bitmap decoding", async () => {
    const concurrency = readResourceMetrics()["imageWorkQueue.concurrency"]!;
    const fetchImage = vi.fn().mockResolvedValue(new Response(new Blob()));
    const bitmap = { width: 1, height: 1 } as ImageBitmap;
    vi.stubGlobal("fetch", fetchImage);
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
    const views = Array.from({ length: concurrency }, (_, index) =>
      loadHtmlTexture(`${url()}?mixed=${index}`),
    );
    const shape = loadBitmapTextureAsync(`${url()}?shape`);
    expect(images).toHaveLength(concurrency);
    expect(fetchImage).not.toHaveBeenCalled();
    expect(readResourceMetrics()["imageWorkQueue.queued"]).toBe(1);
    images[0].succeed();
    await expect(shape).resolves.toHaveProperty("image", bitmap);
    expect(fetchImage).toHaveBeenCalledOnce();
    expect(complete).not.toHaveBeenCalled();
    for (const image of images.slice(1)) image.succeed();
    await Promise.all(views);
    expect(complete).toHaveBeenCalledOnce();
  });

  it("permits reentrant retry even when a manager error observer throws", async () => {
    let retry: ReturnType<typeof loadHtmlTexture> | undefined;
    DefaultLoadingManager.onError = () => {
      retry = loadHtmlTexture(url());
      throw new Error("detached loading UI");
    };
    const rejected = expect(loadHtmlTexture(url())).rejects.toBeInstanceOf(
      Event,
    );
    images[0].fail();
    await rejected;
    expect(complete).not.toHaveBeenCalled();
    expect(images).toHaveLength(2);
    images[1].succeed();
    await expect(retry).resolves.toHaveProperty("image", images[1]);
    expect(complete).toHaveBeenCalledOnce();
    expect(readResourceMetrics()).toMatchObject({
      "imageWorkQueue.active": 0,
      "imageTextureCache.pendingEntries": 0,
    });
  });

  it("finishes queue and manager items after synchronous loader failures", async () => {
    createImage.mockImplementationOnce(() => {
      throw new Error("image unavailable");
    });
    await expect(loadHtmlTexture(url())).rejects.toThrow("image unavailable");
    expect(error).toHaveBeenCalledExactlyOnceWith(url());
    expect(complete).toHaveBeenCalledOnce();
    expect(readResourceMetrics()).toMatchObject({
      "imageWorkQueue.active": 0,
      "imageTextureCache.pendingEntries": 0,
    });
  });

  it("preserves global URL resolution", async () => {
    DefaultLoadingManager.setURLModifier((value) => `${value}?resolved`);
    const ready = loadHtmlTexture(url());
    expect(images[0].src).toBe(`${url()}?resolved`);
    images[0].succeed();
    await ready;
  });

  it("skips released uploads while retaining the texture for a live owner", async () => {
    const controller = new AbortController();
    const abandonedUpload = vi.fn();
    const liveUpload = vi.fn();
    const setup = vi.fn();
    const abandoned = loadTextures(
      [url()],
      { initTexture: abandonedUpload } as unknown as WebGLRenderer,
      setup,
      controller.signal,
    );
    const live = loadTextures([url()], {
      initTexture: liveUpload,
    } as unknown as WebGLRenderer);
    controller.abort();
    images[0].succeed();
    const [abandonedTextures, liveTextures] = await Promise.all([
      abandoned,
      live,
    ]);
    expect(abandonedUpload).not.toHaveBeenCalled();
    expect(setup).not.toHaveBeenCalled();
    expect(liveUpload).toHaveBeenCalledExactlyOnceWith(liveTextures[0]);
    expect(abandonedTextures[0]).toBe(liveTextures[0]);
    expect(images).toHaveLength(1);
    expect(complete).toHaveBeenCalledOnce();
  });

  it("honors aborts during setup before initializing GPU storage", async () => {
    const controller = new AbortController();
    const upload = vi.fn();
    const ready = loadTextures(
      [url()],
      { initTexture: upload } as unknown as WebGLRenderer,
      () => controller.abort(),
      controller.signal,
    );
    images[0].succeed();
    await ready;
    expect(upload).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledOnce();
  });
});
