import { expect, it } from "vitest";
import {
  MAX_LOOK_ANGLE,
  PACKED_BODY_YAW_STEP,
  PACKED_HEAD_STEP,
  reconstructQuantizedAim,
  type QuantizedAimSample,
} from "./quantizedPlayerAim";

const level = (2 * 31) / 63 - 1;
const sample: QuantizedAimSample = {
  rotationZ: 10 * PACKED_BODY_YAW_STEP,
  headX: level,
  headZ: level,
};

it("continues a small turn inside unchanged packed yaw and pitch bins", () => {
  const first = Object.freeze(reconstructQuantizedAim(undefined, sample));
  let aim = first;
  for (let tick = 1; tick <= 6; tick++) {
    const delta = PACKED_BODY_YAW_STEP / 8;
    const headDelta = (PACKED_HEAD_STEP * MAX_LOOK_ANGLE) / 8;
    const crossed = tick >= 4;
    aim = reconstructQuantizedAim(aim, {
      ...sample,
      rotationZ: sample.rotationZ + (crossed ? PACKED_BODY_YAW_STEP : 0),
      headX: sample.headX + (crossed ? PACKED_HEAD_STEP : 0),
      move: { yaw: delta, pitch: headDelta },
    });
    expect(aim.bodyYaw).toBeCloseTo(first.bodyYaw + tick * delta, 12);
    expect(aim.pitch).toBeCloseTo(first.pitch + tick * headDelta, 12);
    expect(aim.headYaw).toBeCloseTo(0, 12);
  }
  expect(first.bodyYaw).toBeCloseTo(
    sample.rotationZ + PACKED_BODY_YAW_STEP / 2,
  );
});

it("projects prediction to the bin edge and reseeds after an unexplained large turn", () => {
  const first = reconstructQuantizedAim(undefined, sample);
  const tooFar = reconstructQuantizedAim(first, {
    ...sample,
    move: { yaw: PACKED_BODY_YAW_STEP },
  });
  expect(tooFar.bodyYaw).toBeCloseTo(sample.rotationZ + PACKED_BODY_YAW_STEP);
  const turned = { ...sample, rotationZ: sample.rotationZ + 0.75 };
  expect(reconstructQuantizedAim(tooFar, turned).bodyYaw).toBeCloseTo(
    reconstructQuantizedAim(undefined, turned).bodyYaw,
    12,
  );
});

it.each([1, -1])("continues a turn across yaw wraparound (%s)", (sign) => {
  const turn = 2 * Math.PI;
  const previous = {
    bodyYaw: sign === 1 ? turn - 0.01 : 0.01,
    pitch: 0,
    headYaw: 0,
  };
  const aim = reconstructQuantizedAim(previous, {
    ...sample,
    rotationZ: sign === 1 ? 0 : turn - PACKED_BODY_YAW_STEP,
    move: { yaw: sign * 0.02 },
  });
  expect(aim.bodyYaw).toBeCloseTo(sign === 1 ? 0.01 : turn - 0.01, 12);
});

it.each([1, -1])(
  "wraps a large turn inferred across a sparse update (%s)",
  (sign) => {
    const turn = 2 * Math.PI;
    const step = PACKED_BODY_YAW_STEP;
    const move = { yaw: sign * 3 };
    const prior = reconstructQuantizedAim(undefined, {
      ...sample,
      rotationZ: sign === 1 ? 121 * step : 10 * step,
      move,
    });
    const turned = (((prior.bodyYaw + 4 * move.yaw) % turn) + turn) % turn;
    const bin = Math.floor(turned / step) * step;
    const aim = reconstructQuantizedAim(
      prior,
      { ...sample, rotationZ: bin, move },
      4,
    );
    expect(aim.bodyYaw).toBeCloseTo(
      turned * 0.75 + (bin + step / 2) * 0.25,
      12,
    );
  },
);

it("uses freelook to turn the head, and keeps pitch within its physical limits", () => {
  const first = reconstructQuantizedAim(undefined, { ...sample, headX: -1 });
  expect(first.pitch).toBe(-MAX_LOOK_ANGLE);
  const delta = 0.01;
  const next = reconstructQuantizedAim(first, {
    ...sample,
    headX: 1,
    move: { yaw: delta, pitch: 4, freeLook: true },
  });
  expect(next.bodyYaw).toBe(first.bodyYaw);
  expect(next.headYaw).toBeCloseTo(delta, 12);
  expect(next.pitch).toBe(MAX_LOOK_ANGLE);
});

it("estimates missing turns from the neighboring moves on a short gap", () => {
  const step = PACKED_BODY_YAW_STEP;
  const first = reconstructQuantizedAim(undefined, {
    ...sample,
    move: { yaw: step / 24 },
  });
  const next = reconstructQuantizedAim(
    first,
    { ...sample, move: { yaw: step / 12 } },
    3,
  );
  // Two unobserved ticks average the endpoint rates. A partial move gives
  // less information than a directly observed turn, so shrink toward center.
  expect(next.bodyYaw).toBeCloseTo(first.bodyYaw + (5 / 24) * step * 0.75, 12);
});

it("does not mix yaw input between body and head when freelook changes", () => {
  const delta = PACKED_BODY_YAW_STEP / 10;
  const first = reconstructQuantizedAim(undefined, {
    ...sample,
    move: { yaw: delta, freeLook: true },
  });
  const next = reconstructQuantizedAim(
    first,
    { ...sample, move: { yaw: delta, freeLook: false } },
    2,
  );
  expect(next.bodyYaw).toBeCloseTo(first.bodyYaw + delta * 0.75, 12);
});

it("keeps a stationary estimate across sparse packets and reacquires after a long gap", () => {
  const start = reconstructQuantizedAim(undefined, sample);
  const turned = reconstructQuantizedAim(start, {
    ...sample,
    move: { yaw: PACKED_BODY_YAW_STEP / 10 },
  });
  const stopped = { ...sample, move: { yaw: 0, pitch: 0 } };
  const stationary = reconstructQuantizedAim(turned, stopped);
  expect(stationary.bodyYaw).toBe(turned.bodyYaw);
  expect(stationary.pitch).toBe(turned.pitch);
  expect(stationary.headYaw).toBeCloseTo(0, 12);
  expect(reconstructQuantizedAim(stationary, stopped, 3).bodyYaw).toBe(
    stationary.bodyYaw,
  );
  expect(reconstructQuantizedAim(stationary, stopped, 10).bodyYaw).toBe(
    stationary.bodyYaw,
  );
  const turnedDuringGap = { ...stopped, rotationZ: sample.rotationZ + 0.25 };
  expect(reconstructQuantizedAim(stationary, turnedDuringGap, 10).bodyYaw).toBe(
    reconstructQuantizedAim(undefined, turnedDuringGap).bodyYaw,
  );
});
