import { describe, expect, it, vi } from "vitest";
import { createAudioPlaybackFade } from "./audioPlaybackFade";

function setup(state: AudioContextState = "suspended") {
  const gain = {
    value: 1,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  const context = {
    state,
    currentTime: 10,
    createGain: () => ({ gain }) as unknown as GainNode,
  };
  const fade = createAudioPlaybackFade(context as BaseAudioContext);
  return { context, gain, fade };
}

describe("playback audio fade", () => {
  it("stays silent during a blocked resume and fades once audio runs", () => {
    const { context, gain, fade } = setup();
    expect(gain.value).toBe(0);

    fade.setPlaying(true);
    fade.setPlaying(true);
    expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled();

    context.state = "running";
    context.currentTime = 10.25;
    fade.setPlaying(true);
    expect(gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10.25);
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 10.3);
  });

  it("does not restart the fade when gestures reassert playback", () => {
    const { context, gain, fade } = setup("running");
    fade.setPlaying(true);
    context.currentTime += 0.01;
    fade.setPlaying(true);
    context.currentTime += 1;
    fade.setPlaying(true);
    expect(gain.cancelScheduledValues).toHaveBeenCalledTimes(1);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledTimes(1);
  });

  it("keeps a gesture-driven autoplay unlock silent while playback is stopped", () => {
    const { context, gain, fade } = setup();
    fade.setPlaying(false);
    context.state = "running";
    fade.setPlaying(false);
    context.state = "suspended";
    fade.setPlaying(false);
    expect(gain.value).toBe(0);
    expect(gain.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("cancels an unfinished fade on pause and starts a fresh one on resume", () => {
    const { context, gain, fade } = setup("running");
    fade.setPlaying(true);
    context.currentTime = 10.02;
    fade.setPlaying(false);
    expect(gain.cancelScheduledValues).toHaveBeenLastCalledWith(10.02);
    expect(gain.setValueAtTime).toHaveBeenLastCalledWith(0, 10.02);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledTimes(1);

    // A rapid play can arrive before suspend has updated ctx.state.
    fade.setPlaying(true);
    expect(gain.linearRampToValueAtTime).toHaveBeenCalledTimes(2);
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 10.07);
  });

  it("fades again after the browser suspends an otherwise playing context", () => {
    const { context, gain, fade } = setup("running");
    fade.setPlaying(true);
    context.currentTime = 15;
    context.state = "suspended";
    fade.setPlaying(true);
    expect(gain.setValueAtTime).toHaveBeenLastCalledWith(0, 15);

    context.state = "running";
    fade.setPlaying(true);
    expect(gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, 15.05);
  });
});
