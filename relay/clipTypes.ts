import {
  normalizePlayerInterpolation,
  samePlayerInterpolation,
  type PlayerInterpolationSettings,
} from "../src/stream/playerInterpolation.js";
import { isPublishedDemoKey } from "./demoKeys.js";

export const CLIP_VERSION = 1;
export const MAX_CLIP_DURATION_MS = 60_000;
export const MAX_CLIP_SAMPLES = 7_202;
export const MAX_CLIP_BODY_BYTES = 2 * 1024 * 1024;
export const CLIPS_PAGE_SIZE = 6;

export interface ClipHudSettings {
  showChat: boolean;
  chatHudStyle?: "solid" | "transparent";
  showMatchHud: boolean;
  matchHudStyle: "classic" | "broadcast";
}

export interface ClipSample {
  timeMs: number;
  demoTimeSec: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  /** Effective Three.js vertical FOV, with the recording viewport's aspect. */
  fov: number;
  aspect: number;
  projection: "perspective" | "orthographic";
  /** Orthographic vertical span in world units. */
  viewHeight?: number;
  cameraMode: string;
  targetId: number | null;
  flagSlot: number | null;
  rate: number;
  playing: boolean;
  cut?: boolean;
}

export interface ClipTake {
  version: 1;
  sourceDemo: string;
  samples: ClipSample[];
  /** Older takes used stock player interpolation. */
  playerInterpolation?: Readonly<PlayerInterpolationSettings>;
  /** Omitted by older clips, which retain the viewer's HUD preferences. */
  hud?: ClipHudSettings;
}

export interface ClipCreateRequest {
  requestId: string;
  sourceSha256: string;
  take: ClipTake;
  trimStartMs: number;
  trimEndMs: number;
}

export interface ClipView {
  id: string;
  title: string;
  sourceDemo: string;
  startSec: number;
  /** Recorded clip time, including pauses and playback-speed changes. */
  durationMs?: number;
  ownerDiscordId: string;
  creatorName?: string;
  createdAt: number;
  state: "processing" | "ready" | "failed";
  error?: string;
  timeline?: ClipTake;
  checkpointUrl: string;
}

export interface ClipPage {
  clips: ClipView[];
  total: number;
  pending: number;
  page: number;
  pageSize: number;
}

const MODES = new Set([
  "original",
  "freeFly",
  "orbitOverride",
  "firstPersonOverride",
  "commandCircuit",
  "director",
  "tour",
]);
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= min &&
  value <= max;
const identity = (value: unknown): value is number | null =>
  value === null || (Number.isSafeInteger(value) && finite(value, 0, 65535));

export function clipDurationMs(take: ClipTake): number {
  return take.samples.at(-1)?.timeMs ?? 0;
}

export function readClipHudSettings(value: unknown): ClipHudSettings {
  const hud = value as Partial<ClipHudSettings> | null;
  if (
    !hud ||
    typeof hud.showChat !== "boolean" ||
    (hud.chatHudStyle !== undefined &&
      hud.chatHudStyle !== "solid" &&
      hud.chatHudStyle !== "transparent") ||
    typeof hud.showMatchHud !== "boolean" ||
    (hud.matchHudStyle !== "classic" && hud.matchHudStyle !== "broadcast")
  )
    throw new Error("Invalid clip HUD settings");
  return {
    showChat: hud.showChat,
    ...(hud.chatHudStyle !== undefined && { chatHudStyle: hud.chatHudStyle }),
    showMatchHud: hud.showMatchHud,
    matchHudStyle: hud.matchHudStyle,
  };
}

/** Normalize untrusted camera data into the one persisted clip format. */
export function readClipTake(value: unknown): ClipTake {
  const take = value as Partial<ClipTake> | null;
  if (
    !take ||
    take.version !== CLIP_VERSION ||
    !isPublishedDemoKey(take.sourceDemo) ||
    !Array.isArray(take.samples) ||
    take.samples.length < 2 ||
    take.samples.length > MAX_CLIP_SAMPLES
  )
    throw new Error("Invalid clip recording");
  const hud =
    take.hud === undefined ? undefined : readClipHudSettings(take.hud);
  const playerInterpolation = normalizePlayerInterpolation(
    take.playerInterpolation,
  );
  if (
    take.playerInterpolation !== undefined &&
    (!take.playerInterpolation ||
      !samePlayerInterpolation(take.playerInterpolation, playerInterpolation))
  )
    throw new Error("Invalid clip player interpolation");
  let previousMs = -1;
  let previousDemoSec = -1;
  const samples = take.samples.map((value) => {
    const sample = value as ClipSample;
    if (
      !sample ||
      !finite(sample.timeMs, 0, MAX_CLIP_DURATION_MS) ||
      sample.timeMs <= previousMs ||
      !finite(sample.demoTimeSec, 0, 1e8) ||
      sample.demoTimeSec + 1e-6 < previousDemoSec ||
      !Array.isArray(sample.position) ||
      sample.position.length !== 3 ||
      !sample.position.every((n) => finite(n, -1e7, 1e7)) ||
      !Array.isArray(sample.quaternion) ||
      sample.quaternion.length !== 4 ||
      !sample.quaternion.every((n) => finite(n, -1, 1)) ||
      !finite(sample.fov, 0.01, 179) ||
      !finite(sample.aspect, 0.1, 10) ||
      !["perspective", "orthographic"].includes(sample.projection) ||
      (sample.projection === "orthographic" &&
        !finite(sample.viewHeight, 0.001, 1e7)) ||
      !MODES.has(sample.cameraMode) ||
      !identity(sample.targetId) ||
      !identity(sample.flagSlot) ||
      !finite(sample.rate, 0.01, 16) ||
      typeof sample.playing !== "boolean" ||
      (sample.cut !== undefined && typeof sample.cut !== "boolean")
    )
      throw new Error("Invalid clip camera sample");
    const length = Math.hypot(...sample.quaternion);
    if (length < 0.9 || length > 1.1)
      throw new Error("Invalid clip camera rotation");
    previousMs = sample.timeMs;
    previousDemoSec = sample.demoTimeSec;
    return {
      timeMs: sample.timeMs,
      demoTimeSec: sample.demoTimeSec,
      position: [...sample.position] as ClipSample["position"],
      quaternion: sample.quaternion.map(
        (n) => n / length,
      ) as ClipSample["quaternion"],
      fov: sample.fov,
      aspect: sample.aspect,
      projection: sample.projection,
      ...(sample.projection === "orthographic" && {
        viewHeight: sample.viewHeight,
      }),
      cameraMode: sample.cameraMode,
      targetId: sample.targetId,
      flagSlot: sample.flagSlot,
      rate: sample.rate,
      playing: sample.playing,
      ...(sample.cut && { cut: true }),
    } satisfies ClipSample;
  });
  if (samples[0].timeMs !== 0 || samples.at(-1)!.timeMs <= 0)
    throw new Error("Invalid clip duration");
  return {
    version: CLIP_VERSION,
    sourceDemo: take.sourceDemo,
    samples,
    ...(hud && { hud }),
    ...(take.playerInterpolation && { playerInterpolation }),
  };
}

function blendQuaternion(
  a: ClipSample["quaternion"],
  b: ClipSample["quaternion"],
  t: number,
): ClipSample["quaternion"] {
  let dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
  const sign = dot < 0 ? -1 : 1;
  dot = Math.min(1, Math.abs(dot));
  const angle = Math.acos(dot);
  const sine = Math.sin(angle);
  const first = sine < 1e-6 ? 1 - t : Math.sin((1 - t) * angle) / sine;
  const second = sine < 1e-6 ? t : Math.sin(t * angle) / sine;
  const result = a.map(
    (value, index) => value * first + b[index] * sign * second,
  ) as ClipSample["quaternion"];
  const length = Math.hypot(...result);
  return result.map((value) => value / length) as ClipSample["quaternion"];
}

/** Cuts preserve their discontinuity; ordinary movement and zoom interpolate. */
export function sampleClipTake(take: ClipTake, timeMs: number): ClipSample {
  const samples = take.samples;
  const time = Math.max(0, Math.min(clipDurationMs(take), timeMs));
  let low = 0,
    high = samples.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (samples[middle].timeMs <= time) low = middle;
    else high = middle - 1;
  }
  const a = samples[low];
  const b = samples[low + 1];
  if (!b || time === a.timeMs)
    return {
      ...a,
      timeMs: time,
      position: [...a.position],
      quaternion: [...a.quaternion],
    };
  const fraction = (time - a.timeMs) / (b.timeMs - a.timeMs);
  const blend = (first: number, second: number) =>
    first + (second - first) * fraction;
  const cut = b.cut || a.projection !== b.projection;
  const sample: ClipSample = {
    ...a,
    timeMs: time,
    demoTimeSec: blend(a.demoTimeSec, b.demoTimeSec),
    position: cut
      ? [...a.position]
      : (a.position.map((n, i) =>
          blend(n, b.position[i]),
        ) as ClipSample["position"]),
    quaternion: cut
      ? [...a.quaternion]
      : blendQuaternion(a.quaternion, b.quaternion, fraction),
    fov: cut ? a.fov : blend(a.fov, b.fov),
    aspect: cut ? a.aspect : blend(a.aspect, b.aspect),
    ...(a.viewHeight !== undefined &&
      b.viewHeight !== undefined && {
        viewHeight: cut ? a.viewHeight : blend(a.viewHeight, b.viewHeight),
      }),
  };
  // A cut belongs to its exact sample, not a point interpolated after it.
  delete sample.cut;
  return sample;
}

export function trimClipTake(
  take: ClipTake,
  startMs: number,
  endMs: number,
): ClipTake {
  if (
    !finite(startMs, 0, clipDurationMs(take)) ||
    !finite(endMs, 0, clipDurationMs(take)) ||
    endMs <= startMs
  )
    throw new Error("Choose a valid clip start and end");
  return {
    version: CLIP_VERSION,
    sourceDemo: take.sourceDemo,
    ...(take.hud && { hud: { ...take.hud } }),
    ...(take.playerInterpolation && {
      playerInterpolation: { ...take.playerInterpolation },
    }),
    samples: [
      sampleClipTake(take, startMs),
      ...take.samples.filter(
        (sample) => sample.timeMs > startMs && sample.timeMs < endMs,
      ),
      sampleClipTake(take, endMs),
    ].map((sample) => ({
      ...sample,
      timeMs: sample.timeMs - startMs,
      position: [...sample.position],
      quaternion: [...sample.quaternion],
    })),
  };
}

export function readClipCreateRequest(value: unknown): ClipCreateRequest {
  const request = value as Partial<ClipCreateRequest> | null;
  if (
    !request ||
    typeof request.requestId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      request.requestId,
    )
  )
    throw new Error("Invalid clip request ID");
  if (
    typeof request.sourceSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(request.sourceSha256)
  )
    throw new Error("Invalid clip source fingerprint");
  const take = readClipTake(request.take);
  trimClipTake(take, request.trimStartMs!, request.trimEndMs!);
  return {
    requestId: request.requestId.toLowerCase(),
    sourceSha256: request.sourceSha256,
    take,
    trimStartMs: request.trimStartMs!,
    trimEndMs: request.trimEndMs!,
  };
}
