import { AudioLoader, Object3D } from "three";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { audioToUrl } from "../loaders";
import { settingsStore } from "../state/settingsStore";
import { PlaybackAudioListener } from "./PlaybackAudioListener";
import { audioBufferCache } from "./audioBuffers";
import { installFakeAudioContext } from "./audioTestFixtures";
import { playOneShotSound, stopAllTrackedSounds } from "./soundEffects";

const profile = {
  filename: "fx/misc/flag_capture.wav",
  is3D: true,
  isLooping: false,
  refDist: 1,
  maxDist: 50,
  volume: 1,
};
const buffer = { length: 32, numberOfChannels: 1 } as AudioBuffer;
let audio: ReturnType<typeof installFakeAudioContext>;
let listener: PlaybackAudioListener;
let loader: AudioLoader;

beforeEach(() => {
  audio = installFakeAudioContext();
  Object.assign(audio.context, { state: "running" });
  listener = new PlaybackAudioListener();
  loader = new AudioLoader();
  settingsStore.setState({ audioEnabled: true });
});

afterEach(() => {
  stopAllTrackedSounds();
  audioBufferCache.clear();
  vi.restoreAllMocks();
});

it("drops pending one-shots through a mute and unmute while keeping their buffers", () => {
  let complete: ((buffer: AudioBuffer) => void) | undefined;
  const load = vi.spyOn(loader, "load").mockImplementation((_url, onLoad) => {
    complete = onLoad;
  });
  playOneShotSound(profile, listener, loader);
  expect(load).toHaveBeenCalledOnce();
  settingsStore.setState({ audioEnabled: false });
  settingsStore.setState({ audioEnabled: true });
  complete!(buffer);
  expect(audio.sources).toHaveLength(0);

  playOneShotSound(profile, listener, loader);
  expect(load).toHaveBeenCalledOnce();
  expect(audio.sources[0].start).toHaveBeenCalledOnce();
  settingsStore.setState({ audioEnabled: false });
  expect(audio.sources[0].stop).toHaveBeenCalledOnce();
  settingsStore.setState({ audioEnabled: true });
});

it.each([499, 500])(
  "checks the one-shot deadline when decode finishes after %d ms",
  (elapsedMs) => {
    const now = vi.spyOn(performance, "now").mockReturnValue(1000);
    let complete: ((buffer: AudioBuffer) => void) | undefined;
    vi.spyOn(loader, "load").mockImplementation((_url, onLoad) => {
      complete = onLoad;
    });
    playOneShotSound(profile, listener, loader);

    // Complete the decode before the timeout callback gets a turn.
    now.mockReturnValue(1000 + elapsedMs);
    complete!(buffer);
    expect(audio.sources).toHaveLength(elapsedMs < 500 ? 1 : 0);
    expect(audioBufferCache.get(audioToUrl(profile.filename))).toBe(buffer);
  },
);

it.each(["aborted", "superseded"])(
  "drops a pending one-shot when its owner is %s",
  (retirement) => {
    const lifetime = new AbortController();
    let current = true;
    let complete: ((buffer: AudioBuffer) => void) | undefined;
    const load = vi.spyOn(loader, "load").mockImplementation((_url, onLoad) => {
      complete = onLoad;
    });
    playOneShotSound(profile, listener, loader, undefined, new Object3D(), {
      signal: lifetime.signal,
      canStart: () => current,
    });
    if (retirement === "aborted") lifetime.abort();
    else current = false;
    complete!(buffer);
    expect(audio.sources).toHaveLength(0);

    playOneShotSound(profile, listener, loader);
    expect(load).toHaveBeenCalledOnce();
    expect(audio.sources[0].start).toHaveBeenCalledOnce();
  },
);

it("retires failed starts without occupying spatial one-shot slots", () => {
  audioBufferCache.set(audioToUrl(profile.filename), buffer);
  const parent = new Object3D();
  const createBufferSource = audio.context.createBufferSource.bind(
    audio.context,
  );
  const create = vi
    .spyOn(audio.context, "createBufferSource")
    .mockImplementation(() => {
      const source = createBufferSource();
      source.start.mockImplementation(() => {
        throw new Error("could not start");
      });
      return source;
    });
  for (let i = 0; i < 33; i++)
    playOneShotSound(profile, listener, loader, undefined, parent);
  expect(create).toHaveBeenCalledTimes(33);
  expect(parent.children).toHaveLength(0);

  create.mockRestore();
  playOneShotSound(profile, listener, loader, undefined, parent);
  expect(audio.sources.at(-1)?.start).toHaveBeenCalledOnce();
  expect(parent.children).toHaveLength(1);
  stopAllTrackedSounds();
  expect(parent.children).toHaveLength(0);
});
