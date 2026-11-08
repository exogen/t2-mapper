import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamRecording } from "./types";

const mocks = vi.hoisted(() => ({
  finish: vi.fn(),
  push: vi.fn(),
  directorBuffer: vi.fn(),
  scan: vi.fn(),
  recording: null as StreamRecording | null,
  complete: false,
  headerDuration: 100,
  bufferedSec: 2,
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
    get duration() {
      return mocks.headerDuration || mocks.bufferedSec;
    },
    streamingPlayback: {
      get streamComplete() {
        return mocks.complete;
      },
      get bufferedSec() {
        return mocks.bufferedSec;
      },
      findSceneReadyTime() {
        return 0;
      },
      getSnapshot: () => ({
        entities: [{ sceneData: { className: "TerrainBlock" } }],
      }),
    },
  } as unknown as StreamRecording;
}
const scanResult = { events: [] };
beforeEach(() => {
  unloadDemo();
  vi.clearAllMocks();
  mocks.complete = false;
  mocks.headerDuration = 100;
  mocks.bufferedSec = 2;
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

async function installPrefix(
  metadata: Response | Promise<Response> = new Response(null, { status: 404 }),
) {
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
    vi.fn(async (url) => {
      const path = new URL(String(url), "http://localhost/").pathname;
      if (path.endsWith(".checkpoints.json"))
        return new Response(null, { status: 404 });
      if (path.endsWith(".rec.json")) return metadata;
      return new Response(body);
    }),
  );
  const loading = loadDemoUrl("first.rec");
  await vi.waitFor(() =>
    expect(state().playback.recording).toBe(mocks.recording),
  );
  return { loading, controller, cancel };
}

describe("installed progressive demos", () => {
  it("keeps metadata requests independent from the growing demo stream", async () => {
    let finishMetadata!: (response: Response) => void;
    const metadata = new Promise<Response>((resolve) => {
      finishMetadata = resolve;
    });
    const { loading, controller } = await installPrefix(metadata);
    expect(state().playback.downloadComplete).toBe(false);
    expect(demoLoadStore.getState().publishedGames).toBeNull();
    expect(fetch).toHaveBeenCalledWith("http://localhost/first.rec.json", {
      signal: expect.any(AbortSignal),
      cache: "no-cache",
    });

    const games = [
      {
        mission: "Katabatic",
        gameType: "CTF",
        startMs: 0,
        tournament: false,
        title: "Final",
        teamNames: { 1: "Knights" },
      },
    ];
    finishMetadata(Response.json({ games }));
    await vi.waitFor(() =>
      expect(demoLoadStore.getState().publishedGames).toEqual(games),
    );
    controller.enqueue(new Uint8Array([4]));
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledOnce());
    controller.close();
    await loading;
    expect(state().playback.downloadComplete).toBe(true);
    expect(state().playback.recording).toBe(mocks.recording);
  });

  it("publishes a growing fallback duration and the exact final fractional tail", async () => {
    mocks.headerDuration = 0;
    const { loading, controller } = await installPrefix();
    expect(state().playback.durationMs).toBe(2_000);
    state().setPlaybackStatus("playing");
    state().setPlaybackRate(2);
    const { seekNonce } = state().playback;

    mocks.bufferedSec = 5.12;
    controller.enqueue(new Uint8Array([4]));
    await vi.waitFor(() => expect(state().playback.durationMs).toBe(5_120));
    expect(state().playback).toMatchObject({
      status: "playing",
      rate: 2,
      seekNonce,
    });
    state().seekPlayback(4);
    expect(state().playback.seekTime).toBe(4);

    mocks.bufferedSec = 5.28;
    controller.enqueue(new Uint8Array([5]));
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(2));
    expect(state().playback.durationMs).toBe(5_120);
    mocks.finish.mockImplementation(() => {
      mocks.complete = true;
      mocks.bufferedSec = 5.312;
    });
    controller.close();
    await loading;
    expect(state().playback.durationMs).toBe(5_312);
    expect(state().playback.downloadComplete).toBe(true);
  });

  it.each(["network failure", "replacement failure"])(
    "publishes the final fallback duration after %s",
    async (reason) => {
      mocks.headerDuration = 0;
      const { loading, controller } = await installPrefix();
      mocks.finish.mockImplementation(() => {
        mocks.complete = true;
        mocks.bufferedSec = 2.048;
      });
      if (reason === "network failure") {
        controller.error(new Error("connection lost"));
      } else {
        vi.mocked(fetch).mockRejectedValueOnce(new Error("offline"));
        await loadDemoUrl("second.rec");
      }
      await loading;
      expect(state().playback).toMatchObject({
        recording: mocks.recording,
        durationMs: 2_048,
        downloadComplete: true,
      });
    },
  );

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
