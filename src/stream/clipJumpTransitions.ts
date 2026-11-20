import { Quaternion } from "three";
import {
  clipDurationMs,
  MAX_CLIP_TRANSITION_AIM_LEAD,
  MAX_CLIP_TRANSITION_MS,
  sameClipFollowTarget,
  type ClipCameraTransition,
  type ClipSample,
  type ClipTake,
  type ClipTransitionAnchor,
} from "../../relay/clipTypes";

const MIN_TRANSITION_MS = 250;
const FULL_DURATION_DISTANCE = 500;
const DISTANCE_SCALE = 40;
const NORMAL_LENS_HALF_SPAN = Math.tan(Math.PI / 6);
const fromRotation = new Quaternion();
const toRotation = new Quaternion();

/** Half of the narrower frame dimension, measured at unit depth. */
function lensHalfSpan(sample: ClipSample): number {
  return Math.tan((sample.fov * Math.PI) / 360) * Math.min(1, sample.aspect);
}

function transitionMotion(from: ClipSample, to: ClipSample) {
  const distance = Math.hypot(
    to.position[0] - from.position[0],
    to.position[1] - from.position[1],
    to.position[2] - from.position[2],
  );
  const turn = fromRotation
    .fromArray(from.quaternion)
    .normalize()
    .angleTo(toRotation.fromArray(to.quaternion).normalize());
  const perspective =
    from.projection === "perspective" && to.projection === "perspective";
  // A pan crosses more of the screen through a narrow lens.
  const lensScale = perspective
    ? Math.min(
        2,
        Math.max(
          1,
          NORMAL_LENS_HALF_SPAN /
            Math.min(lensHalfSpan(from), lensHalfSpan(to)),
        ),
      )
    : 1;
  const travel =
    Math.log1p(distance / DISTANCE_SCALE) /
    Math.log1p(FULL_DURATION_DISTANCE / DISTANCE_SCALE);
  // The camera turns and travels together, so budget for the slower move.
  const progress = Math.min(1, Math.max(travel, (turn * lensScale) / Math.PI));
  const durationMs = Math.round(
    MIN_TRANSITION_MS + (MAX_CLIP_TRANSITION_MS - MIN_TRANSITION_MS) * progress,
  );
  const orbitDistance =
    to.orbitDistance !== undefined && sameClipFollowTarget(from, to)
      ? from.orbitDistance
      : undefined;
  // During a traveling pan, establish the new facing a little ahead of the move.
  // Same-target orbits use their aim to place the camera on the arc.
  const aimLead =
    perspective && orbitDistance === undefined
      ? MAX_CLIP_TRANSITION_AIM_LEAD *
        Math.min(1, distance / DISTANCE_SCALE, (3 * turn) / Math.PI)
      : 0;
  return { durationMs, orbitDistance, aimLead };
}

function endsTransition(previous: ClipSample, current: ClipSample): boolean {
  return (
    !!current.cut ||
    current.cameraMode !== previous.cameraMode ||
    current.projection !== previous.projection ||
    !sameClipFollowTarget(previous, current)
  );
}

function transitionAnchor(
  sample: ClipSample,
): ClipTransitionAnchor | undefined {
  if (sample.projection !== "perspective") return;
  const { targetId, flagSlot, projectile, orbitDistance } = sample;
  if (
    sample.cameraMode === "firstPersonOverride" &&
    sample.firstPersonPose !== false &&
    targetId !== null
  )
    return { kind: "playerEye", targetId };
  if (
    orbitDistance !== undefined &&
    (targetId !== null || flagSlot !== null || projectile)
  )
    return {
      kind: "orbit",
      distance: orbitDistance,
      targetId,
      flagSlot,
      ...(projectile && { projectile }),
    };
}

function planClipJumpTransition(samples: readonly ClipSample[], index: number) {
  const to = samples[index];
  if (!to?.jump || index < 1) return;

  const motion = transitionMotion(samples[index - 1], to);
  let endMs = Math.min(to.timeMs + motion.durationMs, samples.at(-1)!.timeMs);
  for (let next = index + 1; next < samples.length; next++) {
    const sample = samples[next];
    if (sample.timeMs >= endMs) break;
    if (endsTransition(samples[next - 1], sample)) {
      endMs = sample.timeMs;
      break;
    }
  }
  return { ...motion, endMs };
}

export function clipJumpTransitionEnd(
  samples: readonly ClipSample[],
  index: number,
): number | undefined {
  return planClipJumpTransition(samples, index)?.endMs;
}

/** A transition can start before the trim start when its tail is still visible. */
export function clipJumpTransitionEndInRange(
  timeMs: number,
  transitionEndMs: number | undefined,
  trimStartMs: number,
  trimEndMs: number,
): number | undefined {
  if (transitionEndMs === undefined) return;
  const endMs = Math.min(transitionEndMs, trimEndMs);
  if (endMs - timeMs >= 1 && endMs > trimStartMs) return endMs;
}

/** Turn the selected jumps into short camera moves on the existing clip timeline. */
export function applyClipJumpTransitions(
  take: ClipTake,
  transitionTimes: ReadonlySet<number>,
  trimEndMs = clipDurationMs(take),
): ClipTake {
  const { transitions: existingTransitions, ...rawTake } = take;
  if (!transitionTimes.size) return existingTransitions ? rawTake : take;
  const transitions: ClipCameraTransition[] = [];
  const endMs = Math.min(trimEndMs, clipDurationMs(take));
  const samples = take.samples;
  for (let index = 1; index < samples.length; index++) {
    const to = samples[index];
    const startMs = to.timeMs;
    if (startMs >= endMs) break;
    if (!transitionTimes.has(startMs)) continue;
    const plan = planClipJumpTransition(samples, index);
    if (!plan) continue;

    const end = clipJumpTransitionEndInRange(startMs, plan.endMs, 0, endMs);
    if (end === undefined) continue;
    const from = samples[index - 1];
    const { orbitDistance, aimLead } = plan;
    const anchor =
      orbitDistance === undefined ? transitionAnchor(from) : undefined;
    transitions.push({
      startMs,
      durationMs: Math.min(plan.durationMs, end - startMs),
      position: [...from.position],
      quaternion: [...from.quaternion],
      fov: from.fov,
      aspect: from.aspect,
      projection: from.projection,
      ...(from.viewHeight !== undefined && { viewHeight: from.viewHeight }),
      ...(orbitDistance !== undefined && { orbitDistance }),
      ...(anchor && { anchor }),
      ...(aimLead > 0 && { aimLead }),
    });
  }
  if (transitions.length) return { ...rawTake, transitions };
  return existingTransitions ? rawTake : take;
}

export function clipCameraTransitionAt(
  take: ClipTake,
  timeMs: number,
): ClipCameraTransition | undefined {
  const transitions = take.transitions;
  if (!transitions?.length) return undefined;
  let low = 0;
  let high = transitions.length;
  while (low < high) {
    const index = Math.floor((low + high) / 2);
    if (transitions[index].startMs <= timeMs) low = index + 1;
    else high = index;
  }
  const transition = transitions[low - 1];
  if (transition && timeMs < transition.startMs + transition.durationMs)
    return transition;
}

function easeTransition(t: number): number {
  // Speed is proportional to t²(1 − t)³, with zero speed and acceleration
  // at both ends and a longer easing tail at the destination.
  return t ** 3 * (20 - t * (45 - t * (36 - 10 * t)));
}

/** Ease toward the destination's current pose without depending on prior frames. */
export function sampleClipCameraTransition(
  transition: ClipCameraTransition,
  timeMs: number,
) {
  const t = Math.max(
    0,
    Math.min(1, (timeMs - transition.startMs) / transition.durationMs),
  );
  const fraction = easeTransition(t);
  const aimFraction = transition.aimLead
    ? easeTransition(t + transition.aimLead * t * (1 - t))
    : fraction;
  return { from: transition, fraction, aimFraction };
}
