/**
 * What a shot will ACTUALLY look like, before it is published.
 *
 * The director knows a shot's whole camera path up front: a fixedOrbit
 * is a centre, a radius, a lift and an angular speed over a known
 * duration; a sweep is a line between two points over a known duration.
 * So it can walk that path and answer the only questions that matter —
 * does the camera ever end up inside the world, and can it see the
 * thing the shot is about — instead of validating one point and letting
 * the runtime discover the rest.
 *
 * Checking a single point is what produced shots that spent their whole
 * duration inside a wall while reporting perfect visibility: a ray cast
 * from inside a solid crosses only backfaces on the way out and reports
 * NOTHING, which the old sight test read as an unobstructed view.
 */
import type { DirectorVec3, Shot, ShotSubject } from "./types";
import { ORBIT_LOOK_LIFT, orbitEyeAt } from "./cameraRig";
import { Vector3 } from "three";
import { pointObstructed } from "../collision/worldCollision";
import { subjectViewBlocked } from "./cameraRig";
import { flightPointAt } from "./flightPath";

/** Room the lens needs; below this it is clipping the world. */
export const CAMERA_CLEARANCE = 2;
/** Share of the shot that must actually show the subject. */
export const MIN_PATH_VISIBILITY = 0.7;

/** Samples along a shot. Enough to catch a wall crossed mid-shot. */
const PATH_SAMPLES = 9;

export interface PathReport {
  samples: number;
  /** Samples whose camera is inside the world. */
  buried: number;
  /** Samples that can see the subject. */
  seen: number;
  visibility: number;
  ok: boolean;
}

/**
 * The camera positions a shot will visit, with what it looks at.
 *
 * Mirrors the rig: a fixedOrbit camera sits at (sin θ, cos θ)·r from
 * the centre, lifted by `liftFactor·r` above the look point, and θ
 * advances at `angularSpeed` per demo second. Returns null for shot
 * kinds whose path depends on where a player goes.
 */
/**
 * A camera position that came from `shotPoseAt`.
 *
 * The brand is not decoration. Every serious camera bug in this system
 * has been one fact expressed twice, and the fix each time was to route
 * both callers through a single definition — but nothing stopped the
 * next caller from writing the arithmetic out again. A plain
 * `DirectorVec3` cannot say where it came from; this can, and
 * `placeCamera` accepts nothing else. Re-deriving a position now fails
 * to compile rather than failing in front of a viewer.
 */
export type SolvedEye = DirectorVec3 & { readonly __solvedEye: unique symbol };
export type SolvedAim = DirectorVec3 & { readonly __solvedAim: unique symbol };

export interface ShotPose {
  eye: SolvedEye;
  aim: SolvedAim;
}

/**
 * Write a solved pose onto a camera. Torque (x, y, z) → three (y, z, x).
 *
 * The ONLY way the director poses a camera for a shot whose path is
 * known up front. Anything else would have to manufacture a `SolvedEye`
 * or a `SolvedAim`, which only `shotPoseAt` produces.
 */
export function placeCamera(
  camera: { position: { set: (x: number, y: number, z: number) => void } },
  eye: SolvedEye,
  lift = 0,
): void {
  camera.position.set(eye[1], eye[2] + lift, eye[0]);
}

/**
 * Point a camera at a solved aim, via a scratch vector the caller owns.
 *
 * Shots that track a LIVE subject (a dropped flag sliding downhill)
 * steer their own aim and do not come through here — that is a runtime
 * concern with no plan-time counterpart, and so nothing to disagree
 * with.
 */
export function aimCamera(
  camera: { lookAt: (v: Vector3) => void },
  aim: SolvedAim,
  scratch: Vector3,
): void {
  scratch.set(aim[1], aim[2], aim[0]);
  camera.lookAt(scratch);
}

/**
 * Live state only the running rig has.
 *
 * A fixed orbit integrates its own bearing frame by frame, and the
 * visibility rail may re-solve the standoff, height or anchor mid-shot.
 * Plan-time validation passes none of this and gets the pose as
 * planned; the rig passes what it currently holds.
 */
export interface ShotPoseLive {
  angle?: number;
  radius?: number;
  heightScale?: number;
  anchor?: DirectorVec3;
}

/**
 * WHERE THE CAMERA IS AND WHAT IT LOOKS AT, at fraction `f` through a
 * shot. Torque space.
 *
 * This is the single definition, and it exists because every place the
 * two were written separately, they drifted:
 *
 *   - the eye differed by exactly `ORBIT_LOOK_LIFT`, so every fixed
 *     shot was certified at a height it never occupied (a chest-height
 *     portrait actually flew underground),
 *   - the aim was the rig's two-unit default on one side and the
 *     shot's own `lookLift` on the other, so the planner approved a
 *     framing the rail then rejected a beat into the shot,
 *   - the sweep's aim was interpolated in both places, by different
 *     parameters.
 *
 * Returns null for shots whose path is not known up front — a follow
 * or a dolly goes where its subject goes.
 */
export function shotPoseAt(
  shot: Shot,
  f: number,
  live?: ShotPoseLive,
): ShotPose | null {
  if (shot.kind === "fixedOrbit") {
    const base = live?.angle ?? shot.staged?.angle ?? shot.startAngle ?? 0;
    const angle =
      live?.angle != null
        ? base
        : base + (shot.angularSpeed ?? 0) * (shot.endSec - shot.startSec) * f;
    const centre = live?.anchor ?? shot.staged?.anchor ?? shot.center;
    return {
      eye: orbitEyeAt(shot, angle, [0, 0, 0], live) as SolvedEye,
      // A portrait looks at a chest, not at the two-unit default that
      // sits on top of its subject's head.
      aim: [
        centre[0],
        centre[1],
        centre[2] + (shot.lookLift ?? ORBIT_LOOK_LIFT),
      ] as SolvedAim,
    };
  }
  if (shot.kind === "sweep") {
    // `f` is the fraction along the PATH, not through the clock. The
    // caller converts: the rig eases time into path (see sweepProgress),
    // validation walks the path evenly. Easing inside here made the
    // check sample uniformly in TIME, which on a decelerating shot
    // bunches the samples at the ends and stepped clean over the ridge
    // in the middle.
    const p = f;
    const to = shot.targetTo ?? shot.target;
    const eye = flightPointAt(shot, p, [0, 0, 0]);
    const aim: DirectorVec3 = [
      shot.target[0] + (to[0] - shot.target[0]) * p,
      shot.target[1] + (to[1] - shot.target[1]) * p,
      shot.target[2] + (to[2] - shot.target[2]) * p,
    ];
    if (shot.maxPitch != null) capPitch(eye, aim, shot.maxPitch, p);
    return { eye: eye as SolvedEye, aim: aim as SolvedAim };
  }
  return null;
}

/**
 * Raise a sweep's aim so the camera looks down no steeper than
 * `maxPitch`. Faded out over the first and last `PITCH_CAP_RAMP` of the
 * path, so the shot still opens and arrives exactly on its targets —
 * which is what its path check judges it on.
 */
function capPitch(
  eye: DirectorVec3,
  aim: DirectorVec3,
  maxPitch: number,
  p: number,
): void {
  const ramp = Math.min(1, Math.min(p, 1 - p) / PITCH_CAP_RAMP);
  if (ramp <= 0) return;
  const horiz = Math.hypot(aim[0] - eye[0], aim[1] - eye[1]);
  const floor = eye[2] - horiz * Math.tan(maxPitch);
  if (aim[2] < floor) aim[2] += (floor - aim[2]) * ramp;
}

/** Share of a capped sweep's path over which the cap fades in and out. */
const PITCH_CAP_RAMP = 0.15;

/**
 * The poses a shot will pass through, evenly sampled ALONG THE PATH.
 *
 * Deliberately not sampled in time: easing changes when the camera is
 * somewhere, not where it can be, and stepping through the clock on a
 * decelerating shot crowds the samples at both ends and skips the
 * middle — which is exactly where a ridge sits.
 */
export function shotCameraPath(
  shot: Shot,
  samples = PATH_SAMPLES,
): ShotPose[] | null {
  const out: ShotPose[] = [];
  for (let i = 0; i < samples; i++) {
    const pose = shotPoseAt(shot, samples === 1 ? 0 : i / (samples - 1));
    if (!pose) return null;
    out.push(pose);
  }
  return out;
}

/** What a shot is trying to show, for the visibility check. */
export function shotSubjectOf(shot: Shot): ShotSubject | null {
  switch (shot.kind) {
    case "followFlag":
      return { type: "flag", slot: shot.slot };
    case "followPlayer":
      return { type: "player", targetId: shot.targetId };
    case "dolly":
      return shot.subject;
    case "fixedOrbit":
      return shot.lookSubject ?? null;
    default:
      return null;
  }
}

/** Is the camera inside the world here? */
export function cameraBuried(eye: DirectorVec3): boolean {
  // Architecture only. The hardware being filmed sits in these rooms,
  // and counting it would reject every interior framing.
  return pointObstructed(eye, CAMERA_CLEARANCE, { includeStatics: false });
}

/**
 * Can this camera see that subject?
 *
 * A buried camera sees NOTHING, however clear its rays come back — the
 * rays come back clear precisely because it is inside a solid.
 */
export function subjectVisible(eye: DirectorVec3, aim: DirectorVec3): boolean {
  if (cameraBuried(eye)) return false;
  // THE SAME TEST THE RUNTIME USES, not a second opinion. These were
  // separate implementations whose tolerances ran in different
  // directions — a lateral halo here, a vertical spread there — so the
  // planner certified placements the runtime then rejected a beat into
  // the shot, and the viewer saw the camera correct itself.
  _fromThree.set(eye[1], eye[2], eye[0]);
  _toThree.set(aim[1], aim[2], aim[0]);
  return !subjectViewBlocked(_fromThree, _toThree);
}
const _fromThree = new Vector3();
const _toThree = new Vector3();

/** Walk a shot's path and report whether it is worth broadcasting. */
export function inspectShot(shot: Shot): PathReport | null {
  const path = shotCameraPath(shot);
  if (!path) return null;
  // An establishing fly-by is judged on its ENDS. Its aim slides from
  // the near landmark to the far one, and the straight line between two
  // flag stands runs through the hill in the middle — so asking whether
  // each intermediate aim point is visible asks about a point inside
  // the ground. What the shot promises is: open on the near one, arrive
  // on the far one, and never touch the world in between.
  if (shot.kind === "sweep" && shot.via && shot.via.length > 0) {
    const buriedAnywhere = path.filter((s) => cameraBuried(s.eye)).length;
    const first = path[0];
    const last = path[path.length - 1];
    const opensOn = subjectVisible(first.eye, shot.target);
    const arrivesOn = subjectVisible(last.eye, shot.targetTo ?? shot.target);
    const ends = (opensOn ? 1 : 0) + (arrivesOn ? 1 : 0);
    return {
      samples: path.length,
      buried: buriedAnywhere,
      seen: ends,
      visibility: ends / 2,
      ok: buriedAnywhere === 0 && opensOn && arrivesOn,
    };
  }
  // A flyover aims at the horizon, not at anything: it is judged on
  // whether the camera stays out of the world, nothing more.
  const headingOnly = shot.kind === "sweep" && shot.aimIsHeading === true;
  let buried = 0;
  let seen = 0;
  for (const s of path) {
    if (cameraBuried(s.eye)) buried++;
    else if (headingOnly || subjectVisible(s.eye, s.aim)) seen++;
  }
  const visibility = seen / path.length;
  return {
    samples: path.length,
    buried,
    seen,
    visibility,
    // No frame may be inside the world, and most of the shot has to
    // show what it is a shot OF.
    ok: buried === 0 && visibility >= MIN_PATH_VISIBILITY,
  };
}

/**
 * Did the PLANNER already solve this shot's camera?
 *
 * Two shot kinds record it differently — an orbit carries its solved
 * `staged` placement, a sweep sets `pathSolved` — but it is one idea,
 * and the staging pass must honour it either way. Naming it once is
 * what stops the next pass from "refining" a placement that was chosen
 * deliberately: the lift ladder hoisted chest-height player pans to
 * five metres, and solvePlacement re-derived a basement camera into the
 * ceiling, both by re-solving work that was already done.
 */
export function plannerSolved(shot: Shot): boolean {
  if (shot.kind === "fixedOrbit") return shot.staged != null;
  if (shot.kind === "sweep") return shot.pathSolved === true;
  return false;
}
