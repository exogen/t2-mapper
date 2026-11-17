import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AccountUser } from "../../relay/accountTypes";
import { appAccountStore } from "./appAccountStore";
import { demoLoadStore } from "./demoLoadStore";
import { engineStore } from "./engineStore";
import { DEMOS_BASE_URL } from "../stream/demoIndex";
import {
  canStartClipRecording,
  clipStore,
  installClipStateGuards,
  seekClipSource,
} from "./clipStore";
import { streamPlaybackStore } from "./streamPlaybackStore";
import { setStreamSnapshot } from "./streamSnapshotStore";
import type { StreamSnapshot, StreamingPlayback } from "../stream/types";
import type { ClipSample } from "../../relay/clipTypes";

vi.mock("../stream/demoIndex", () => ({
  DEMOS_BASE_URL: "https://demos.example/demos",
}));

let dispose: () => void;
const confirm = vi.fn(() => true);
const sample = (timeMs: number): ClipSample => ({
  timeMs,
  demoTimeSec: timeMs / 1000,
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  fov: 70,
  aspect: 1.5,
  projection: "perspective",
  cameraMode: "freeFly",
  targetId: null,
  flagSlot: null,
  rate: 1,
  playing: true,
});
beforeEach(() => {
  confirm.mockReset().mockReturnValue(true);
  vi.stubGlobal("confirm", confirm);
  clipStore.getState().discard();
  clipStore.getState().stopPlayback();
  const stream = {} as StreamingPlayback;
  engineStore.getState().setRecording({
    source: "demo",
    duration: 100,
    streamingPlayback: stream,
  } as never);
  streamPlaybackStore.setState({ playback: stream });
  setStreamSnapshot({} as StreamSnapshot);
  demoLoadStore.setState({
    sourceUrl: `${DEMOS_BASE_URL}/game.rec`,
    phase: "idle",
    requestedDemo: "game.rec",
    requestedUrl: null,
  });
  appAccountStore.setState({
    user: { discordId: "126767979894407168" } as AccountUser,
    pending: null,
  });
  dispose = installClipStateGuards();
});
afterEach(() => {
  dispose();
  clipStore.getState().discard();
  clipStore.getState().stopPlayback();
  engineStore.getState().setRecording(null);
  streamPlaybackStore.setState({ playback: null });
  appAccountStore.setState({ user: null });
  vi.unstubAllGlobals();
});

it.each(["unattached", "opening-frame", "collision-assets", "reconstruction"])(
  "does not begin capture before the demo is ready: %s",
  (reason) => {
    const stream = engineStore.getState().playback.recording!.streamingPlayback;
    if (reason === "unattached")
      streamPlaybackStore.setState({ playback: null });
    if (reason === "opening-frame") setStreamSnapshot(null);
    if (reason === "collision-assets")
      Object.assign(stream, { canStartSeek: false });
    if (reason === "reconstruction")
      Object.assign(stream, { needsReplay: true });
    expect(canStartClipRecording()).toBe(false);
    expect(clipStore.getState().start()).toBe(false);
    expect(clipStore.getState()).toMatchObject({
      recording: false,
      error: null,
    });
  },
);

it.each(["paused", "stopped"] as const)(
  "can record a ready demo while playback is %s",
  (status) => {
    engineStore.getState().setPlaybackStatus(status);
    expect(canStartClipRecording()).toBe(true);
    expect(clipStore.getState().start()).toBe(true);
  },
);

it.each([0, 10])(
  "keeps the active recording and transport when seeking to %s is canceled",
  (time) => {
    clipStore.getState().start();
    clipStore.getState().appendSample(sample(0));
    clipStore.getState().appendSample(sample(1000));
    const playback = engineStore.getState().playback;
    confirm.mockReturnValue(false);

    expect(engineStore.getState().seekPlayback(time)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("discard"));
    expect(engineStore.getState().playback).toBe(playback);
    expect(clipStore.getState().recording).toBe(true);
    clipStore.getState().appendSample(sample(2000));
    clipStore.getState().stop();
    expect(clipStore.getState().draft?.samples).toHaveLength(3);
  },
);

it("seeks and discards silently after confirmation", () => {
  clipStore.getState().start();
  clipStore.getState().appendSample(sample(0));
  clipStore.getState().appendSample(sample(1000));

  expect(engineStore.getState().seekPlayback(10)).toBe(true);
  expect(confirm).toHaveBeenCalledOnce();
  expect(engineStore.getState().playback.seekTime).toBe(10);
  expect(clipStore.getState()).toMatchObject({
    recording: false,
    draft: null,
    error: null,
  });
});

it("does not let clip initialization bypass confirmation for an active recording", () => {
  clipStore.getState().start();
  confirm.mockReturnValue(false);
  const before = engineStore.getState().playback;
  expect(seekClipSource(10)).toBe(false);
  expect(confirm).toHaveBeenCalledOnce();
  expect(clipStore.getState().recording).toBe(true);
  expect(engineStore.getState().playback).toBe(before);
});

it("only prompts for an active recording, and removes its guard on cleanup", () => {
  const completeSeek = () => {
    const { recording, seekNonce } = engineStore.getState().playback;
    engineStore
      .getState()
      .completePlaybackSeek(recording!, seekNonce, "paused");
  };
  expect(engineStore.getState().seekPlayback(1)).toBe(true);
  completeSeek();
  expect(clipStore.getState().start()).toBe(true);
  expect(engineStore.getState().seekPlayback(2, "reconstruction")).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
  completeSeek();
  clipStore.getState().start();
  dispose();
  confirm.mockReturnValue(false);
  expect(engineStore.getState().seekPlayback(3)).toBe(true);
  expect(confirm).not.toHaveBeenCalled();
});

it.each([
  "seek",
  "same-time-seek",
  "different-demo",
  "load-intent",
  "account-change",
])("discards active samples immediately on %s", (reason) => {
  expect(clipStore.getState().start()).toBe(true);
  clipStore.getState().appendSample(sample(0));
  clipStore.getState().appendSample(sample(1000));
  if (reason === "seek") engineStore.getState().seekPlayback(10);
  if (reason === "same-time-seek") engineStore.getState().seekPlayback(0);
  if (reason === "different-demo")
    engineStore
      .getState()
      .setRecording({ source: "demo", duration: 100 } as never);
  if (reason === "load-intent")
    demoLoadStore.setState({ requestedDemo: "next.rec" });
  if (reason === "account-change") appAccountStore.setState({ user: null });
  expect(clipStore.getState()).toMatchObject({ recording: false, draft: null });
  clipStore.getState().stop();
  expect(clipStore.getState().draft).toBeNull();
});

it("enters paused clip editing immediately and rejects raw demo seeks until discard", () => {
  clipStore.getState().start();
  clipStore.getState().appendSample(sample(0));
  clipStore.getState().appendSample(sample(1000));
  clipStore.getState().stop();
  const draft = clipStore.getState().draft!;
  expect(clipStore.getState()).toMatchObject({
    active: draft,
    trimStartMs: 0,
    trimEndMs: 1000,
    playheadMs: 1000,
    playing: false,
  });
  const before = engineStore.getState().playback;
  expect(engineStore.getState().seekPlayback(0)).toBe(false);
  expect(engineStore.getState().playback).toBe(before);
  expect(confirm).not.toHaveBeenCalled();
  expect(clipStore.getState().draft).toBe(draft);
  clipStore.getState().stopPlayback();
  expect(clipStore.getState().active).toBe(draft);
  expect(clipStore.getState().draft).toBe(draft);
  clipStore.getState().discard();
  expect(clipStore.getState().active).toBeNull();
  expect(engineStore.getState().seekPlayback(0)).toBe(true);
});

it("seeks and trims a draft without releasing the recorded camera, with the latest target winning", () => {
  clipStore.getState().start();
  clipStore.getState().appendSample(sample(0));
  clipStore.getState().appendSample(sample(1000));
  clipStore.getState().stop();
  const draft = clipStore.getState().draft!;
  clipStore.getState().setTrimRange(200, 800);
  expect(clipStore.getState()).toMatchObject({
    draft,
    active: draft,
    trimStartMs: 200,
    trimEndMs: 800,
    playheadMs: 800,
    playing: false,
  });
  expect(engineStore.getState().playback.seekTime).toBe(0.8);
  expect(clipStore.getState().seek(100)).toBe(true);
  expect(clipStore.getState().seek(700)).toBe(true);
  expect(clipStore.getState().seek(300)).toBe(true);
  expect(clipStore.getState().playheadMs).toBe(300);
  expect(engineStore.getState().playback.seekTime).toBeCloseTo(0.3);
  expect(clipStore.getState().active).toBe(draft);
  expect(confirm).not.toHaveBeenCalled();
});

it("restarts draft playback at its trimmed beginning and cannot replace the draft with another clip", () => {
  clipStore.getState().start();
  clipStore.getState().appendSample(sample(0));
  clipStore.getState().appendSample(sample(1000));
  clipStore.getState().stop();
  const draft = clipStore.getState().draft!;
  clipStore.getState().setTrimRange(100, 700);
  clipStore.getState().resume();
  expect(clipStore.getState()).toMatchObject({
    playheadMs: 100,
    playing: true,
  });
  expect(engineStore.getState().playback.seekTime).toBe(0.1);
  expect(() => clipStore.getState().play({ ...draft })).toThrow(
    /Save or discard/,
  );
  expect(clipStore.getState().active).toBe(draft);
});

it("previews either adjusted trim boundary even when the playhead is inside the range", () => {
  clipStore.getState().start();
  clipStore.getState().appendSample(sample(0));
  clipStore.getState().appendSample(sample(1000));
  clipStore.getState().stop();
  clipStore.getState().seek(500);
  clipStore.getState().setTrimRange(100, 1000);
  expect(clipStore.getState().playheadMs).toBe(100);
  clipStore.getState().seek(500);
  clipStore.getState().setTrimRange(100, 900);
  expect(clipStore.getState().playheadMs).toBe(900);
  expect(engineStore.getState().playback.seekTime).toBeCloseTo(0.9);
});

it("seeks and replays saved clips without losing their camera or playback intent", () => {
  clipStore.getState().start();
  clipStore.getState().appendSample(sample(0));
  clipStore.getState().appendSample(sample(1000));
  clipStore.getState().stop();
  const take = clipStore.getState().draft!;
  clipStore.getState().discard();
  clipStore.getState().play(take);
  const active = clipStore.getState().active;
  clipStore.getState().seek(500);
  expect(clipStore.getState()).toMatchObject({
    active,
    playheadMs: 500,
    playing: true,
  });
  expect(engineStore.getState().playback.seekTime).toBeCloseTo(0.5);
  clipStore.getState().pause();
  clipStore.getState().seek(2000);
  expect(clipStore.getState()).toMatchObject({
    active,
    playheadMs: 1000,
    playing: false,
  });
  clipStore.getState().resume();
  expect(clipStore.getState()).toMatchObject({
    active,
    playheadMs: 0,
    playing: true,
  });
  expect(engineStore.getState().playback.seekTime).toBe(0);
  expect(confirm).not.toHaveBeenCalled();
});

it("previews smoothing from the raw take without changing trim, playhead or transport", () => {
  clipStore.getState().start();
  for (let timeMs = 0; timeMs <= 1000; timeMs += 50) {
    clipStore.getState().appendSample({
      ...sample(timeMs),
      position: [timeMs % 100 === 0 ? -1 : 1, 0, 0],
    });
  }
  clipStore.getState().stop();
  clipStore.getState().setTrimRange(100, 900);
  clipStore.setState({ playing: true, playheadMs: 450 });
  const raw = clipStore.getState().draft!;
  const original = structuredClone(raw);
  clipStore.getState().setSmoothingLevel(2);
  const high = clipStore.getState().active!;
  expect(high).not.toBe(raw);
  expect(high.samples[10].position[0]).not.toBe(raw.samples[10].position[0]);
  expect(clipStore.getState()).toMatchObject({
    draft: raw,
    playing: true,
    playheadMs: 450,
    trimStartMs: 100,
    trimEndMs: 900,
    smoothingLevel: 2,
  });
  clipStore.getState().setSmoothingLevel(1);
  clipStore.getState().setSmoothingLevel(2);
  expect(clipStore.getState().active).toEqual(high);
  expect(raw).toEqual(original);
  clipStore.getState().setSmoothingLevel(0);
  expect(clipStore.getState().active).toBe(raw);
  clipStore.getState().discard();
  expect(clipStore.getState().smoothingLevel).toBe(0);
});

it("does not apply smoothing to saved clips or an active recording", () => {
  clipStore.getState().start();
  clipStore.getState().setSmoothingLevel(2);
  expect(clipStore.getState()).toMatchObject({
    active: null,
    smoothingLevel: 0,
  });
  clipStore.getState().discard();
  clipStore.getState().play({
    version: 1,
    sourceDemo: "game.rec",
    samples: [sample(0), sample(1000)],
  });
  const active = clipStore.getState().active;
  clipStore.getState().setSmoothingLevel(2);
  expect(clipStore.getState().active).toBe(active);
  expect(clipStore.getState().smoothingLevel).toBe(0);
});

it("discards a stopped draft when the recording object changes, even for the same hosted URL", () => {
  clipStore.getState().start();
  clipStore.getState().appendSample(sample(0));
  clipStore.getState().appendSample(sample(1000));
  clipStore.getState().stop();
  expect(clipStore.getState().draft).not.toBeNull();
  engineStore
    .getState()
    .setRecording({ source: "demo", duration: 100 } as never);
  expect(clipStore.getState().draft).toBeNull();
});

it("keeps clip playback through automatic reconstruction but exits on an explicit same-time seek", () => {
  clipStore.getState().play({
    version: 1,
    sourceDemo: "game.rec",
    samples: [sample(0), sample(1000)],
  });
  const active = clipStore.getState().active;
  engineStore.getState().seekPlayback(0.5, "reconstruction");
  expect(clipStore.getState().active).toBe(active);
  engineStore.getState().seekPlayback(0.5);
  expect(clipStore.getState().active).toBeNull();
});

it("discards an active recording before automatic reconstruction can move the source backwards", () => {
  clipStore.getState().start();
  clipStore.getState().appendSample(sample(0));
  clipStore.getState().appendSample(sample(1000));
  engineStore.getState().seekPlayback(0.5, "reconstruction");
  expect(clipStore.getState()).toMatchObject({ recording: false, draft: null });
});

it("rejects logged-out, local, and external-source recording", () => {
  appAccountStore.setState({ user: null });
  expect(clipStore.getState().start()).toBe(false);
  appAccountStore.setState({
    user: { discordId: "126767979894407168" } as AccountUser,
  });
  for (const sourceUrl of [
    null,
    "https://external.example/game.rec",
    `${DEMOS_BASE_URL}/sources/tribesforever/123.rec`,
  ]) {
    demoLoadStore.setState({ sourceUrl });
    expect(clipStore.getState().start()).toBe(false);
  }
});
