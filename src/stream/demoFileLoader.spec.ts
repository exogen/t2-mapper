import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamRecording } from "./types";

const mocks = vi.hoisted(() => ({
  install: vi.fn(),
  parse: vi.fn(),
  leave: vi.fn(),
  commentary: vi.fn(),
  warn: vi.fn(),
  current: null as StreamRecording | null,
}));
vi.mock("../logger", () => ({
  createLogger: () => ({ info: vi.fn(), error: vi.fn(), warn: mocks.warn }),
}));
vi.mock("../state/engineStore", () => ({
  engineStore: {
    getState: () => ({
      setRecording: mocks.install,
      playback: { recording: mocks.current },
    }),
  },
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
  commentaryTracksStore: { getState: () => ({ load: mocks.commentary }) },
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

import {
  loadDemoFile,
  loadDemoUrl,
  loadDemoReference,
  unloadDemo,
} from "./demoFileLoader";
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
    vi.stubEnv("RELAY_URL", "wss://relay.example");
    mocks.install.mockImplementation((recording) => {
      mocks.current = recording;
    });
  });
  afterEach(() => {
    unloadDemo();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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
    expect(demoLoadStore.getState().sidecarSourceUrl).toBe("same.rec");
  });

  it("loads a qualified source through the existing parser without index sidecars", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response()),
    );
    const demo = recording("TribesForever");
    mocks.parse.mockResolvedValue(demo);
    await loadDemoReference("tribesforever:22945");
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://relay.example/demo-download/tribesforever/22945",
      {
        signal: expect.any(AbortSignal),
        headers: { Accept: "application/octet-stream, application/json" },
      },
    );
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith(demo, buffer);
    expect(mocks.commentary).toHaveBeenCalledExactlyOnceWith(null);
    expect(demoLoadStore.getState()).toMatchObject({
      sourceUrl: "https://tribesforever.com/demo/22945/download",
      requestedUrl: "https://tribesforever.com/demo/22945/download",
      requestedDemo: "tribesforever:22945",
      sidecarSourceUrl: null,
      phase: "idle",
    });
  });

  it("reports missing relay configuration without downloading or parsing", async () => {
    vi.stubEnv("RELAY_URL", undefined);
    vi.stubGlobal("fetch", vi.fn());
    await loadDemoReference("tribesforever:22945");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedDemo: "tribesforever:22945",
      phase: "error",
      error: "RELAY_URL is not configured",
    });
  });

  it("cancels a qualified download when another demo is selected", async () => {
    const first = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce(response()),
    );
    const pending = loadDemoReference("tribesforever:22945");
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    mocks.parse.mockResolvedValue(recording("next"));
    await loadDemoUrl("next.rec");
    first.resolve(response());
    await pending;
    expect(signal.aborted).toBe(true);
    expect(mocks.parse).toHaveBeenCalledOnce();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedDemo: null,
      sourceUrl: "next.rec",
    });
  });

  it("shows source validation errors and cancels the preceding download", async () => {
    const first = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => first.promise),
    );
    const pending = loadDemoReference("tribesforever:22945");
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    await loadDemoReference("unknown:1");
    first.resolve(response());
    await pending;
    expect(signal.aborted).toBe(true);
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedDemo: "unknown:1",
      requestedUrl: null,
      phase: "error",
      error: "Unknown demo source: unknown",
    });
  });

  it("shows download failures for qualified sources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not found", { status: 404 })),
    );
    await loadDemoReference("tribesforever:22945");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      requestedDemo: "tribesforever:22945",
      phase: "error",
      error: "Couldn't download the demo",
    });
  });

  it("closes an unread HTTP error body and aborts the failed load", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new ReadableStream({ cancel }), { status: 502 }),
      ),
    );
    await loadDemoUrl("failed.rec");
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.mocked(fetch).mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(mocks.parse).not.toHaveBeenCalled();
  });
  const cachedUrl =
    "https://demos.example/demos/sources/tribesforever/22945.rec";
  const metadata = {
    format: "t2-source-demo",
    schemaVersion: 1,
    source: "tribesforever",
    id: "22945",
    sourceUrl: "https://tribesforever.com/demo/22945/download",
    fetchedAt: "2026-09-28T12:00:00.000Z",
    recordedAt: null,
    originalFilename: "original.rec",
    gameVersion: 25034,
    protocolVersion: 0x330004,
    durationMs: 1259725,
  };

  it("installs a demo without waiting for metadata and receives metadata later", async () => {
    const sidecar = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ...response(), url: cachedUrl })
        .mockReturnValueOnce(sidecar.promise),
    );
    mocks.parse.mockResolvedValue(recording("cached"));
    await loadDemoReference("tribesforever:22945");
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenLastCalledWith(`${cachedUrl}.json`, {
      signal: expect.any(AbortSignal),
    });
    expect(demoLoadStore.getState()).toMatchObject({
      sourceMetadata: null,
      phase: "idle",
    });
    sidecar.resolve(new Response(JSON.stringify(metadata)));
    await vi.waitFor(() =>
      expect(demoLoadStore.getState().sourceMetadata).toEqual(metadata),
    );
    await loadDemoFile({ arrayBuffer: async () => buffer } as File);
    expect(demoLoadStore.getState()).toMatchObject({
      sourceMetadata: null,
    });
  });

  it("keeps metadata that arrives before the demo is parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ...response(), url: cachedUrl })
        .mockResolvedValueOnce(new Response(JSON.stringify(metadata))),
    );
    const parsed = deferred<StreamRecording>();
    mocks.parse.mockReturnValueOnce(parsed.promise);
    const pending = loadDemoReference("tribesforever:22945");
    await vi.waitFor(() => expect(mocks.parse).toHaveBeenCalledOnce());
    expect(demoLoadStore.getState().sourceMetadata).toBeNull();
    parsed.resolve(recording("cached"));
    await pending;
    expect(demoLoadStore.getState().sourceMetadata).toEqual(metadata);
  });

  it.each(["eject", "next demo"])(
    "ignores late metadata after %s",
    async (action) => {
      const sidecar = deferred<Response>();
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce({ ...response(), url: cachedUrl })
          .mockReturnValueOnce(sidecar.promise)
          .mockResolvedValueOnce(response()),
      );
      mocks.parse.mockResolvedValue(recording("cached"));
      await loadDemoReference("tribesforever:22945");
      const signal = vi.mocked(fetch).mock.calls[1][1]!.signal!;
      if (action === "eject") unloadDemo();
      else await loadDemoUrl("next.rec");
      expect(signal.aborted).toBe(true);
      sidecar.resolve(new Response(JSON.stringify(metadata)));
      await sidecar.promise;
      // Allow the async JSON parse and state-update continuation to finish.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(demoLoadStore.getState().sourceMetadata).toBeNull();
      expect(demoLoadStore.getState().sourceUrl).toBe(
        action === "eject" ? null : "next.rec",
      );
    },
  );

  it("keeps playback working if the metadata request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ...response(), url: cachedUrl })
        .mockRejectedValueOnce(new Error("metadata offline")),
    );
    mocks.parse.mockResolvedValue(recording("cached"));
    await loadDemoReference("tribesforever:22945");
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "idle",
      sourceMetadata: null,
    });
    expect(mocks.warn).toHaveBeenCalledOnce();
  });

  it("aborts pending metadata if parsing the demo fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ...response(), url: cachedUrl })
        .mockImplementationOnce(
          (_url, options) =>
            new Promise((_resolve, reject) => {
              options.signal.addEventListener(
                "abort",
                () => reject(options.signal.reason),
                { once: true },
              );
            }),
        ),
    );
    mocks.parse.mockRejectedValueOnce(new Error("invalid demo"));
    await loadDemoReference("tribesforever:22945");
    expect(vi.mocked(fetch).mock.calls[1][1]!.signal!.aborted).toBe(true);
    expect(demoLoadStore.getState().error).toBe("Couldn't parse the demo");
  });

  it("shows the relay's unsupported-version error", async () => {
    const message =
      "Only Tribes 2 v25034 demos are supported (received protocol 0x330003)";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(message, { status: 422 })),
    );
    await loadDemoReference("tribesforever:22945");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "error",
      error: message,
    });
  });

  it("shows a retry message when the relay's import queue is full", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 503 })),
    );
    await loadDemoReference("tribesforever:22945");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "error",
      error: "Demo downloads are busy. Please try again shortly.",
    });
  });
  it("shows the relay's demo size limit error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("Demo exceeds the 150 MB size limit", { status: 413 }),
      ),
    );
    await loadDemoReference("tribesforever:22945");
    expect(mocks.parse).not.toHaveBeenCalled();
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "error",
      error: "Demo exceeds the 150 MB size limit",
    });
  });
});
