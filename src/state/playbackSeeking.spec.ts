import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { demoLoadStore } from "./demoLoadStore";
import { effectDeltaSec, engineStore, worldDeltaSec } from "./engineStore";
import { setStreamSnapshot, streamSnapshotStore } from "./streamSnapshotStore";
import type { StreamRecording, StreamSnapshot } from "../stream/types";

const state = () => engineStore.getState();
const recording = () => ({ source: "demo", duration: 3000 }) as StreamRecording;
let demo: StreamRecording;

beforeEach(() => {
  demo = recording();
  state().setRecording(demo);
  state().setPlaybackStatus("playing");
  setStreamSnapshot({ timeSec: 10 } as StreamSnapshot);
});
afterEach(() => {
  state().setRecording(null);
  state().setPlaybackStatus("stopped");
  setStreamSnapshot(null);
  demoLoadStore.getState().reset();
});

describe("seek transport state", () => {
  it("refreshes a growing duration without resetting the active transport", () => {
    let duration = 0;
    demo = {
      ...recording(),
      get duration() {
        return duration;
      },
    };
    state().setRecording(demo);
    state().setPlaybackStatus("playing");
    state().setPlaybackRate(2);
    const previous = state().playback;

    duration = 12.032;
    state().refreshRecordingDuration(demo);

    expect(state().playback).toEqual({ ...previous, durationMs: 12_032 });
    state().seekPlayback(10);
    expect(state().playback).toMatchObject({
      seekTime: 10,
      resumeAfterSeek: "playing",
      rate: 2,
    });
    const seeking = state().playback;
    duration = 20;
    state().refreshRecordingDuration(demo);
    expect(state().playback).toEqual({ ...seeking, durationMs: 20_000 });
  });

  it("rejects duration updates from an unloaded or replaced recording", () => {
    state().setRecording(null);
    const unloaded = state().playback;
    state().refreshRecordingDuration(demo);
    expect(state().playback).toBe(unloaded);

    state().setRecording(recording());
    const replacement = state().playback;
    demo.duration = 123;
    state().refreshRecordingDuration(demo);
    expect(state().playback).toBe(replacement);
  });

  it.each(["playing", "paused", "stopped"] as const)(
    "suspends %s playback until reconstruction completes",
    (status) => {
      state().setPlaybackStatus(status);
      state().seekPlayback(1490.37);
      const { seekNonce } = state().playback;
      expect(state().playback).toMatchObject({
        status: "seeking",
        resumeAfterSeek: status,
        seekTime: 1490.37,
      });
      expect(effectDeltaSec(1)).toBe(0);
      expect(worldDeltaSec(1)).toBe(0);
      expect(streamSnapshotStore.getState().snapshot?.timeSec).toBe(10);
      setStreamSnapshot({ timeSec: 1490.368 } as StreamSnapshot);
      state().completePlaybackSeek(demo, seekNonce);
      expect(state().playback.status).toBe(status);
      expect(state().playback.resumeAfterSeek).toBeNull();
    },
  );

  it("keeps the newest target pending when an older seek completes", () => {
    state().seekPlayback(1000);
    const oldNonce = state().playback.seekNonce;
    state().updateSeekProgress(demo, oldNonce, {
      startTimeSec: 0,
      currentTimeSec: 100,
      targetTimeSec: 1000,
    });
    expect(state().playback.seekProgress?.currentTimeSec).toBe(100);
    state().seekPlayback(1500);
    state().updateSeekProgress(demo, oldNonce, {
      startTimeSec: 0,
      currentTimeSec: 200,
      targetTimeSec: 1000,
    });
    expect(state().playback.seekProgress).toBeNull();
    state().completePlaybackSeek(demo, oldNonce);
    expect(state().playback).toMatchObject({
      status: "seeking",
      seekTime: 1500,
    });
    state().completePlaybackSeek(demo, state().playback.seekNonce);
    expect(state().playback.status).toBe("playing");
    expect(state().playback.seekProgress).toBeNull();
  });

  it("remembers play/pause changes during a seek without starting playback early", () => {
    state().seekPlayback(1500);
    state().setPlaybackStatus("paused");
    expect(state().playback.status).toBe("seeking");
    state().completePlaybackSeek(demo, state().playback.seekNonce);
    expect(state().playback.status).toBe("paused");
    state().seekPlayback(500);
    state().setPlaybackStatus("playing");
    expect(effectDeltaSec(1)).toBe(0);
    state().completePlaybackSeek(demo, state().playback.seekNonce);
    expect(state().playback.status).toBe("playing");
  });

  it("toggles atomically before a render and preserves the latest intent through replacement seeks", () => {
    state().togglePlayback(demo);
    state().togglePlayback(demo);
    expect(state().playback.status).toBe("playing");
    state().seekPlayback(1000);
    state().togglePlayback(demo);
    state().togglePlayback(demo);
    state().seekPlayback(200);
    state().togglePlayback(demo);
    expect(state().playback).toMatchObject({
      status: "seeking",
      resumeAfterSeek: "paused",
    });
    expect(effectDeltaSec(1)).toBe(0);
    state().completePlaybackSeek(demo, state().playback.seekNonce);
    expect(state().playback.status).toBe("paused");
  });

  it("rejects old controls and completion even after reinstalling the same recording", () => {
    state().seekPlayback(100);
    const nonce = state().playback.seekNonce;
    state().setRecording(recording());
    state().togglePlayback(demo);
    expect(state().playback.status).toBe("stopped");
    state().setRecording(demo);
    state().seekPlayback(200);
    state().completePlaybackSeek(demo, nonce);
    expect(state().playback.status).toBe("seeking");
  });

  it("stays suspended through downloading and reconstruction", () => {
    state().setDownloadComplete(false);
    demoLoadStore.setState({ downloadedSec: 50 });
    state().seekPlayback(1000);
    const { seekNonce } = state().playback;
    state().completePlaybackSeek(demo, seekNonce);
    state().fulfillPendingSeek();
    expect(state().playback).toMatchObject({
      status: "seeking",
      seekTime: 1000,
      pendingSeekSec: 1000,
    });
    demoLoadStore.setState({ downloadedSec: 1001 });
    state().fulfillPendingSeek();
    expect(state().playback).toMatchObject({
      status: "seeking",
      pendingSeekSec: null,
      seekNonce,
    });
    state().completePlaybackSeek(demo, seekNonce);
    expect(state().playback.status).toBe("playing");
  });

  it("retains a timestamp beyond the growing duration until its data arrives", () => {
    demo.duration = 2;
    state().refreshRecordingDuration(demo);
    state().setDownloadComplete(false);
    demoLoadStore.setState({ downloadedSec: 2 });
    state().seekPlayback(500);
    const { seekNonce } = state().playback;
    expect(state().playback).toMatchObject({
      status: "seeking",
      seekTime: 500,
      pendingSeekSec: 500,
    });
    demo.duration = 600;
    state().refreshRecordingDuration(demo);
    demoLoadStore.setState({ downloadedSec: 600 });
    state().fulfillPendingSeek();
    expect(state().playback).toMatchObject({
      status: "seeking",
      seekTime: 500,
      pendingSeekSec: null,
      seekNonce,
    });
  });

  it("clamps a pending timestamp when a short recording finishes downloading", () => {
    demo.duration = 2;
    state().refreshRecordingDuration(demo);
    state().setDownloadComplete(false);
    demoLoadStore.setState({ downloadedSec: 2 });
    state().seekPlayback(500);
    demo.duration = 200.032;
    state().refreshRecordingDuration(demo);
    state().setDownloadComplete(true);
    state().fulfillPendingSeek();
    expect(state().playback).toMatchObject({
      status: "seeking",
      seekTime: 200.032,
      pendingSeekSec: null,
    });
  });

  it("replaces a downloading target with an available target", () => {
    state().setDownloadComplete(false);
    demoLoadStore.setState({ downloadedSec: 50 });
    state().seekPlayback(1000);
    state().seekPlayback(20);
    expect(state().playback).toMatchObject({
      status: "seeking",
      pendingSeekSec: null,
      seekTime: 20,
    });
    state().fulfillPendingSeek();
    state().completePlaybackSeek(demo, state().playback.seekNonce);
    expect(state().playback.status).toBe("playing");
  });

  it("discards pending state on unload and rejects completion from another recording", () => {
    state().seekPlayback(1000);
    const nonce = state().playback.seekNonce;
    state().setRecording(null);
    expect(state().playback).toMatchObject({
      status: "paused",
      resumeAfterSeek: null,
    });
    state().setRecording(recording());
    state().seekPlayback(100);
    state().completePlaybackSeek(demo, state().playback.seekNonce);
    state().completePlaybackSeek(demo, nonce);
    expect(state().playback.status).toBe("seeking");
  });

  it("remains paused on a failed seek or at EOF", () => {
    state().seekPlayback(3000);
    state().completePlaybackSeek(demo, state().playback.seekNonce, "paused");
    expect(state().playback).toMatchObject({
      status: "paused",
      resumeAfterSeek: null,
    });
  });
});
