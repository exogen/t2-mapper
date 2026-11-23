import { expect, it, onTestFinished, vi } from "vitest";
import { settingsStore } from "../state/settingsStore";
import { getAudioGraph } from "./audioGraph";
import { installAudio } from "./audioSystem";
import { fakeAudioParam, installFakeAudioContext } from "./audioTestFixtures";
import { FrameScheduler } from "./frameScheduler";
import type { GameEngine } from "./gameEngine";

vi.mock("./preloadMatchSounds", () => ({
  preloadMatchSounds: () => undefined,
}));

it("applies volume and mute without waiting for a render frame", () => {
  const { context } = installFakeAudioContext();
  Object.assign(context, {
    state: "running",
    addEventListener: vi.fn(),
    suspend() {
      Object.assign(context, { state: "suspended" });
      return Promise.resolve();
    },
    createDynamicsCompressor: () => ({
      ...context.createGain(),
      threshold: fakeAudioParam(),
      knee: fakeAudioParam(),
      ratio: fakeAudioParam(),
      attack: fakeAudioParam(),
      release: fakeAudioParam(),
    }),
  });
  vi.stubGlobal("document", new EventTarget());
  const { audioEnabled, audioVolume } = settingsStore.getState();
  settingsStore.setState({ audioEnabled: true, audioVolume: 0.5 });
  const listener = getAudioGraph().audioListener;
  const setVolume = vi.spyOn(listener, "setMasterVolume");
  const dispose = installAudio({
    scheduler: new FrameScheduler(),
  } as GameEngine);
  onTestFinished(() => {
    dispose();
    settingsStore.setState({ audioEnabled, audioVolume });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  expect(setVolume).toHaveBeenLastCalledWith(0.5);
  settingsStore.setState({ audioVolume: 0.2 });
  expect(setVolume).toHaveBeenLastCalledWith(0.2);
  settingsStore.setState({ audioEnabled: false });
  expect(setVolume).toHaveBeenLastCalledWith(0);
  settingsStore.setState({ audioVolume: 0.75 });
  expect(setVolume).toHaveBeenCalledTimes(3);
  settingsStore.setState({ audioEnabled: true });
  expect(setVolume).toHaveBeenLastCalledWith(0.75);
});
