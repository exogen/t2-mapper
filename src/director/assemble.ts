/**
 * Turning a pile of candidate shots into a broadcast: make the timeline
 * contiguous, drop cuts that do not change the picture, hold every shot
 * long enough to read, and splice cut-ins for tier-1 events the
 * segmentation missed — but sparingly, because cutting for every touch
 * in a scramble is worse coverage than staying with the play.
 */
import type {
  CoverageRow,
  DirectorDataset,
  DirectorEvent,
  DirectorVec3,
  Shot,
  ShotAim,
  ShotSubject,
} from "./types";
import {
  DIRECTOR_CLUSTER_CAM_HEIGHT,
  DIRECTOR_CLUSTER_CAM_RADIUS,
  DIRECTOR_COVER_RANGE,
  DIRECTOR_DIST_STAND,
  DIRECTOR_GUARANTEE_MIN_GAP_SEC,
  DIRECTOR_LOOK_SUBJECT_REACH,
  DIRECTOR_MIN_SHOT_HOLD_SEC,
  DIRECTOR_PITCH_STAND,
  DIRECTOR_REDUNDANT_AIM_RADIANS,
  DIRECTOR_REDUNDANT_CUT_RANGE,
  DIRECTOR_WIDE_CAM_MARGIN,
  TIER1_TYPES,
} from "./tunables";
import { dist } from "./geometry";
import {
  buildFlagTracks,
  eventFlagSlot,
  sampleAt,
  type FlagTrack,
  playerSampleAt,
} from "./dataset";
import {
  angleFacingLandmark,
  farLandmark,
  onBroadcastSide,
  orbitShot,
} from "./framing";
import { idleShots } from "./modes";

/**
 * A fixed camera may only claim an aim subject that is actually inside
 * its frame. Several builders anchor a shot on one thing (a battle, an
 * event position) and name a flag as the pan target; when that flag is
 * hundreds of units outside the framed area the shot opens with a slow
 * whip-pan toward empty distance and then cuts — a camera move that
 * means nothing. Here the claim is checked against where the subject
 * really is when the shot starts, and dropped when it is out of frame,
 * leaving the camera looking at what the shot is anchored on.
 */
export function sanitizeLookSubjects(
  shots: Shot[],
  dataset: DirectorDataset,
): void {
  const tracks = buildFlagTracks(dataset);
  for (const shot of shots) {
    if (shot.kind !== "fixedOrbit" || !shot.lookSubject) continue;
    const reach =
      shot.radius * DIRECTOR_LOOK_SUBJECT_REACH + DIRECTOR_WIDE_CAM_MARGIN;
    // In frame at ANY point during the shot keeps the claim — a dropped
    // flag legitimately starts outside its own shot (which is framed on
    // where it will settle) and slides in.
    const mid = (shot.startSec + shot.endSec) / 2;
    const everInFrame = [shot.startSec, mid, shot.endSec].some((t) => {
      const pos = subjectPosAt(shot.lookSubject!, t, tracks, dataset);
      return pos != null && dist(pos, shot.center) <= reach;
    });
    // No sample at all (subject out of scope) keeps the claim too — the
    // runtime resolves it live and holds the centre until it appears.
    const everSampled = [shot.startSec, mid, shot.endSec].some(
      (t) => subjectPosAt(shot.lookSubject!, t, tracks, dataset) != null,
    );
    if (everSampled && !everInFrame) {
      shot.lookSubject = undefined;
    }
  }
}

/** Where a shot subject is at a moment, from the scanned samples. */
function subjectPosAt(
  subject: ShotSubject,
  timeSec: number,
  tracks: Map<number, FlagTrack>,
  dataset: DirectorDataset,
): DirectorVec3 | null {
  if (subject.type === "flag") {
    return (
      sampleAt(tracks.get(subject.slot)?.samples ?? [], timeSec)?.pos ?? null
    );
  }
  return playerSampleAt(dataset, subject.targetId, timeSec)?.pos ?? null;
}

/**
 * Drop cuts that do not actually change the picture. A flag being
 * picked up or dropped ends one status run and starts another, but if
 * the new shot would sit in nearly the same place looking at nearly the
 * same thing, cutting to it just jolts a viewer who was already
 * watching it happen — so the running shot is extended instead. Steady
 * beats busy.
 */
export function mergeRedundantCuts(shots: Shot[]): Shot[] {
  if (shots.length === 0) return shots;
  const out: Shot[] = [shots[0]];
  for (let i = 1; i < shots.length; i++) {
    const previous = out[out.length - 1];
    const shot = shots[i];
    if (framesTheSame(previous, shot)) {
      previous.endSec = shot.endSec;
      // A merged run of identical quick cuts is a hold, not a rhythm.
      if (previous.quickCut && previous.endSec - previous.startSec > 4) {
        previous.quickCut = undefined;
      }
      continue;
    }
    out.push(shot);
  }
  return out;
}

/** Whether two consecutive shots would look near enough identical that
 *  cutting between them is pure churn. */
export function framesTheSame(a: Shot, b: Shot): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "fixedOrbit" && b.kind === "fixedOrbit") {
    // A deliberate bearing change on the same anchor is NOT redundant —
    // it is how a long watch varies the eye without leaving the story.
    const swung =
      a.startAngle != null &&
      b.startAngle != null &&
      Math.abs(
        ((((a.startAngle - b.startAngle) % (Math.PI * 2)) + Math.PI * 3) %
          (Math.PI * 2)) -
          Math.PI,
      ) > DIRECTOR_REDUNDANT_AIM_RADIANS;
    return (
      !swung &&
      dist(a.center, b.center) <= DIRECTOR_REDUNDANT_CUT_RANGE &&
      Math.abs(a.radius - b.radius) <= DIRECTOR_REDUNDANT_CUT_RANGE &&
      sameSubject(a.lookSubject, b.lookSubject)
    );
  }
  if (a.kind === "followFlag" && b.kind === "followFlag") {
    // Same flag, near enough the same framing: a grab or drop alone is
    // not a reason to re-frame.
    return (
      a.slot === b.slot &&
      Math.abs((a.distance ?? 0) - (b.distance ?? 0)) <= 4 &&
      sameAim(a.aim, b.aim)
    );
  }
  return false;
}

/**
 * Whether two aims point the camera the same way. Comparing only the
 * MODE would fuse a shot aiming across the carrier at their own base
 * with one aiming at a crowd on the far side of the map: the merged shot
 * keeps the earlier target, so the camera spends the whole run aimed at
 * somewhere nothing is happening.
 */
export function sameAim(a?: ShotAim, b?: ShotAim): boolean {
  if (!a || !b) return a == null && b == null;
  if (a.mode !== b.mode) return false;
  if (a.mode === "toward" && b.mode === "toward") {
    return dist(a.target, b.target) <= DIRECTOR_REDUNDANT_CUT_RANGE;
  }
  if (a.mode === "hold" && b.mode === "hold") {
    return Math.abs(a.yaw - b.yaw) <= DIRECTOR_REDUNDANT_AIM_RADIANS;
  }
  return true;
}

function sameSubject(a?: ShotSubject, b?: ShotSubject): boolean {
  if (!a || !b) return a == null && b == null;
  if (a.type !== b.type) return false;
  return a.type === "flag" && b.type === "flag"
    ? a.slot === b.slot
    : a.type === "player" && b.type === "player"
      ? a.targetId === b.targetId
      : false;
}

/**
 * No shot shorter than DIRECTOR_MIN_SHOT_HOLD_SEC survives: anything
 * briefer than that reads as a flicker rather than a shot, so it is
 * absorbed into its neighbour (splices and segment arithmetic can both
 * leave slivers). Time is never lost — the neighbour takes it.
 */
export function enforceMinDuration(
  shots: Shot[],
  dataset: DirectorDataset,
): Shot[] {
  if (shots.length === 0) return shots;
  // Deliberate quick cuts (roster portraits) hold a 2s floor instead
  // of the normal one — a planned rhythm, not an assembly sliver.
  const holdsItsOwn = (s: Shot): boolean =>
    s.endSec - s.startSec >= (s.quickCut ? 2 : DIRECTOR_MIN_SHOT_HOLD_SEC);
  const out: Shot[] = [shots[0]];
  for (let i = 1; i < shots.length; i++) {
    const previous = out[out.length - 1];
    const shot = shots[i];
    if (!holdsItsOwn(shot)) {
      // Too short to stand alone: hand its time to the previous shot.
      previous.endSec = shot.endSec;
      continue;
    }
    if (!holdsItsOwn(previous)) {
      // The previous one was the sliver: drop it and start this one early.
      out.pop();
      const before = out[out.length - 1];
      if (before) before.endSec = previous.startSec;
      out.push({ ...shot, startSec: previous.startSec, transitionIn: "cut" });
      continue;
    }
    out.push(shot);
  }
  // A lone sliver at the very end folds back into its predecessor.
  const last = out[out.length - 1];
  if (out.length > 1 && !holdsItsOwn(last)) {
    out.pop();
    out[out.length - 1].endSec = last.endSec;
  }
  if (out.length === 1) out[0].endSec = dataset.durationSec;
  return out;
}

/** Sort, de-overlap, and fill holes so shots cover [0, duration]. */
export function fillGaps(shots: Shot[], dataset: DirectorDataset): Shot[] {
  const sorted = shots
    .filter((s) => s.endSec - s.startSec > 0.05)
    .sort((a, b) => a.startSec - b.startSec);
  const result: Shot[] = [];
  let cursor = 0;
  for (const shot of sorted) {
    const start = Math.max(shot.startSec, cursor);
    if (shot.endSec - start <= 0.05) continue;
    if (start - cursor > 0.25) {
      for (const filler of idleShots(cursor, start, dataset)) {
        result.push(filler);
      }
    }
    result.push({ ...shot, startSec: start });
    cursor = Math.max(cursor, shot.endSec);
  }
  if (result.length === 0) {
    return idleShots(0, dataset.durationSec, dataset);
  }
  if (cursor < dataset.durationSec - 0.25) {
    result.push(...idleShots(cursor, dataset.durationSec, dataset));
  } else {
    result[result.length - 1].endSec = dataset.durationSec;
  }
  result[0].startSec = 0;
  return result;
}

/**
 * The tier-1 events a plan must not miss, paired with where they
 * happened (a flag's sampled position when the event message carries
 * none).
 */
interface TierOneEvent {
  event: DirectorEvent;
  slot: number | null;
  pos: DirectorVec3 | null;
}

function tierOneEvents(dataset: DirectorDataset): TierOneEvent[] {
  const tracks = buildFlagTracks(dataset);
  const out: TierOneEvent[] = [];
  for (const event of dataset.events) {
    if (!TIER1_TYPES.has(event.type)) continue;
    const slot = event.type.startsWith("flag-")
      ? eventFlagSlot(event, dataset)
      : null;
    out.push({
      event,
      slot,
      pos:
        event.pos ??
        (slot != null
          ? (sampleAt(tracks.get(slot)?.samples ?? [], event.timeSec)?.pos ??
            null)
          : null),
    });
  }
  return out;
}

/**
 * The shot that puts an event on camera, if any. The window is generous
 * either side because event messages lag the sampled state by a second
 * or two (a capture message lands after the flag already reads "home").
 */
function coveringShot(
  shots: Shot[],
  { event, slot, pos }: TierOneEvent,
): Shot | undefined {
  const windowStart = event.timeSec - 2.5;
  const windowEnd = event.timeSec + 1;
  return shots.find(
    (s) =>
      s.endSec > windowStart &&
      s.startSec < windowEnd &&
      (slot == null ||
        (s.kind === "followFlag" && s.slot === slot) ||
        (s.kind === "dolly" &&
          s.subject.type === "flag" &&
          s.subject.slot === slot) ||
        // A fixed camera that names this flag as its look-subject is
        // already telling the story: it pans to the flag's live position
        // and re-anchors on it at runtime, so its planned centre says
        // nothing about whether the event is on screen.
        (s.kind === "fixedOrbit" &&
          s.lookSubject?.type === "flag" &&
          s.lookSubject.slot === slot) ||
        (s.kind === "fixedOrbit" &&
          pos != null &&
          dist(s.center, pos) <= DIRECTOR_COVER_RANGE)),
  );
}

/** The cut-in that would cover an event: a fixed angle facing a base
 *  where we have a position, a lock on the flag where we do not. */
function cutInFor(
  { event, slot, pos }: TierOneEvent & { slot: number },
  dataset: DirectorDataset,
): Shot {
  const startSec = Math.max(0, event.timeSec - 3);
  const endSec = Math.min(dataset.durationSec, event.timeSec + 2);
  const reason = event.description;
  // A return's sampled position is wherever the flag lay when it was
  // touched — often a dead corridor the flag has already teleported out
  // of. The story concludes at the stand it came home to, so cover
  // that; anywhere near it still covers the touch for the report.
  if (event.type === "flag-return") {
    pos = dataset.flagStands.find((s) => s.slot === slot)?.pos ?? pos;
  }
  if (!pos) {
    return {
      kind: "followFlag",
      slot,
      distance: DIRECTOR_DIST_STAND,
      pitch: DIRECTOR_PITCH_STAND,
      startSec,
      endSec,
      transitionIn: "cut",
      reason,
      coverageCutIn: true,
    };
  }
  const landmark = farLandmark(pos, dataset);
  // Steer the bearing clear of the flag's coming path: a grab cut-in is
  // anchored where the flag IS, and the grabber then carries it — often
  // straight over the camera spot.
  const path = dataset.flagSamples
    .filter(
      (f) => f.slot === slot && f.timeSec >= startSec && f.timeSec <= endSec,
    )
    .map((f) => f.pos);
  // A cap or return teleports the flag home the instant it happens — a
  // cut-in that tracks the flag would whip toward its home base mid-
  // shot. Those cover the SPOT; only grabs keep tracking the item.
  const tracksFlag = event.type !== "flag-cap" && event.type !== "flag-return";
  return asCoverageCutIn(
    orbitShot({
      center: pos,
      radius: DIRECTOR_CLUSTER_CAM_RADIUS,
      angle: landmark
        ? onBroadcastSide(angleFacingLandmark(pos, landmark), dataset)
        : undefined,
      avoidPath: path,
      still: true,
      heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
      lookSubject: tracksFlag ? { type: "flag", slot } : undefined,
      startSec,
      endSec,
      reason,
    }),
  );
}

/** Mark a cut-in built by the coverage pass. */
function asCoverageCutIn(shot: Shot): Shot {
  shot.coverageCutIn = true;
  return shot;
}

/**
 * Splice cut-ins for tier-1 events the segmentation missed, in place.
 *
 * Deliberately NOT exhaustive: in a scramble the flag changes hands every
 * few seconds, and cutting for each touch means crossing the map four to
 * six times in half a minute. Beyond DIRECTOR_GUARANTEE_MIN_GAP_SEC the
 * event is left uncovered, which reportCoverage then says plainly.
 */
export function spliceMissingCoverage(
  shots: Shot[],
  dataset: DirectorDataset,
): void {
  let lastSpliceSec: number | null = null;
  for (const tier1 of tierOneEvents(dataset)) {
    if (tier1.slot == null) continue;
    if (coveringShot(shots, tier1)) continue;
    // The rate limit exists so a scramble's every touch doesn't become
    // a cut across the map — but a CAPTURE is always the most valuable
    // thing on the map, and is never skipped, whatever just aired.
    if (
      tier1.event.type !== "flag-cap" &&
      lastSpliceSec != null &&
      tier1.event.timeSec - lastSpliceSec < DIRECTOR_GUARANTEE_MIN_GAP_SEC
    ) {
      continue;
    }
    spliceShot(shots, cutInFor({ ...tier1, slot: tier1.slot }, dataset));
    lastSpliceSec = tier1.event.timeSec;
  }
}

/**
 * The coverage report, computed from the FINAL shot list — after cut-ins
 * are spliced and the merge and minimum-hold passes have had their say,
 * so a row never credits a shot that no longer exists.
 */
export function reportCoverage(
  shots: Shot[],
  dataset: DirectorDataset,
): CoverageRow[] {
  return tierOneEvents(dataset).map((tier1) => {
    const shot = coveringShot(shots, tier1);
    return {
      timeSec: tier1.event.timeSec,
      description: tier1.event.description,
      covered: shot != null,
      by: shot?.reason ?? "skipped — staying with the play",
    };
  });
}

/** Insert a cut-in, trimming/splitting whatever it overlaps, in place. */
function spliceShot(shots: Shot[], cutIn: Shot): void {
  const head = shots[0]?.startSec ?? cutIn.startSec;
  const tail = shots[shots.length - 1]?.endSec ?? cutIn.endSec;
  for (let i = shots.length - 1; i >= 0; i--) {
    const shot = shots[i];
    if (shot.endSec <= cutIn.startSec || shot.startSec >= cutIn.endSec) {
      continue;
    }
    // Fragments shorter than a legible beat are dropped (the sliver-
    // closing pass below extends a neighbor over them) — never leave a
    // flash cut.
    const keepLeft =
      cutIn.startSec - shot.startSec >= DIRECTOR_MIN_SHOT_HOLD_SEC;
    const keepRight = shot.endSec - cutIn.endSec >= DIRECTOR_MIN_SHOT_HOLD_SEC;
    if (keepLeft && keepRight) {
      shots.splice(i + 1, 0, {
        ...shot,
        startSec: cutIn.endSec,
        transitionIn: "cut",
      });
      shot.endSec = cutIn.startSec;
    } else if (keepLeft) {
      shot.endSec = cutIn.startSec;
    } else if (keepRight) {
      shot.startSec = cutIn.endSec;
      shot.transitionIn = "cut";
    } else {
      shots.splice(i, 1);
    }
  }
  shots.push(cutIn);
  shots.sort((a, b) => a.startSec - b.startSec);
  // Close rounding slivers the cut-in may have left at its edges, and
  // never let a dropped head or tail shot shrink the covered span.
  for (let i = 1; i < shots.length; i++) {
    if (shots[i].startSec > shots[i - 1].endSec) {
      shots[i - 1].endSec = shots[i].startSec;
    }
  }
  if (shots.length > 0) {
    shots[0].startSec = Math.min(shots[0].startSec, head);
    const last = shots[shots.length - 1];
    last.endSec = Math.max(last.endSec, tail);
  }
}
