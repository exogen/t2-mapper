import { expect, it } from "vitest";
import {
  MAX_CLIP_TRANSITION_MS,
  readClipTake,
  type ClipSample,
  type ClipTake,
} from "../../relay/clipTypes";
import {
  applyClipJumpTransitions,
  clipCameraTransitionAt,
  sampleClipCameraTransition,
} from "./clipJumpTransitions";

function sample(
  timeMs: number,
  overrides: Partial<ClipSample> = {},
): ClipSample {
  return {
    timeMs,
    demoTimeSec: 10 + timeMs / 1000,
    position: [0, 0, 0],
    quaternion: [0, 0, 0, 1],
    fov: 80,
    aspect: 16 / 9,
    projection: "perspective",
    cameraMode: "freeFly",
    targetId: null,
    flagSlot: null,
    rate: 1,
    playing: true,
    ...overrides,
  };
}

function take(samples: ClipSample[]): ClipTake {
  return { version: 1, sourceDemo: "test.rec", samples };
}

function yaw(degrees: number): ClipSample["quaternion"] {
  const halfAngle = (degrees * Math.PI) / 360;
  return [0, Math.sin(halfAngle), 0, Math.cos(halfAngle)];
}

it("keeps recorded samples intact and applies an eased move only to a selected jump", () => {
  const input = take([
    sample(0),
    sample(200, { position: [1, 2, 3] }),
    sample(233, { cut: true, jump: "quickCam", position: [80, 2, 3] }),
    sample(800, { cut: true, jump: "resume" }),
    sample(1000),
  ]);
  expect(applyClipJumpTransitions(input, new Set())).toBe(input);
  expect(applyClipJumpTransitions(input, new Set([200]))).toBe(input);
  const result = applyClipJumpTransitions(input, new Set([233]));
  expect(result.samples).toBe(input.samples);
  expect(result.transitions).toHaveLength(1);
  const transition = clipCameraTransitionAt(result, 233)!;
  expect(transition).toMatchObject({
    position: [1, 2, 3],
    quaternion: [0, 0, 0, 1],
    fov: 80,
    projection: "perspective",
  });
  expect(transition.durationMs).toBeGreaterThan(250);
  const time = (fraction: number) => 233 + transition.durationMs * fraction;
  expect(clipCameraTransitionAt(result, time(0) - 0.001)).toBeUndefined();
  expect(clipCameraTransitionAt(result, time(1) - 0.001)).toBe(transition);
  expect(clipCameraTransitionAt(result, time(1))).toBeUndefined();
  expect(clipCameraTransitionAt(result, 800)).toBeUndefined();
  for (const [progress, fraction] of [
    [0, 0],
    [0.25, 0.16943359375],
    [0.5, 0.65625],
    [0.75, 0.96240234375],
    [1, 1],
  ])
    expect(
      sampleClipCameraTransition(transition, time(progress)),
    ).toMatchObject({
      fraction,
      aimFraction: fraction,
    });
});

it.each([
  [0, 250],
  [50, 484],
  [250, 821],
  [500, 1000],
  [1500, 1000],
])("uses %d units of jump distance to select %d ms", (distance, durationMs) => {
  const input = take([
    sample(0),
    sample(100, {
      cut: true,
      jump: "quickCam",
      position: [0, distance, 0],
    }),
    sample(1500),
  ]);
  expect(
    applyClipJumpTransitions(input, new Set([100])).transitions,
  ).toMatchObject([{ durationMs }]);
});

it("keeps a maximum-length transition valid at a fractional start time", () => {
  const startMs = 24.005;
  const input = take([
    sample(0),
    sample(startMs, { cut: true, jump: "quickCam", position: [500, 0, 0] }),
    sample(1500),
  ]);
  const result = applyClipJumpTransitions(input, new Set([startMs]));
  expect(readClipTake(result).transitions).toMatchObject([
    { startMs, durationMs: MAX_CLIP_TRANSITION_MS },
  ]);
});

it.each([
  [179, -179, 80, 258],
  [0, 45, 80, 438],
  [0, 90, 80, 625],
  [0, 180, 80, 1000],
  [0, 45, 30, 625],
  [0, 360, 80, 250],
])(
  "budgets for the shortest turn from %d° to %d° at a %d° field of view",
  (from, to, fov, durationMs) => {
    const input = take([
      sample(0, { fov, quaternion: yaw(from) }),
      sample(100, { cut: true, jump: "quickCam", fov, quaternion: yaw(to) }),
      sample(1500),
    ]);
    const result = applyClipJumpTransitions(input, new Set([100]));
    expect(result.transitions).toMatchObject([{ durationMs }]);
    expect(result.transitions?.[0].aimLead).toBeUndefined();
  },
);

it("turns ahead of a traveling camera while reaching the exact poses at both ends", () => {
  const input = take([
    sample(0),
    sample(100, {
      cut: true,
      jump: "quickCam",
      position: [50, 0, 0],
      quaternion: yaw(90),
    }),
    sample(1500),
  ]);
  const transition = applyClipJumpTransitions(input, new Set([100]))
    .transitions![0];
  expect(transition).toMatchObject({ durationMs: 625, aimLead: 0.25 });
  expect(sampleClipCameraTransition(transition, 100)).toMatchObject({
    fraction: 0,
    aimFraction: 0,
  });
  expect(sampleClipCameraTransition(transition, 412.5)).toMatchObject({
    fraction: 0.65625,
    aimFraction: 0.7650121450424194,
  });
  expect(sampleClipCameraTransition(transition, 725)).toMatchObject({
    fraction: 1,
    aimFraction: 1,
  });
});

it("bounds close transitions at the next jump and at the trim endpoint", () => {
  const input = take([
    sample(0),
    sample(100, { cut: true, jump: "resume", position: [50, 0, 0] }),
    sample(130, { position: [50, 1, 0] }),
    sample(150, {
      cut: true,
      jump: "cameraChange",
      cameraMode: "firstPersonOverride",
      targetId: 7,
    }),
    sample(800, { cameraMode: "firstPersonOverride", targetId: 7 }),
  ]);
  const result = applyClipJumpTransitions(input, new Set([150, 100]), 250);
  expect(result.transitions).toMatchObject([
    { startMs: 100, durationMs: 50, position: [0, 0, 0] },
    { startMs: 150, durationMs: 100, position: [50, 1, 0] },
  ]);
  expect(clipCameraTransitionAt(result, 150)).toBe(result.transitions?.[1]);
  expect(clipCameraTransitionAt(result, 250)).toBeUndefined();
  expect(applyClipJumpTransitions(input, new Set([150]), 150)).toBe(input);
});

it("rebuilds an existing selection and removes the last transition when disabled or trimmed out", () => {
  const input = take([
    sample(0),
    sample(100, { cut: true, jump: "quickCam" }),
    sample(400, { cut: true, jump: "resume" }),
    sample(800),
  ]);
  const result = applyClipJumpTransitions(input, new Set([100]));
  const changed = applyClipJumpTransitions(result, new Set([400]));
  expect(changed.transitions?.map(({ startMs }) => startMs)).toEqual([400]);
  expect(changed.samples).toBe(input.samples);
  expect(applyClipJumpTransitions(changed, new Set())).toEqual(input);
  expect(applyClipJumpTransitions(changed, new Set([400]), 399)).toEqual(input);
});

it("finishes a transition before a same-player perspective toggle", () => {
  const input = take([
    sample(0),
    sample(100, {
      cut: true,
      jump: "cameraChange",
      cameraMode: "firstPersonOverride",
      firstPersonPose: true,
      targetId: 7,
    }),
    sample(200, {
      cameraMode: "orbitOverride",
      firstPersonPose: false,
      targetId: 7,
    }),
    sample(550, {
      cameraMode: "orbitOverride",
      orbitDistance: 7,
      targetId: 7,
    }),
  ]);
  const result = applyClipJumpTransitions(input, new Set([100]));
  expect(result.transitions).toMatchObject([{ startMs: 100, durationMs: 100 }]);
  expect(clipCameraTransitionAt(result, 200)).toBeUndefined();
  expect(result.samples[2]).toBe(input.samples[2]);
});

it("retains an origin orbit offset only when reframing the same target", () => {
  const input = take([
    sample(0, {
      cameraMode: "orbitOverride",
      targetId: 7,
      orbitDistance: 3,
    }),
    sample(100, {
      cut: true,
      jump: "quickCam",
      cameraMode: "orbitOverride",
      targetId: 7,
      orbitDistance: 12,
      position: [50, 0, 0],
      quaternion: yaw(90),
    }),
    sample(150, {
      cut: true,
      jump: "cameraChange",
      cameraMode: "orbitOverride",
      targetId: 5,
      orbitDistance: 12,
    }),
    sample(700, {
      cameraMode: "orbitOverride",
      targetId: 5,
      orbitDistance: 12,
    }),
  ]);
  const result = applyClipJumpTransitions(input, new Set([100, 150]));
  expect(clipCameraTransitionAt(result, 100)?.orbitDistance).toBe(3);
  expect(clipCameraTransitionAt(result, 100)?.anchor).toBeUndefined();
  expect(clipCameraTransitionAt(result, 100)?.aimLead).toBeUndefined();
  expect(clipCameraTransitionAt(result, 150)).not.toHaveProperty(
    "orbitDistance",
  );
  expect(clipCameraTransitionAt(result, 150)?.anchor).toEqual({
    kind: "orbit",
    distance: 12,
    targetId: 7,
    flagSlot: null,
  });
});

it.each([true, false])(
  "uses an outgoing first-person eye only when the camera is at the eye (%s)",
  (firstPersonPose) => {
    const input = take([
      sample(0, {
        cameraMode: "firstPersonOverride",
        firstPersonPose,
        targetId: 7,
      }),
      sample(100, { cut: true, jump: "quickCam" }),
      sample(700),
    ]);
    const result = applyClipJumpTransitions(input, new Set([100]));
    const origin = clipCameraTransitionAt(result, 100);
    expect(origin?.anchor).toEqual(
      firstPersonPose ? { kind: "playerEye", targetId: 7 } : undefined,
    );
  },
);

it("keeps the source projection and zoom available during a projection change", () => {
  const input = take([
    sample(0, { projection: "orthographic", viewHeight: 300 }),
    sample(100, { cut: true, jump: "cameraChange" }),
    sample(500),
  ]);
  const result = applyClipJumpTransitions(input, new Set([100]));
  expect(clipCameraTransitionAt(result, 100)).toMatchObject({
    projection: "orthographic",
    viewHeight: 300,
  });
  expect(result.samples[1].projection).toBe("perspective");
});
