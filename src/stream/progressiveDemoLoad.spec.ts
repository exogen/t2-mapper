import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamRecording } from "./types";

const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  push: vi.fn(),
  directorBuffer: vi.fn(),
  scan: vi.fn(),
  recording: null as StreamRecording | null,
  complete: false,
}));
vi.mock("t2-demo-parser", () => ({
  DemoParser: class {
    static peekHeader() {
      return { byteLength: 1, header: { initialBlockSize: 1 } };
    }
    async load() {}
    finish = mocks.finish;
    push = mocks.push;
  },
}));
vi.mock("./demoStreaming", () => ({
  createRecordingFromParser: () => mocks.recording,
}));
vi.mock("../state/liveConnectionStore", () => ({
  liveConnectionStore: {
    getState: () => ({ leaveServer() {}, disconnectRelay() {} }),
  },
}));
vi.mock("../state/gameEntityStore", () => ({
  gameEntityStore: { getState: () => ({ endStreaming() {} }) },
}));
vi.mock("../state/commandCircuitStore", () => ({
  commandCircuitStore: { getState: () => ({ deactivate() {} }) },
}));
vi.mock("../state/demoDirectorStore", () => ({
  resetDirector() {},
  setDirectorDemoBuffer: mocks.directorBuffer,
}));
vi.mock("../state/commentaryTracksStore", () => ({
  commentaryTracksStore: { getState: () => ({ load() {} }) },
}));
vi.mock("./demoTimelineScanner", () => ({ scanDemoTimeline: mocks.scan }));

import { engineStore } from "../state/engineStore";
import { demoLoadStore } from "../state/demoLoadStore";
import { demoTimelineStore } from "../state/demoTimelineStore";
import { loadDemoUrl, unloadDemo } from "./demoFileLoader";

const state = () => engineStore.getState();
function recording() {
  return {
    source: "demo",
    duration: 100,
    streamingPlayback: {
      get streamComplete() {
        return mocks.complete;
      },
      bufferedSec: 2,
      findSceneReadyTime() {
        return 0;
      },
      getSnapshot: () => ({
        entities: [{ sceneData: { className: "TerrainBlock" } }],
      }),
    },
  } as unknown as StreamRecording;
}
const scanResult = { events: [], killEvents: [], observerPerspective: false };
beforeEach(() => {
  unloadDemo();
  vi.clearAllMocks();
  mocks.complete = false;
  mocks.recording = recording();
  mocks.finish.mockImplementation(() => {
    mocks.complete = true;
  });
  mocks.scan.mockResolvedValue(scanResult);
});
afterEach(() => {
  unloadDemo();
  vi.unstubAllGlobals();
});

async function installPrefix() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(new Uint8Array([1, 2, 3]));
    },
    cancel,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body)),
  );
  const loading = loadDemoUrl("first.rec");
  await vi.waitFor(() =>
    expect(state().playback.recording).toBe(mocks.recording),
  );
  return { loading, controller, cancel };
}

describe("installed progressive demos", () => {
  it("keeps a cancelled prefix playable and fulfills its seek if the replacement download fails", async () => {
    const { loading, cancel } = await installPrefix();
    state().setPlaybackStatus("playing");
    state().seekPlayback(80);
    expect(state().playback.pendingSeekSec).toBe(80);
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await loadDemoUrl("second.rec");
    await loading;
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.finish).toHaveBeenCalledOnce();
    expect(state().playback).toMatchObject({
      recording: mocks.recording,
      downloadComplete: true,
      pendingSeekSec: null,
      status: "seeking",
    });
    expect(new Uint8Array(state().playback.demoBuffer!)).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());
    expect(demoLoadStore.getState()).toMatchObject({
      phase: "error",
      sourceUrl: "first.rec",
      downloadedSec: null,
    });
  });

  it("releases a stalled reader on unload without reviving scans or playback", async () => {
    const { loading, cancel } = await installPrefix();
    state().seekPlayback(80);
    unloadDemo();
    await loading;
    expect(cancel).toHaveBeenCalledOnce();
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.scan).not.toHaveBeenCalled();
    expect(state().playback).toMatchObject({
      recording: null,
      pendingSeekSec: null,
      seekProgress: null,
    });
  });

  it("handles a network failure like a shortened demo, including independent scans", async () => {
    const { loading, controller } = await installPrefix();
    controller.error(new Error("connection lost"));
    await loading;
    expect(mocks.finish).toHaveBeenCalledOnce();
    expect(state().playback.downloadComplete).toBe(true);
    expect(mocks.directorBuffer).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());
  });

  it("keeps the current demo's timeline scan alive while a replacement fails", async () => {
    let finishScan!: (result: typeof scanResult) => void;
    mocks.scan.mockReturnValueOnce(
      new Promise((resolve) => {
        finishScan = resolve;
      }),
    );
    const { loading, controller } = await installPrefix();
    controller.close();
    await loading;
    await vi.waitFor(() => expect(mocks.scan).toHaveBeenCalledOnce());
    const signal = mocks.scan.mock.calls[0][3] as AbortSignal;
    vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
    await loadDemoUrl("second.rec");
    expect(signal.aborted).toBe(false);
    finishScan(scanResult);
    await vi.waitFor(() =>
      expect(demoTimelineStore.getState().scanProgress).toBeNull(),
    );
    expect(demoTimelineStore.getState().events).toEqual([]);
  });
});
