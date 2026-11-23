import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AudioLoader } from "three";
import { audioBufferCache, getCachedAudioBuffer } from "./audioBuffers";

vi.mock("../logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

function loader() {
  let complete!: (buffer: AudioBuffer) => void;
  let fail!: (error: unknown) => void;
  const load = vi.fn((_url, onLoad, _progress, onError) => {
    complete = onLoad;
    fail = onError;
  });
  return {
    loader: { load } as unknown as AudioLoader,
    load,
    complete: (buffer: AudioBuffer) => complete(buffer),
    fail: (error: unknown) => fail(error),
  };
}

beforeEach(() => audioBufferCache.clear());

describe("shared audio buffers", () => {
  it("delivers oversized buffers to all pending owners without retaining them in the cache", () => {
    const source = loader();
    const first = vi.fn(),
      second = vi.fn();
    const oversized = {
      length: audioBufferCache.maxBytes / 4 + 1,
      numberOfChannels: 1,
    } as AudioBuffer;
    getCachedAudioBuffer("large.wav", source.loader, first);
    getCachedAudioBuffer("large.wav", source.loader, second);
    source.complete(oversized);
    expect(first).toHaveBeenCalledExactlyOnceWith(oversized);
    expect(second).toHaveBeenCalledExactlyOnceWith(oversized);
    expect(audioBufferCache.has("large.wav")).toBe(false);
    expect(audioBufferCache.retainedBytes).toBe(0);
    getCachedAudioBuffer("large.wav", source.loader, vi.fn());
    expect(source.load).toHaveBeenCalledTimes(2);
    source.complete({ length: 1, numberOfChannels: 1 } as AudioBuffer);
  });

  it("counts aliased buffers once and evicts lookup references without mutating active owners", () => {
    const activeBuffer = { length: 10, numberOfChannels: 2 } as AudioBuffer;
    audioBufferCache.set("first.wav", activeBuffer);
    audioBufferCache.set("alias.wav", activeBuffer);
    expect(audioBufferCache.retainedBytes).toBe(80);
    expect(audioBufferCache.uniqueValues).toBe(1);
    for (let i = 0; i < audioBufferCache.maxEntries; i++)
      audioBufferCache.set(`small${i}.wav`, {
        length: 1,
        numberOfChannels: 1,
      } as AudioBuffer);
    expect(audioBufferCache.has("first.wav")).toBe(false);
    expect(audioBufferCache.has("alias.wav")).toBe(false);
    expect(activeBuffer.length).toBe(10);
    expect(activeBuffer.numberOfChannels).toBe(2);
    expect(audioBufferCache.size).toBe(audioBufferCache.maxEntries);
    expect(audioBufferCache.retainedBytes).toBe(
      audioBufferCache.maxEntries * 4,
    );
  });

  it("loads and decodes once for concurrent sound owners, then serves cached buffers synchronously", () => {
    const firstLoader = loader();
    const secondLoader = loader();
    const first = vi.fn(),
      second = vi.fn(),
      third = vi.fn();
    const buffer = {} as AudioBuffer;
    getCachedAudioBuffer("station.wav", firstLoader.loader, first);
    getCachedAudioBuffer("station.wav", secondLoader.loader, second);
    expect(firstLoader.load).toHaveBeenCalledOnce();
    expect(secondLoader.load).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    firstLoader.complete(buffer);
    expect(first).toHaveBeenCalledExactlyOnceWith(buffer);
    expect(second).toHaveBeenCalledExactlyOnceWith(buffer);
    getCachedAudioBuffer("station.wav", secondLoader.loader, third);
    expect(third).toHaveBeenCalledExactlyOnceWith(buffer);
    expect(secondLoader.load).not.toHaveBeenCalled();
  });

  it("notifies all failed owners and permits a later retry", () => {
    const source = loader();
    const firstError = vi.fn(),
      secondError = vi.fn();
    const onLoad = vi.fn();
    const error = new Error("network failure");
    getCachedAudioBuffer("retry.wav", source.loader, onLoad, firstError);
    getCachedAudioBuffer("retry.wav", source.loader, onLoad, secondError);
    source.fail(error);
    expect(firstError).toHaveBeenCalledExactlyOnceWith(error);
    expect(secondError).toHaveBeenCalledExactlyOnceWith(error);
    expect(onLoad).not.toHaveBeenCalled();
    getCachedAudioBuffer("retry.wav", source.loader, onLoad);
    expect(source.load).toHaveBeenCalledTimes(2);
    source.complete({} as AudioBuffer);
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("does not let one owner's callback prevent other owners receiving their buffer", () => {
    const source = loader();
    const onLoad = vi.fn();
    getCachedAudioBuffer("callback.wav", source.loader, () => {
      throw new Error("disposed owner");
    });
    getCachedAudioBuffer("callback.wav", source.loader, onLoad);
    source.complete({} as AudioBuffer);
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("releases a request when the loader throws synchronously", () => {
    const source = loader();
    source.load.mockImplementationOnce(() => {
      throw new Error("loader failure");
    });
    expect(() =>
      getCachedAudioBuffer("throw.wav", source.loader, vi.fn()),
    ).toThrow("loader failure");
    const onLoad = vi.fn();
    getCachedAudioBuffer("throw.wav", source.loader, onLoad);
    expect(source.load).toHaveBeenCalledTimes(2);
    source.complete({} as AudioBuffer);
    expect(onLoad).toHaveBeenCalledOnce();
  });

  it("delivers failure notifications even if one owner's handler throws", () => {
    const source = loader();
    const onError = vi.fn();
    getCachedAudioBuffer("error-callback.wav", source.loader, vi.fn(), () => {
      throw new Error("disposed owner");
    });
    getCachedAudioBuffer("error-callback.wav", source.loader, vi.fn(), onError);
    source.fail(new Error("network failure"));
    expect(onError).toHaveBeenCalledOnce();
  });
});
