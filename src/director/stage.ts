/**
 * The staging pass: solve every fixedOrbit placement — and verify every
 * follow shot — against REAL geometry at plan time, across the shot's
 * whole duration.
 *
 * The planner (planShots) is pure and geometry-blind; the runtime used
 * to compensate with a reactive search at each cut that could silently
 * fail ("a bad angle still beats no shot") — measured at 24.5% of
 * airtime with the subject's sightline blocked. This pass runs where
 * plans are actually made (the app and the backfill browser, with the
 * collision world loaded) and has what the runtime never does: the
 * subject's entire future path. Placements are chosen by how much of
 * the shot they can actually SEE, and a location that admits no
 * watchable camera changes the shot instead of shipping it — pull in
 * tight, watch the doorway, follow the subject, or move to what the
 * subject is shooting at.
 *
 * Solved placements ride the plan as additive `staged` fields (cast
 * format unchanged); plans without them fall back to the legacy
 * runtime search.
 */
import { Vector3 } from "three";
import type {
  DirectorDataset,
  DirectorVec3,
  Shot,
  ShotPlan,
  StagedPlacement,
} from "./types";
import {
  buildFlagTracks,
  playersAtSecFor,
  sampleAt,
  type FlagTrack,
  type PlayersAtSec,
  playerTracksFor,
} from "./dataset";
import { frameScore, type SalientEntity } from "./frameScore";
import { castWorldRay } from "../collision/worldCollision";
import {
  cameraBuried,
  inspectShot,
  plannerSolved,
  subjectVisible,
} from "./shotPath";
import {
  AIM_TOWARD_MIN_RANGE,
  clearStandoffWide,
  isRoofed,
  OCCLUSION_ANGLE_OFFSETS,
  OCCLUSION_HEIGHT_BOOSTS,
  ORBIT_HEIGHT_FACTOR,
  ORBIT_LOOK_LIFT,
  orbitLiftFactor,
  STANDOFF_MIN,
  STANDOFF_MIN_SCALE,
  subjectViewBlocked,
  SUBJECT_MAX_RANGE,
  surfaceLiftedAnchor,
} from "./cameraRig";
import {
  DIRECTOR_TIGHT_SHOT_SHARE,
  DIRECTOR_DIST_STAND,
  DIRECTOR_PITCH_STAND,
  DIRECTOR_DIST_CHASE,
  DIRECTOR_PITCH_CHASE,
  DIRECTOR_BOMBARDMENT_CAM_RADIUS,
  DIRECTOR_BOMBARDMENT_CAM_HEIGHT,
  DIRECTOR_DOORWAY_HEIGHT,
  DIRECTOR_DOORWAY_RADIUS,
} from "./tunables";
import { orbitPullbackDir } from "../stream/streamHelpers";

/** How often along a shot the subject's visibility is sampled. */
const STAGE_SAMPLE_SEC = 1;
/**
 * Absolute ceiling on a solved camera's height above its anchor. The
 * composition score otherwise LIKES altitude — visibility is easy from
 * the sky, the openness fan is all clear, and a wide down-looking
 * frustum catches plenty of entities — which is exactly the blimp view
 * the rig's ORBIT_MAX_HEIGHT existed to prevent. Slightly above that
 * cap to leave the escalation boosts some room over walls.
 */
const STAGE_MAX_CAMERA_LIFT = 32;
/** A placement must see its subject at least this fraction of the shot. */
const STAGE_VISIBILITY_FLOOR = 0.7;
/** Tight-repair framing: close orbits that work indoors, tried largest
 *  first — the last rung fits inside a small flag room. */
const STAGE_TIGHT_RADIUS_FRACTION = 0.3;
const STAGE_TIGHT_LIFT = 0.25;
/** Follow verification: bearings tried around the subject, the pull-in
 *  rungs when the shot's own distance sees nothing, and the closest a
 *  follow may ride. */
const STAGE_FOLLOW_YAWS = 8;
const STAGE_FOLLOW_PULL_FRACTIONS = [0.6, 0.35];
const STAGE_FOLLOW_MIN_DISTANCE = 9;

export interface StageReport {
  fixedShots: number;
  /** Sweep paths verified / lifted clear / trimmed to their clear
   *  segment / converted to a solved orbit when nothing flew clean. */
  sweepClean: number;
  sweepLifted: number;
  sweepTrimmed: number;
  sweepConverted: number;
  /** Placement solved by the planner against the free-space grid and
   *  kept as-is — no search needed here. */
  presolved: number;
  /** Planned bearing verified as-is. */
  clean: number;
  /** A different bearing/height/standoff was needed. */
  adjusted: number;
  /** Pulled in to a tight interior orbit. */
  tight: number;
  /** Roofed anchor with no watchable orbit: became a doorway watch. */
  doorway: number;
  /** Converted to a follow shot on the look-subject. */
  follow: number;
  /** Identical to the shot before it, and folded into it. */
  merged: number;
  /** Failed the whole-path check after staging and was dropped. */
  unwatchable: number;
  /** Nothing reached the floor; left for the runtime's best effort. */
  unsolved: number;
  /** Follow shots checked / verified at their planned distance. */
  followShots: number;
  followClean: number;
  /** Follow distance shortened so the orbit fits the subject's space. */
  followPulledIn: number;
  /** Unwatchable subject with a known aim target: moved there. */
  followConverted: number;
  /** Unwatchable follow left as planned (runtime rails do their best). */
  followUnsolved: number;
}

interface PathSample {
  timeSec: number;
  pos: Vector3;
}

const _dir = new Vector3();
const _eye = new Vector3();
const _anchorThree = new Vector3();

/** Fold one tally into another, for a plan staged in slices. */
export function addReports(into: StageReport, from: StageReport): StageReport {
  for (const key of Object.keys(into) as (keyof StageReport)[]) {
    into[key] += from[key];
  }
  return into;
}

/** A zeroed tally. */
export function emptyReport(): StageReport {
  return {
    fixedShots: 0,
    sweepClean: 0,
    sweepLifted: 0,
    sweepTrimmed: 0,
    sweepConverted: 0,
    presolved: 0,
    clean: 0,
    adjusted: 0,
    tight: 0,
    doorway: 0,
    follow: 0,
    unsolved: 0,
    merged: 0,
    unwatchable: 0,
    followShots: 0,
    followClean: 0,
    followPulledIn: 0,
    followConverted: 0,
    followUnsolved: 0,
  };
}

/** Set up the per-run staging context the pass functions read. */
function openStageContext(
  dataset: DirectorDataset,
  tracks: Map<number, FlagTrack>,
): void {
  const vehiclesBySec = new Map<number, Vector3[]>();
  for (const v of dataset.vehicles ?? []) {
    const sec = Math.round(v.timeSec);
    let list = vehiclesBySec.get(sec);
    if (!list) vehiclesBySec.set(sec, (list = []));
    list.push(new Vector3(v.pos[1], v.pos[2], v.pos[0]));
  }
  _stageCtx = {
    tightAcc: 0,
    playersAtSec: playersAtSecFor(dataset),
    tracks,
    standsThree: dataset.flagStands.map(
      (st) => new Vector3(st.pos[1], st.pos[2], st.pos[0]),
    ),
    vehiclesBySec,
    salientBySec: new Map(),
    fog: dataset.visibility?.fogDistance,
  };
}

/**
 * Solve the plan's shots in place. Mutates shots (attaching `staged`,
 * setting `doorwayOf`, shortening follow distances, or replacing the
 * element with a different mechanism that keeps its scene/timing
 * identity) and returns the tally.
 */
export function stagePlan(
  plan: ShotPlan,
  dataset: DirectorDataset,
): StageReport {
  const report = emptyReport();
  const tracks = buildFlagTracks(dataset);
  openStageContext(dataset, tracks);
  try {
    for (let i = 0; i < plan.shots.length; i++) {
      stageSweepShot(plan, i, tracks, dataset, report);
    }
    for (let i = 0; i < plan.shots.length; i++) {
      stageFixedShot(plan, i, tracks, dataset, report);
    }
    // After the fixed pass: its repairs may have created follow shots,
    // which get verified like the planner's own.
    for (let i = 0; i < plan.shots.length; i++) {
      stageFollowShot(plan, i, tracks, dataset, report);
    }
  } finally {
    _stageCtx = null;
  }
  // LAST WORD. Every pass above reasons about a placement; this one
  // walks the camera path each shot will actually fly and throws out
  // what does not hold up. A shot that spends its duration inside a
  // wall, or never shows the thing it is a shot OF, does not ship.
  // Nothing is playing here, so nothing is off limits.
  addReports(report, auditAhead(plan, dataset, -Infinity));
  return report;
}

/**
 * The cross-shot passes, over the part of the plan still ahead.
 *
 * Their VERDICTS never needed the future — whether a camera is inside a
 * wall, or can see the point it aims at, is settled by terrain, by
 * interiors and by a fixed aim, none of which the rest of the match
 * changes. What kept these to the end was the side effect: both close
 * the gap they leave by rewriting a neighbour's timing, and a shot the
 * playhead has reached cannot be rewritten. Hence the floor.
 */
export function auditAhead(
  plan: ShotPlan,
  dataset: DirectorDataset,
  mutableFromSec: number,
  /** While the switcher is still running, its LAST shot is still being
   *  framed — its end time is provisional and it is the element the
   *  switcher itself is holding. Leave it alone until it closes. */
  openTail = false,
): StageReport {
  const report = emptyReport();
  const tracks = buildFlagTracks(dataset);
  openStageContext(dataset, tracks);
  const tail = openTail ? plan.shots.pop() : undefined;
  try {
    mergeConsecutiveDuplicates(plan, report, mutableFromSec);
    dropUnwatchable(plan, report, mutableFromSec);
    closeSeams(plan, mutableFromSec);
  } finally {
    if (tail) plan.shots.push(tail);
    _stageCtx = null;
  }
  return report;
}

/**
 * Solve the shots at `indices`, for a cast being planned as it plays.
 *
 * Per-shot passes only; the cross-shot ones are `auditAhead`, which
 * needs to know where the playhead is.
 */
export function stageShots(
  shots: Shot[],
  indices: number[],
  dataset: DirectorDataset,
): StageReport {
  const report = emptyReport();
  const plan: ShotPlan = { shots, gameMode: "ctf" } as ShotPlan;
  const tracks = buildFlagTracks(dataset);
  openStageContext(dataset, tracks);
  try {
    for (const i of indices) stageSweepShot(plan, i, tracks, dataset, report);
    for (const i of indices) stageFixedShot(plan, i, tracks, dataset, report);
    for (const i of indices) stageFollowShot(plan, i, tracks, dataset, report);
  } finally {
    _stageCtx = null;
  }
  return report;
}

/**
 * What a shot LOOKS like, for spotting a repeat.
 *
 * Timing, reason and role are deliberately excluded: two cuts a viewer
 * cannot tell apart are the same shot however differently the plan
 * describes them.
 */
function framingKey(shot: Shot): string {
  const r = (v: number) => Math.round(v * 100) / 100;
  const p = (v: DirectorVec3) => v.map(r).join(",");
  switch (shot.kind) {
    case "fixedOrbit":
      return [
        "orbit",
        p(shot.staged?.anchor ?? shot.center),
        r(shot.staged?.radius ?? shot.radius),
        r(shot.staged?.angle ?? shot.startAngle ?? 0),
        r(shot.angularSpeed ?? 0),
        r(shot.staged?.liftFactor ?? shot.heightFactor ?? 0),
      ].join("|");
    case "sweep":
      return [
        "sweep",
        p(shot.from),
        p(shot.to),
        p(shot.target),
        shot.targetTo ? p(shot.targetTo) : "-",
      ].join("|");
    case "followFlag":
      return `flag|${shot.slot}|${r(shot.distance ?? 0)}|${r(shot.pitch ?? 0)}`;
    case "followPlayer":
      return `player|${shot.targetId}|${r(shot.distance ?? 0)}|${r(shot.pitch ?? 0)}`;
    case "dolly":
      return `dolly|${JSON.stringify(shot.subject)}`;
  }
}

/**
 * Fold a shot into its predecessor when the two are the same picture.
 *
 * Cutting from a shot to an identical one is not a cut — it is a hitch,
 * and it happened whenever a line-up block re-armed and replayed its
 * first pass. Rather than police every caller, collapse them here: one
 * longer shot is what was actually wanted.
 */
function mergeConsecutiveDuplicates(
  plan: ShotPlan,
  report: StageReport,
  /** Shots starting before this have been handed to the playhead;
   *  rewriting them is not an option however wrong they are. */
  mutableFromSec = -Infinity,
): void {
  const keep: Shot[] = [];
  let lastKey: string | null = null;
  for (const shot of plan.shots) {
    const key = framingKey(shot);
    const prev = keep[keep.length - 1];
    // Both halves must still be rewritable: the merge stretches `prev`,
    // and a shot the playhead has reached is on screen at its planned
    // length.
    if (
      prev &&
      key === lastKey &&
      shot.startSec >= mutableFromSec &&
      prev.startSec >= mutableFromSec
    ) {
      report.merged++;
      prev.endSec = Math.min(
        Math.max(prev.endSec, shot.endSec),
        prev.startSec + maxHold(prev),
      );
      continue;
    }
    keep.push(shot);
    lastKey = key;
  }
  // IN PLACE, not a reassignment. While streaming, this array is the
  // switcher's own — handing `plan` a fresh one leaves the switcher
  // appending to the array nobody is reading, so every audit is
  // discarded and redone on the next slice.
  plan.shots.length = 0;
  plan.shots.push(...keep);
}

/**
 * Leave no holes in the timeline.
 *
 * `ShotPlan` promises shots that cover their span without gaps, and the
 * runtime relies on it — a hole is a shot index the playhead falls
 * through, which reads as the broadcast ending. Dropping a shot cannot
 * always hand its time to a neighbour (the neighbour may be capped, or
 * may fail its own check once stretched), so whatever is left over is
 * absorbed here by pulling the following shot back to meet the one
 * before it.
 *
 * Safe for orbits and sweeps alike: a shot's camera path is
 * parameterised by fraction, so changing when it starts moves when the
 * camera is somewhere, never where it can be.
 */
function closeSeams(plan: ShotPlan, mutableFromSec: number): void {
  for (let i = 1; i < plan.shots.length; i++) {
    const prev = plan.shots[i - 1];
    const shot = plan.shots[i];
    if (shot.startSec <= prev.endSec) continue;
    if (shot.startSec < mutableFromSec) continue;
    shot.startSec = prev.endSec;
  }
}

/**
 * The point a sweep is actually ABOUT.
 *
 * `target` is where the aim STARTS; with `targetTo` it travels, and the
 * subject sits in the middle of that travel.
 */
export function midAim(shot: Extract<Shot, { kind: "sweep" }>): DirectorVec3 {
  const to = shot.targetTo;
  if (!to) return shot.target;
  return [
    (shot.target[0] + to[0]) / 2,
    (shot.target[1] + to[1]) / 2,
    (shot.target[2] + to[2]) / 2,
  ];
}

/**
 * The longest a shot of this kind should ever run.
 *
 * Absorbing a dropped neighbour's time is right in small doses and
 * absurd in large ones: a portrait is a beat, not a vigil.
 */
function maxHold(shot: Shot): number {
  switch (shot.role) {
    case "signing":
    case "rosterCloseUp":
      return 14;
    case "rosterWide":
    case "tourHold":
    case "tourMove":
      return 26;
    default:
      return 45;
  }
}

/**
 * Remove shots that fail their own path check, closing the gap.
 *
 * Timing is contiguous, so a dropped shot's time goes to the one before
 * it (or the one after, at the head of the plan) rather than leaving a
 * hole for the runtime to sit through.
 */
function dropUnwatchable(
  plan: ShotPlan,
  report: StageReport,
  mutableFromSec = -Infinity,
): void {
  const keep: Shot[] = [];
  for (let i = 0; i < plan.shots.length; i++) {
    const shot = plan.shots[i];
    const verdict = shot.startSec >= mutableFromSec ? inspectShot(shot) : null;
    if (verdict && !verdict.ok) {
      const prev = keep[keep.length - 1];
      if (
        prev &&
        prev.startSec >= mutableFromSec &&
        prev.endSec < prev.startSec + maxHold(prev)
      ) {
        // Stretching an orbit swings it further round, which can walk
        // the camera into the wall the shot was avoiding — so put the
        // extension back if it costs the neighbour its own check. And
        // CAP it: several dropped shots in a row all landed on the same
        // neighbour, which turned a six-second portrait into a
        // seventy-two-second stare.
        const was = prev.endSec;
        prev.endSec = Math.min(
          Math.max(prev.endSec, shot.endSec),
          prev.startSec + maxHold(prev),
        );
        if (inspectShot(prev)?.ok !== false) {
          report.unwatchable++;
          continue;
        }
        prev.endSec = was;
      }
      // Nothing that can absorb the time before it: let the next shot
      // start early instead.
      const next = plan.shots[i + 1];
      if (next) {
        next.startSec = Math.min(next.startSec, shot.startSec);
        report.unwatchable++;
        continue;
      }
      // Nothing on either side to give the time to (the last shot of a
      // finished plan): it stays, and is not counted as dropped.
    }
    keep.push(shot);
  }
  // IN PLACE, not a reassignment. While streaming, this array is the
  // switcher's own — handing `plan` a fresh one leaves the switcher
  // appending to the array nobody is reading, so every audit is
  // discarded and redone on the next slice.
  plan.shots.length = 0;
  plan.shots.push(...keep);
}

/** Sweep lifts tried for the wide passes; close-ups are LOW on
 *  purpose, so they only get gentle lifts before being trimmed to
 *  their clear stretch instead. */
const SWEEP_STAGE_LIFTS = [0, 3, 7, 14, 25];
const SWEEP_CLOSE_LIFTS = [0, 1.5, 3];
/** A trimmed close-up keeping less than this of its travel is no
 *  longer a pan along the ranks. */
const SWEEP_MIN_KEPT_FRACTION = 0.4;

/** Whether the straight flight path (Torque a→b) runs clear of world
 *  geometry — the camera itself must never enter a wall. */
function sweepPathClear(a: DirectorVec3, b: DirectorVec3): boolean {
  return castWorldRay(a, b, { includeStatics: true }) == null;
}

/** The PLAYERS a sweep is about: bodies near its aim line at the
 *  shot's midpoint. The pass is judged on sight of THEM — an aim point
 *  can be "visible" past a roof lip while every model behind it is
 *  masked (IFF markers drawing through geometry hide the failure). */
function sweepAudience(
  shot: Extract<Shot, { kind: "sweep" }>,
  dataset: DirectorDataset,
): DirectorVec3[] {
  const mid = Math.round((shot.startSec + shot.endSec) / 2);
  const players = playersAtSecFor(dataset).get(mid) ?? [];
  const a = shot.target;
  const b = shot.targetTo ?? shot.target;
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const len2 = abx * abx + aby * aby;
  const out: DirectorVec3[] = [];
  for (const p of players) {
    const t =
      len2 > 1e-6
        ? Math.max(
            0,
            Math.min(
              1,
              ((p.pos[0] - a[0]) * abx + (p.pos[1] - a[1]) * aby) / len2,
            ),
          )
        : 0;
    const cx = a[0] + abx * t;
    const cy = a[1] + aby * t;
    if (Math.hypot(p.pos[0] - cx, p.pos[1] - cy) <= 35) out.push(p.pos);
  }
  return out;
}

/** Uninterrupted line of sight from a path point to a player MODEL
 *  (chest height), the subject's immediate surroundings forgiven. */
function playerVisibleFrom(eye: DirectorVec3, pos: DirectorVec3): boolean {
  return subjectVisible(eye, [pos[0], pos[1], pos[2] + 1]);
}

/** A candidate pass must actually SEE its audience for most of the
 *  flight — at least one unmasked player model from two-thirds of the
 *  sampled path points. Empty audience abstains (target checks rule). */
const AUDIENCE_SAMPLES = 9;

/** Per-sample audience visibility along a flight path. */
function audienceProfile(
  from: DirectorVec3,
  to: DirectorVec3,
  audience: readonly DirectorVec3[],
): boolean[] {
  const profile: boolean[] = [];
  for (let k = 0; k < AUDIENCE_SAMPLES; k++) {
    const f = k / (AUDIENCE_SAMPLES - 1);
    const eye: DirectorVec3 = [
      from[0] + (to[0] - from[0]) * f,
      from[1] + (to[1] - from[1]) * f,
      from[2] + (to[2] - from[2]) * f,
    ];
    profile.push(audience.some((p) => playerVisibleFrom(eye, p)));
  }
  return profile;
}

/**
 * Whether a pass sees its audience well enough to air. The killer
 * failure is the BLIND TAIL — a close pan that ends flying into a wall
 * with its subjects masked — so the final stretch is a hard rule, on
 * top of a moderate overall floor (brief mid-pass occlusion by a
 * pillar is life among buildings).
 */
function sweepSeesAudience(
  from: DirectorVec3,
  to: DirectorVec3,
  audience: readonly DirectorVec3[],
  minFraction = 0.66,
  requireSightedTail = false,
): boolean {
  if (audience.length === 0) return true;
  const profile = audienceProfile(from, to, audience);
  const seen = profile.filter(Boolean).length;
  if (seen / profile.length < minFraction) return false;
  if (requireSightedTail) {
    const tail = profile.slice(-3);
    if (tail.filter(Boolean).length < 2 || !profile[profile.length - 1]) {
      return false;
    }
  }
  return true;
}

/**
 * Verify a sweep's FLIGHT PATH against geometry — the runtime only
 * ever checked what the endpoints could see, so a roster pass across a
 * base flew straight through the buildings. Lift the whole path until
 * it flies clear; trim a low close-up to the clear stretch around its
 * midpoint; when nothing flies, hand the moment to a solved orbit of
 * the same subject.
 */
function stageSweepShot(
  plan: ShotPlan,
  i: number,
  tracks: Map<number, FlagTrack>,
  dataset: DirectorDataset,
  report: StageReport,
): void {
  const shot = plan.shots[i];
  if (shot.kind !== "sweep") return;
  // Already solved by the planner; see plannerSolved. Re-lifting is not
  // a refinement — the lift ladder hoisted player pans deliberately
  // placed at chest height up to nearly five metres.
  if (plannerSolved(shot)) {
    report.sweepClean++;
    return;
  }
  const closeUp = shot.role === "rosterCloseUp";
  const lifts = closeUp ? SWEEP_CLOSE_LIFTS : SWEEP_STAGE_LIFTS;
  const audience = sweepAudience(shot, dataset);
  // A roster pass exists to show PLAYERS: if nobody is near its aim
  // line by mid-shot (a countdown restart scattered the line-up), the
  // pass films an empty parade ground — hand it to a solved orbit.
  // A roster pass specifically — a sweep ACROSS PLAYERS. Matching all
  // of /Pre-match/ also caught map fly-throughs, which have no audience
  // by design, so their clearance test was skipped and every one was
  // converted to an orbit.
  const rosterPass =
    shot.role === "rosterWide" || shot.role === "rosterCloseUp";
  if (!rosterPass || audience.length > 0) {
    for (const lift of lifts) {
      const from: DirectorVec3 = [
        shot.from[0],
        shot.from[1],
        shot.from[2] + lift,
      ];
      const to: DirectorVec3 = [shot.to[0], shot.to[1], shot.to[2] + lift];
      const mid: DirectorVec3 = [
        (from[0] + to[0]) / 2,
        (from[1] + to[1]) / 2,
        (from[2] + to[2]) / 2,
      ];
      const endTarget = shot.targetTo ?? shot.target;
      if (
        sweepPathClear(from, to) &&
        subjectVisible(from, shot.target) &&
        subjectVisible(to, endTarget) &&
        subjectVisible(mid, shot.target) &&
        sweepSeesAudience(from, to, audience, closeUp ? 0.75 : 0.66, closeUp)
      ) {
        shot.pathSolved = true;
        if (lift > 0) {
          shot.from = from;
          shot.to = to;
          report.sweepLifted++;
        } else {
          report.sweepClean++;
        }
        return;
      }
    }
  }
  // Trimming applies to any pan that is still worth having in part: a
  // dolly past a turret which clips a wall halfway is fine as the half
  // that flies clean. Gating it on /close-up/ alone meant every
  // pre-match tour move went straight to conversion instead — 41% of
  // the moves planned for the picking period came out as orbits.
  const trimmable = closeUp || shot.role === "tourMove";
  if (trimmable && (!rosterPass || audience.length > 0)) {
    // Find the longest clear stretch containing the midpoint by
    // sampling the path, and keep the pan if enough of it survives.
    const N = 24;
    const point = (f: number): DirectorVec3 => [
      shot.from[0] + (shot.to[0] - shot.from[0]) * f,
      shot.from[1] + (shot.to[1] - shot.from[1]) * f,
      shot.from[2] + (shot.to[2] - shot.from[2]) * f,
    ];
    const clear: boolean[] = [];
    for (let k = 0; k < N; k++) {
      clear.push(sweepPathClear(point(k / N), point((k + 1) / N)));
    }
    let lo = N >> 1;
    let hi = N >> 1;
    while (lo - 1 >= 0 && clear[lo - 1]) lo--;
    while (hi < N && clear[hi]) hi++;
    const kept = (hi - lo) / N;
    if (kept >= SWEEP_MIN_KEPT_FRACTION && hi > lo) {
      let f0 = lo / N;
      let f1 = hi / N;
      const at = (
        f: number,
        a: DirectorVec3,
        b: DirectorVec3,
      ): DirectorVec3 => [
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
      ];
      let from = at(f0, shot.from, shot.to);
      let to = at(f1, shot.from, shot.to);
      // Strip AUDIENCE-BLIND ends off the clear stretch (the "flies
      // into the building" tail) before judging what remains.
      if (audience.length > 0) {
        const profile = audienceProfile(from, to, audience);
        let a = 0;
        let b = profile.length - 1;
        while (a < b && !profile[a]) a++;
        while (b > a && !profile[b]) b--;
        if (b > a && (a > 0 || b < profile.length - 1)) {
          const span = profile.length - 1;
          const g0 = f0 + (f1 - f0) * (a / span);
          const g1 = f0 + (f1 - f0) * (b / span);
          f0 = g0;
          f1 = g1;
          from = at(f0, shot.from, shot.to);
          to = at(f1, shot.from, shot.to);
        }
      }
      const keptAfterBlind = f1 - f0;
      // A clear FLIGHT line is not a shot: the trimmed pass must still
      // SEE the players (a pan skimming a roof stares at the roof).
      if (
        keptAfterBlind >= SWEEP_MIN_KEPT_FRACTION &&
        sweepSeesAudience(from, to, audience, 0.75, true)
      ) {
        // The aim window pans with the travel — trim it in proportion.
        if (shot.targetTo) {
          const target = at(f0, shot.target, shot.targetTo);
          const targetTo = at(f1, shot.target, shot.targetTo);
          shot.target = target;
          shot.targetTo = targetTo;
        }
        shot.from = from;
        shot.to = to;
        shot.pathSolved = true;
        report.sweepTrimmed++;
        return;
      }
    }
  }
  // A roster wide is a pass over a squad and its base from above. When
  // that cannot fly clean the squad has gathered INSIDE the base, and
  // an orbit on their centroid is a camera in a room — Raindance's
  // Inferno line-up sat 2.6 units under the ceiling, aimed at a point
  // 1.3 units from a wall, and passed every clearance test. There is
  // no wide of an indoor squad: leave it for the audit to drop, and the
  // close-ups, framed from the players' own facings, carry the roster.
  if (shot.role === "rosterWide") return;
  // Nothing flies clean here: a solved orbit of the same subject beats
  // a camera inside a wall.
  // WHAT THE SWEEP IS OF, which is not always where it starts looking.
  // A pan deliberately aims off to one side at first so the subject
  // crosses the frame — its `target` is half a pan-width away from the
  // thing itself. Centring an orbit there put the generator beside the
  // shot and slowly rotated it out of view.
  //
  // The subject is the middle of the aim's travel. (A fly-by's aim runs
  // from one flag to the other, where the midpoint would be mid-map —
  // but those are planner-solved and never reach this conversion.)
  const center = midAim(shot);
  plan.shots[i] = {
    kind: "fixedOrbit",
    center,
    lookLift: 0,
    radius: DIRECTOR_DOORWAY_RADIUS,
    angularSpeed: 0.06,
    heightFactor: DIRECTOR_DOORWAY_HEIGHT,
    ...storyOf(shot),
    // The camera no longer travels, so a reason that promised a pass
    // ("over the map toward the Storm generator") would now describe a
    // shot that orbits — and commentary reads this text.
    reason: shot.reason
      .replace(/\bover the map toward the\b/i, "holding on the")
      .replace(/\bacross the map, .*? to (?:the )?/i, "holding on the ")
      .replace(/\bpast the\b/i, "holding on the")
      .replace(/\btracking across the\b/i, "holding on the")
      .replace(/\bclosing on the\b/i, "holding on the"),
  };
  report.sweepConverted++;
  stageFixedShot(plan, i, tracks, dataset, report);
}

/**
 * The half of a shot that survives a change of camera mechanism: its
 * timing and what it is about. Every conversion below spreads this,
 * so a field added to the story (the topic, most recently) cannot be
 * lost by one of them.
 */
function storyOf(shot: Shot) {
  return {
    startSec: shot.startSec,
    endSec: shot.endSec,
    transitionIn: "cut" as const,
    reason: shot.reason,
    topic: shot.topic,
    scene: shot.scene,
    coverageCutIn: shot.coverageCutIn,
  };
}

/** Bresenham distribution of the tight-shot share across framings. */
function takeTightFraming(): boolean {
  const ctx = _stageCtx;
  if (!ctx) return false;
  ctx.tightAcc += DIRECTOR_TIGHT_SHOT_SHARE;
  if (ctx.tightAcc >= 1) {
    ctx.tightAcc -= 1;
    return true;
  }
  return false;
}

function stageFixedShot(
  plan: ShotPlan,
  i: number,
  tracks: Map<number, FlagTrack>,
  dataset: DirectorDataset,
  report: StageReport,
): void {
  const shot = plan.shots[i];
  // Doorway watches already frame a door mouth, deliberately not the
  // subject; their placement machinery is dataset-driven and works.
  if (shot.kind !== "fixedOrbit" || shot.doorwayOf) return;
  report.fixedShots++;
  // Already solved by the planner; see plannerSolved. Re-deriving threw
  // that away — solvePlacement casts outward from the anchor, so it
  // cannot express a camera BELOW its subject (the basement floor is
  // immediately in the way) and fell to the tight repair rung, which
  // lifts a fixed +0.25 and buried the eye in the ceiling.
  if (plannerSolved(shot)) {
    report.presolved++;
    return;
  }
  const anchor = surfaceLiftedAnchor(shot.center) ?? shot.center;
  const path = subjectPath(shot, tracks, dataset, anchor);
  const plannedLift = orbitLiftFactor(
    shot.radius,
    shot.heightFactor ?? ORBIT_HEIGHT_FACTOR,
  );
  const best = solvePlacement(shot, anchor, path, shot.radius, plannedLift, {
    // Standoff is part of the composition search: intent first, then a
    // tighter and a wider framing compete on the frame they produce.
    rungs: [1, 0.55, 1.4],
    // Subject framings split hero (tight) vs action (wide) sizes by
    // the tunable share; anonymous area shots stay establishing.
    targetSubjectFraction: shot.lookSubject
      ? shot.radius <= 20 || takeTightFraming()
        ? 0.1
        : 0.055
      : 0.03,
  });
  if (best && best.visibility >= STAGE_VISIBILITY_FLOOR) {
    shot.staged = best;
    if (
      best.angle === (shot.startAngle ?? 0) &&
      best.radius >= shot.radius * 0.999 &&
      best.liftFactor === plannedLift &&
      anchor === shot.center
    ) {
      report.clean++;
    } else {
      report.adjusted++;
    }
    return;
  }
  // Repair ladder: the location admits no watchable orbit at the
  // planned framing. Tight interior-capable orbits first — they keep
  // the fixed-camera cinematography and work inside rooms; the second
  // rung is the smallest orbit the rig allows.
  const tightRadii = [
    Math.max(STANDOFF_MIN + 2, shot.radius * STAGE_TIGHT_RADIUS_FRACTION),
    STANDOFF_MIN + 2,
  ];
  for (const tightRadius of new Set(tightRadii)) {
    const tight = solvePlacement(
      shot,
      anchor,
      path,
      tightRadius,
      STAGE_TIGHT_LIFT,
      {
        targetSubjectFraction: 0.1,
      },
    );
    if (tight && tight.visibility >= STAGE_VISIBILITY_FLOOR) {
      shot.staged = tight;
      report.tight++;
      return;
    }
  }
  // A look-subject the orbit cannot see from anywhere: put the follow
  // machinery on it instead — it rides close and pulls in through the
  // runtime's own visibility rail. Timing, reason and scene facts
  // stay; only the camera mechanism changes.
  if (shot.lookSubject) {
    plan.shots[i] =
      shot.lookSubject.type === "flag"
        ? {
            kind: "followFlag",
            slot: shot.lookSubject.slot,
            distance: DIRECTOR_DIST_STAND,
            pitch: DIRECTOR_PITCH_STAND,
            ...storyOf(shot),
          }
        : {
            kind: "followPlayer",
            targetId: shot.lookSubject.targetId,
            distance: DIRECTOR_DIST_CHASE,
            pitch: DIRECTOR_PITCH_CHASE,
            ...storyOf(shot),
          };
    report.follow++;
    return;
  }
  // An anonymous anchor under a roof: the only broadcastable framing
  // is the building's mouth.
  if (isRoofed(anchor)) {
    shot.doorwayOf = anchor;
    report.doorway++;
    return;
  }
  if (best) shot.staged = best;
  report.unsolved++;
}

/**
 * Verify a follow shot can see its subject FROM THE BEARING ITS AIM
 * ACTUALLY COMMANDS, across the shot — a clear bearing existing
 * somewhere is worthless if the aim machinery never goes there (the
 * lesson of the mortar-crew shots: plenty of open sky behind the crew,
 * camera parked looking across them into their cover). Where the
 * planned aim fails, find one fixed (yaw, distance) that works and
 * rewrite the aim to hold it — seeing the subject beats framing
 * intent, the same trade the runtime rail makes. Where nothing works:
 * a roofed flag hold becomes a doorway watch, a shooter with a known
 * target hands the camera to the impact zone, and anything else is
 * left for the runtime's best effort.
 */
function stageFollowShot(
  plan: ShotPlan,
  i: number,
  tracks: Map<number, FlagTrack>,
  dataset: DirectorDataset,
  report: StageReport,
): void {
  const shot = plan.shots[i];
  if (shot.kind !== "followFlag" && shot.kind !== "followPlayer") return;
  const path = followPath(shot, tracks, dataset);
  if (path.length === 0) return;
  report.followShots++;
  const wanted = shot.distance ?? DIRECTOR_DIST_CHASE;
  const pitch = shot.pitch ?? DIRECTOR_PITCH_CHASE;
  const clearFrom = (
    sample: PathSample,
    yaw: number,
    distance: number,
  ): boolean => {
    orbitPullbackDir(yaw, pitch, _dir);
    const room = clearStandoffWide(sample.pos, _dir, distance);
    if (room < distance * 0.85) return false;
    _eye.copy(sample.pos).addScaledVector(_dir, Math.min(room, distance));
    return !subjectViewBlocked(_eye, sample.pos);
  };
  const anyYawClear = (sample: PathSample, distance: number): boolean => {
    for (let k = 0; k < STAGE_FOLLOW_YAWS; k++) {
      if (clearFrom(sample, (k / STAGE_FOLLOW_YAWS) * Math.PI * 2, distance)) {
        return true;
      }
    }
    return false;
  };
  // The yaw the runtime's aim machinery commands at each sample. Null =
  // unconstrained (aimless drift, or a degenerate bearing the runtime
  // holds through) — any bearing is then in-character.
  const aimYawAt = (idx: number): number | null => {
    const aim = shot.aim;
    const sample = path[idx];
    if (aim?.mode === "hold") return aim.yaw;
    if (aim?.mode === "toward") {
      // Torque coords from the Three-space sample (x = Torque y,
      // z = Torque x); yaw convention matches bearingYaw.
      const dx = aim.target[0] - sample.pos.z;
      const dy = aim.target[1] - sample.pos.x;
      if (Math.hypot(dx, dy) < AIM_TOWARD_MIN_RANGE) return null;
      return Math.atan2(dx, dy);
    }
    if (aim?.mode === "forward" || aim?.mode === "backward") {
      const prev = path[Math.max(0, idx - 1)];
      const next = path[Math.min(path.length - 1, idx + 1)];
      const dx = next.pos.z - prev.pos.z;
      const dy = next.pos.x - prev.pos.x;
      if (Math.hypot(dx, dy) < 1) return null;
      const heading = Math.atan2(dx, dy);
      return aim.mode === "forward" ? heading : heading + Math.PI;
    }
    return null;
  };
  let seen = 0;
  for (let idx = 0; idx < path.length; idx++) {
    const yaw = aimYawAt(idx);
    if (
      yaw == null
        ? anyYawClear(path[idx], wanted)
        : clearFrom(path[idx], yaw, wanted)
    ) {
      seen++;
    }
  }
  if (seen / path.length >= STAGE_VISIBILITY_FLOOR) {
    report.followClean++;
    return;
  }
  // One fixed (distance, yaw) that sees the subject through the shot —
  // largest distance first, the aim rewritten to hold the bearing, and
  // among the clear yaws the one with the best COMPOSITION wins:
  // motion crossing the frame and a stand anchoring the background,
  // not just an unblocked ray.
  const floor = shot.minDistance ?? STAGE_FOLLOW_MIN_DISTANCE;
  for (const fraction of [1, ...STAGE_FOLLOW_PULL_FRACTIONS]) {
    const distance = Math.max(floor, wanted * fraction);
    if (fraction !== 1 && distance >= wanted) continue;
    let bestYaw: number | null = null;
    let bestScore = -Infinity;
    for (let k = 0; k < STAGE_FOLLOW_YAWS; k++) {
      const yaw = (k / STAGE_FOLLOW_YAWS) * Math.PI * 2;
      const visible =
        path.filter((sample) => clearFrom(sample, yaw, distance)).length /
        path.length;
      if (visible < STAGE_VISIBILITY_FLOOR) continue;
      let frameSum = 0;
      for (let idx = 0; idx < path.length; idx++) {
        const sample = path[idx];
        orbitPullbackDir(yaw, pitch, _dir);
        _eye.copy(sample.pos).addScaledVector(_dir, distance);
        const prev = path[Math.max(0, idx - 1)];
        const next = path[Math.min(path.length - 1, idx + 1)];
        const dt = Math.max(0.5, next.timeSec - prev.timeSec);
        frameSum += frameScore({
          eye: _eye,
          aim: sample.pos,
          subjectPos: sample.pos,
          subjectVel: {
            x: (next.pos.x - prev.pos.x) / dt,
            z: (next.pos.z - prev.pos.z) / dt,
          },
          entities: salientAt(sample.timeSec),
          stands: stageStands(),
          fogDistance: stageFog(),
        }).score;
      }
      const score = 0.5 * visible + 0.5 * (frameSum / path.length);
      if (score > bestScore) {
        bestScore = score;
        bestYaw = yaw;
      }
    }
    if (bestYaw != null) {
      if (distance < wanted) shot.distance = distance;
      shot.aim = { mode: "hold", yaw: bestYaw };
      report.followPulledIn++;
      return;
    }
  }
  // A shot that DECLARED a framing floor is stating intent that
  // outranks geometry: ship it as planned and let the runtime rails
  // handle transient occlusion, rather than demoting it to another
  // mechanism (a grab dive squeezed into a portrait — or replaced by
  // yet another stand orbit — is exactly what the floor forbids).
  if (shot.minDistance != null) {
    report.followUnsolved++;
    return;
  }
  // A held flag deep inside a structure: the watchable framing is the
  // building's mouth, like the planner's own turtle coverage.
  const mid = path[Math.floor(path.length / 2)].pos;
  const midTorque: DirectorVec3 = [mid.z, mid.x, mid.y - 1];
  if (shot.kind === "followFlag" && isRoofed(midTorque)) {
    plan.shots[i] = {
      kind: "fixedOrbit",
      center: midTorque,
      radius: DIRECTOR_DOORWAY_RADIUS,
      angularSpeed: 0,
      heightFactor: DIRECTOR_DOORWAY_HEIGHT,
      doorwayOf: midTorque,
      ...storyOf(shot),
    };
    report.followConverted++;
    return;
  }
  if (shot.kind === "followPlayer" && shot.aim?.mode === "toward") {
    // Nowhere around the shooter can see them, but we know what they
    // are shooting AT. Watch the impact zone instead, solved like any
    // other fixed shot.
    plan.shots[i] = {
      kind: "fixedOrbit",
      center: shot.aim.target,
      radius: DIRECTOR_BOMBARDMENT_CAM_RADIUS,
      startAngle: 0,
      angularSpeed: 0,
      heightFactor: DIRECTOR_BOMBARDMENT_CAM_HEIGHT,
      ...storyOf(shot),
    };
    report.followConverted++;
    stageFixedShot(plan, i, tracks, dataset, report);
    return;
  }
  report.followUnsolved++;
}

/**
 * The subject's sampled positions across the shot (Three-space, lifted
 * to the verify height). Flags use the scanned flag track, players
 * their nearest samples; a shot with no look-subject watches its own
 * anchor. Samples that stray beyond the runtime's re-anchor range are
 * dropped — the aim holds the scene there (a capture teleport must not
 * count as "blocked at the stand").
 */
function subjectPath(
  shot: Extract<Shot, { kind: "fixedOrbit" }>,
  tracks: Map<number, FlagTrack>,
  dataset: DirectorDataset,
  anchor: DirectorVec3,
): PathSample[] {
  const range = Math.max(SUBJECT_MAX_RANGE, shot.radius);
  const out = collectPath(
    shot.lookSubject,
    shot,
    tracks,
    dataset,
    (pos) => Math.hypot(pos[0] - anchor[0], pos[1] - anchor[1]) <= range,
  );
  if (out.length === 0) {
    // No usable subject samples: the anchor is the subject.
    for (let t = shot.startSec; t <= shot.endSec; t += STAGE_SAMPLE_SEC) {
      out.push({ timeSec: t, pos: threeLifted(anchor) });
    }
  }
  return out;
}

/** A follow shot's subject path — the chase goes wherever they go, so
 *  no range cap applies. */
function followPath(
  shot: Extract<Shot, { kind: "followFlag" | "followPlayer" }>,
  tracks: Map<number, FlagTrack>,
  dataset: DirectorDataset,
): PathSample[] {
  const subject =
    shot.kind === "followFlag"
      ? ({ type: "flag", slot: shot.slot } as const)
      : ({ type: "player", targetId: shot.targetId } as const);
  return collectPath(subject, shot, tracks, dataset, () => true);
}

function collectPath(
  subject:
    | { type: "flag"; slot: number }
    | { type: "player"; targetId: number }
    | undefined,
  shot: Shot,
  tracks: Map<number, FlagTrack>,
  dataset: DirectorDataset,
  keep: (pos: DirectorVec3) => boolean,
): PathSample[] {
  const out: PathSample[] = [];
  if (subject?.type === "flag") {
    const samples = tracks.get(subject.slot)?.samples ?? [];
    for (let t = shot.startSec; t <= shot.endSec; t += STAGE_SAMPLE_SEC) {
      const sample = sampleAt(samples, t);
      if (sample && t - sample.timeSec <= 3 && keep(sample.pos)) {
        out.push({ timeSec: t, pos: threeLifted(sample.pos) });
      }
    }
  } else if (subject?.type === "player") {
    const samples = playerTracksFor(dataset).get(subject.targetId) ?? [];
    for (const sample of samples) {
      if (sample.timeSec < shot.startSec - 1) continue;
      if (sample.timeSec > shot.endSec + 1) break;
      if (keep(sample.pos)) {
        out.push({ timeSec: sample.timeSec, pos: threeLifted(sample.pos) });
      }
    }
  }
  return out;
}

/** Torque [x, y, z] → Three (y, z, x), lifted like the runtime's
 *  verification aim (low enough that a roof still counts). */
function threeLifted(pos: DirectorVec3): Vector3 {
  return new Vector3(pos[1], pos[2] + 1, pos[0]);
}

/**
 * The best placement for one framing family: sweep bearing, height and
 * STANDOFF candidates (small offsets first — they stay on the planned,
 * broadcast-side bearing; height boosts only as escalation when
 * nothing at natural height can see), require room, require the
 * visibility floor across the subject's path, then pick the candidate
 * with the best COMPOSITION: what the frame contains (frameScore) and
 * how much open depth it has (the wall-fill test), blended with
 * visibility. Orbiting shots are evaluated along their sweep, not just
 * at the cut.
 */
function solvePlacement(
  shot: Extract<Shot, { kind: "fixedOrbit" }>,
  anchor: DirectorVec3,
  path: PathSample[],
  radius: number,
  liftFactor: number,
  options?: {
    /** Standoff multipliers to try (intent first). */
    rungs?: readonly number[];
    /** Subject angular-size intent for the composition score. */
    targetSubjectFraction?: number;
  },
): StagedPlacement | null {
  _anchorThree.set(anchor[1], anchor[2] + ORBIT_LOOK_LIFT, anchor[0]);
  const planned = shot.startAngle ?? 0;
  const spin = shot.angularSpeed ?? 0;
  const minScale = shot.lookSubject ? 0 : STANDOFF_MIN_SCALE;
  const rungs = options?.rungs ?? [1];
  let best: StagedPlacement | null = null;
  let bestComposite = -Infinity;
  // Height boosts escalate only when the natural height found nothing
  // above the floor — an elevated angle is a compromise, not a style.
  for (const boost of OCCLUSION_HEIGHT_BOOSTS) {
    if (best && best.visibility >= STAGE_VISIBILITY_FLOOR) break;
    const lift = liftFactor * boost;
    const norm = Math.hypot(1, lift);
    for (const rung of rungs) {
      const rungRadius = Math.max(STANDOFF_MIN + 1, radius * rung);
      for (const offset of OCCLUSION_ANGLE_OFFSETS) {
        const angle = planned + offset;
        _dir.set(Math.cos(angle) / norm, lift / norm, Math.sin(angle) / norm);
        const desired = rungRadius * norm;
        const room = clearStandoffWide(_anchorThree, _dir, desired);
        if (room <= 0) continue;
        const scale = Math.min(1, room / desired);
        if (scale < minScale) continue;
        const standRadius = rungRadius * scale;
        // Never rise into the blimp zone, whatever the score says.
        if (lift * standRadius > STAGE_MAX_CAMERA_LIFT) continue;
        const evaluated = evaluateCandidate(
          shot,
          anchor,
          path,
          angle,
          spin,
          lift,
          standRadius,
          options?.targetSubjectFraction,
        );
        const composite =
          0.5 * evaluated.visibility + 0.5 * evaluated.composition;
        // Eligible candidates (floor met) compete on the composite;
        // when nothing meets the floor, the most-visible fallback is
        // remembered for the repair ladder to inspect.
        const eligible = evaluated.visibility >= STAGE_VISIBILITY_FLOOR;
        const bestEligible =
          best != null && best.visibility >= STAGE_VISIBILITY_FLOOR;
        const wins = eligible
          ? !bestEligible || composite > bestComposite
          : !bestEligible &&
            (best == null || evaluated.visibility > best.visibility + 1e-6);
        if (wins) {
          bestComposite = composite;
          best = {
            angle,
            radius: standRadius,
            liftFactor: lift,
            anchor: anchor === shot.center ? undefined : anchor,
            visibility: evaluated.visibility,
          };
        }
      }
    }
  }
  return best;
}

/** Visibility across the path plus the composition score (frame
 *  content + openness), averaged over the shot's sampled moments. */
function evaluateCandidate(
  shot: Extract<Shot, { kind: "fixedOrbit" }>,
  anchor: DirectorVec3,
  path: PathSample[],
  angle: number,
  spin: number,
  lift: number,
  standRadius: number,
  targetSubjectFraction: number | undefined,
): { visibility: number; composition: number } {
  let seen = 0;
  let frameSum = 0;
  for (let i = 0; i < path.length; i++) {
    const sample = path[i];
    const at = angle + spin * (sample.timeSec - shot.startSec);
    _eye.set(
      _anchorThree.x + Math.cos(at) * standRadius,
      anchor[2] + lift * standRadius,
      _anchorThree.z + Math.sin(at) * standRadius,
    );
    // A camera INSIDE geometry sees nothing, however clear the line to
    // the subject is. Without this an eye buried in the ceiling slab
    // above a basement generator scored a perfect 1.00 — the sight ray
    // down to the subject really is unobstructed — and the shot was
    // published as solved, then rendered as a faceful of sky.
    if (!eyeBuried(_eye) && !subjectViewBlocked(_eye, sample.pos)) seen++;
    const prev = path[Math.max(0, i - 1)];
    const next = path[Math.min(path.length - 1, i + 1)];
    const dt = Math.max(0.5, next.timeSec - prev.timeSec);
    frameSum += frameScore({
      eye: _eye,
      aim: sample.pos,
      subjectPos: sample.pos,
      subjectVel: {
        x: (next.pos.x - prev.pos.x) / dt,
        z: (next.pos.z - prev.pos.z) / dt,
      },
      targetSubjectFraction,
      entities: salientAt(sample.timeSec),
      stands: stageStands(),
      fogDistance: stageFog(),
    }).score;
  }
  const visibility = path.length > 0 ? seen / path.length : 0;
  // Openness once per candidate, at the path's midpoint: a fan of rays
  // across the frame — a lens with a wall across half of it has no
  // depth to show, however visible the subject is. Tight shots are
  // exempt in proportion (an interior hero frame is close on purpose).
  const mid = path[Math.floor(path.length / 2)];
  let composition = path.length > 0 ? frameSum / path.length : 0;
  if (mid) {
    const midAt = angle + spin * (mid.timeSec - shot.startSec);
    _eye.set(
      _anchorThree.x + Math.cos(midAt) * standRadius,
      anchor[2] + lift * standRadius,
      _anchorThree.z + Math.sin(midAt) * standRadius,
    );
    const open = openness(_eye, mid.pos, standRadius);
    composition = 0.7 * composition + 0.3 * open;
  }
  return { visibility, composition };
}

/**
 * Is the camera itself embedded in the world?
 *
 * `subjectViewBlocked` only asks about the LINE from eye to subject, so
 * it cannot tell a clean interior view from a camera sunk into the slab
 * over the subject's head. Both have an unobstructed ray.
 */
function eyeBuried(eye: Vector3): boolean {
  // cameraBuried takes TORQUE space; `eye` is three (y up).
  _eyeTorque[0] = eye.z;
  _eyeTorque[1] = eye.x;
  _eyeTorque[2] = eye.y;
  // Shared with the plan-time path check on purpose. When these two
  // disagreed by half a metre, staging published placements the
  // validator then called buried, and neither was wrong on its own.
  return cameraBuried(_eyeTorque);
}
const _eyeTorque: DirectorVec3 = [0, 0, 0];

/** Mean free depth across a 5-ray horizontal fan, normalized by what
 *  this standoff needs — the wall-fill detector. */
function openness(eye: Vector3, aim: Vector3, standRadius: number): number {
  const need = Math.min(60, Math.max(15, standRadius * 1.2));
  const dx = aim.x - eye.x;
  const dz = aim.z - eye.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return 1;
  const bx = dx / len;
  const bz = dz / len;
  let sum = 0;
  for (const yaw of OPENNESS_FAN) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const rx = bx * cos - bz * sin;
    const rz = bx * sin + bz * cos;
    // Three (x, y, z) → Torque (z, x, y); probe level with the eye.
    const hit = castWorldRay(
      [eye.z, eye.x, eye.y],
      [eye.z + rz * need, eye.x + rx * need, eye.y],
      { includeStatics: true },
    );
    sum += hit ? Math.min(1, (hit.t * need) / need) : 1;
  }
  return sum / OPENNESS_FAN.length;
}

const OPENNESS_FAN = [-0.6, -0.3, 0, 0.3, 0.6];

/** Lazily-built salient-entity census per whole second: players (1),
 *  flags (3), vehicles (1.5) — what there is to SEE at that moment. */
function salientAt(timeSec: number): SalientEntity[] {
  const ctx = _stageCtx;
  if (!ctx) return [];
  const sec = Math.round(timeSec);
  let cached = ctx.salientBySec.get(sec);
  if (cached) return cached;
  cached = [];
  for (const p of ctx.playersAtSec.get(sec) ?? []) {
    cached.push({ pos: new Vector3(p.pos[1], p.pos[2], p.pos[0]), weight: 1 });
  }
  for (const track of ctx.tracks.values()) {
    const s = sampleAt(track.samples, sec);
    if (s && sec - s.timeSec <= 3) {
      cached.push({
        pos: new Vector3(s.pos[1], s.pos[2], s.pos[0]),
        weight: 3,
      });
    }
  }
  for (const v of ctx.vehiclesBySec.get(sec) ?? []) {
    cached.push({ pos: v, weight: 1.5 });
  }
  ctx.salientBySec.set(sec, cached);
  return cached;
}

function stageStands(): Vector3[] {
  return _stageCtx?.standsThree ?? [];
}

function stageFog(): number | undefined {
  return _stageCtx?.fog;
}

interface StageCtx {
  /** Accumulator distributing DIRECTOR_TIGHT_SHOT_SHARE across the
   *  plan's subject framings (Bresenham-style, order-stable). */
  tightAcc: number;
  playersAtSec: PlayersAtSec;
  tracks: Map<number, FlagTrack>;
  standsThree: Vector3[];
  vehiclesBySec: Map<number, Vector3[]>;
  salientBySec: Map<number, SalientEntity[]>;
  fog?: number;
}

let _stageCtx: StageCtx | null = null;
