import { describe, expect, it } from "vitest";
import { fitDemoAim, type DemoAimTick } from "./demoAimFit";
import {
  PACKED_BODY_YAW_STEP,
  reconstructQuantizedAim,
  type QuantizedAimSample,
} from "./quantizedPlayerAim";

const RAD = Math.PI / 180;
const TURN = 2 * Math.PI;
const level = -1 / 63;

function observation(bin: number, moveDegrees: number): QuantizedAimSample {
  return {
    rotationZ: bin * PACKED_BODY_YAW_STEP,
    headX: level,
    headZ: level,
    move: { yaw: moveDegrees * RAD },
  };
}

function frame(
  tick: number,
  yawDegrees: number,
  ...observations: QuantizedAimSample[]
): DemoAimTick {
  return {
    tick,
    estimate: { bodyYaw: yawDegrees * RAD, pitch: 0, headYaw: 0 },
    observations,
  };
}

describe("demo aim fitting", () => {
  // Mistcane at 4:12.736 in S5-Massive. This is a real burst across two
  // packed bins, where the latest-only estimate jumps 2.83 degrees.
  const ticks = [
    frame(7895, 345.71674077, observation(121, 0.521850586)),
    frame(7896, 345.82677165, observation(121, 0.966796875)),
    frame(7897, 345.82677165, observation(121, 1.043701172)),
    frame(
      7898,
      348.66141732,
      observation(122, 1.043701172),
      observation(123, 0.922851563),
    ),
    frame(7899, 348.66141732),
    frame(7900, 348.66141732),
  ];

  it("uses the ordered bins in an active burst even when the next ticks are empty", () => {
    const latestOnly = ticks[3].estimate!.bodyYaw - ticks[2].estimate!.bodyYaw;
    expect(latestOnly / RAD).toBeCloseTo(2.835, 3);
    const previous = fitDemoAim(ticks, 7897)!;
    const current = fitDemoAim(ticks, 7898)!;
    const fitted = current.bodyYaw - previous.bodyYaw;
    expect(fitted / RAD).toBeCloseTo(1.572, 3);
    expect(previous.bodyYaw).toBeGreaterThanOrEqual(
      ticks[2].observations[0].rotationZ,
    );
    expect(previous.bodyYaw).toBeLessThanOrEqual(
      ticks[2].observations[0].rotationZ + PACKED_BODY_YAW_STEP,
    );
    expect(current.bodyYaw).toBeGreaterThanOrEqual(
      ticks[3].observations[0].rotationZ,
    );
  });

  it("does not widen the latest bin using a burst that reverses direction", () => {
    const reversed = [
      ...ticks.slice(0, 3),
      {
        ...ticks[3],
        observations: [observation(122, -1), observation(123, 0.922851563)],
      },
      ...ticks.slice(4),
    ];
    expect(fitDemoAim(reversed, 7898)!.bodyYaw).toBeGreaterThanOrEqual(
      observation(123, 0).rotationZ,
    );
  });

  it("interpolates inside a short observation gap on a coherent turn", () => {
    const gap = [
      frame(10, 1, observation(0, 0.5)),
      frame(11, 1),
      frame(12, 2, observation(0, 0.5)),
    ];
    expect(fitDemoAim(gap, 11)!.bodyYaw / RAD).toBeCloseTo(1.5, 5);
    const cut = [...gap.slice(0, 2), { ...gap[2], cut: true }];
    expect(fitDemoAim(cut, 11)).toBe(gap[1].estimate);
    expect(fitDemoAim(gap.slice(0, 2), 11)).toBe(gap[1].estimate);
  });

  it("keeps stopped, sharp-turn and freelook samples at their original aim", () => {
    const assertUnchanged = (sample: QuantizedAimSample) => {
      const changed = {
        ...ticks[2],
        observations: [sample],
      };
      expect(
        fitDemoAim([ticks[0], ticks[1], changed, ticks[3]], changed.tick),
      ).toBe(changed.estimate);
    };
    assertUnchanged(observation(121, 0));
    assertUnchanged(observation(121, 15));
    const freelook = observation(121, 1);
    assertUnchanged({ ...freelook, move: { yaw: RAD, freeLook: true } });
  });

  it("uses only nearby ticks of the requested segment", () => {
    const future = frame(7901, 352, observation(124, 1));
    expect(fitDemoAim([...ticks, future], 7898)).toEqual(
      fitDemoAim(ticks, 7898),
    );
    const start = { ...ticks[3], cut: true };
    expect(fitDemoAim([...ticks.slice(0, 3), start], 7898)).toBe(
      start.estimate,
    );
  });

  it("unwraps consecutive yaw bins without changing revolution or head yaw", () => {
    const turn = [
      frame(0, 358.8, observation(126, 0.7)),
      {
        ...frame(1, 0.6, observation(0, 0.7)),
        estimate: { bodyYaw: 0.6 * RAD, pitch: 0, headYaw: 0.012 },
      },
      { tick: 2, observations: [observation(0, 0.7)] },
    ];
    const aim = fitDemoAim(turn, 1)!;
    expect(aim.bodyYaw).toBeGreaterThanOrEqual(0);
    expect(aim.bodyYaw).toBeLessThan(PACKED_BODY_YAW_STEP);
    expect(aim.headYaw).toBe(0.012);
    const prior = unwrapDifference(aim.bodyYaw, turn[0].estimate!.bodyYaw);
    expect(prior / RAD).toBeGreaterThan(0.5);
    const original = unwrapDifference(
      turn[1].estimate!.bodyYaw,
      turn[0].estimate!.bodyYaw,
    );
    expect(prior).toBeLessThan(original);

    const next = reconstructQuantizedAim(
      turn[1].estimate,
      turn[2].observations[0],
    );
    expect(fitDemoAim(turn, 2)).toEqual(next);
  });
});

function unwrapDifference(angle: number, prior: number): number {
  const radians = angle - prior;
  return radians - Math.round(radians / TURN) * TURN;
}
