import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, Vector3 } from "three";
import {
  type FakeAudioParam,
  fakeAudioParam,
  installFakeAudioContext,
} from "./audioTestFixtures";
import { PlaybackAudioListener } from "./PlaybackAudioListener";
import {
  AudioParamVector,
  PlaybackPositionalAudio,
  SPATIAL_SMOOTHING_SEC,
} from "./spatialAudio";

afterEach(() => vi.restoreAllMocks());

describe("AudioParamVector", () => {
  function fakeVector() {
    const [x, y, z] = [fakeAudioParam(), fakeAudioParam(), fakeAudioParam()];
    const param = (fake: FakeAudioParam) => fake as unknown as AudioParam;
    return { x, vector: new AudioParamVector(param(x), param(y), param(z)) };
  }

  const cancelTimes = (param: FakeAudioParam) =>
    param.cancelScheduledValues.mock.calls.map(([time]) => time);

  it("sets the first value instantly", () => {
    const { x, vector } = fakeVector();
    vector.set(new Vector3(1, 2, 3), 5);
    expect(x.setValueAtTime).toHaveBeenCalledExactlyOnceWith(1, 5);
    expect(x.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("glides from the value reached, starting now", () => {
    const { x, vector } = fakeVector();
    vector.set(new Vector3(1, 2, 3), 5);
    vector.set(new Vector3(4, 2, 3), 6);
    expect(x.setValueAtTime).toHaveBeenLastCalledWith(1, 6);
    expect(x.linearRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
      4,
      6 + SPATIAL_SMOOTHING_SEC,
    );
  });

  it("appends a glide to one under way, without cancelling it", () => {
    const { x, vector } = fakeVector();
    vector.set(new Vector3(0, 0, 0), 5);
    vector.set(new Vector3(10, 0, 0), 6);
    vector.set(new Vector3(20, 0, 0), 6 + SPATIAL_SMOOTHING_SEC / 4);
    expect(x.setValueAtTime).toHaveBeenCalledTimes(2);
    expect(x.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      20,
      6 + SPATIAL_SMOOTHING_SEC * 1.25,
    );
    expect(cancelTimes(x)).toEqual([
      5,
      6 + SPATIAL_SMOOTHING_SEC,
      6 + SPATIAL_SMOOTHING_SEC * 1.25,
    ]);
  });

  it("replaces a glide set at the same instant", () => {
    const { x, vector } = fakeVector();
    vector.set(new Vector3(0, 0, 0), 5);
    vector.set(new Vector3(10, 0, 0), 6);
    vector.set(new Vector3(20, 0, 0), 6);
    expect(cancelTimes(x).at(-1)).toBe(6 + SPATIAL_SMOOTHING_SEC);
    expect(
      x.cancelScheduledValues.mock.invocationCallOrder.at(-1),
    ).toBeLessThan(x.linearRampToValueAtTime.mock.invocationCallOrder[1]);
    expect(x.linearRampToValueAtTime).toHaveBeenLastCalledWith(
      20,
      6 + SPATIAL_SMOOTHING_SEC,
    );
    expect(x.setValueAtTime).toHaveBeenCalledTimes(2);
  });

  it("leaves unchanged values alone", () => {
    const { x, vector } = fakeVector();
    vector.set(new Vector3(1, 2, 3), 5);
    vector.set(new Vector3(1, 2, 3), 6);
    expect(x.setValueAtTime).toHaveBeenCalledOnce();
    expect(x.cancelScheduledValues).toHaveBeenCalledOnce();
    expect(x.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("stays instant until the clock moves past the last snap", () => {
    const { x, vector } = fakeVector();
    vector.set(new Vector3(1, 2, 3), 5);
    vector.set(new Vector3(4, 2, 3), 5);
    expect(cancelTimes(x)).toEqual([5, 5]);
    expect(x.setValueAtTime).toHaveBeenLastCalledWith(4, 5);
    expect(x.linearRampToValueAtTime).not.toHaveBeenCalled();
    vector.set(new Vector3(7, 2, 3), 6);
    expect(x.linearRampToValueAtTime).toHaveBeenCalledOnce();
  });

  it("snaps on request, cutting short a glide under way", () => {
    const { x, vector } = fakeVector();
    vector.set(new Vector3(1, 2, 3), 5);
    vector.set(new Vector3(4, 2, 3), 6);
    vector.set(new Vector3(4, 2, 3), 6 + SPATIAL_SMOOTHING_SEC / 2, true);
    expect(cancelTimes(x).at(-1)).toBe(6 + SPATIAL_SMOOTHING_SEC / 2);
    expect(x.setValueAtTime).toHaveBeenLastCalledWith(
      4,
      6 + SPATIAL_SMOOTHING_SEC / 2,
    );
    expect(x.linearRampToValueAtTime).toHaveBeenCalledOnce();
  });
});

describe("PlaybackPositionalAudio", () => {
  function playingSound() {
    const fake = installFakeAudioContext();
    const parent = new Group();
    parent.position.set(10, 0, 0);
    const sound = new PlaybackPositionalAudio(new PlaybackAudioListener());
    sound.position.set(1, 2, 3);
    parent.add(sound);
    sound.setBuffer({} as AudioBuffer);
    sound.play();
    const [panner] = fake.panners;
    return { ...fake, parent, sound, panner };
  }

  it("places the panner at the sound's world position before it starts", () => {
    const { panner, sources } = playingSound();
    expect(panner.positionX.setValueAtTime).toHaveBeenCalledExactlyOnceWith(
      11,
      5,
    );
    expect(panner.positionY.setValueAtTime).toHaveBeenCalledWith(2, 5);
    expect(panner.positionZ.setValueAtTime).toHaveBeenCalledWith(3, 5);
    expect(
      panner.positionX.setValueAtTime.mock.invocationCallOrder[0],
    ).toBeLessThan(sources[0].start.mock.invocationCallOrder[0]);
  });

  it("computes its panner once per render quantum", () => {
    const { panner } = playingSound();
    const params = [
      panner.positionX,
      panner.positionY,
      panner.positionZ,
      panner.orientationX,
      panner.orientationY,
      panner.orientationZ,
    ];
    for (const param of params) expect(param.automationRate).toBe("k-rate");
  });

  it("re-places a sound moved before the audio clock moves, instantly", () => {
    const { parent, panner } = playingSound();
    parent.position.x = 20;
    parent.updateMatrixWorld(true);
    expect(panner.positionX.setValueAtTime).toHaveBeenLastCalledWith(21, 5);
    expect(panner.positionX.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("glides as the sound moves, instead of three's per-frame ramps", () => {
    const { context, parent, panner } = playingSound();
    context.currentTime = 6;
    parent.position.x = 20;
    parent.updateMatrixWorld(true);
    parent.updateMatrixWorld(true);
    expect(
      panner.positionX.linearRampToValueAtTime,
    ).toHaveBeenCalledExactlyOnceWith(21, 6 + SPATIAL_SMOOTHING_SEC);
    expect(panner.orientationX.linearRampToValueAtTime).not.toHaveBeenCalled();
  });

  it("leaves a stopped sound's panner alone, then places it instantly on replay", () => {
    const { context, parent, sound, panner } = playingSound();
    sound.stop();
    context.currentTime = 6;
    parent.position.x = 30;
    parent.updateMatrixWorld(true);
    expect(panner.positionX.setValueAtTime).toHaveBeenCalledOnce();
    context.currentTime = 7;
    sound.play();
    expect(panner.positionX.setValueAtTime).toHaveBeenLastCalledWith(31, 7);
    expect(panner.positionX.linearRampToValueAtTime).not.toHaveBeenCalled();
  });
});
