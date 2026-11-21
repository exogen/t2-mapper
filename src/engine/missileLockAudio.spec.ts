import { afterEach, expect, it, vi } from "vitest";
import type { AudioLoader } from "three";
import { engineStore } from "../state/engineStore";
import { settingsStore } from "../state/settingsStore";
import { streamClock } from "../state/streamPlaybackStore";
import type { StreamRecording } from "../stream/types";
import { audioBufferCache } from "./audioBuffers";
import { installFakeAudioContext } from "./audioTestFixtures";
import { FramePriority } from "./framePriority";
import { FrameScheduler, type FrameContext } from "./frameScheduler";
import type { GameEngine } from "./gameEngine";
import { installMissileLockAudio } from "./missileLockAudio";
import { sampleMissileLockView } from "./missileLockView";
import { PlaybackAudioListener } from "./PlaybackAudioListener";

vi.mock("../loaders", () => ({ audioToUrl: (path: string) => path }));
vi.mock("./missileLockView", () => ({ sampleMissileLockView: vi.fn() }));

const sampleView = vi.mocked(sampleMissileLockView);
const idle = { subjectId: "shooter", incomingLock: false, inbound: false };
const disposals: (() => void)[] = [];

afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  engineStore.getState().setRecording(null);
  settingsStore.setState({ audioEnabled: true });
  streamClock.matchEndedAtSec = null;
  audioBufferCache.clear();
  sampleView.mockReset();
  vi.restoreAllMocks();
});

function startAudio({ deferred = false } = {}) {
  const { context, sources, panners } = installFakeAudioContext();
  Object.assign(context, { state: "running" });
  const audioListener = new PlaybackAudioListener();
  const files = new Map<AudioBuffer, string>();
  const pending: (() => void)[] = [];
  const load = vi.fn((path: string, onLoad: (buffer: AudioBuffer) => void) => {
    const buffer = { duration: 1 } as AudioBuffer;
    files.set(buffer, path.split("/").at(-1)!);
    if (deferred) pending.push(() => onLoad(buffer));
    else onLoad(buffer);
  });
  const scheduler = new FrameScheduler();
  const frame = () =>
    scheduler.run(FramePriority.PostCamera, {} as FrameContext);
  engineStore
    .getState()
    .setRecording({ source: "demo", duration: 60 } as StreamRecording);
  engineStore.getState().setPlaybackStatus("playing");
  settingsStore.setState({ audioEnabled: true });
  disposals.push(
    installMissileLockAudio({ scheduler } as GameEngine, {
      audioListener,
      audioLoader: { load } as unknown as AudioLoader,
    }),
  );
  const started = () =>
    sources.map((source) => {
      const audio = source as unknown as AudioBufferSourceNode;
      expect(audio.loop).toBe(true);
      return files.get(audio.buffer!);
    });
  return { frame, sources, panners, started, pending };
}

it.each(["tracking", "targeting"] as const)(
  "plays a nonpositional search loop for %s, then a confirmed lock loop",
  (kind) => {
    const { frame, started, sources, panners } = startAudio();
    sampleView.mockReturnValue({ ...idle, outgoing: { kind } });
    frame();
    frame();
    expect(started()).toEqual(["missile_firer_search.wav"]);
    sampleView.mockReturnValue({ ...idle, outgoing: { kind: "locked" } });
    frame();
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(started()).toEqual([
      "missile_firer_search.wav",
      "missile_firer_lock.wav",
    ]);
    expect(panners).toHaveLength(0);
    sampleView.mockReturnValue(undefined);
    frame();
    expect(sources[1].stop).toHaveBeenCalledOnce();
  },
);

it("keeps an existing lock warning through homing and suppresses a fresh warning during homing", () => {
  const { frame, started, sources } = startAudio();
  sampleView.mockReturnValue({ ...idle, incomingLock: true, inbound: true });
  frame();
  expect(started()).toEqual(["missile_target_inbound.wav"]);
  sampleView.mockReturnValue({ ...idle, incomingLock: true });
  frame();
  expect(started()).toEqual([
    "missile_target_inbound.wav",
    "missile_target_lock.wav",
  ]);
  sampleView.mockReturnValue({ ...idle, incomingLock: true, inbound: true });
  frame();
  expect(sources[1].stop).not.toHaveBeenCalled();
  expect(started().at(-1)).toBe("missile_target_inbound.wav");
  sampleView.mockReturnValue({
    ...idle,
    subjectId: "new-body",
    incomingLock: true,
    inbound: true,
  });
  frame();
  expect(sources[1].stop).toHaveBeenCalledOnce();
  expect(started()).toHaveLength(3);
});

it("silences loops when playback pauses, seeks, or audio is disabled", () => {
  const { frame, sources } = startAudio();
  sampleView.mockReturnValue({ ...idle, outgoing: { kind: "locked" } });
  frame();
  engineStore.getState().setPlaybackStatus("paused");
  expect(sources[0].stop).toHaveBeenCalledOnce();
  frame();
  expect(sources).toHaveLength(1);
  engineStore.getState().setPlaybackStatus("playing");
  frame();
  expect(engineStore.getState().seekPlayback(20)).toBe(true);
  expect(sources[1].stop).toHaveBeenCalledOnce();
  frame();
  expect(sources).toHaveLength(2);
  const { recording, seekNonce } = engineStore.getState().playback;
  engineStore.getState().completePlaybackSeek(recording!, seekNonce, "playing");
  frame();
  settingsStore.setState({ audioEnabled: false });
  expect(sources[2].stop).toHaveBeenCalledOnce();
  frame();
  expect(sources).toHaveLength(3);
});

it("never starts an expired tone after its audio asset loads", () => {
  const { frame, pending, sources } = startAudio({ deferred: true });
  sampleView.mockReturnValue({ ...idle, outgoing: { kind: "tracking" } });
  frame();
  expect(pending).toHaveLength(4);
  sampleView.mockReturnValue(idle);
  for (const complete of pending) complete();
  frame();
  expect(sources).toHaveLength(0);
});

it("suppresses a warning that could not play before a missile went inbound", () => {
  const { frame, pending, started } = startAudio({ deferred: true });
  sampleView.mockReturnValue({ ...idle, incomingLock: true });
  frame();
  expect(started()).toEqual([]);

  sampleView.mockReturnValue({ ...idle, incomingLock: true, inbound: true });
  for (const complete of pending) complete();
  frame();
  expect(started()).toEqual(["missile_target_inbound.wav"]);
});

it("does not latch an unplayed warning when a paused view resumes", () => {
  const { frame, started } = startAudio();
  engineStore.getState().setPlaybackStatus("paused");
  sampleView.mockReturnValue({ ...idle, incomingLock: true });
  frame();
  expect(started()).toEqual([]);

  sampleView.mockReturnValue({ ...idle, incomingLock: true, inbound: true });
  engineStore.getState().setPlaybackStatus("playing");
  frame();
  expect(started()).toEqual(["missile_target_inbound.wav"]);
});

it("resumes a warning that was already playing before a pause", () => {
  const { frame, started } = startAudio();
  sampleView.mockReturnValue({ ...idle, incomingLock: true });
  frame();
  expect(started()).toEqual(["missile_target_lock.wav"]);

  sampleView.mockReturnValue({ ...idle, incomingLock: true, inbound: true });
  frame();
  expect(started().at(-1)).toBe("missile_target_inbound.wav");
  engineStore.getState().setPlaybackStatus("paused");
  frame();
  engineStore.getState().setPlaybackStatus("playing");
  frame();
  expect(started().slice(-2)).toEqual([
    "missile_target_lock.wav",
    "missile_target_inbound.wav",
  ]);
});
