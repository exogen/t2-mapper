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
 *  - saliency: count what is actually IN the frustum (players, flags,
 *    vehicles — and only within fog range, where they can be seen).
 *    An empty frame scores nothing whatever its geometry.
 *  - anchor: a flag stand in the background orients the viewer even
 *    beyond fog range — its floating base marker renders through the
 *    haze — so this term has NO range gate.
 *  - sizeFit: the subject's angular size against the shot's intent —
 *    the difference between a hero frame and a surveillance still.
 *  - tangential: motion across the frame reads as speed; motion along
 *    the lens axis reads as nothing.
 *
 * All terms are 0..1; frameScore blends them with the exported
 * weights and returns the parts for logging/tuning.
 */
import { Vector3 } from "three";

/** Tribes' ~100° horizontal FOV at 16:9 → ~0.63 rad vertical half. */
const VERTICAL_HALF_FOV = 0.63;
const HORIZONTAL_HALF_FOV = 0.87;
/** Player capsule height, for angular-size math (world units). */
const SUBJECT_HEIGHT = 2.4;
/** Saliency saturates: six interesting things is a full frame. */
const SALIENCY_FULL = 6;
/** Below this horizontal speed the tangential term abstains. */
const TANGENTIAL_MIN_SPEED = 8;

export interface SalientEntity {
  pos: Vector3;
  /** Relative interest: flags 3, vehicles 1.5, players 1, props 0.5. */
  weight: number;
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
  skyBalance: 0.2,
  saliency: 0.3,
  anchor: 0.15,
  sizeFit: 0.25,
  tangential: 0.1,
};

const _dir = new Vector3();
const _to = new Vector3();

/** Whether `point` sits inside the view cone (cheap frustum: the
 *  horizontal half-FOV as a cone angle — good enough for census). */
function inFrustum(eye: Vector3, viewDir: Vector3, point: Vector3): boolean {
  _to.copy(point).sub(eye);
  const len = _to.length();
  if (len < 1e-3) return true;
  return _to.dot(viewDir) / len >= Math.cos(HORIZONTAL_HALF_FOV);
}

export function frameScore(ctx: FrameContext): {
  score: number;
  parts: FrameScoreParts;
} {
  const viewDir = _dir.copy(ctx.aim).sub(ctx.eye);
  const range = viewDir.length();
  if (range < 1e-3) {
    const parts = {
      skyBalance: 0,
      saliency: 0,
      anchor: 0,
      sizeFit: 0,
      tangential: 0,
    };
    return { score: 0, parts };
  }
  viewDir.multiplyScalar(1 / range);
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
  const seeRange = Math.min(ctx.fogDistance ?? Infinity, 900) * 0.9;
  let interest = 0;
  for (const e of ctx.entities) {
    if (e.pos.distanceTo(ctx.eye) > seeRange) continue;
    if (inFrustum(ctx.eye, viewDir, e.pos)) interest += e.weight;
  }
  const saliency = Math.min(1, interest / SALIENCY_FULL);

  // ── anchor: any stand in frame, at ANY distance (the base marker
  //    renders through fog and orients the viewer regardless) ──
  const anchor = ctx.stands.some((s) => inFrustum(ctx.eye, viewDir, s)) ? 1 : 0;

  // ── sizeFit: subject angular height vs the shot's intent ──
  let sizeFit = 0;
  if (ctx.targetSubjectFraction != null) {
    const angular = SUBJECT_HEIGHT / subjectDist / (2 * VERTICAL_HALF_FOV);
    const ratio = angular / ctx.targetSubjectFraction;
    // Log-space gaussian: half size or double size ≈ half score.
    sizeFit = Math.exp(-(Math.log(ratio) ** 2) / (2 * 0.6 ** 2));
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
