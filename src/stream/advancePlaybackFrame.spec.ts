import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engineStore } from "../state/engineStore";
import { demoLoadStore } from "../state/demoLoadStore";
import {
  setStreamSnapshot,
  streamSnapshotStore,
} from "../state/streamSnapshotStore";
import { advancePlaybackFrame } from "./advancePlaybackFrame";
import { PlaybackClock } from "./PlaybackClock";
import type { StreamRecording, StreamSnapshot } from "./types";

const state = () => engineStore.getState();
const snapshot = (timeSec: number, exhausted = false) =>
  ({ timeSec, exhausted }) as StreamSnapshot;
let demo: StreamRecording;
let clock: PlaybackClock;
let step: ReturnType<typeof vi.fn>;
let streamComplete: boolean;
const frame = (
  publish = (frame: NonNullable<ReturnType<PlaybackClock["step"]>>) =>
    setStreamSnapshot(frame.snapshot),
) => advancePlaybackFrame(demo, clock, 1 / 60, publish);

beforeEach(() => {
  step = vi.fn((time: number) =>
    snapshot(Math.floor((time * 1000) / 32) * 0.032),
  );
  streamComplete = true;
  demo = {
    source: "demo",
    duration: 100,
    streamingPlayback: {
      stepToTime: step,
      get streamComplete() {
        return streamComplete;
      },
    },
  } as unknown as StreamRecording;
  state().setRecording(demo);
  state().setPlaybackStatus("playing");
  clock = new PlaybackClock();
  clock.reset(0, state().playback.seekNonce);
  setStreamSnapshot(snapshot(0));
});
afterEach(() => {
  state().setRecording(null);
  setStreamSnapshot(null);
  demoLoadStore.getState().reset();
});

describe("frame publication and transport", () => {
  it("keeps partial reconstruction private and resumes only after publishing the destination", () => {
    state().seekPlayback(10);
    step.mockReturnValueOnce(snapshot(1));
    frame();
    expect(state().playback.status).toBe("seeking");
    expect(state().playback.seekProgress?.currentTimeSec).toBe(1);
    expect(streamSnapshotStore.getState().snapshot?.timeSec).toBe(0);
    const publish = vi.fn(
      (result: NonNullable<ReturnType<PlaybackClock["step"]>>) => {
        expect(state().playback.status).toBe("seeking");
        setStreamSnapshot(result.snapshot);
        state().togglePlayback(demo);
      },
    );
    frame(publish);
    expect(publish).toHaveBeenCalledOnce();
    expect(state().playback.status).toBe("paused");
    expect(streamSnapshotStore.getState().snapshot?.timeSec).toBeCloseTo(
      10.016,
    );
  });

  it("does no work while waiting for bytes or after unload", () => {
    state().setDownloadComplete(false);
    demoLoadStore.setState({ downloadedSec: 2 });
    state().seekPlayback(10);
    frame();
    expect(step).not.toHaveBeenCalled();
    state().setRecording(null);
    frame();
    expect(step).not.toHaveBeenCalled();
    expect(streamSnapshotStore.getState().snapshot?.timeSec).toBe(0);
  });

  it.each(["unload", "replace", "seek"])(
    "rejects a frame invalidated by a parser callback (%s)",
    (action) => {
      state().seekPlayback(10);
      step.mockImplementationOnce(() => {
        if (action === "seek") state().seekPlayback(20);
        else state().setRecording(action === "unload" ? null : { ...demo });
        return snapshot(10);
      });
      const publish = vi.fn();
      frame(publish);
      expect(publish).not.toHaveBeenCalled();
      if (action === "seek") {
        expect(state().playback).toMatchObject({
          status: "seeking",
          seekTime: 20,
        });
        frame();
        expect(clock.time).toBe(20);
      }
    },
  );

  it("does not complete a replacement seek started by a snapshot subscriber", () => {
    state().seekPlayback(10);
    const unsubscribe = streamSnapshotStore.subscribe(() =>
      state().seekPlayback(20),
    );
    try {
      frame();
    } finally {
      unsubscribe();
    }
    expect(state().playback).toMatchObject({ status: "seeking", seekTime: 20 });
    frame();
    expect(clock.time).toBe(20);
    expect(state().playback.status).toBe("playing");
  });

  it.each(["step", "publish"])(
    "clears loading and pauses if %s fails, then accepts another seek",
    (phase) => {
      state().seekPlayback(10);
      const fail = () => {
        throw new Error("broken frame");
      };
      if (phase === "step") step.mockImplementationOnce(fail);
      expect(() => (phase === "step" ? frame() : frame(fail))).toThrow(
        "broken frame",
      );
      expect(state().playback).toMatchObject({
        status: "paused",
        resumeAfterSeek: null,
        seekProgress: null,
      });
      step.mockClear();
      const publish = vi.fn();
      frame(publish);
      frame(publish);
      expect(step).not.toHaveBeenCalled();
      expect(publish).not.toHaveBeenCalled();
      state().seekPlayback(20);
      frame();
      expect(clock.time).toBe(20);
      expect(state().playback.status).toBe("paused");
    },
  );

  it.each([0.5, 1.024])(
    "waits at a download frontier of %s until both endpoints arrive",
    (frontier) => {
      streamComplete = false;
      state().seekPlayback(1.025);
      step.mockImplementation(() => snapshot(frontier, true));
      frame();
      frame();
      expect(state().playback.status).toBe("seeking");
      expect(clock.time).toBe(0);
      expect(streamSnapshotStore.getState().snapshot?.timeSec).toBe(0);
      step.mockImplementation((time: number) =>
        snapshot(Math.floor((time * 1000) / 32) * 0.032),
      );
      frame();
      expect(clock.time).toBe(1.025);
      expect(state().playback.status).toBe("playing");
    },
  );

  it("retries a failed destination in slices when Play is pressed", () => {
    state().seekPlayback(10);
    step.mockImplementationOnce(() => {
      throw new Error("broken frame");
    });
    expect(() => frame()).toThrow("broken frame");
    state().togglePlayback(demo);
    step.mockReturnValueOnce(snapshot(1));
    frame();
    expect(state().playback).toMatchObject({
      status: "seeking",
      seekTime: 10,
      resumeAfterSeek: "playing",
    });
    expect(step.mock.lastCall?.[2]).toBe(12);
    frame();
    expect(clock.time).toBe(10);
    expect(clock.failedSeek).toBeNull();
    expect(state().playback.status).toBe("playing");
  });

  it("retries a playback error at the displayed time rather than an old seek target", () => {
    clock.reset(20, state().playback.seekNonce, snapshot(20));
    step.mockImplementationOnce(() => {
      throw new Error("broken tick");
    });
    expect(() => frame()).toThrow("broken tick");
    frame();
    expect(step).toHaveBeenCalledOnce();
    state().togglePlayback(demo);
    frame();
    expect(clock.time).toBe(20);
    expect(state().playback.status).toBe("playing");
  });

  it("finishes a buffering seek at the shorter EOF after a download fails", () => {
    streamComplete = false;
    state().seekPlayback(10);
    step.mockReturnValue(snapshot(2, true));
    frame();
    expect(state().playback.status).toBe("seeking");
    streamComplete = true;
    frame();
    expect(clock.time).toBe(2);
    expect(state().playback.status).toBe("paused");
  });
});
