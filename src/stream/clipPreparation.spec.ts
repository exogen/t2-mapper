import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClipView } from "../../relay/clipTypes";
import type { StreamRecording } from "./types";

type PlaybackState = {
  recording: StreamRecording | null;
  demoBuffer: ArrayBuffer | null;
  downloadStatus: "downloading" | "complete" | "interrupted";
  seekIntentNonce: number;
};
type EngineState = { playback: PlaybackState };

const fixture = vi.hoisted(() => ({
  playback: {} as PlaybackState,
  load: {
    sourceUrl: "test.rec",
    phase: "idle",
    error: null as string | null,
    requestedDemo: "test.rec" as string | null,
    requestedUrl: null as string | null,
  },
  attached: null as unknown,
  loadGeneration: 0,
  listeners: [
    new Set<(next: EngineState, previous: EngineState) => void>(),
    new Set<() => void>(),
    new Set<() => void>(),
  ] as const,
  readClip: vi.fn(),
  reload: vi.fn(),
  checkpoint: vi.fn(),
  recover: vi.fn(),
  start: vi.fn(),
}));
vi.mock("../state/engineStore", () => ({
  engineStore: {
    getState: () => ({ playback: fixture.playback }),
    subscribe: (
      fn: (
        next: { playback: typeof fixture.playback },
        previous: { playback: typeof fixture.playback },
      ) => void,
    ) => {
      fixture.listeners[0].add(fn);
      return () => fixture.listeners[0].delete(fn);
    },
  },
}));
vi.mock("../state/demoLoadStore", () => ({
  demoLoadStore: {
    getState: () => fixture.load,
    subscribe: (fn: () => void) => {
      fixture.listeners[1].add(fn);
      return () => fixture.listeners[1].delete(fn);
    },
  },
}));
vi.mock("../state/streamPlaybackStore", () => ({
  streamPlaybackStore: {
    getState: () => ({ playback: fixture.attached }),
    subscribe: (fn: () => void) => {
      fixture.listeners[2].add(fn);
      return () => fixture.listeners[2].delete(fn);
    },
  },
}));
vi.mock("../state/editableGame", () => ({
  publishedDemoFilename: (value: string) => value,
}));
vi.mock("./clipApi", async (original) => ({
  ...(await original<typeof import("./clipApi")>()),
  readClip: fixture.readClip,
}));
vi.mock("./clipCheckpointApi", () => ({
  readClipCheckpoint: fixture.checkpoint,
  recoverClipCheckpoint: fixture.recover,
}));
vi.mock("./demoFileLoader", () => ({
  loadDemoReference: fixture.reload,
  getDemoLoadGeneration: () => fixture.loadGeneration,
}));
vi.mock("./clipPlayback", () => ({ startClipPlayback: fixture.start }));
vi.mock("../account/authClient", () => ({
  appApiBaseUrl: "https://api.example.com",
}));

import { prepareClipPlayback } from "./clipPreparation";

const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
let clip: ClipView;
let previousPlayback: typeof fixture.playback;
function notify() {
  const previous = previousPlayback;
  previousPlayback = { ...fixture.playback };
  fixture.listeners[0].forEach((fn) =>
    fn({ playback: fixture.playback }, { playback: previous }),
  );
  fixture.listeners[1].forEach((fn) => fn());
  fixture.listeners[2].forEach((fn) => fn());
}
function install(buffer: ArrayBuffer = bytes) {
  const recording = {
    source: "demo",
    streamingPlayback: {},
  } as StreamRecording;
  fixture.playback = {
    recording,
    demoBuffer: buffer,
    downloadStatus: "complete",
    seekIntentNonce: fixture.playback.seekIntentNonce + 1,
  };
  fixture.attached = recording.streamingPlayback;
  notify();
  return recording;
}
beforeEach(() => {
  vi.clearAllMocks();
  fixture.reload.mockReset();
  fixture.readClip.mockReset();
  fixture.load = {
    sourceUrl: "test.rec",
    phase: "idle",
    error: null,
    requestedDemo: "test.rec",
    requestedUrl: null,
  };
  fixture.playback.seekIntentNonce = 0;
  fixture.loadGeneration = 0;
  install();
  clip = {
    id: "clip-one",
    sourceDemo: "test.rec",
    state: "ready",
    sourceBytes: bytes.byteLength,
    timeline: { sourceDemo: "test.rec" },
  } as ClipView;
  fixture.readClip.mockResolvedValue(clip);
  fixture.checkpoint.mockResolvedValue(null);
  fixture.reload.mockImplementation(async () => {
    install();
  });
});
afterEach(() => {
  fixture.listeners.forEach((listeners) => {
    expect(listeners.size).toBe(0);
    listeners.clear();
  });
});

it("uses a verified source without a reload and permits normal seeking without a checkpoint", async () => {
  const recording = fixture.playback.recording;
  expect(await prepareClipPlayback(clip, new AbortController().signal)).toBe(
    recording,
  );
  expect(fixture.reload).not.toHaveBeenCalled();
  expect(fixture.checkpoint).toHaveBeenCalledWith(
    clip,
    expect.any(AbortSignal),
  );
  expect(fixture.start.mock.calls[0][3]).toBeUndefined();
});

it("passes the saved source digest and checkpoint repair token to playback", async () => {
  clip.sourceSha256 = "a".repeat(64);
  fixture.checkpoint.mockResolvedValueOnce({
    text: "checkpoint",
    etag: '"saved"',
  });
  const signal = new AbortController().signal;
  await prepareClipPlayback(clip, signal);
  const checkpoint = fixture.start.mock.calls[0][3];
  expect(checkpoint).toMatchObject({
    text: "checkpoint",
    sourceSha256: clip.sourceSha256,
  });
  await checkpoint.recover();
  expect(fixture.recover).toHaveBeenCalledWith(clip, '"saved"', signal);
});

it("accepts a complete recording from an older relay that omits its size", async () => {
  const legacyClip = { ...clip, sourceBytes: undefined };
  expect(
    await prepareClipPlayback(legacyClip, new AbortController().signal),
  ).toBe(fixture.playback.recording);
  expect(fixture.reload).not.toHaveBeenCalled();
});

it("waits for complete bytes and scene attachment in either order", async () => {
  fixture.playback.downloadStatus = "downloading";
  fixture.attached = null;
  const task = prepareClipPlayback(clip, new AbortController().signal);
  fixture.playback.downloadStatus = "complete";
  notify();
  expect(fixture.checkpoint).not.toHaveBeenCalled();
  fixture.attached = fixture.playback.recording!.streamingPlayback;
  notify();
  await task;
  expect(fixture.reload).not.toHaveBeenCalled();
});

it.each(["idle", "error"])(
  "waits for navigation instead of rejecting an earlier %s request",
  async (phase) => {
    fixture.load.requestedDemo = "previous.rec";
    fixture.load.sourceUrl = "previous.rec";
    fixture.load.phase = phase;
    const task = prepareClipPlayback(clip, new AbortController().signal);
    await Promise.resolve();
    expect(fixture.reload).not.toHaveBeenCalled();
    expect(fixture.readClip).not.toHaveBeenCalled();
    fixture.load.requestedDemo = clip.sourceDemo;
    fixture.load.sourceUrl = clip.sourceDemo;
    fixture.load.phase = "idle";
    const recording = install();
    expect(await task).toBe(recording);
    expect(fixture.reload).not.toHaveBeenCalled();
  },
);

it("cancels a manual seek before the initial download finishes", async () => {
  fixture.playback.downloadStatus = "downloading";
  const task = prepareClipPlayback(clip, new AbortController().signal);
  fixture.playback.seekIntentNonce++;
  notify();
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(fixture.start).not.toHaveBeenCalled();
});

it.each(["downloading", "waiting for the scene"])(
  "preserves a manual seek while the replacement is %s",
  async (stage) => {
    fixture.playback.downloadStatus = "interrupted";
    let finishDownload!: () => void;
    fixture.reload.mockImplementationOnce(() => {
      install();
      fixture.playback.downloadStatus =
        stage === "downloading" ? "downloading" : "complete";
      fixture.attached = null;
      notify();
      return new Promise<void>((resolve) => {
        finishDownload = resolve;
      });
    });
    const task = prepareClipPlayback(clip, new AbortController().signal);
    await vi.waitFor(() => expect(fixture.reload).toHaveBeenCalledOnce());
    if (stage === "waiting for the scene") {
      finishDownload();
      await Promise.resolve();
    }
    fixture.playback.seekIntentNonce++;
    notify();
    const options = fixture.reload.mock.calls[0][1];
    expect(options.signal.aborted).toBe(true);
    finishDownload();
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.checkpoint).not.toHaveBeenCalled();
    expect(fixture.start).not.toHaveBeenCalled();
  },
);

it.each(["interrupted", "mismatch"])(
  "replaces %s source bytes once without changing the clip route",
  async (reason) => {
    const original = fixture.playback.recording;
    if (reason === "interrupted")
      fixture.playback.downloadStatus = "interrupted";
    else fixture.playback.demoBuffer = new ArrayBuffer(1);
    const signal = new AbortController().signal;
    const result = await prepareClipPlayback(clip, signal);
    expect(result).not.toBe(original);
    const preparingSignal = fixture.readClip.mock.calls[0][1] as AbortSignal;
    expect(fixture.readClip).toHaveBeenCalledExactlyOnceWith(
      clip.id,
      preparingSignal,
    );
    expect(fixture.reload).toHaveBeenCalledExactlyOnceWith("test.rec", {
      cache: "no-store",
      signal: preparingSignal,
      expectedRecording: original,
      expectedGeneration: 0,
    });
    expect(fixture.start.mock.calls[0][1]).toBe(result);
  },
);

it("recovers a failed initial download before any recording was installed", async () => {
  fixture.playback.recording = null;
  fixture.playback.demoBuffer = null;
  fixture.load.phase = "error";
  fixture.reload.mockImplementationOnce(async () => {
    fixture.load.phase = "idle";
    install();
  });
  await prepareClipPlayback(clip, new AbortController().signal);
  expect(fixture.reload).toHaveBeenCalledOnce();
});

it("stops after one fresh download still fails verification", async () => {
  fixture.playback.downloadStatus = "interrupted";
  fixture.reload.mockImplementationOnce(async () => {
    install(new ArrayBuffer(2));
  });
  await expect(
    prepareClipPlayback(clip, new AbortController().signal),
  ).rejects.toThrow("unexpected size");
  expect(fixture.reload).toHaveBeenCalledOnce();
  expect(fixture.checkpoint).not.toHaveBeenCalled();
  expect(fixture.start).not.toHaveBeenCalled();
});

it("reports a failed replacement instead of reusing the original bad buffer", async () => {
  fixture.playback.downloadStatus = "interrupted";
  fixture.reload.mockImplementationOnce(async () => {
    fixture.load.error = "Offline";
  });
  await expect(
    prepareClipPlayback(clip, new AbortController().signal),
  ).rejects.toThrow("Offline");
  expect(fixture.checkpoint).not.toHaveBeenCalled();
});

it("cancels source subscriptions while the download is still running", async () => {
  fixture.playback.downloadStatus = "downloading";
  const abort = new AbortController();
  const task = prepareClipPlayback(clip, abort.signal);
  abort.abort();
  await expect(task).rejects.toMatchObject({ name: "AbortError" });
  expect(fixture.reload).not.toHaveBeenCalled();
});

it.each(["recording", "seek", "abort", "download"])(
  "does not start recovery after %s changes during metadata refresh",
  async (change) => {
    const abort = new AbortController();
    fixture.playback.downloadStatus = "interrupted";
    fixture.readClip.mockImplementationOnce(async () => {
      if (change === "recording") install();
      else if (change === "seek") {
        fixture.playback.seekIntentNonce++;
        notify();
      } else if (change === "download") {
        fixture.loadGeneration++;
        fixture.load.requestedDemo = "other.rec";
      } else abort.abort();
      return clip;
    });
    await expect(prepareClipPlayback(clip, abort.signal)).rejects.toMatchObject(
      { name: "AbortError" },
    );
    expect(fixture.reload).not.toHaveBeenCalled();
  },
);

it("does not start playback when the recording changes during checkpoint fetching", async () => {
  fixture.checkpoint.mockImplementationOnce(async () => {
    install();
    return null;
  });
  await expect(
    prepareClipPlayback(clip, new AbortController().signal),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(fixture.start).not.toHaveBeenCalled();
});
