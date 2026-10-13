import { afterEach, expect, it, vi } from "vitest";
import { Audio, AudioContext as ThreeAudioContext } from "three";
import { PlaybackAudioListener } from "./PlaybackAudioListener";

afterEach(() => vi.restoreAllMocks());

it("routes world and chat through separate gates into the same master volume", () => {
  const createGain = () => ({
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  const context = { createGain, destination: {} } as unknown as AudioContext;
  vi.spyOn(ThreeAudioContext, "getContext").mockReturnValue(context);
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
