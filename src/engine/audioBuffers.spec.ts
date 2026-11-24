import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import {
  audioBufferCache,
  createAudioBufferLoader,
  getCachedAudioBuffer,
  type AudioBufferLoader,
} from "./audioBuffers";
import { readM4aSampleRate } from "./m4aSampleRate";

vi.mock("../logger", () => ({
  createLogger: () => ({ error: vi.fn() }),
}));

function loader() {
  let complete!: (buffer: AudioBuffer) => void;
  let fail!: (error: unknown) => void;
  const load = vi.fn<AudioBufferLoader["load"]>(
    (_url, onLoad, _progress, onError) => {
      complete = onLoad;
      fail = onError;
    },
  );
  return {
    loader: { load },
    load,
    complete: (buffer: AudioBuffer) => complete(buffer),
    fail: (error: unknown) => fail(error),
  };
}

beforeEach(() => audioBufferCache.clear());

function useAudioTimers() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
}

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

  it("notifies all failed owners and shares one later retry after backoff", () => {
    useAudioTimers();
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
    const nextOnLoad = vi.fn();
    getCachedAudioBuffer("retry.wav", source.loader, nextOnLoad);
    expect(source.load).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000);
    expect(source.load).toHaveBeenCalledTimes(2);
    source.complete({} as AudioBuffer);
    expect(onLoad).toHaveBeenCalledOnce();
    expect(nextOnLoad).toHaveBeenCalledOnce();
  });

  it("aborts a stalled request with no subscribers and rejects late completion", () => {
    useAudioTimers();
    const stalled = loader();
    const recovered = loader();
    const dropped = vi.fn();
    const onLoad = vi.fn();
    const onError = vi.fn();
    const url = "stalled.wav";
    const unsubscribe = getCachedAudioBuffer(url, stalled.loader, dropped);
    unsubscribe();
    const signal = stalled.load.mock.calls[0][4];
    vi.advanceTimersByTime(10_000);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toMatchObject({ name: "TimeoutError" });
    getCachedAudioBuffer(url, recovered.loader, onLoad, onError);
    vi.advanceTimersByTime(1000);
    expect(recovered.load).toHaveBeenCalledOnce();
    stalled.complete({} as AudioBuffer);
    expect(dropped).not.toHaveBeenCalled();
    expect(onLoad).not.toHaveBeenCalled();
    expect(audioBufferCache.has(url)).toBe(false);
    const buffer = {} as AudioBuffer;
    recovered.complete(buffer);
    expect(onLoad).toHaveBeenCalledExactlyOnceWith(buffer);
    expect(onError).not.toHaveBeenCalled();
  });

  it("backs off on consecutive failures and resets after a successful decode", () => {
    useAudioTimers();
    const source = loader();
    const onLoad = vi.fn();
    const url = "consecutive-failures.wav";
    getCachedAudioBuffer(url, source.loader, onLoad);
    source.fail(new Error("first failure"));
    getCachedAudioBuffer(url, source.loader, onLoad);
    vi.advanceTimersByTime(1000);
    source.fail(new Error("second failure"));
    getCachedAudioBuffer(url, source.loader, onLoad);
    vi.advanceTimersByTime(1000);
    expect(source.load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(source.load).toHaveBeenCalledTimes(3);
    source.complete({} as AudioBuffer);
    expect(onLoad).toHaveBeenCalledOnce();
    audioBufferCache.delete(url);
    getCachedAudioBuffer(url, source.loader, onLoad);
    source.fail(new Error("new failure"));
    getCachedAudioBuffer(url, source.loader, onLoad);
    vi.advanceTimersByTime(1000);
    expect(source.load).toHaveBeenCalledTimes(5);
    source.complete({} as AudioBuffer);
    expect(onLoad).toHaveBeenCalledTimes(2);
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

it("fetches with the shared request's signal and decodes on the given context", async () => {
  const bytes = new ArrayBuffer(8);
  const buffer = {} as AudioBuffer;
  const fetchMock = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => bytes,
  }));
  vi.stubGlobal("fetch", fetchMock);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  const decodeAudioData = vi.fn(async () => buffer);
  const loader = createAudioBufferLoader({
    decodeAudioData,
    sampleRate: 48000,
  });
  const controller = new AbortController();
  const decoded = new Promise<AudioBuffer>((resolve, reject) => {
    loader.load("decoded.m4a", resolve, undefined, reject, controller.signal);
  });
  await expect(decoded).resolves.toBe(buffer);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith("decoded.m4a", {
    signal: controller.signal,
  });
  expect(decodeAudioData).toHaveBeenCalledExactlyOnceWith(bytes);
});

// Minimal sample-description headers with the same descriptor layout emitted
// by the game's AAC encoder. Native decoding is stubbed, so there is no mdat.
function m4aHeader({ sbr = false, declaredRate = 22050 } = {}) {
  const u32 = (value: number) => [
    value >>> 24,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ];
  const box = (tag: string, payload: number[]) => [
    ...u32(payload.length + 8),
    ...Array.from(tag, (char) => char.charCodeAt(0)),
    ...payload,
  ];
  const descriptor = (tag: number, payload: number[]) => [
    tag,
    0x80,
    0x80,
    0x80,
    payload.length,
    ...payload,
  ];
  const zeros = (count: number): number[] => Array(count).fill(0);
  const config = descriptor(5, [0x13, 0x88, 0x56, 0xe5, sbr ? 128 : 0]);
  const decoder = descriptor(4, [0x40, 0x15, ...zeros(11), ...config]);
  const esds = box("esds", [
    ...zeros(4),
    ...descriptor(3, [0, 1, 0, ...decoder]),
  ]);
  const entry = box("mp4a", [
    ...zeros(24),
    ...u32(declaredRate * 65536),
    ...esds,
  ]);
  const descriptions = box("stsd", [...zeros(4), ...u32(1), ...entry]);
  const media = box("mdia", [
    ...box("hdlr", [...zeros(8), 0x73, 0x6f, 0x75, 0x6e]),
    ...box("minf", box("stbl", descriptions)),
  ]);
  return Uint8Array.from([
    ...box("ftyp", zeros(8)),
    ...box("moov", box("trak", media)),
  ]).buffer;
}

function decodeWith(
  loader: AudioBufferLoader,
  signal = new AbortController().signal,
) {
  return new Promise<AudioBuffer>((resolve, reject) => {
    loader.load("test.m4a", resolve, undefined, reject, signal);
  });
}

function mockNativeAudio(
  fetchSound: () => ArrayBuffer,
  decodeAudioData: (input: ArrayBuffer) => Promise<AudioBuffer>,
) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => fetchSound(),
  }));
  const offlineContext = vi.fn(function () {
    return { decodeAudioData };
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("OfflineAudioContext", offlineContext);
  onTestFinished(() => {
    vi.unstubAllGlobals();
  });
  return { fetchMock, offlineContext };
}

it("uses and reuses an offline decoder at the game's native AAC rate", async () => {
  const nativeBuffer = { sampleRate: 22050 } as AudioBuffer;
  const decodeNative = vi.fn(async () => nativeBuffer);
  const decodeOutput = vi.fn();
  const { fetchMock, offlineContext } = mockNativeAudio(
    m4aHeader,
    decodeNative,
  );
  const loader = createAudioBufferLoader({
    decodeAudioData: decodeOutput,
    sampleRate: 48000,
  });
  await expect(decodeWith(loader)).resolves.toBe(nativeBuffer);
  await expect(decodeWith(loader)).resolves.toBe(nativeBuffer);
  expect(offlineContext).toHaveBeenCalledExactlyOnceWith(1, 1, 22050);
  expect(decodeNative).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(decodeOutput).not.toHaveBeenCalled();
});

it("uses the mixer decoder on retry after a native decoder stalls", async () => {
  useAudioTimers();
  const url = "stalled-native.m4a";
  const nativeBuffer = { sampleRate: 22050 } as AudioBuffer;
  let finishNative!: (buffer: AudioBuffer) => void;
  const decodeNative = vi.fn(
    () =>
      new Promise<AudioBuffer>((resolve) => {
        finishNative = resolve;
      }),
  );
  const buffer = { sampleRate: 48000 } as AudioBuffer;
  const decodeOutput = vi.fn(async () => buffer);
  const { fetchMock } = mockNativeAudio(m4aHeader, decodeNative);
  const loader = createAudioBufferLoader({
    decodeAudioData: decodeOutput,
    sampleRate: 48000,
  });
  const onLoad = vi.fn();
  const onError = vi.fn();

  getCachedAudioBuffer(url, loader, onLoad, onError);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(decodeNative).toHaveBeenCalledOnce();
  expect(onLoad).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ name: "TimeoutError" }),
  );

  getCachedAudioBuffer(url, loader, onLoad, onError);
  await vi.advanceTimersByTimeAsync(1000);
  expect(decodeNative).toHaveBeenCalledOnce();
  expect(decodeOutput).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(onLoad).toHaveBeenCalledExactlyOnceWith(buffer);

  finishNative(nativeBuffer);
  await vi.advanceTimersByTimeAsync(0);
  expect(onLoad).toHaveBeenCalledOnce();
  expect(audioBufferCache.get(url)).toBe(buffer);
});

it("trusts only the matching AAC-LC rate and rejects truncated headers", () => {
  const bytes = m4aHeader();
  expect(readM4aSampleRate(bytes)).toBe(22050);
  expect(readM4aSampleRate(m4aHeader({ sbr: true }))).toBeUndefined();
  expect(readM4aSampleRate(m4aHeader({ declaredRate: 44100 }))).toBeUndefined();
  for (let length = 0; length < bytes.byteLength; length++) {
    expect(readM4aSampleRate(bytes.slice(0, length))).toBeUndefined();
  }
});

it("uses the output decoder if creating an offline decoder fails", async () => {
  const bytes = m4aHeader();
  const buffer = {} as AudioBuffer;
  const decodeOutput = vi.fn(async () => buffer);
  const { fetchMock, offlineContext } = mockNativeAudio(() => bytes, vi.fn());
  offlineContext.mockImplementation(() => {
    throw new Error("unsupported sample rate");
  });
  const loader = createAudioBufferLoader({
    decodeAudioData: decodeOutput,
    sampleRate: 48000,
  });
  await expect(decodeWith(loader)).resolves.toBe(buffer);
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(decodeOutput).toHaveBeenCalledExactlyOnceWith(bytes);
});

it("re-fetches detached input through the same request signal for the fallback", async () => {
  const bytes = m4aHeader();
  const retry = m4aHeader();
  const buffer = {} as AudioBuffer;
  const decodeOutput = vi.fn(async () => buffer);
  const getBytes = vi
    .fn()
    .mockReturnValueOnce(bytes)
    .mockReturnValueOnce(retry);
  const { fetchMock } = mockNativeAudio(getBytes, async (input) => {
    structuredClone(input, { transfer: [input] });
    throw new Error("offline decode failed");
  });
  const loader = createAudioBufferLoader({
    decodeAudioData: decodeOutput,
    sampleRate: 48000,
  });
  const { signal } = new AbortController();
  await expect(decodeWith(loader, signal)).resolves.toBe(buffer);
  expect(fetchMock.mock.calls).toEqual([
    ["test.m4a", { signal }],
    ["test.m4a", { signal }],
  ]);
  expect(decodeOutput).toHaveBeenCalledExactlyOnceWith(retry);
});

it("skips a second fetch and decode if the audio request expires", async () => {
  const controller = new AbortController();
  const decodeOutput = vi.fn();
  const { fetchMock } = mockNativeAudio(m4aHeader, async () => {
    controller.abort();
    throw new Error("offline decode failed");
  });
  const loader = createAudioBufferLoader({
    decodeAudioData: decodeOutput,
    sampleRate: 48000,
  });
  await expect(decodeWith(loader, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(decodeOutput).not.toHaveBeenCalled();
});
