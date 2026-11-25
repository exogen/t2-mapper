import {
  COLOR_GRADE_PATHS,
  GRAPHICS_EFFECT_KEYS,
  type ClipGraphicsEffects,
  type GraphicsEffect,
} from "../src/graphicsEffects.js";
import {
  normalizePlayerInterpolation,
  samePlayerInterpolation,
  type PlayerInterpolationSettings,
} from "../src/stream/playerInterpolation.js";
import type { ProjectileFollowIdentity } from "../src/stream/projectileFollowIdentity.js";
import { isPublishedDemoKey } from "./demoKeys.js";

export const CLIP_VERSION = 1;
export const MAX_CLIP_DURATION_MS = 60_000;
export const MAX_CLIP_TRANSITION_MS = 1000;
export const MAX_CLIP_TRANSITION_AIM_LEAD = 0.25;
export const MAX_CLIP_SAMPLES = 7_202;
export const MAX_CLIP_BODY_BYTES = 2 * 1024 * 1024;
export const CLIPS_PAGE_SIZE = 6;
export const MAX_PUBLIC_CLIPS = 1_000;

// Rebasing a transition during a trim can round its two endpoints differently.
const TRANSITION_BOUNDARY_EPSILON_MS = 1e-6;

export interface ClipHudSettings {
  showChat: boolean;
  chatHudStyle?: "solid" | "transparent";
  showMatchHud: boolean;
  matchHudStyle: "classic" | "broadcast";
}

const CLIP_JUMP_REASONS = ["quickCam", "cameraChange", "resume"] as const;
export type ClipJumpReason = (typeof CLIP_JUMP_REASONS)[number];

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
  /** First-person freelook relative to the body, in radians. */
  headYaw?: number;
  /** True at the eye, false during a perspective transition or death view.
   * Steady third-person samples and older takes omit this field. */
  firstPersonPose?: boolean;
  /** Effective distance from the follow pivot after camera collision. */
  orbitDistance?: number;
  /** Stable across checkpoint restores and changes to runtime entity IDs. */
  projectile?: Readonly<ProjectileFollowIdentity>;
  cameraMode: string;
  targetId: number | null;
  flagSlot: number | null;
  rate: number;
  playing: boolean;
  cut?: boolean;
  /** Editable marker on the first sample of the new view. */
  jump?: ClipJumpReason;
}

export type ClipTransitionAnchor =
  | { kind: "playerEye"; targetId: number }
  | {
      kind: "orbit";
      distance: number;
      targetId: number | null;
      flagSlot: number | null;
      projectile?: Readonly<ProjectileFollowIdentity>;
    };

export interface ClipCameraTransition extends Pick<
  ClipSample,
  | "position"
  | "quaternion"
  | "fov"
  | "aspect"
  | "projection"
  | "viewHeight"
  | "orbitDistance"
> {
  /** Negative when a trim starts partway through the transition. */
  startMs: number;
  durationMs: number;
  /** Normalized time bias toward the incoming aim during a camera glide. */
  aimLead?: number;
  /** Reconstruct the outgoing view as its subject continues moving. */
  anchor?: ClipTransitionAnchor;
}

export interface ClipTake {
  version: 1;
  sourceDemo: string;
  samples: ClipSample[];
  /** Ease from a preceding pose into the selected view on the existing timeline. */
  transitions?: ClipCameraTransition[];
  /** Older takes used stock player interpolation. */
  playerInterpolation?: Readonly<PlayerInterpolationSettings>;
  /** Omitted by older clips, which retain the viewer's HUD preferences. */
  hud?: ClipHudSettings;
  /** An empty snapshot turns effects off. Omission uses the viewer's settings. */
  graphicsEffects?: ClipGraphicsEffects;
}

export type ClipCreateRequest = {
  requestId: string;
  take: ClipTake;
  trimStartMs: number;
  trimEndMs: number;
} & (
  | { sourceBytes: number; sourceSha256?: string }
  | { sourceBytes?: undefined; sourceSha256: string }
);

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
  /** Size of the hosted recording, included with the timeline when available. */
  sourceBytes?: number;
  /** Included for older clients that verify the recording digest. */
  sourceSha256?: string;
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

function validProjectileIdentity(
  projectile: ProjectileFollowIdentity,
): boolean {
  return (
    !!projectile &&
    Number.isSafeInteger(projectile.ghostIndex) &&
    finite(projectile.ghostIndex, 0, 65535) &&
    Number.isSafeInteger(projectile.spawnTick) &&
    finite(projectile.spawnTick, 0, 0xffffffff)
  );
}

function copyProjectileIdentity({
  ghostIndex,
  spawnTick,
}: ProjectileFollowIdentity): ProjectileFollowIdentity {
  return { ghostIndex, spawnTick };
}

function validTransitionAnchor(transition: ClipCameraTransition): boolean {
  const { anchor } = transition;
  if (anchor === undefined) return true;
  if (!anchor || transition.projection !== "perspective") return false;
  if (anchor.kind === "playerEye")
    return anchor.targetId !== null && identity(anchor.targetId);
  return (
    anchor.kind === "orbit" &&
    finite(anchor.distance, 0, 1e7) &&
    identity(anchor.targetId) &&
    identity(anchor.flagSlot) &&
    (anchor.targetId !== null ||
      anchor.flagSlot !== null ||
      anchor.projectile !== undefined) &&
    (anchor.projectile === undefined ||
      validProjectileIdentity(anchor.projectile))
  );
}

function copyTransitionAnchor(
  anchor: ClipTransitionAnchor,
): ClipTransitionAnchor {
  if (anchor.kind === "playerEye")
    return { kind: anchor.kind, targetId: anchor.targetId };
  return {
    kind: anchor.kind,
    distance: anchor.distance,
    targetId: anchor.targetId,
    flagSlot: anchor.flagSlot,
    ...(anchor.projectile && {
      projectile: copyProjectileIdentity(anchor.projectile),
    }),
  };
}

type ClipCameraPose = Pick<
  ClipSample,
  "position" | "quaternion" | "fov" | "aspect" | "projection" | "viewHeight"
>;

function validCameraPose(pose: ClipCameraPose): boolean {
  return (
    Array.isArray(pose.position) &&
    pose.position.length === 3 &&
    pose.position.every((value) => finite(value, -1e7, 1e7)) &&
    Array.isArray(pose.quaternion) &&
    pose.quaternion.length === 4 &&
    pose.quaternion.every((value) => finite(value, -1, 1)) &&
    finite(pose.fov, 0.01, 179) &&
    finite(pose.aspect, 0.1, 10) &&
    (pose.projection === "perspective" ||
      (pose.projection === "orthographic" &&
        finite(pose.viewHeight, 0.001, 1e7)))
  );
}

function copyCameraPose(pose: ClipCameraPose): ClipCameraPose {
  const length = Math.hypot(...pose.quaternion);
  if (length < 0.9 || length > 1.1)
    throw new Error("Invalid clip camera rotation");
  return {
    position: [...pose.position],
    quaternion: pose.quaternion.map(
      (value) => value / length,
    ) as ClipSample["quaternion"],
    fov: pose.fov,
    aspect: pose.aspect,
    projection: pose.projection,
    ...(pose.projection === "orthographic" && { viewHeight: pose.viewHeight }),
  };
}

export function sameClipFollowTarget(a: ClipSample, b: ClipSample): boolean {
  return (
    a.targetId === b.targetId &&
    a.flagSlot === b.flagSlot &&
    a.projectile?.ghostIndex === b.projectile?.ghostIndex &&
    a.projectile?.spawnTick === b.projectile?.spawnTick
  );
}

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

function readClipGraphicsEffects(value: unknown): ClipGraphicsEffects {
  const effects = value as Partial<ClipGraphicsEffects> | null;
  const invalid = "Invalid clip graphics effects";
  if (
    !effects?.intensity ||
    typeof effects.intensity !== "object" ||
    Array.isArray(effects.intensity)
  )
    throw new Error(invalid);
  const intensity: Partial<Record<GraphicsEffect, number>> = {};
  for (const key of GRAPHICS_EFFECT_KEYS) {
    if (!Object.hasOwn(effects.intensity, key)) continue;
    const strength = effects.intensity[key];
    if (!finite(strength, 0, 1)) throw new Error(invalid);
    if (strength > 0) intensity[key] = strength;
  }
  const grade = effects.grade;
  if (
    grade !== undefined &&
    (!grade ||
      typeof grade.name !== "string" ||
      !Object.hasOwn(COLOR_GRADE_PATHS, grade.name) ||
      !finite(grade.intensity, 0, 1))
  )
    throw new Error(invalid);
  return {
    intensity,
    ...(grade &&
      grade.intensity > 0 && {
        grade: { name: grade.name, intensity: grade.intensity },
      }),
  };
}

/** Normalize untrusted data into the persisted clip format. */
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
  const graphicsEffects =
    take.graphicsEffects === undefined
      ? undefined
      : readClipGraphicsEffects(take.graphicsEffects);
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
      !validCameraPose(sample) ||
      (sample.headYaw !== undefined &&
        !finite(sample.headYaw, -Math.PI, Math.PI)) ||
      (sample.firstPersonPose !== undefined &&
        typeof sample.firstPersonPose !== "boolean") ||
      !MODES.has(sample.cameraMode) ||
      !identity(sample.targetId) ||
      !identity(sample.flagSlot) ||
      !finite(sample.rate, 0.01, 16) ||
      typeof sample.playing !== "boolean" ||
      (sample.cut !== undefined && typeof sample.cut !== "boolean") ||
      (sample.jump !== undefined &&
        (!sample.cut || !CLIP_JUMP_REASONS.includes(sample.jump)))
    )
      throw new Error("Invalid clip camera sample");
    const projectile = sample.projectile;
    if (
      ((sample.orbitDistance !== undefined || projectile !== undefined) &&
        (sample.cameraMode !== "orbitOverride" ||
          sample.projection !== "perspective" ||
          sample.firstPersonPose !== undefined)) ||
      (sample.orbitDistance !== undefined &&
        !finite(sample.orbitDistance, 0, 1e7)) ||
      (projectile !== undefined && !validProjectileIdentity(projectile))
    )
      throw new Error("Invalid clip camera orbit");
    previousMs = sample.timeMs;
    previousDemoSec = sample.demoTimeSec;
    return {
      timeMs: sample.timeMs,
      demoTimeSec: sample.demoTimeSec,
      ...copyCameraPose(sample),
      ...(sample.headYaw !== undefined && { headYaw: sample.headYaw }),
      ...(sample.firstPersonPose !== undefined && {
        firstPersonPose: sample.firstPersonPose,
      }),
      ...(sample.orbitDistance !== undefined && {
        orbitDistance: sample.orbitDistance,
      }),
      ...(projectile && { projectile: copyProjectileIdentity(projectile) }),
      cameraMode: sample.cameraMode,
      targetId: sample.targetId,
      flagSlot: sample.flagSlot,
      rate: sample.rate,
      playing: sample.playing,
      ...(sample.cut && { cut: true }),
      ...(sample.jump && { jump: sample.jump }),
    } satisfies ClipSample;
  });
  if (samples[0].timeMs !== 0 || samples.at(-1)!.timeMs <= 0)
    throw new Error("Invalid clip duration");
  let previousTransitionEnd = -Infinity;
  const transitions = take.transitions;
  if (
    transitions !== undefined &&
    (!Array.isArray(transitions) || transitions.length >= samples.length)
  )
    throw new Error("Invalid clip camera transitions");
  return {
    version: CLIP_VERSION,
    sourceDemo: take.sourceDemo,
    samples,
    ...(transitions?.length && {
      transitions: transitions.map((transition: ClipCameraTransition) => {
        if (
          !transition ||
          !finite(transition.startMs, -MAX_CLIP_TRANSITION_MS, previousMs) ||
          transition.startMs + TRANSITION_BOUNDARY_EPSILON_MS <
            previousTransitionEnd ||
          transition.startMs >= previousMs ||
          !finite(transition.durationMs, 1, MAX_CLIP_TRANSITION_MS) ||
          transition.startMs + transition.durationMs <= 0 ||
          (transition.aimLead !== undefined &&
            !finite(transition.aimLead, 0, MAX_CLIP_TRANSITION_AIM_LEAD)) ||
          !validCameraPose(transition) ||
          !validTransitionAnchor(transition) ||
          (transition.orbitDistance !== undefined &&
            (transition.projection !== "perspective" ||
              !finite(transition.orbitDistance, 0, 1e7)))
        )
          throw new Error("Invalid clip camera transition");
        previousTransitionEnd = transition.startMs + transition.durationMs;
        return {
          ...copyCameraPose(transition),
          startMs: transition.startMs,
          durationMs: transition.durationMs,
          ...(transition.aimLead !== undefined && {
            aimLead: transition.aimLead,
          }),
          ...(transition.anchor && {
            anchor: copyTransitionAnchor(transition.anchor),
          }),
          ...(transition.orbitDistance !== undefined && {
            orbitDistance: transition.orbitDistance,
          }),
        };
      }),
    }),
    ...(hud && { hud }),
    ...(graphicsEffects && { graphicsEffects }),
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
  const anchoredOrbit =
    a.orbitDistance !== undefined ||
    b.orbitDistance !== undefined ||
    a.projectile !== undefined ||
    b.projectile !== undefined;
  const cut =
    b.cut ||
    a.projection !== b.projection ||
    (anchoredOrbit && !sameClipFollowTarget(a, b));
  const leavesEye =
    !cut &&
    a.cameraMode === "firstPersonOverride" &&
    a.firstPersonPose !== false &&
    (b.cameraMode === "orbitOverride" ||
      (b.cameraMode === a.cameraMode && b.firstPersonPose === false));
  const leavesOrbit =
    !cut &&
    a.cameraMode === "orbitOverride" &&
    a.orbitDistance !== undefined &&
    (b.cameraMode === "firstPersonOverride" ||
      (b.cameraMode === "orbitOverride" && b.firstPersonPose === false));
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
    ...(a.headYaw !== undefined &&
      b.headYaw !== undefined &&
      !cut && {
        headYaw: blend(a.headYaw, b.headYaw),
      }),
    ...(a.orbitDistance !== undefined &&
      b.orbitDistance !== undefined &&
      !cut && {
        orbitDistance: blend(a.orbitDistance, b.orbitDistance),
      }),
  };
  // The interpolated camera is between an eye and an orbit. Use the saved
  // transition path and pose the body for an outside view until it arrives.
  if (leavesEye || leavesOrbit) {
    sample.firstPersonPose = false;
    delete sample.headYaw;
    delete sample.orbitDistance;
  }
  // A cut belongs to its exact sample, not a point interpolated after it.
  delete sample.cut;
  delete sample.jump;
  return sample;
}

type ClipTrimRange = Pick<ClipCreateRequest, "trimStartMs" | "trimEndMs">;

function validateClipTrimRange(
  take: ClipTake,
  range: Partial<ClipTrimRange>,
): asserts range is ClipTrimRange {
  const { trimStartMs, trimEndMs } = range;
  const durationMs = clipDurationMs(take);
  if (
    !finite(trimStartMs, 0, durationMs) ||
    !finite(trimEndMs, 0, durationMs) ||
    trimEndMs <= trimStartMs
  )
    throw new Error("Choose a valid clip start and end");
}

export function trimClipTake(
  take: ClipTake,
  startMs: number,
  endMs: number,
): ClipTake {
  validateClipTrimRange(take, { trimStartMs: startMs, trimEndMs: endMs });
  const transitions = take.transitions
    ?.filter(
      ({ startMs: at, durationMs }) => at < endMs && at + durationMs > startMs,
    )
    .map((transition) => ({
      ...transition,
      startMs: transition.startMs - startMs,
      position: [...transition.position] as ClipSample["position"],
      quaternion: [...transition.quaternion] as ClipSample["quaternion"],
      ...(transition.anchor && {
        anchor: copyTransitionAnchor(transition.anchor),
      }),
    }));
  return {
    version: CLIP_VERSION,
    sourceDemo: take.sourceDemo,
    ...(transitions?.length && { transitions }),
    ...(take.hud && { hud: { ...take.hud } }),
    ...(take.graphicsEffects && { graphicsEffects: take.graphicsEffects }),
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

export function isClipSourceByteCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
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
  const { requestId, sourceBytes, sourceSha256 } = request;
  if (
    sourceSha256 !== undefined &&
    (typeof sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(sourceSha256))
  )
    throw new Error("Invalid clip source fingerprint");
  const take = readClipTake(request.take);
  validateClipTrimRange(take, request);
  const parsed = {
    requestId: requestId.toLowerCase(),
    take,
    trimStartMs: request.trimStartMs,
    trimEndMs: request.trimEndMs,
  };
  if (sourceBytes === undefined && sourceSha256)
    return { ...parsed, sourceSha256 };
  if (!isClipSourceByteCount(sourceBytes))
    throw new Error("Invalid clip source size");
  return { ...parsed, sourceBytes, ...(sourceSha256 && { sourceSha256 }) };
}
