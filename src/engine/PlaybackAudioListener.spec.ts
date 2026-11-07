import { afterEach, expect, it, vi } from "vitest";
import { Audio } from "three";
import {
  type FakeAudioParam,
  installFakeAudioContext,
} from "./audioTestFixtures";
import { PlaybackAudioListener } from "./PlaybackAudioListener";
import { SPATIAL_SMOOTHING_SEC } from "./spatialAudio";

afterEach(() => vi.restoreAllMocks());

it("routes world and chat through separate gates into the same master volume", () => {
  const { context } = installFakeAudioContext();
  const listener = new PlaybackAudioListener();
  const world = new Audio(listener);
  const chat = listener.createChatSound();
  expect(world.gain.connect).toHaveBeenCalledExactlyOnceWith(
    listener.world.node,
  );
  expect(chat.gain.disconnect).toHaveBeenCalledExactlyOnceWith(
    listener.world.node,
  );
  expect(chat.gain.connect).toHaveBeenLastCalledWith(listener.chat.node);
  expect(listener.world.node.connect).toHaveBeenCalledExactlyOnceWith(
    listener.gain,
  );
  expect(listener.chat.node.connect).toHaveBeenCalledExactlyOnceWith(
    listener.gain,
  );
  expect(listener.gain.connect).toHaveBeenCalledExactlyOnceWith(
    context.destination,
  );
});

it("computes the listener once per render quantum", () => {
  const { context } = installFakeAudioContext();
  new PlaybackAudioListener();
  const params = Object.values(context.listener).filter(
    (value): value is FakeAudioParam => typeof value === "object",
  );
  expect(params).toHaveLength(9);
  for (const param of params) expect(param.automationRate).toBe("k-rate");
});

it("places the listener instantly until the audio clock moves, then glides", () => {
  const { context } = installFakeAudioContext();
  const { positionX, forwardZ, upY } = context.listener;
  const listener = new PlaybackAudioListener();
  listener.position.set(1, 2, 3);
  listener.updateMatrixWorld(true);
  expect(positionX!.setValueAtTime).toHaveBeenLastCalledWith(1, 5);
  expect(forwardZ!.setValueAtTime).toHaveBeenLastCalledWith(-1, 5);
  expect(upY!.setValueAtTime).toHaveBeenLastCalledWith(1, 5);

  listener.position.x = 2;
  listener.updateMatrixWorld(true);
  expect(positionX!.setValueAtTime).toHaveBeenLastCalledWith(2, 5);

  context.currentTime = 6;
  listener.position.x = 4;
  listener.updateMatrixWorld(true);
  listener.updateMatrixWorld(true);
  expect(positionX!.setValueAtTime).toHaveBeenLastCalledWith(2, 6);
  expect(positionX!.linearRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(
    4,
    6 + SPATIAL_SMOOTHING_SEC,
  );
  expect(forwardZ!.linearRampToValueAtTime).not.toHaveBeenCalled();
});

it("uses the instant setters where the listener has no AudioParams", () => {
  const { context } = installFakeAudioContext({ listenerParams: false });
  const listener = new PlaybackAudioListener();
  listener.position.set(1, 2, 3);
  listener.updateMatrixWorld(true);
  expect(context.listener.setPosition).toHaveBeenCalledExactlyOnceWith(1, 2, 3);
  expect(context.listener.setOrientation).toHaveBeenCalledExactlyOnceWith(
    0,
    0,
    -1,
    0,
    1,
    0,
  );
});
