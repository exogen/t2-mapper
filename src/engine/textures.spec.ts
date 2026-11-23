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
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";

vi.mock("../logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

// Exercise the real TextureLoader/ImageLoader path without browser decoding.
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
  vi.stubGlobal("document", { createElementNS: createImage });
});

afterEach(() => {
  Object.assign(DefaultLoadingManager, previousManagerCallbacks);
  DefaultLoadingManager.setURLModifier();
  vi.unstubAllGlobals();
});

describe("view texture ownership", () => {
  it("preserves HTML loader defaults and independently accounts shape bitmap images", async () => {
    const before = readResourceMetrics();
    const bitmap = { width: 8, height: 4 } as ImageBitmap;
    const decode = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob())));
    vi.stubGlobal("createImageBitmap", decode);
    vi.stubGlobal("ProgressEvent", Event);

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
    vi.stubGlobal("ProgressEvent", Event);
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
