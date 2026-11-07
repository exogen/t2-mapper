import { vi } from "vitest";
import { AudioContext as ThreeAudioContext } from "three";

/**
 * An AudioParam that records how it's scheduled.
 */
export function fakeAudioParam() {
  return {
    value: 0,
    automationRate: "a-rate" as AutomationRate,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
}

export type FakeAudioParam = ReturnType<typeof fakeAudioParam>;

function fakeParams<const Name extends string>(names: readonly Name[]) {
  return Object.fromEntries(
    names.map((name) => [name, fakeAudioParam()]),
  ) as Record<Name, FakeAudioParam>;
}

const fakeNode = () => ({ connect: vi.fn(), disconnect: vi.fn() });

const fakePanner = () => ({
  ...fakeNode(),
  ...fakeParams([
    "positionX",
    "positionY",
    "positionZ",
    "orientationX",
    "orientationY",
    "orientationZ",
  ]),
});

const fakeBufferSource = () => ({
  ...fakeNode(),
  start: vi.fn(),
  stop: vi.fn(),
  detune: fakeAudioParam(),
  playbackRate: fakeAudioParam(),
});

/**
 * Just enough of an AudioContext for three's audio classes, installed as
 * three's shared context, with its clock at 5 s. Without `listenerParams`,
 * the listener has only the instant setters, like Firefox's.
 */
export function installFakeAudioContext({ listenerParams = true } = {}) {
  const panners: ReturnType<typeof fakePanner>[] = [];
  const sources: ReturnType<typeof fakeBufferSource>[] = [];
  const context = {
    currentTime: 5,
    destination: {},
    listener: {
      setPosition: vi.fn(),
      setOrientation: vi.fn(),
      ...(listenerParams
        ? fakeParams([
            "positionX",
            "positionY",
            "positionZ",
            "forwardX",
            "forwardY",
            "forwardZ",
            "upX",
            "upY",
            "upZ",
          ])
        : {}),
    },
    createGain: () => ({ ...fakeNode(), gain: fakeAudioParam() }),
    createPanner() {
      const panner = fakePanner();
      panners.push(panner);
      return panner;
    },
    createBufferSource() {
      const source = fakeBufferSource();
      sources.push(source);
      return source;
    },
  };
  vi.spyOn(ThreeAudioContext, "getContext").mockReturnValue(
    context as unknown as AudioContext,
  );
  return { context, panners, sources };
}
