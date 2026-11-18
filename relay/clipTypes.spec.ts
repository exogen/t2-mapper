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
