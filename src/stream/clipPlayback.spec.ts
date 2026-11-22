import { beforeEach, expect, it, vi } from "vitest";
import type { ClipTake } from "../../relay/clipTypes";
import type { StreamRecording } from "./types";
import { RETAIL_PLAYER_INTERPOLATION } from "./playerInterpolation";

const fixture = vi.hoisted(() => ({
  state: {} as {
    playback: {
      recording: unknown;
      status: string;
      seekNonce: number;
      seekIntentNonce: number;
      seekFailed: boolean;
      downloadComplete: boolean;
      demoBuffer: ArrayBuffer | null;
    };
  },
  listeners: new Set<() => void>(),
  clipListeners: new Set<(state: { active: ClipTake | null }) => void>(),
  events: [] as string[],
  source: "test.rec",
  read: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
  draft: null as ClipTake | null,
  active: null as ClipTake | null,
  seek: vi.fn(),
  exitDirector: vi.fn(),
}));
vi.mock("../state/demoDirectorStore", () => ({
  exitDirector: fixture.exitDirector,
}));
vi.mock("./demoCheckpoints", () => ({ readDemoCheckpoints: fixture.read }));
vi.mock("../state/clipStore", () => ({
  clipStore: {
    getState: () => ({
      play: fixture.play,
      stopPlayback: fixture.stop,
      draft: fixture.draft,
      active: fixture.active,
    }),
    subscribe(listener: (state: { active: ClipTake | null }) => void) {
      fixture.clipListeners.add(listener);
      return () => fixture.clipListeners.delete(listener);
    },
  },
  seekClipSource: (...args: unknown[]) => fixture.seek(...args),
}));
vi.mock("../state/demoLoadStore", () => ({
  demoLoadStore: { getState: () => ({ sourceUrl: fixture.source }) },
}));
vi.mock("../state/editableGame", () => ({
  publishedDemoFilename: (value: string) => value,
}));
vi.mock("../state/engineStore", () => ({
  engineStore: {
    getState: () => ({
      ...fixture.state,
      setPlaybackStatus: (status: string) => {
        fixture.state.playback.status = status;
      },
      seekPlayback: fixture.seek,
    }),
    subscribe: (listener: () => void) => {
      fixture.listeners.add(listener);
      return () => fixture.listeners.delete(listener);
    },
  },
}));

import { startClipPlayback } from "./clipPlayback";

const take = {
  sourceDemo: "test.rec",
  samples: [{ demoTimeSec: 100 }],
} as ClipTake;
const checkpoint = { cursor: { moveTicks: 3125 } };
let recording: StreamRecording;
let imported: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  fixture.listeners.clear();
  fixture.clipListeners.clear();
  fixture.events = [];
  fixture.source = "test.rec";
  fixture.draft = null;
  fixture.active = null;
  imported = vi.fn(() => fixture.events.push("import"));
  recording = {
    source: "demo",
    streamingPlayback: { importCheckpoints: imported },
  } as unknown as StreamRecording;
  fixture.state = {
    playback: {
      recording,
      status: "paused",
      seekNonce: 1,
      seekIntentNonce: 1,
      seekFailed: false,
      downloadComplete: true,
      demoBuffer: new ArrayBuffer(4),
    },
  };
  fixture.read.mockResolvedValue([checkpoint]);
  fixture.seek.mockImplementation(() => {
    fixture.events.push("seek");
    fixture.state.playback.status = "seeking";
    fixture.state.playback.seekNonce++;
    fixture.state.playback.seekIntentNonce++;
    fixture.state.playback.seekFailed = false;
    return true;
  });
  fixture.play.mockImplementation((active: ClipTake) => {
    fixture.events.push("play");
    fixture.active = active;
  });
});

function settle() {
  fixture.state.playback.status = "paused";
  [...fixture.listeners].forEach((listener) => listener());
}

it("imports the clip checkpoint before seeking and waits for the target scene before starting the camera track", async () => {
  const hold = vi.fn(() => () => {});
  recording.streamingPlayback.holdPlayerInterpolation = hold;
  const task = startClipPlayback(
    take,
    recording,
    new AbortController().signal,
    "checkpoint",
  );
  await vi.waitFor(() => expect(fixture.seek).toHaveBeenCalledWith(100));
  expect(hold).toHaveBeenCalledWith(RETAIL_PLAYER_INTERPOLATION);
  expect(imported).toHaveBeenCalledWith([checkpoint], undefined);
  expect(fixture.exitDirector).toHaveBeenCalledOnce();
  expect(fixture.events).toEqual(["import", "seek"]);
  expect(fixture.play).not.toHaveBeenCalled();
  settle();
  await task;
  expect(fixture.events).toEqual(["import", "seek", "play"]);
  expect(fixture.listeners.size).toBe(0);
});

it("seeks the verified demo normally when the engine rejects the clip checkpoint", async () => {
  imported.mockImplementation(() => {
    throw new Error("Invalid seek checkpoint");
  });
  const recover = vi.fn().mockResolvedValue(undefined);
  const task = startClipPlayback(
    take,
    recording,
    new AbortController().signal,
    "checkpoint",
    recover,
  );
  await vi.waitFor(() => expect(fixture.seek).toHaveBeenCalledWith(100));
  expect(fixture.play).not.toHaveBeenCalled();
  settle();
  await task;
  expect(fixture.play).toHaveBeenCalledWith(take);
  expect(recover).toHaveBeenCalledOnce();
});

it("holds the creator's interpolation through checkpoint restore and playback", async () => {
  const settings = {
    maxLatencyTicks: 0,
    maxPredictionTicks: 25,
    maxWarpTicks: 2,
    minWarpTicks: 1,
  };
  const release = vi.fn();
  recording.streamingPlayback.holdPlayerInterpolation = (value) => {
    expect(value).toEqual(settings);
    fixture.events.push("creator");
    return release;
  };
  const task = startClipPlayback(
    { ...take, playerInterpolation: settings },
    recording,
    new AbortController().signal,
    "checkpoint",
  );
  await vi.waitFor(() => expect(fixture.seek).toHaveBeenCalledWith(100));
  expect(imported).toHaveBeenCalledWith([checkpoint], undefined);
  expect(fixture.events).toEqual(["creator", "import", "seek"]);
  settle();
  await task;
  expect(release).not.toHaveBeenCalled();
  for (const listener of fixture.clipListeners) listener({ active: null });
  expect(release).toHaveBeenCalledOnce();
  expect(fixture.clipListeners.size).toBe(0);
});

it("does not seek or start a replaced demo after asynchronous checkpoint validation", async () => {
  let finish!: (value: unknown[]) => void;
  fixture.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const task = startClipPlayback(
    take,
    recording,
    new AbortController().signal,
    "checkpoint",
  );
  expect(fixture.exitDirector).toHaveBeenCalledOnce();
  fixture.state.playback.recording = { source: "demo" };
  finish([checkpoint]);
  await expect(task).rejects.toThrow(/demo changed/);
  expect(imported).not.toHaveBeenCalled();
  expect(fixture.seek).not.toHaveBeenCalled();
  expect(fixture.play).not.toHaveBeenCalled();
});

it("cancels a pending start if another seek wins", async () => {
  const task = startClipPlayback(take, recording, new AbortController().signal);
  fixture.state.playback.seekNonce++;
  fixture.state.playback.seekIntentNonce++;
  settle();
  await expect(task).rejects.toThrow(/interrupted/);
  expect(fixture.play).not.toHaveBeenCalled();
  expect(fixture.listeners.size).toBe(0);
});

it("does not overwrite a manual seek made while the checkpoint is being validated", async () => {
  let finish!: (value: unknown[]) => void;
  fixture.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const task = startClipPlayback(
    take,
    recording,
    new AbortController().signal,
    "checkpoint",
  );
  fixture.state.playback.seekNonce++;
  fixture.state.playback.seekIntentNonce++;
  finish([checkpoint]);
  await expect(task).rejects.toThrow(/interrupted/);
  expect(imported).not.toHaveBeenCalled();
  expect(fixture.seek).not.toHaveBeenCalled();
  expect(fixture.play).not.toHaveBeenCalled();
});

it("tolerates cold asset reconstruction during checkpoint validation and the starting seek", async () => {
  let finish!: (value: unknown[]) => void;
  fixture.read.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const task = startClipPlayback(
    take,
    recording,
    new AbortController().signal,
    "checkpoint",
  );
  fixture.state.playback.seekNonce++;
  finish([checkpoint]);
  await vi.waitFor(() => expect(fixture.seek).toHaveBeenCalledWith(100));
  fixture.state.playback.seekNonce++;
  settle();
  await task;
  expect(fixture.play).toHaveBeenCalledOnce();
  expect(fixture.listeners.size).toBe(0);
});

it("lets a newer start replace an earlier request still validating its checkpoint", async () => {
  let finish!: (value: unknown[]) => void;
  fixture.read.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const previous = startClipPlayback(
    take,
    recording,
    new AbortController().signal,
    "checkpoint",
  );
  const latest = startClipPlayback(
    take,
    recording,
    new AbortController().signal,
  );
  settle();
  await latest;
  finish([checkpoint]);
  await expect(previous).rejects.toThrow(/interrupted/);
  expect(fixture.play).toHaveBeenCalledOnce();
  expect(imported).not.toHaveBeenCalled();
});

it("removes pending seek listeners on cancellation", async () => {
  const release = vi.fn();
  recording.streamingPlayback.holdPlayerInterpolation = () => release;
  const abort = new AbortController();
  const task = startClipPlayback(take, recording, abort.signal);
  abort.abort(new Error("Canceled"));
  await expect(task).rejects.toThrow("Canceled");
  expect(fixture.play).not.toHaveBeenCalled();
  expect(fixture.listeners.size).toBe(0);
  expect(release).toHaveBeenCalledOnce();
});

it("does not start its camera track when the starting seek is canceled", async () => {
  fixture.seek.mockReturnValue(false);
  await expect(
    startClipPlayback(take, recording, new AbortController().signal),
  ).rejects.toThrow(/canceled/);
  expect(fixture.play).not.toHaveBeenCalled();
  expect(fixture.listeners.size).toBe(0);
});

it("rejects a failed starting seek and releases the interpolation hold", async () => {
  const release = vi.fn();
  recording.streamingPlayback.holdPlayerInterpolation = () => release;
  const task = startClipPlayback(take, recording, new AbortController().signal);
  fixture.state.playback.seekFailed = true;
  settle();
  await expect(task).rejects.toThrow(/restore the clip's starting view/);
  expect(fixture.play).not.toHaveBeenCalled();
  expect(fixture.listeners.size).toBe(0);
  expect(release).toHaveBeenCalledOnce();
});

it("waits for complete source bytes and rejects previews from a different source", async () => {
  fixture.state.playback.downloadComplete = false;
  await expect(
    startClipPlayback(
      take,
      recording,
      new AbortController().signal,
      "checkpoint",
    ),
  ).rejects.toThrow(/finish downloading/);
  fixture.state.playback.downloadComplete = true;
  fixture.source = "other.rec";
  await expect(
    startClipPlayback(take, recording, new AbortController().signal),
  ).rejects.toThrow(/different hosted demo/);
  expect(fixture.seek).not.toHaveBeenCalled();
});

it("does not replace a draft that is still being edited", async () => {
  fixture.draft = take;
  await expect(
    startClipPlayback(take, recording, new AbortController().signal),
  ).rejects.toThrow(/Save or discard/);
  expect(fixture.seek).not.toHaveBeenCalled();
  expect(fixture.exitDirector).not.toHaveBeenCalled();
  expect(fixture.stop).not.toHaveBeenCalled();
});
