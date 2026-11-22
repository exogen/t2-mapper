/**
 * Composition scoring — what makes a frame WORTH looking at, beyond
 * the sightline being clear. The staging solver optimized visibility
 * alone, which happily certifies a frame that is 90% empty sky with a
 * three-pixel subject in the corner. These terms encode the broadcast
 * craft the shots were missing:
 *
 *  - skyBalance: aiming up fills the frame with sky (dead), aiming
 *    down with readable ground — so tight shots may look up, wide
 *    shots should look level-to-down, and the horizon stays out of
 *    the middle of the frame.
 *  - saliency: readable players, flags, and vehicles.
 *  - anchor: flag stands, buildings, and base hardware that help
 *    viewers place the action on the map.
 *  - sizeFit: the subject's angular size against the shot's intent —
 *    the difference between a hero frame and a surveillance still.
 *  - tangential: motion across the frame reads as speed; motion along
 *    the lens axis reads as nothing.
 *
 * All terms are 0..1; frameScore blends them with the exported
 * weights and returns the parts for logging/tuning.
 */
import { Vector3 } from "three";

// Nominal 90° horizontal view at 16:9. Keep the outer quarter of each
// half-frame available for breathing room and narrower viewer windows.
const TAN_HALF_VERTICAL_FOV = 9 / 16;
const VERTICAL_HALF_FOV = Math.atan(TAN_HALF_VERTICAL_FOV);
const EDGE_PADDING = 0.25;
/** Player capsule height, for angular-size math (world units). */
const SUBJECT_HEIGHT = 2.4;
/** Saliency saturates: six interesting things is a full frame. */
const SALIENCY_FULL = 6;
/** Below this horizontal speed the tangential term abstains. */
const TANGENTIAL_MIN_SPEED = 8;
const LANDMARK_SIGHTLINE_LIMIT = 4;

export interface SalientEntity {
  pos: Vector3;
  /** Relative interest: flags 3, vehicles 1.5, players 1, props 0.5. */
  weight: number;
}

export interface FramingLandmark extends SalientEntity {
  /** A ray hitting the landmark's own building can see its exterior. */
  interiorId?: string;
}

export interface FrameContext {
  /** Camera eye and look-at point, Three-space. */
  eye: Vector3;
  aim: Vector3;
  /** The primary subject (for size/lead terms); defaults to `aim`. */
  subjectPos?: Vector3;
  /** Subject horizontal velocity, Three x/z (u/s). */
  subjectVel?: { x: number; z: number };
  /** Target angular height of the subject as a fraction of frame
   *  height — the shot's intent (hero ≈ 0.12, action ≈ 0.06,
   *  establishing ≈ 0.03). Omit to skip the size term. */
  targetSubjectFraction?: number;
  /** What there is to see, weighted (see SalientEntity). */
  entities: readonly SalientEntity[];
  /** Flag stand positions, Three-space (background anchors). */
  stands: readonly Vector3[];
  landmarks?: readonly FramingLandmark[];
  landmarkVisible?: (eye: Vector3, landmark: FramingLandmark) => boolean;
  /** Fog distance — beyond it saliency cannot be seen. */
  fogDistance?: number;
}

export interface FrameScoreParts {
  skyBalance: number;
  saliency: number;
  anchor: number;
  sizeFit: number;
  tangential: number;
}

export const FRAME_WEIGHTS: FrameScoreParts = {
  skyBalance: 0.17,
  saliency: 0.26,
  anchor: 0.24,
  sizeFit: 0.25,
  tangential: 0.08,
};

const _dir = new Vector3();
const _to = new Vector3();
const _right = new Vector3();
const _up = new Vector3();

function frameAxes(eye: Vector3, aim: Vector3): boolean {
  _dir.subVectors(aim, eye);
  if (_dir.lengthSq() < 1e-6) return false;
  _dir.normalize();
  _right.set(-_dir.z, 0, _dir.x);
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);
  else _right.normalize();
  _up.crossVectors(_right, _dir);
  return true;
}

function weightInFrame(eye: Vector3, point: Vector3): number {
  _to.copy(point).sub(eye);
  const depth = _to.dot(_dir);
  if (depth <= 0) return 0;
  const edge =
    Math.max(
      Math.abs(_to.dot(_right)),
      Math.abs(_to.dot(_up)) / TAN_HALF_VERTICAL_FOV,
    ) / depth;
  return Math.max(0, Math.min(1, (1 - edge) / EDGE_PADDING));
}

/** Full credit inside the comfortable frame, tapering to zero at its edge. */
export function paddedFrameWeight(
  eye: Vector3,
  aim: Vector3,
  point: Vector3,
): number {
  return frameAxes(eye, aim) ? weightInFrame(eye, point) : 0;
}

function landmarkScore(ctx: FrameContext, rangeSq: number): number {
  let stand = 0;
  // The stand marker remains useful even if the flag is away or the
  // stand is beyond the fog.
  for (const pos of ctx.stands)
    stand = Math.max(stand, weightInFrame(ctx.eye, pos));

  const shortlist: { landmark: FramingLandmark; weight: number }[] = [];
  for (const landmark of ctx.landmarks ?? []) {
    if (landmark.pos.distanceToSquared(ctx.eye) > rangeSq) continue;
    const weight = landmark.weight * weightInFrame(ctx.eye, landmark.pos);
    if (
      weight <= 0 ||
      (shortlist.length === LANDMARK_SIGHTLINE_LIMIT &&
        weight <= shortlist[LANDMARK_SIGHTLINE_LIMIT - 1].weight)
    )
      continue;
    shortlist.push({ landmark, weight });
    shortlist.sort((a, b) => b.weight - a.weight);
    if (shortlist.length > LANDMARK_SIGHTLINE_LIMIT) shortlist.pop();
  }

  // Leave room to try another landmark when a stronger one is hidden.
  let score = 0.65 * stand;
  let visible = 0;
  for (const { landmark, weight } of shortlist) {
    if (ctx.landmarkVisible && !ctx.landmarkVisible(ctx.eye, landmark))
      continue;
    score += weight;
    if (++visible === 2 || score >= 1) break;
  }
  return Math.min(1, score);
}

export function frameScore(ctx: FrameContext): {
  score: number;
  parts: FrameScoreParts;
} {
  if (!frameAxes(ctx.eye, ctx.aim)) {
    const parts = {
      skyBalance: 0,
      saliency: 0,
      anchor: 0,
      sizeFit: 0,
      tangential: 0,
    };
    return { score: 0, parts };
  }
  const viewDir = _dir;
  const subject = ctx.subjectPos ?? ctx.aim;
  const subjectDist = Math.max(1, subject.distanceTo(ctx.eye));

  // ── skyBalance: where the (flat-earth) horizon cuts the frame ──
  // pitch > 0 looks up; skyFraction ≈ how much of the frame is above
  // the horizon. Ideal is a third-ish of sky; a frame that is mostly
  // sky is dead air, mostly ground is acceptable (it reads as a map),
  // and the penalty for sky scales with how WIDE the shot is — a
  // tight low-angle hero against the sky is idiomatic.
  const pitch = Math.asin(Math.max(-1, Math.min(1, viewDir.y)));
  const skyFraction = Math.max(
    0,
    Math.min(1, 0.5 + pitch / (2 * VERTICAL_HALF_FOV)),
  );
  const wideness = Math.max(0, Math.min(1, (subjectDist - 15) / 60));
  let skyBalance: number;
  if (skyFraction < 0.12) {
    // Near-nadir: the aerial "map view" — a satellite survey, not a
    // broadcast frame. Steeply worse the closer to straight down.
    skyBalance = 0.1 + (skyFraction / 0.12) * 0.55;
  } else if (skyFraction <= 0.4) {
    skyBalance = 1 - Math.abs(skyFraction - 0.28) * 1.5;
  } else {
    const excess = (skyFraction - 0.4) / 0.6;
    skyBalance = Math.max(0, 1 - excess * (0.6 + 1.2 * wideness));
  }

  // ── saliency: weighted census of visible interesting things ──
  const seeRangeSq = (Math.min(ctx.fogDistance ?? Infinity, 900) * 0.9) ** 2;
  let interest = 0;
  for (const e of ctx.entities) {
    if (e.pos.distanceToSquared(ctx.eye) > seeRangeSq) continue;
    interest += e.weight * weightInFrame(ctx.eye, e.pos);
  }
  const saliency = Math.min(1, interest / SALIENCY_FULL);

  const anchor = landmarkScore(ctx, seeRangeSq);

  // ── sizeFit: subject angular height vs the shot's intent ──
  let sizeFit = 0;
  if (ctx.targetSubjectFraction != null) {
    const angular = SUBJECT_HEIGHT / subjectDist / (2 * VERTICAL_HALF_FOV);
    const ratio = angular / ctx.targetSubjectFraction;
    // Log-space gaussian: half size or double size ≈ half score.
    sizeFit =
      Math.exp(-(Math.log(ratio) ** 2) / (2 * 0.6 ** 2)) *
      weightInFrame(ctx.eye, subject);
  }

  // ── tangential: subject velocity across the lens, not along it ──
  let tangential = 0.5; // abstain (neutral) when still or unknown
  if (ctx.subjectVel) {
    const speed = Math.hypot(ctx.subjectVel.x, ctx.subjectVel.z);
    if (speed >= TANGENTIAL_MIN_SPEED) {
      const vx = ctx.subjectVel.x / speed;
      const vz = ctx.subjectVel.z / speed;
      // 2D cross of view direction and velocity: 1 = crossing frame.
      tangential = Math.abs(viewDir.x * vz - viewDir.z * vx);
    }
  }

  const parts: FrameScoreParts = {
    skyBalance,
    saliency,
    anchor,
    sizeFit,
    tangential,
  };
  let score = 0;
  let weightSum = 0;
  for (const key of Object.keys(FRAME_WEIGHTS) as (keyof FrameScoreParts)[]) {
    // Size abstains when no target was given (weights renormalize).
    if (key === "sizeFit" && ctx.targetSubjectFraction == null) continue;
    score += FRAME_WEIGHTS[key] * parts[key];
    weightSum += FRAME_WEIGHTS[key];
  }
  return { score: weightSum > 0 ? score / weightSum : 0, parts };
}
