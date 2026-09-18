import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamRecording } from "./types";

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  parse: vi.fn(),
  leave: vi.fn(),
}));
vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn() }),
}));
vi.mock("../state/engineStore", () => ({
  engineStore: { getState: () => ({ setRecording: mocks.install }) },
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: {
    getState: () => ({ leaveServer: mocks.leave, disconnectRelay: vi.fn() }),
  },
}));
vi.mock("../state/gameEntityStore", () => ({
  gameEntityStore: { getState: () => ({ endStreaming: vi.fn() }) },
}));
vi.mock("../state/commandCircuitStore", () => ({
  commandCircuitStore: { getState: () => ({ deactivate: vi.fn() }) },
}));
vi.mock("../state/demoDirectorStore", () => ({
  resetDirector: vi.fn(),
  setDirectorDemoBuffer: vi.fn(),
}));
vi.mock("../state/commentaryTracksStore", () => ({
  commentaryTracksStore: { getState: () => ({ load: vi.fn() }) },
}));
vi.mock("./demoStreaming", () => ({
  createDemoStreamingRecording: mocks.parse,
}));
vi.mock("./demoTimelineScanner", () => ({
  scanDemoTimeline: async () => ({
    events: [],
    killEvents: [],
    observerPerspective: false,
  }),
}));

import { loadDemoFile, loadDemoUrl, unloadDemo } from "./demoFileLoader";
import { demoLoadStore } from "../state/demoLoadStore";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const buffer = new ArrayBuffer(4);
const response = () =>
  ({ ok: true, body: null, arrayBuffer: async () => buffer }) as Response;
const recording = (name: string) =>
  ({ source: "demo", recorderName: name }) as StreamRecording;

describe("demo loads during navigation", () => {
  beforeEach(() => {
    unloadDemo();
    vi.clearAllMocks();
  });
  afterEach(() => {
    unloadDemo();
    vi.unstubAllGlobals();
  });

  it("aborts a download on eject and ignores a late response", async () => {
    const download = deferred<Response>();
    const fetch = vi.fn(() => download.promise);
    vi.stubGlobal("fetch", fetch);
    const pending = loadDemoUrl("first.rec");
    const signal = (vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit)
      .signal!;
    unloadDemo();
    expect(signal.aborted).toBe(true);
    download.resolve(response());
    await pending;
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedUrl: null,
      sourceUrl: null,
      phase: "idle",
    });
  });

  it("does not install an older parse after the next demo is loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const first = deferred<StreamRecording>();
    const second = recording("second");
    mocks.parse
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(second);
    const pending = loadDemoUrl("first.rec");
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledOnce());
    await loadDemoUrl("second.rec");
    first.resolve(recording("first"));
    await pending;
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith(second, buffer);
    expect(demoLoadStore.getState()).toMatchObject({
      requestedUrl: "second.rec",
      sourceUrl: "second.rec",
    });
  });

  it("does not replace a selected demo with an older local file read", async () => {
    const read = deferred<ArrayBuffer>();
    const pending = loadDemoFile({ arrayBuffer: () => read.promise } as File);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const next = recording("next");
    mocks.parse.mockResolvedValueOnce(next);
    await loadDemoUrl("next.rec");
    read.resolve(buffer);
    await pending;
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith(next, buffer);
    expect(demoLoadStore.getState().sourceUrl).toBe("next.rec");
  });

  it("can load the same URL again after ejecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    mocks.parse.mockResolvedValue(recording("same"));
    await loadDemoUrl("same.rec");
    unloadDemo();
    await loadDemoUrl("same.rec");
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(demoLoadStore.getState().sourceUrl).toBe("same.rec");
  });
});
