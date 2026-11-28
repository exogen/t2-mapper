import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultLoadingManager } from "three";
import {
  loadBitmapTexture,
  loadBitmapTextureAsync,
  loadBitmapTextureInstance,
  promoteBitmapTexture,
} from "./bitmapTextures";
import { readResourceMetrics } from "../diagnostics/resourceMetricRegistry";
import { setupTexture } from "../textureUtils";
import { imageWorkQueue } from "./imageWorkQueue";
import { SceneAssets } from "./sceneAssets";

vi.mock("../logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const png = new Blob(
  [
    Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      ),
      (char) => char.charCodeAt(0),
    ),
  ],
  { type: "image/png" },
);
const image = { width: 1, height: 1 } as ImageBitmap;
const previousManagerCallbacks = {
  onStart: DefaultLoadingManager.onStart,
  onLoad: DefaultLoadingManager.onLoad,
  onError: DefaultLoadingManager.onError,
};
let requests: Array<ReturnType<typeof deferred<Response>>>;
let decodes: Array<ReturnType<typeof deferred<ImageBitmap>>>;
let sequence = 0;
const fetchImage = vi.fn<typeof fetch>();
const decodeImage =
  vi.fn<(blob: Blob, options: ImageBitmapOptions) => Promise<ImageBitmap>>();
const complete = vi.fn();
const error = vi.fn();
const start = vi.fn();

beforeEach(() => {
  sequence++;
  requests = [];
  decodes = [];
  fetchImage.mockReset().mockImplementation(() => {
    const request = deferred<Response>();
    requests.push(request);
    return request.promise;
  });
  decodeImage.mockReset().mockImplementation(() => {
    const decode = deferred<ImageBitmap>();
    decodes.push(decode);
    return decode.promise;
  });
  complete.mockClear();
  error.mockClear();
  start.mockClear();
  DefaultLoadingManager.onStart = start;
  DefaultLoadingManager.onLoad = complete;
  DefaultLoadingManager.onError = error;
  vi.stubGlobal("fetch", fetchImage);
  vi.stubGlobal("createImageBitmap", decodeImage);
});

afterEach(() => {
  Object.assign(DefaultLoadingManager, previousManagerCallbacks);
  vi.unstubAllGlobals();
});

const url = () => `https://textures.test/${sequence}.png`;

async function fetchSucceeded() {
  requests[0].resolve(new Response(png));
  await vi.waitFor(() => expect(decodes).toHaveLength(1));
}

describe("shared shape texture images", () => {
  it("keeps decoded pixels and samplers when their resolved URL is unchanged", async () => {
    const assets = new SceneAssets();
    const name = url();
    const first = loadBitmapTextureInstance(
      () => [name],
      undefined,
      [],
      assets,
    );
    const second = loadBitmapTextureInstance(
      () => [name],
      undefined,
      [],
      assets,
    );
    await fetchSucceeded();
    const bitmap = { width: 8, height: 8, close: vi.fn() };
    decodes[0].resolve(bitmap as unknown as ImageBitmap);
    await vi.waitFor(() => expect(second.image).toBe(bitmap));
    const source = first.source;
    const version = first.version;
    const disposed = vi.fn();
    first.addEventListener("dispose", disposed);
    second.addEventListener("dispose", disposed);

    assets.refreshTextures();
    expect(fetchImage).toHaveBeenCalledOnce();
    expect(bitmap.close).not.toHaveBeenCalled();
    expect(disposed).not.toHaveBeenCalled();
    expect(first.source).toBe(source);
    expect(second.source).toBe(source);
    expect(first.version).toBe(version);
    expect(
      loadBitmapTexture(name, undefined, undefined, assets.textures).source,
    ).toBe(source);

    first.dispose();
    second.dispose();
    assets.dispose();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("keeps a loaded fallback when no new candidate takes priority", async () => {
    const assets = new SceneAssets();
    const preferred = `${url()}?preferred`;
    const fallback = `${url()}?fallback`;
    let candidates = [preferred, fallback, `${url()}?hd`];
    const sampler = loadBitmapTextureInstance(
      () => candidates,
      undefined,
      [],
      assets,
    );

    requests[0].resolve(new Response(png, { status: 404 }));
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    requests[1].resolve(new Response(png));
    await vi.waitFor(() => expect(decodes).toHaveLength(1));
    const original = { width: 8, height: 8, close: vi.fn() };
    decodes[0].resolve(original as unknown as ImageBitmap);
    await vi.waitFor(() => expect(sampler.image).toBe(original));

    candidates = [preferred, fallback, `${url()}?sd`];
    assets.refreshTextures();
    expect(sampler.image).toBe(original);

    candidates = [fallback];
    assets.refreshTextures();
    expect(sampler.image).toBe(original);
    expect(original.close).not.toHaveBeenCalled();
    expect(fetchImage).toHaveBeenCalledTimes(2);

    candidates = [preferred, fallback];
    assets.refreshTextures();
    expect(fetchImage.mock.calls[2][0]).toBe(preferred);
    expect(original.close).toHaveBeenCalledOnce();
    requests[2].resolve(new Response(png));
    await vi.waitFor(() => expect(decodes).toHaveLength(2));
    const replacement = { width: 16, height: 16, close: vi.fn() };
    decodes[1].resolve(replacement as unknown as ImageBitmap);
    await vi.waitFor(() => expect(sampler.image).toBe(replacement));

    sampler.dispose();
    assets.dispose();
    expect(replacement.close).toHaveBeenCalledOnce();
  });

  it.each(["settled", "pending"])(
    "handles a %s retry of a preferred texture when quality changes",
    async (retryState) => {
      const assets = new SceneAssets();
      const preferred = `${url()}?preferred`;
      const fallback = `${url()}?fallback`;
      const sampler = loadBitmapTextureInstance(
        () => [preferred, fallback],
        undefined,
        [],
        assets,
      );
      requests[0].resolve(new Response(png, { status: 404 }));
      await vi.waitFor(() => expect(requests).toHaveLength(2));
      requests[1].resolve(new Response(png));
      await vi.waitFor(() => expect(decodes).toHaveLength(1));
      const fallbackImage = { width: 8, height: 8, close: vi.fn() };
      decodes[0].resolve(fallbackImage as unknown as ImageBitmap);
      await vi.waitFor(() => expect(sampler.image).toBe(fallbackImage));

      const retry = loadBitmapTextureAsync(
        preferred,
        assets.textures,
        "speculative",
      );
      const restoredImage = { width: 16, height: 16, close: vi.fn() };
      if (retryState === "settled") {
        requests[2].resolve(new Response(png));
        await vi.waitFor(() => expect(decodes).toHaveLength(2));
        decodes[1].resolve(restoredImage as unknown as ImageBitmap);
        await retry;
        assets.refreshTextures();
        expect(sampler.image).toBe(restoredImage);
        expect(fallbackImage.close).toHaveBeenCalledOnce();
      } else {
        const canceled = expect(retry).rejects.toThrow(preferred);
        assets.refreshTextures();
        requests[2].resolve(new Response(png));
        await canceled;
        expect(sampler.image).toBe(fallbackImage);
        expect(decodeImage).toHaveBeenCalledOnce();
      }
      expect(fetchImage.mock.calls.map(([url]) => url)).toEqual([
        preferred,
        fallback,
        preferred,
      ]);
      sampler.dispose();
      assets.dispose();
    },
  );

  it("rebinds a live sampler through rapid texture changes and ignores stale decodes", async () => {
    const assets = new SceneAssets();
    let name = `${url()}?size=large`;
    const resolve = vi.fn(() => [name]);
    const sampler = loadBitmapTextureInstance(resolve, undefined, [], assets);
    sampler.repeat.set(3, 4);

    await fetchSucceeded();
    const firstBitmap = {
      width: 8,
      height: 8,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    decodes[0].resolve(firstBitmap);
    await vi.waitFor(() => expect(sampler.image).toBe(firstBitmap));
    const firstSource = sampler.source;
    const evicted = vi.fn(() => sampler.source);
    sampler.addEventListener("dispose", evicted);

    name = `${url()}?size=intermediate`;
    assets.refreshTextures();
    expect(evicted).toHaveReturnedWith(firstSource);
    expect(sampler.image).toBeNull();
    expect(sampler.version).toBe(0);
    expect(firstBitmap.close).toHaveBeenCalledOnce();
    requests[1].resolve(new Response(png));
    await vi.waitFor(() => expect(decodes).toHaveLength(2));

    name = `${url()}?size=small`;
    assets.refreshTextures();
    const stale = {
      width: 4,
      height: 4,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    decodes[1].resolve(stale);
    await vi.waitFor(() => expect(stale.close).toHaveBeenCalledOnce());
    expect(sampler.image).toBeNull();

    requests[2].resolve(new Response(png));
    await vi.waitFor(() => expect(decodes).toHaveLength(3));
    const latest = {
      width: 2,
      height: 2,
      close: vi.fn(),
    } as unknown as ImageBitmap;
    decodes[2].resolve(latest);
    await vi.waitFor(() => expect(sampler.image).toBe(latest));
    expect(sampler.version).toBeGreaterThan(0);
    expect(sampler.repeat.toArray()).toEqual([3, 4]);
    expect(
      loadBitmapTexture(name, undefined, undefined, assets.textures).source,
    ).toBe(sampler.source);

    sampler.dispose();
    assets.refreshTextures();
    expect(latest.close).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledTimes(3);
    expect(fetchImage).toHaveBeenCalledTimes(3);
    assets.dispose();
  });

  it("shares checked image loads and keeps the manager busy through decoding", async () => {
    const loaded = vi.fn();
    const original = loadBitmapTexture(url(), loaded);
    const a = loadBitmapTextureInstance(url());
    const b = loadBitmapTextureInstance(url());
    expect(fetchImage).toHaveBeenCalledOnce();
    expect(a.source).toBe(original.source);
    expect(b.source).toBe(original.source);
    expect(original.flipY).toBe(false);
    a.repeat.set(3, 4);
    a.anisotropy = 8;

    await fetchSucceeded();
    expect(complete).not.toHaveBeenCalled();
    expect(loaded).not.toHaveBeenCalled();
    expect(decodeImage).toHaveBeenCalledWith(expect.any(Blob), {
      premultiplyAlpha: "none",
      colorSpaceConversion: "none",
    });
    decodes[0].resolve(image);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());

    expect(start).toHaveBeenCalledOnce();
    expect(loaded).toHaveBeenCalledExactlyOnceWith(original);
    expect(a.image).toBe(image);
    expect(b.image).toBe(image);
    // Decoding bumps the pixel revision once, regardless of sampler count.
    expect(original.source.version).toBe(1);
    expect(a.version).toBeGreaterThan(0);
    expect(b.version).toBeGreaterThan(0);
    expect(a.repeat.toArray()).toEqual([3, 4]);
    expect(b.repeat.toArray()).toEqual([1, 1]);
    expect(b.anisotropy).toBe(1);
    const cached = vi.fn();
    expect(loadBitmapTexture(url(), cached)).toBe(original);
    expect(cached).toHaveBeenCalledExactlyOnceWith(original);
    const cachedSampler = loadBitmapTextureInstance(url());
    expect(cachedSampler.source).toBe(original.source);
    const samplerVersion = cachedSampler.version;
    expect(samplerVersion).toBeGreaterThan(0);
    setupTexture(cachedSampler, { disableMipmaps: true });
    expect(cachedSampler.version).toBe(samplerVersion + 1);
    expect(original.source.version).toBe(1);
    expect(fetchImage).toHaveBeenCalledOnce();
    expect(decodeImage).toHaveBeenCalledOnce();
  });

  it("promotes a queued bitmap when a renderer sampler asks for it", async () => {
    const assets = new SceneAssets();
    const blocked = deferred<void>();
    const running = Array.from({ length: imageWorkQueue.concurrency }, () =>
      imageWorkQueue.run(() => blocked.promise),
    );
    const optionalUrl = `${url()}?optional`;
    const visibleUrl = `${url()}?visible`;
    const optional = loadBitmapTextureAsync(
      optionalUrl,
      assets.textures,
      "speculative",
    );
    const prefetched = loadBitmapTextureAsync(
      visibleUrl,
      assets.textures,
      "speculative",
    );
    const visible = loadBitmapTextureInstance(
      () => [visibleUrl],
      undefined,
      [],
      assets,
    );
    expect(fetchImage).not.toHaveBeenCalled();

    blocked.resolve();
    await Promise.all(running);
    expect(fetchImage.mock.calls.map(([url]) => url)).toEqual([
      visibleUrl,
      optionalUrl,
    ]);
    for (const request of requests) request.resolve(new Response(png));
    await vi.waitFor(() => expect(decodes).toHaveLength(2));
    for (const decode of decodes) decode.resolve(image);
    const [, loaded] = await Promise.all([optional, prefetched]);
    expect(visible.source).toBe(loaded.source);
    expect(visible.image).toBe(image);
  });

  it("prioritizes the existing bitmap request for an imminent effect", async () => {
    const assets = new SceneAssets();
    const blocked = deferred<void>();
    const running = Array.from({ length: imageWorkQueue.concurrency }, () =>
      imageWorkQueue.run(() => blocked.promise),
    );
    const geometryUrl = `${url()}?geometry`;
    const effectUrl = `${url()}?effect`;
    const geometry = loadBitmapTextureAsync(geometryUrl, assets.textures);
    const effect = loadBitmapTextureAsync(effectUrl, assets.textures);
    promoteBitmapTexture(effectUrl, assets.textures, "critical");
    const sameEffect = loadBitmapTextureAsync(
      effectUrl,
      assets.textures,
      "critical",
    );
    expect(readResourceMetrics()).toMatchObject({
      "imageWorkQueue.queuedCritical": 1,
      "imageWorkQueue.queuedDemand": 1,
      "imageWorkQueue.queuedSpeculative": 0,
    });

    blocked.resolve();
    await Promise.all(running);
    expect(fetchImage.mock.calls.map(([url]) => url)).toEqual([
      effectUrl,
      geometryUrl,
    ]);
    for (const request of requests) request.resolve(new Response(png));
    await vi.waitFor(() => expect(decodes).toHaveLength(2));
    for (const decode of decodes) decode.resolve(image);
    const [, loaded, reused] = await Promise.all([
      geometry,
      effect,
      sameEffect,
    ]);
    expect(reused).toBe(loaded);
  });

  it.each(["HTTP 404", "network", "decode"] as const)(
    "notifies all waiters and permits retry after a %s failure",
    async (failure) => {
      const firstError = vi.fn();
      const samplerError = vi.fn();
      const loaded = vi.fn();
      const original = loadBitmapTexture(url(), loaded, firstError);
      loadBitmapTextureInstance(url(), samplerError);
      const a = loadBitmapTextureAsync(url());
      const b = loadBitmapTextureAsync(url());
      const rejected = Promise.all([
        expect(a).rejects.toThrow(url()),
        expect(b).rejects.toThrow(url()),
      ]);
      if (failure === "network") requests[0].reject(new Error("offline"));
      else if (failure === "HTTP 404")
        // A decodable image body still must not override the failing status.
        requests[0].resolve(new Response(png, { status: 404 }));
      else {
        await fetchSucceeded();
        decodes[0].reject(new Error("invalid image"));
      }
      await rejected;
      await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
      expect(firstError).toHaveBeenCalledExactlyOnceWith(url());
      expect(samplerError).toHaveBeenCalledExactlyOnceWith(url());
      expect(error).toHaveBeenCalledExactlyOnceWith(url());
      expect(loaded).not.toHaveBeenCalled();
      expect(decodeImage).toHaveBeenCalledTimes(failure === "decode" ? 1 : 0);

      const retry = loadBitmapTextureAsync(url());
      requests[1].resolve(new Response(png));
      const decodeCount = failure === "decode" ? 2 : 1;
      await vi.waitFor(() => expect(decodes).toHaveLength(decodeCount));
      decodes.at(-1)!.resolve(image);
      await expect(retry).resolves.not.toBe(original);
      await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
      expect(loadBitmapTexture(url()).image).toBe(image);
      expect(fetchImage).toHaveBeenCalledTimes(2);
    },
  );

  it("finishes the decode item and rejects waiters if the decoder throws", async () => {
    decodeImage.mockImplementationOnce(() => {
      throw new Error("decoder unavailable");
    });
    const result = loadBitmapTextureAsync(url());
    const rejected = expect(result).rejects.toThrow(url());
    requests[0].resolve(new Response(png));
    await rejected;
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(error).toHaveBeenCalledExactlyOnceWith(url());
  });

  it("keeps new retry waiters separate from the failed request's waiters", async () => {
    let retry: Promise<ReturnType<typeof loadBitmapTexture>> | undefined;
    loadBitmapTexture(url(), undefined, () => {
      // Reentrant error callbacks must not discard this new load's waiters.
      loadBitmapTexture(url());
      retry = loadBitmapTextureAsync(url());
    });
    const failed = loadBitmapTextureAsync(url());
    const rejected = expect(failed).rejects.toThrow(url());
    requests[0].reject(new Error("offline"));
    await rejected;
    expect(requests).toHaveLength(2);
    requests[1].resolve(new Response(png));
    await vi.waitFor(() => expect(decodes).toHaveLength(1));
    decodes[0].resolve(image);
    await expect(retry).resolves.toHaveProperty("image", image);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
  });

  it("bounds in-flight fetching and decoding while keeping queued work visible to the manager", async () => {
    const concurrency = readResourceMetrics()["imageWorkQueue.concurrency"]!;
    const count = concurrency + 3;
    const loads = Array.from({ length: count }, (_, index) =>
      loadBitmapTextureAsync(`${url()}?concurrency=${index}`),
    );
    expect(fetchImage).toHaveBeenCalledTimes(concurrency);
    expect(readResourceMetrics()).toMatchObject({
      "imageWorkQueue.active": concurrency,
      "imageWorkQueue.queued": 3,
    });
    for (let i = 0; i < concurrency; i++)
      requests[i].resolve(new Response(png));
    await vi.waitFor(() => expect(decodes).toHaveLength(concurrency));
    expect(fetchImage).toHaveBeenCalledTimes(concurrency);
    expect(complete).not.toHaveBeenCalled();
    for (let i = 0; i < count; i++) {
      if (i >= concurrency) {
        await vi.waitFor(() => expect(requests.length).toBeGreaterThan(i));
        requests[i].resolve(new Response(png));
        await vi.waitFor(() => expect(decodes.length).toBeGreaterThan(i));
      }
      decodes[i].resolve({ width: i + 1, height: 1 } as ImageBitmap);
      await loads[i];
      if (i < count - 1) expect(complete).not.toHaveBeenCalled();
    }
    await Promise.all(loads);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(readResourceMetrics()).toMatchObject({
      "imageWorkQueue.active": 0,
      "imageWorkQueue.queued": 0,
      "imageWorkQueue.peakActive": concurrency,
    });
  });

  it("notifies other owners and finishes manager work when a callback throws", async () => {
    loadBitmapTexture(url(), () => {
      throw new Error("disposed callback");
    });
    const ready = loadBitmapTextureAsync(url());
    await fetchSucceeded();
    decodes[0].resolve(image);
    await expect(ready).resolves.toHaveProperty("image", image);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(readResourceMetrics()["imageWorkQueue.active"]).toBe(0);
  });

  it("keeps retry and manager draining safe when an error callback throws", async () => {
    loadBitmapTexture(url(), undefined, () => {
      throw new Error("disposed error callback");
    });
    const failure = expect(loadBitmapTextureAsync(url())).rejects.toThrow(
      url(),
    );
    requests[0].reject(new Error("offline"));
    await failure;
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(readResourceMetrics()["imageWorkQueue.active"]).toBe(0);
  });

  it("releases the shared queue slot if a loading-manager error observer throws", async () => {
    DefaultLoadingManager.onError = () => {
      throw new Error("detached loading UI");
    };
    const result = loadBitmapTextureAsync(url());
    const failure = expect(result).rejects.toThrow(url());
    await fetchSucceeded();
    decodes[0].reject(new Error("bad bitmap"));
    await failure;
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(readResourceMetrics()["imageWorkQueue.active"]).toBe(0);

    const retry = loadBitmapTextureAsync(url());
    requests[1].resolve(new Response(png));
    await vi.waitFor(() => expect(decodes).toHaveLength(2));
    decodes[1].resolve(image);
    await expect(retry).resolves.toHaveProperty("image", image);
    await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
  });
});
