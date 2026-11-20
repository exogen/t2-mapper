import { expect, it } from "vitest";
import {
  readClipCreateRequest,
  readClipTake,
  sampleClipTake,
  trimClipTake,
  MAX_CLIP_DURATION_MS,
  type ClipSample,
  type ClipTake,
} from "./clipTypes";

const frame = (
  timeMs: number,
  demoTimeSec: number,
  overrides: Partial<ClipSample> = {},
): ClipSample => ({
  timeMs,
  demoTimeSec,
  position: [timeMs, 2, 3],
  quaternion: [0, 0, 0, 1],
  fov: 70,
  aspect: 1.5,
  projection: "perspective",
  cameraMode: "freeFly",
  targetId: null,
  flagSlot: null,
  playing: true,
  rate: 1,
  ...overrides,
});
const take = (samples = [frame(0, 10), frame(1000, 11)]): ClipTake => ({
  version: 1,
  sourceDemo: "game.rec",
  samples,
});

it("accepts hosted source keys, normalizes quaternion data, and strips unknown fields", () => {
  const input = take([
    frame(0, 10, { quaternion: [0, 0, 0, 0.99] }),
    frame(1000, 11),
  ]);
  input.sourceDemo = "users/126767979894407168/upload.rec";
  const result = readClipTake({ ...input, malicious: "ignored" });
  expect(result.samples[0].quaternion).toEqual([0, 0, 0, 1]);
  expect(result).not.toHaveProperty("malicious");
  result.samples[0].position[0] = 123;
  expect(input.samples[0].position[0]).toBe(0);
});

it("preserves first-person freelook through trimming and camera cuts", () => {
  const clip = readClipTake(
    take([
      frame(0, 10, {
        cameraMode: "firstPersonOverride",
        headYaw: 0,
        firstPersonPose: false,
      }),
      frame(1000, 11, { cameraMode: "firstPersonOverride", headYaw: 0.6 }),
      frame(2000, 12, {
        cameraMode: "firstPersonOverride",
        headYaw: -0.6,
        cut: true,
      }),
    ]),
  );
  expect(sampleClipTake(clip, 500).headYaw).toBeCloseTo(0.3);
  expect(sampleClipTake(clip, 500).firstPersonPose).toBe(false);
  expect(sampleClipTake(clip, 1500).headYaw).toBe(0.6);
  expect(sampleClipTake(clip, 2000).headYaw).toBe(-0.6);
  expect(trimClipTake(clip, 500, 1800).samples[0].headYaw).toBeCloseTo(0.3);
  expect(readClipTake(take()).samples[0]).not.toHaveProperty("headYaw");
  expect(() =>
    readClipTake(take([frame(0, 10, { headYaw: 4 }), frame(1000, 11)])),
  ).toThrow("Invalid clip camera sample");
});

it.each([
  { cameraMode: "orbitOverride" },
  { cameraMode: "firstPersonOverride", firstPersonPose: false },
])(
  "uses the outside-eye pose as soon as the camera leaves the eye: %j",
  (end) => {
    const eye = frame(0, 10, {
      cameraMode: "firstPersonOverride",
      firstPersonPose: true,
      headYaw: 0.2,
      targetId: 7,
    });
    const transition = frame(32, 10.032, { targetId: 7, ...end });
    const clip = take([eye, transition]);
    expect(sampleClipTake(clip, 0)).toMatchObject({
      firstPersonPose: true,
      headYaw: 0.2,
    });
    const midpoint = sampleClipTake(clip, 16);
    expect(midpoint).toMatchObject({
      position: [16, 2, 3],
      firstPersonPose: false,
    });
    expect(midpoint).not.toHaveProperty("headYaw");
    expect(trimClipTake(clip, 12, 32).samples[0].firstPersonPose).toBe(false);

    const cut = take([eye, { ...transition, cut: true }]);
    expect(sampleClipTake(cut, 16)).toMatchObject({
      position: eye.position,
      firstPersonPose: true,
      headYaw: 0.2,
    });
  },
);

it("retains the creator's four interpolation values through validation and trimming", () => {
  const settings = {
    maxLatencyTicks: 1.5,
    maxPredictionTicks: 10,
    maxWarpTicks: 1,
    minWarpTicks: 1.25,
  };
  const clip = readClipTake({ ...take(), playerInterpolation: settings });
  expect(trimClipTake(clip, 100, 900).playerInterpolation).toEqual(settings);
  expect(readClipTake(take())).not.toHaveProperty("playerInterpolation");
  for (const invalid of [
    null,
    {},
    { ...settings, maxLatencyTicks: -1 },
    { ...settings, maxWarpTicks: 1.25 },
    { ...settings, maxWarpTicks: "3" },
  ]) {
    expect(() =>
      readClipTake({ ...take(), playerInterpolation: invalid }),
    ).toThrow("Invalid clip player interpolation");
  }
});

it("preserves and copies creator HUD settings through validation and trimming", () => {
  const input = {
    ...take(),
    hud: {
      showChat: false,
      chatHudStyle: "transparent" as const,
      showMatchHud: true,
      matchHudStyle: "broadcast" as const,
    },
  };
  const normalized = readClipTake({
    ...input,
    hud: { ...input.hud, unknown: "ignored" },
  });
  expect(normalized.hud).toEqual(input.hud);
  expect(normalized.hud).not.toBe(input.hud);
  const trimmed = trimClipTake(normalized, 100, 900);
  expect(trimmed.hud).toEqual(input.hud);
  expect(trimmed.hud).not.toBe(normalized.hud);
  trimmed.hud!.showChat = true;
  expect(normalized.hud!.showChat).toBe(false);
});

it.each([
  null,
  {},
  { showChat: "false", showMatchHud: true, matchHudStyle: "classic" },
  { showChat: true, showMatchHud: 1, matchHudStyle: "classic" },
  { showChat: true, showMatchHud: true, matchHudStyle: "unknown" },
  {
    showChat: true,
    chatHudStyle: "unknown",
    showMatchHud: true,
    matchHudStyle: "classic",
  },
  {
    showChat: true,
    chatHudStyle: null,
    showMatchHud: true,
    matchHudStyle: "classic",
  },
])("rejects invalid creator HUD settings %j", (hud) => {
  expect(() => readClipTake({ ...take(), hud })).toThrow("Invalid clip HUD");
});

it("leaves HUD settings absent for legacy clips", () => {
  const legacy = readClipTake(take());
  expect(legacy).not.toHaveProperty("hud");
  expect(trimClipTake(legacy, 100, 900)).not.toHaveProperty("hud");
});

it("preserves older HUD settings without a chat style", () => {
  const hud = { showChat: true, showMatchHud: false, matchHudStyle: "classic" };
  const normalized = readClipTake({ ...take(), hud });
  expect(normalized.hud).toEqual(hud);
  expect(trimClipTake(normalized, 100, 900).hud).toEqual(hud);
});

it("retains only active graphics effects and their strengths through trimming", () => {
  const graphicsEffects = {
    intensity: { bloom: 0.6, grain: 0, unknown: 0.9 },
    grade: { name: "Fuji Velvia 50", intensity: 0.4 },
  };
  const normalized = readClipTake({ ...take(), graphicsEffects });
  expect(trimClipTake(normalized, 100, 900).graphicsEffects).toEqual({
    intensity: { bloom: 0.6 },
    grade: { name: "Fuji Velvia 50", intensity: 0.4 },
  });
  graphicsEffects.intensity.bloom = 0;
  graphicsEffects.grade.intensity = 0;
  expect(normalized.graphicsEffects?.intensity.bloom).toBe(0.6);
  expect(normalized.graphicsEffects?.grade?.intensity).toBe(0.4);
});

it("distinguishes a clip with effects off from a clip using the viewer's effects", () => {
  const legacy = readClipTake(take());
  expect(trimClipTake(legacy, 100, 900)).not.toHaveProperty("graphicsEffects");
  const blank = readClipTake({ ...take(), graphicsEffects: { intensity: {} } });
  expect(trimClipTake(blank, 100, 900).graphicsEffects).toEqual({
    intensity: {},
  });
});

it.each([
  null,
  {},
  { intensity: [] },
  { intensity: { bloom: NaN } },
  { intensity: { grain: -0.1 } },
  { intensity: { tiltShift: "0.5" } },
  { intensity: {}, grade: { name: "Bourbon 64", intensity: 1.1 } },
  {
    intensity: {},
    grade: { name: "https://example.com/lut.png", intensity: 1 },
  },
  { intensity: {}, grade: { name: "constructor", intensity: 1 } },
])("rejects invalid clip effects %j", (graphicsEffects) => {
  expect(() => readClipTake({ ...take(), graphicsEffects })).toThrow(
    "Invalid clip graphics effects",
  );
});

it.each([
  { sourceDemo: "../private.rec" },
  { version: 2 },
  { samples: [] },
  { samples: [frame(0, 10), frame(1000, 9)] },
  { samples: [frame(0, 10), frame(0, 10)] },
  { samples: [frame(0, 10), frame(MAX_CLIP_DURATION_MS + 1, 11)] },
  { samples: [frame(0, 10), frame(1000, 11, { position: [Infinity, 0, 0] })] },
  { samples: [frame(0, 10), frame(1000, 11, { quaternion: [0, 0, 0, 0] })] },
  { samples: [frame(0, 10), frame(1000, 11, { fov: 180 })] },
  { samples: [frame(0, 10), frame(1000, 11, { projection: "orthographic" })] },
])("rejects invalid clip data (%j)", (overrides) => {
  expect(() => readClipTake({ ...take(), ...overrides })).toThrow(/Invalid/);
});

it("trims at interpolated camera boundaries while retaining paused source time and camera motion", () => {
  const original = take([
    frame(0, 10),
    frame(1000, 10, { playing: false }),
    frame(2000, 11),
  ]);
  const trimmed = trimClipTake(original, 250, 1500);
  expect(
    trimmed.samples.map((sample) => [
      sample.timeMs,
      sample.demoTimeSec,
      sample.position[0],
    ]),
  ).toEqual([
    [0, 10, 250],
    [750, 10, 1000],
    [1250, 10.5, 1500],
  ]);
  expect(original.samples[0].position[0]).toBe(0);
  trimmed.samples[1].position[0] = 999;
  expect(original.samples[1].position[0]).toBe(1000);
});

it("keeps camera cuts abrupt and quaternions normalized across the shortest rotation", () => {
  const original = take([
    frame(0, 10),
    frame(1000, 11, {
      cut: true,
      position: [500, 0, 0],
      quaternion: [0, 0, 0, -1],
    }),
  ]);
  expect(sampleClipTake(original, 999).position).toEqual([0, 2, 3]);
  expect(sampleClipTake(original, 1000).position).toEqual([500, 0, 0]);
  delete original.samples[1].cut;
  expect(sampleClipTake(original, 500).quaternion).toEqual([0, 0, 0, 1]);
});

it("retains smooth movement when a trim ends after a camera cut", () => {
  const original = take([
    frame(0, 10),
    frame(1000, 11, { cut: true }),
    frame(2000, 12),
  ]);
  const trimmed = trimClipTake(original, 500, 1500);
  expect(sampleClipTake(trimmed, 499).position).toEqual([0, 2, 3]);
  expect(sampleClipTake(trimmed, 500).position).toEqual([1000, 2, 3]);
  expect(sampleClipTake(trimmed, 750).position).toEqual([1250, 2, 3]);
  expect(trimmed.samples.at(-1)).not.toHaveProperty("cut");
  expect(trimClipTake(original, 0, 1000).samples.at(-1)?.cut).toBe(true);
});

it("accepts a 60-second clip and rejects one past the recording limit", () => {
  expect(MAX_CLIP_DURATION_MS).toBe(60_000);
  expect(() =>
    readClipTake(take([frame(0, 10), frame(60_000, 70)])),
  ).not.toThrow();
  expect(() => readClipTake(take([frame(0, 10), frame(60_001, 70)]))).toThrow(
    /Invalid/,
  );
});

it("validates an idempotent create request and rejects invalid trim ranges", () => {
  const request = {
    requestId: "12345678-1234-4123-8123-123456789abc",
    sourceSha256: "a".repeat(64),
    take: take(),
    trimStartMs: 0,
    trimEndMs: 1000,
  };
  expect(readClipCreateRequest(request)).toEqual(request);
  expect(() =>
    readClipCreateRequest({ ...request, trimStartMs: 1000 }),
  ).toThrow(/start and end/);
  expect(() => readClipCreateRequest({ ...request, requestId: "bad" })).toThrow(
    /request ID/,
  );
  expect(() =>
    readClipCreateRequest({ ...request, sourceSha256: "bad" }),
  ).toThrow(/source fingerprint/);
});
