import { beforeAll, expect, it, onTestFinished, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { settingsStore } from "../state/settingsStore";
import { getAudioDevice } from "./audioDevice";
import { getAudioGraph } from "./audioGraph";
import { installAudio } from "./audioSystem";
import { fakeAudioParam, installFakeAudioContext } from "./audioTestFixtures";
import { FrameScheduler } from "./frameScheduler";
import type { GameEngine } from "./gameEngine";

vi.mock("./preloadMatchSounds", () => ({
  preloadMatchSounds: () => undefined,
}));

beforeAll(() => {
  const { context } = installFakeAudioContext();
  Object.assign(context, {
    state: "running",
    addEventListener: vi.fn(),
    resume() {
      Object.assign(context, { state: "running" });
      return Promise.resolve();
    },
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
});

function harness() {
  const document = new EventTarget();
  vi.stubGlobal("document", document);
  const { audioEnabled, audioVolume } = settingsStore.getState();
  settingsStore.setState({ audioEnabled: true, audioVolume: 0.5 });
  const listener = getAudioGraph().audioListener;
  const setVolume = vi.spyOn(listener, "setMasterVolume");
  const audioRecovery = createStore<
    ReturnType<GameEngine["audioRecovery"]["getState"]>
  >(() => ({ enableSound: null }));
  const dispose = installAudio({
    scheduler: new FrameScheduler(),
    audioRecovery,
  } as GameEngine);
  onTestFinished(() => {
    dispose();
    settingsStore.setState({ audioEnabled, audioVolume });
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  return { document, listener, setVolume, audioRecovery };
}

it("applies volume and mute without waiting for a render frame", () => {
  const { setVolume } = harness();
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

it("attempts to unlock audio on touch release with the audio preference enabled", () => {
  const { document, listener } = harness();
  const userActivation = { isActive: false };
  vi.stubGlobal("navigator", { userActivation });
  const unlock = vi.spyOn(getAudioDevice(listener.context), "unlock");

  document.dispatchEvent(new Event("touchend"));
  userActivation.isActive = true;
  settingsStore.setState({ audioEnabled: false });
  document.dispatchEvent(new Event("touchend"));
  expect(unlock).not.toHaveBeenCalled();

  settingsStore.setState({ audioEnabled: true });
  document.dispatchEvent(new Event("touchend"));
  expect(unlock).toHaveBeenCalledOnce();
});

it("offers a retry only while enabled, audible audio needs recovery", () => {
  vi.useFakeTimers();
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const { document, listener, audioRecovery } = harness();
  const device = getAudioDevice(listener.context);
  const attention = vi.spyOn(device, "needsAttention").mockReturnValue(true);
  vi.spyOn(device, "verifyClock").mockImplementation(() => {});
  const unlock = vi.spyOn(device, "unlock");
  const button = () => audioRecovery.getState().enableSound;
  const refresh = () => document.dispatchEvent(new Event("visibilitychange"));
  vi.stubGlobal("navigator", { userActivation: { isActive: true } });

  refresh();
  vi.advanceTimersByTime(299);
  expect(button()).toBeNull();
  vi.advanceTimersByTime(1);
  expect(button()).toBeTypeOf("function");
  button()?.();
  expect(unlock).toHaveBeenCalledOnce();
  expect(unlock).toHaveBeenCalledWith(true);

  settingsStore.setState({ audioVolume: 0 });
  expect(button()).toBeNull();
  settingsStore.setState({ audioEnabled: false, audioVolume: 0.5 });
  vi.advanceTimersByTime(1000);
  expect(button()).toBeNull();
  settingsStore.setState({ audioEnabled: true });
  vi.advanceTimersByTime(300);
  expect(button()).toBeTypeOf("function");

  attention.mockReturnValue(false);
  refresh();
  expect(button()).toBeNull();
});
