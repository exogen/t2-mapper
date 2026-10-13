import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AudioLoader } from "three";
import { audioToUrl } from "../loaders";
import { getResourceMap } from "../manifest";
import { audioBufferCache, getCachedAudioBuffer } from "./audioBuffers";
import { MATCH_SOUND_PATHS, preloadMatchSounds } from "./preloadMatchSounds";

vi.mock("../logger", () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn() }),
}));

function createLoader() {
  const pending = new Map<
    string,
    { complete: (buffer: AudioBuffer) => void; fail?: (error: unknown) => void }
  >();
  const load = vi.fn<AudioLoader["load"]>((url, onLoad, _progress, onError) => {
    pending.set(url, { complete: onLoad, fail: onError });
  });
  const buffer = {} as AudioBuffer;
  const complete = (url: string) => {
    const request = pending.get(url)!;
    pending.delete(url);
    request.complete(buffer);
  };
  return {
    loader: { load } as unknown as AudioLoader,
    load,
    pending,
    buffer,
    complete,
    fail(url: string) {
      const request = pending.get(url)!;
      pending.delete(url);
      request.fail?.(new Error("network failure"));
    },
    finishAll() {
      while (pending.size) complete(pending.keys().next().value!);
    },
  };
}

let source: ReturnType<typeof createLoader>;
let cleanups: Array<() => void>;

function start() {
  const stop = preloadMatchSounds(source.loader);
  cleanups.push(stop);
  return stop;
}

beforeEach(() => {
  audioBufferCache.clear();
  source = createLoader();
  cleanups = [];
});

afterEach(() => {
  for (const stop of cleanups) stop();
  source.finishAll();
});

it("resolves every selected sound to an existing manifest entry and AAC URL", () => {
  const urls = MATCH_SOUND_PATHS.map((path) => {
    expect(getResourceMap()[`audio/${path}`]).toBeDefined();
    const url = audioToUrl(path);
    expect(url).toMatch(/\.m4a$/);
    return url;
  });
  expect(new Set(urls).size).toBe(MATCH_SOUND_PATHS.length);
});

it("limits concurrent loads and shares decoding with normal playback", () => {
  start();
  expect(source.pending.size).toBe(4);
  const [url] = source.pending.keys();
  const played = vi.fn();
  getCachedAudioBuffer(url, source.loader, played);
  expect(source.load).toHaveBeenCalledTimes(4);
  source.complete(url);
  expect(played).toHaveBeenCalledExactlyOnceWith(source.buffer);
  expect(source.pending.size).toBe(4);

  while (source.pending.size) {
    source.complete(source.pending.keys().next().value!);
    expect(source.pending.size).toBeLessThanOrEqual(4);
  }
  expect(source.load).toHaveBeenCalledTimes(MATCH_SOUND_PATHS.length);
  expect(audioBufferCache.size).toBe(MATCH_SOUND_PATHS.length);

  start();
  expect(source.load).toHaveBeenCalledTimes(MATCH_SOUND_PATHS.length);
  expect(source.pending.size).toBe(0);
});

it("stops queued work on cleanup but keeps in-flight buffers usable", () => {
  const stop = start();
  stop();
  source.finishAll();
  expect(source.load).toHaveBeenCalledTimes(4);
  expect(audioBufferCache.size).toBe(4);

  start();
  source.finishAll();
  expect(source.load).toHaveBeenCalledTimes(MATCH_SOUND_PATHS.length);
  expect(audioBufferCache.size).toBe(MATCH_SOUND_PATHS.length);
});

it("reuses in-flight requests across a provider remount", () => {
  start()();
  start();
  expect(source.load).toHaveBeenCalledTimes(4);
  source.finishAll();
  expect(source.load).toHaveBeenCalledTimes(MATCH_SOUND_PATHS.length);
  expect(audioBufferCache.size).toBe(MATCH_SOUND_PATHS.length);
});

it("continues after load failures and leaves failed sounds retryable", () => {
  source.load.mockImplementationOnce(() => {
    throw new Error("loader failure");
  });
  start();
  expect(source.pending.size).toBe(4);
  const [failedUrl] = source.pending.keys();
  source.fail(failedUrl);
  expect(source.pending.size).toBe(4);
  source.finishAll();
  expect(audioBufferCache.size).toBe(MATCH_SOUND_PATHS.length - 2);

  start();
  expect(source.pending.size).toBe(2);
  source.finishAll();
  expect(audioBufferCache.size).toBe(MATCH_SOUND_PATHS.length);
});
