import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefaultLoadingManager } from "three";
import {
  loadTexture,
  loadTextureAsync,
  loadTextureInstance,
} from "./textureUtils";

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
const fetchImage = vi.fn<(request: Request) => Promise<Response>>();
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
  // FileLoader emits progress events while reading Response's real stream.
  vi.stubGlobal("ProgressEvent", Event);
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
  it("shares checked image loads and keeps the manager busy through decoding", async () => {
    const loaded = vi.fn();
    const original = loadTexture(url(), loaded);
    const a = loadTextureInstance(url());
    const b = loadTextureInstance(url());
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
    expect(a.version).toBeGreaterThan(0);
    expect(b.version).toBeGreaterThan(0);
    expect(a.repeat.toArray()).toEqual([3, 4]);
    expect(b.repeat.toArray()).toEqual([1, 1]);
    expect(b.anisotropy).toBe(1);
    const cached = vi.fn();
    expect(loadTexture(url(), cached)).toBe(original);
    expect(cached).toHaveBeenCalledExactlyOnceWith(original);
    expect(loadTextureInstance(url()).source).toBe(original.source);
    expect(fetchImage).toHaveBeenCalledOnce();
    expect(decodeImage).toHaveBeenCalledOnce();
  });

  it.each(["HTTP 404", "network", "decode"] as const)(
    "notifies all waiters and permits retry after a %s failure",
    async (failure) => {
      const firstError = vi.fn();
      const samplerError = vi.fn();
      const loaded = vi.fn();
      const original = loadTexture(url(), loaded, firstError);
      loadTextureInstance(url(), samplerError);
      const a = loadTextureAsync(url());
      const b = loadTextureAsync(url());
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

      const retry = loadTextureAsync(url());
      requests[1].resolve(new Response(png));
      const decodeCount = failure === "decode" ? 2 : 1;
      await vi.waitFor(() => expect(decodes).toHaveLength(decodeCount));
      decodes.at(-1)!.resolve(image);
      await expect(retry).resolves.not.toBe(original);
      await vi.waitFor(() => expect(complete).toHaveBeenCalledTimes(2));
      expect(loadTexture(url()).image).toBe(image);
      expect(fetchImage).toHaveBeenCalledTimes(2);
    },
  );

  it("finishes the decode item and rejects waiters if the decoder throws", async () => {
    decodeImage.mockImplementationOnce(() => {
      throw new Error("decoder unavailable");
    });
    const result = loadTextureAsync(url());
    const rejected = expect(result).rejects.toThrow(url());
    requests[0].resolve(new Response(png));
    await rejected;
    await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(error).toHaveBeenCalledExactlyOnceWith(url());
  });

  it("keeps new retry waiters separate from the failed request's waiters", async () => {
    let retry: Promise<ReturnType<typeof loadTexture>> | undefined;
    loadTexture(url(), undefined, () => {
      // Reentrant error callbacks must not discard this new load's waiters.
      loadTexture(url());
      retry = loadTextureAsync(url());
    });
    const failed = loadTextureAsync(url());
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
});
