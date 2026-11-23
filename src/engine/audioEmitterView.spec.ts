import { AudioLoader, Scene, type WebGLRenderer } from "three";
import { expect, it, onTestFinished, vi } from "vitest";
import { audioToUrl } from "../loaders";
import type { AudioEmitterEntity } from "../state/gameEntityTypes";
import { settingsStore } from "../state/settingsStore";
import { PlaybackAudioListener } from "./PlaybackAudioListener";
import * as audioBuffers from "./audioBuffers";
import { createAudioEmitterView } from "./audioEmitterView";
import * as audioGraph from "./audioGraph";
import { createAudioPlaybackFade } from "./audioPlaybackFade";
import { installFakeAudioContext } from "./audioTestFixtures";
import { FramePriority } from "./framePriority";
import { GameEngine } from "./gameEngine";

const filename = "fx/misc/flag_capture.wav";
const buffer = { length: 32, numberOfChannels: 1 } as AudioBuffer;

function setup(emitter: Partial<AudioEmitterEntity> = {}) {
  const { context, sources } = installFakeAudioContext();
  const audioLoader = new AudioLoader();
  let pending: ((value: AudioBuffer) => void) | undefined;
  let fail: ((error: unknown) => void) | undefined;
  const load = vi
    .spyOn(audioLoader, "load")
    .mockImplementation((_, onLoad, _onProgress, onError) => {
      pending = onLoad;
      fail = onError;
    });
  const audioListener = new PlaybackAudioListener();
  vi.spyOn(audioGraph, "getAudioGraph").mockReturnValue({
    audioListener,
    audioLoader,
    outputFade: createAudioPlaybackFade(audioListener.context),
  });
  const request = vi.spyOn(audioBuffers, "getCachedAudioBuffer");
  const engine = new GameEngine();
  const scene = new Scene();
  const renderer = {} as WebGLRenderer;
  const disconnect = engine.connect({
    scene,
    renderer,
    assetsLoading: () => false,
    invalidate: () => {},
  });
  const wasEnabled = settingsStore.getState().audioEnabled;
  settingsStore.setState({ audioEnabled: true });
  const view = createAudioEmitterView(
    {
      id: "emitter",
      className: "AudioEmitter",
      renderType: "AudioEmitter",
      position: [0, 0, 0],
      audioFileName: filename,
      audioMaxDistance: 10,
      ...emitter,
    },
    engine,
  );
  onTestFinished(() => {
    view.dispose();
    disconnect();
    settingsStore.setState({ audioEnabled: wasEnabled });
    pending?.(buffer);
    audioBuffers.audioBufferCache.clear();
    vi.restoreAllMocks();
  });

  return {
    context,
    sources,
    load,
    request,
    moveCamera(x: number) {
      const camera = engine.cameras.active;
      camera.position.set(x, 0, 0);
      const frame = engine.beginFrame({
        camera,
        scene,
        renderer,
        delta: 0,
        elapsed: 0,
      });
      engine.scheduler.run(FramePriority.PostCamera, frame);
    },
    finishLoad() {
      const onLoad = pending!;
      pending = undefined;
      onLoad(buffer);
    },
    failLoad() {
      pending = undefined;
      fail!(new Error("temporary audio delivery failure"));
    },
  };
}

it("keeps an out-of-range decode for reentry and requests it only once", () => {
  const { sources, request, moveCamera, finishLoad } = setup();
  moveCamera(0);
  moveCamera(100);
  moveCamera(0);
  moveCamera(100);
  expect(request).toHaveBeenCalledOnce();

  finishLoad();
  expect(sources).toHaveLength(0);
  moveCamera(0);
  expect(sources).toHaveLength(1);
  expect(sources[0].start).toHaveBeenCalledOnce();
  expect(sources[0]).toHaveProperty("loop", true);
  expect(request).toHaveBeenCalledOnce();
});

it("schedules a gapped loop on the audio clock and cancels it on range exit", () => {
  audioBuffers.audioBufferCache.set(audioToUrl(filename), buffer);
  const { context, sources, load, moveCamera } = setup({
    audioMinLoopGap: 400,
    audioMaxLoopGap: 400,
  });
  moveCamera(0);
  expect(load).not.toHaveBeenCalled();
  expect(sources[0]).toHaveProperty("loop", false);

  context.currentTime = 12;
  const source = sources[0] as unknown as AudioBufferSourceNode;
  source.onended?.call(source, new Event("ended"));
  expect(sources).toHaveLength(2);
  expect(sources[0].disconnect).toHaveBeenCalledOnce();
  expect(sources[1].start).toHaveBeenCalledWith(12.4, 0, undefined);

  moveCamera(100);
  expect(sources[1].stop).toHaveBeenCalledWith(12);
  expect(sources[1]).toHaveProperty("onended", null);
  moveCamera(0);
  expect(sources[2].start).toHaveBeenCalledWith(12, 0, undefined);
});

it("drops a muted emitter's pending start while letting the cache warm", () => {
  const { sources, load, moveCamera, finishLoad } = setup();
  moveCamera(0);
  settingsStore.setState({ audioEnabled: false });
  finishLoad();
  expect(sources).toHaveLength(0);

  settingsStore.setState({ audioEnabled: true });
  moveCamera(0);
  expect(sources).toHaveLength(1);
  expect(load).toHaveBeenCalledOnce();
});

it("retries a failed 2D ambience load while rendering is idle", () => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "performance", "Date"],
  });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { sources, load, finishLoad, failLoad } = setup({ audioIs3D: false });
  failLoad();
  expect(load).toHaveBeenCalledOnce();

  vi.advanceTimersByTime(1000);
  expect(load).toHaveBeenCalledTimes(2);
  finishLoad();
  expect(sources[0].start).toHaveBeenCalledOnce();
});

it.each(["out of range", "muted"])(
  "stops retrying a failed ambient load while %s",
  (condition) => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance", "Date"],
    });
    onTestFinished(() => {
      vi.useRealTimers();
    });
    const { load, moveCamera, failLoad } = setup({
      audioFileName:
        condition === "muted"
          ? "fx/misc/flag_drop.wav"
          : "fx/misc/flag_return.wav",
    });
    moveCamera(0);
    failLoad();
    if (condition === "muted") settingsStore.setState({ audioEnabled: false });
    else moveCamera(100);
    vi.advanceTimersByTime(8000);
    expect(load).toHaveBeenCalledOnce();
  },
);
