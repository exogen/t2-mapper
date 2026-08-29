/**
 * Deciding WHAT the camera should be on, moment by moment.
 *
 * Two passes. First every candidate subject — each flag, each base, the
 * shelling of each base, and an idle floor — gets an interest score on a
 * half-second grid, using full knowledge of the future (a possession
 * that ends in a capture scores higher throughout). Then the timeline is
 * cut into segments by walking that grid with hysteresis, so the camera
 * commits to a subject instead of chasing whichever score is highest
 * this instant.
 *
 * Nothing here knows about cameras; it answers "who is the story" and
 * leaves "how do we shoot it" to the shot builders.
 */
import type {
  DirectorVec3,
  DirectorDataset,
  DirectorEvent,
  StructureTransition,
} from "./types";
import {
  DIRECTOR_BOMBARDMENT_MIN_SHELLS,
  DIRECTOR_BOMBARDMENT_RANGE,
  DIRECTOR_BOMBARDMENT_WINDOW_SEC,
  DIRECTOR_FAIR_SHARE_SEC,
  DIRECTOR_GRAB_IMMINENT_SEC,
  DIRECTOR_GRAB_LOOKAHEAD_SEC,
  DIRECTOR_AFTERMATH_CROWD_RANGE,
  DIRECTOR_HARD_FLOOR_SEC,
  DIRECTOR_KILL_NEAR_FLAG,
  DIRECTOR_MAX_CHASE_SEC,
  DIRECTOR_MAX_STATIC_SEC,
  DIRECTOR_MIN_POSSESSION_SEC,
  DIRECTOR_MIN_SHOT_SEC,
  DIRECTOR_PREEMPT_SCORE,
  DIRECTOR_SWITCH_PENALTY,
  DIRECTOR_THREAT_RANGE,
  DIRECTOR_CAP_PREEMPT_SEC,
  DIRECTOR_DROPPED_FAR,
  DIRECTOR_DROPPED_NEAR_HOME,
  DIRECTOR_TICK_SEC,
  SCORE_BASE,
  SCORE_BASE_ATTACK,
  SCORE_BOMBARDMENT,
  SCORE_CAP_CHAIN_BONUS,
  SCORE_CARRIED,
  SCORE_DROPPED,
  SCORE_GRAB_IMMINENT,
  SCORE_GRAB_SOON,
  SCORE_IDLE,
  SCORE_KILLS_NEAR_FLAG,
  SCORE_QUIET,
  SCORE_THREAT,
  SCORE_RETURN_SOON,
  SCORE_RETURN_IMMINENT,
} from "./tunables";
import { dist } from "./geometry";
import { capWithin, heldRunLength, sampleAt } from "./dataset";
import type { FlagTrack, PlayersAtSec } from "./dataset";

/** A thing the camera can be pointed at for a stretch of time. */
export type Subject =
  | { kind: "flag"; slot: number }
  | { kind: "base"; slot: number }
  | { kind: "bombard"; slot: number }
  | { kind: "idle" };

/** A stretch of the timeline awarded to one subject. */
export interface Segment {
  subject: Subject;
  startSec: number;
  endSec: number;
}

/** The dataset views both passes need, derived once. */
export interface InterestContext {
  dataset: DirectorDataset;
  tracks: Map<number, FlagTrack>;
  playersAtSec: PlayersAtSec;
  /** Positioned timeline kills for near-flag scoring. NOTE: observer
   *  recordings (every relay capture) carry no kill events, so the
   *  SCORE_KILLS_NEAR_FLAG bonus effectively applies only to demos the
   *  recorder played in. Sourcing this from dataset.deaths instead
   *  re-segments roughly half of every observer plan — the current
   *  tuning was validated without it, so switching is a deliberate
   *  retuning exercise, not a drop-in fix. */
  kills: { timeSec: number; pos: DirectorVec3 }[];
  destructions: StructureTransition[];
  tickCount: number;
}

export function interestContext(
  dataset: DirectorDataset,
  tracks: Map<number, FlagTrack>,
  playersAtSec: PlayersAtSec,
): InterestContext {
  return {
    dataset,
    tracks,
    playersAtSec,
    kills: dataset.events.filter(
      (e): e is DirectorEvent & { pos: DirectorVec3 } =>
        e.type === "kill" && e.pos != null,
    ),
    destructions: dataset.structures.filter((s) => s.to > s.from),
    tickCount: Math.max(1, Math.ceil(dataset.durationSec / DIRECTOR_TICK_SEC)),
  };
}

/** Every subject competing for the camera, flags first. */
export function buildSubjects(
  dataset: DirectorDataset,
  slots: number[],
): Subject[] {
  return [
    ...slots.map((slot): Subject => ({ kind: "flag", slot })),
    ...dataset.flagStands.map((stand): Subject => ({
      kind: "base",
      slot: stand.slot,
    })),
    // Shelling competes for the shot in its own right: when the flags
    // are sitting still, a barrage on a base is the story.
    ...dataset.flagStands.map((stand): Subject => ({
      kind: "bombard",
      slot: stand.slot,
    })),
    { kind: "idle" },
  ];
}

/** Pass A: an interest score per subject per tick. */
export function scoreSubjects(
  subjects: Subject[],
  ctx: InterestContext,
): Float32Array[] {
  const { dataset, tracks, playersAtSec, kills, destructions, tickCount } = ctx;
  const scores = subjects.map(() => new Float32Array(tickCount));
  subjects.forEach((subject, si) => {
    const grid = scores[si];
    if (subject.kind === "idle") {
      grid.fill(SCORE_IDLE);
      return;
    }
    const stand = dataset.flagStands.find((s) => s.slot === subject.slot);
    if (subject.kind === "bombard") {
      if (!stand) return;
      // A tick scores when enough shells land near this base inside a
      // short window around it.
      for (let i = 0; i < tickCount; i++) {
        const t = i * DIRECTOR_TICK_SEC;
        const shells = dataset.mortarShots.filter(
          (m) =>
            Math.abs(m.timeSec - t) <= DIRECTOR_BOMBARDMENT_WINDOW_SEC &&
            dist(m.to, stand.pos) <= DIRECTOR_BOMBARDMENT_RANGE,
        ).length;
        grid[i] =
          shells >= DIRECTOR_BOMBARDMENT_MIN_SHELLS ? SCORE_BOMBARDMENT : 0;
      }
      return;
    }
    if (subject.kind === "base") {
      grid.fill(SCORE_BASE);
      if (!stand) return;
      for (const destruction of destructions) {
        if (dist(destruction.pos, stand.pos) > 250) continue;
        const from = Math.max(
          0,
          Math.floor((destruction.timeSec - 10) / DIRECTOR_TICK_SEC),
        );
        const to = Math.min(
          tickCount - 1,
          Math.ceil((destruction.timeSec + 2) / DIRECTOR_TICK_SEC),
        );
        for (let i = from; i <= to; i++) {
          grid[i] = Math.max(grid[i], SCORE_BASE_ATTACK);
        }
      }
      return;
    }
    const track = tracks.get(subject.slot)!;
    let grabCursor = 0;
    for (let i = 0; i < tickCount; i++) {
      const t = i * DIRECTOR_TICK_SEC;
      const sample = sampleAt(track.samples, t);
      if (!sample || t - sample.timeSec > 3) {
        grid[i] = 0;
        continue;
      }
      let score: number;
      if (
        sample.status === "held" &&
        heldRunLength(track, t) >= DIRECTOR_MIN_POSSESSION_SEC
      ) {
        score = SCORE_CARRIED;
      } else if (sample.status === "held") {
        // Grabbed and dropped again within a breath: not worth cutting
        // away from whatever we are already watching. Scored as a live
        // scramble rather than a carry, so it only wins if nothing
        // better is happening.
        score = SCORE_DROPPED;
      } else if (sample.status === "field") {
        // Interest scales with how far from home it lies: dropped at
        // the stand's feet, uncontested, it is as dull as a flag AT the
        // stand (it will be trivially returned); deep in enemy country
        // it is a live grenade. Enemies close by make any drop a story.
        const homePos = dataset.flagStands.find(
          (st) => st.slot === subject.slot,
        )?.pos;
        const fromHome = homePos ? dist(sample.pos, homePos) : Infinity;
        const players = playersAtSec.get(Math.round(t)) ?? [];
        const contested = players.some(
          (p) =>
            (p.teamId == null || p.teamId !== subject.slot) &&
            dist(p.pos, sample.pos) <= DIRECTOR_THREAT_RANGE,
        );
        const ramp = Math.min(
          1,
          Math.max(
            0,
            (fromHome - DIRECTOR_DROPPED_NEAR_HOME) /
              (DIRECTOR_DROPPED_FAR - DIRECTOR_DROPPED_NEAR_HOME),
          ),
        );
        score = SCORE_QUIET + (SCORE_DROPPED - SCORE_QUIET) * ramp;
        if (contested) score = Math.max(score, SCORE_THREAT);
        // Future knowledge, mirroring the grab lookahead: this drop is
        // about to be RETURNED — the story is resolving right here, and
        // cutting away to a quiet stand seconds before the touch is how
        // returns get missed.
        const returnAt = track.outPeriods.find(
          (p) =>
            !p.endsInCap &&
            p.endSec >= t &&
            p.endSec - t <= DIRECTOR_GRAB_LOOKAHEAD_SEC,
        )?.endSec;
        if (returnAt != null) {
          // …but only when somebody is actually there to return it. A
          // flag whose timer expires resolves in an empty field — that
          // is not a story worth holding the camera for.
          const returnSpot = sampleAt(track.samples, returnAt - 0.5)?.pos;
          const attended =
            returnSpot != null &&
            (playersAtSec.get(Math.round(returnAt)) ?? []).some(
              (p) => dist(p.pos, returnSpot) <= DIRECTOR_AFTERMATH_CROWD_RANGE,
            );
          if (attended) {
            score = Math.max(
              score,
              returnAt - t <= DIRECTOR_GRAB_IMMINENT_SEC
                ? SCORE_RETURN_IMMINENT
                : SCORE_RETURN_SOON,
            );
          }
        }
      } else {
        while (
          grabCursor < track.grabTimes.length &&
          track.grabTimes[grabCursor] < t
        ) {
          grabCursor++;
        }
        const nextGrab = track.grabTimes[grabCursor];
        // A grab whose possession is an instant fumble is not worth
        // crossing the map for — the boost that parks the camera at the
        // stand ahead of a grab requires the grab to BECOME a carry.
        const realGrab =
          nextGrab != null &&
          heldRunLength(track, nextGrab + 0.75) >= DIRECTOR_MIN_POSSESSION_SEC;
        if (realGrab && nextGrab - t <= DIRECTOR_GRAB_LOOKAHEAD_SEC) {
          // Tiered: competitive through the lookahead window, decisive
          // in the last seconds so the approach is always on camera.
          score =
            nextGrab - t <= DIRECTOR_GRAB_IMMINENT_SEC
              ? SCORE_GRAB_IMMINENT
              : SCORE_GRAB_SOON;
        } else {
          const players = playersAtSec.get(Math.round(t)) ?? [];
          const threatened = players.some(
            (p) =>
              (sample.slot !== p.teamId || p.teamId == null) &&
              dist(p.pos, sample.pos) <= DIRECTOR_THREAT_RANGE,
          );
          score = threatened ? SCORE_THREAT : SCORE_QUIET;
        }
      }
      // Outcome bonus: a possession chain that ends in a capture wins
      // conflicts when both flags are out.
      if (
        track.outPeriods.some(
          (p) => p.endsInCap && t >= p.startSec && t <= p.endSec,
        )
      ) {
        score += SCORE_CAP_CHAIN_BONUS;
      }
      if (
        kills.some(
          (e) =>
            Math.abs(e.timeSec - t) <= 4 &&
            dist(e.pos, sample.pos) <= DIRECTOR_KILL_NEAR_FLAG,
        )
      ) {
        score += SCORE_KILLS_NEAR_FLAG;
      }
      grid[i] = score;
    }
  });

  return scores;
}

/**
 * Pass B: cut the timeline into segments, committing to a subject rather
 * than following the instantaneous maximum. A challenger must beat the
 * running subject by DIRECTOR_SWITCH_PENALTY and the shot must have run
 * its minimum, with three deliberate exceptions: a tier-1 score may
 * pre-empt early, a stale static shot rotates away unchallenged, and two
 * simultaneous flag drives alternate so neither owns the camera for a
 * whole possession.
 */
export function segmentByInterest(
  subjects: Subject[],
  scores: Float32Array[],
  ctx: InterestContext,
): Segment[] {
  const { dataset, tracks, tickCount } = ctx;
  const segments: Segment[] = [];
  let currentIndex = 0;
  for (let si = 1; si < subjects.length; si++) {
    if (scores[si][0] > scores[currentIndex][0]) currentIndex = si;
  }
  let segStartSec = 0;
  /** A fairness cut holds until this time, whatever the scores say. */
  let protectedUntil = 0;
  const isChasing = (si: number, t: number): boolean => {
    const subject = subjects[si];
    if (subject.kind !== "flag") return false;
    const sample = sampleAt(tracks.get(subject.slot)!.samples, t);
    return sample?.status === "held";
  };
  /** A flag subject whose flag is OUT (held or in the field) — live
   *  play the stale-static rotation must never wander away from. */
  const isLiveFlag = (si: number, t: number): boolean => {
    const subject = subjects[si];
    if (subject.kind !== "flag") return false;
    const sample = sampleAt(tracks.get(subject.slot)!.samples, t);
    return sample != null && sample.status !== "home";
  };
  for (let i = 1; i < tickCount; i++) {
    const t = i * DIRECTOR_TICK_SEC;
    let bestIndex = currentIndex === 0 ? 1 : 0;
    for (let si = 0; si < subjects.length; si++) {
      if (si === currentIndex) continue;
      if (scores[si][i] > scores[bestIndex][i]) bestIndex = si;
    }
    const elapsed = t - segStartSec;
    const chase = isChasing(currentIndex, t);
    let switchTo = -1;
    // A CAPTURE preempts everything: fairness holds, hysteresis floors,
    // the switch penalty. If any other flag caps within the preempt
    // window and the camera is not already on it, cut to it now — a
    // capture is always the most valuable thing on the map.
    let capIndex = -1;
    for (let si = 0; si < subjects.length; si++) {
      if (si === currentIndex) continue;
      const subject = subjects[si];
      if (subject.kind !== "flag") continue;
      const track = tracks.get(subject.slot);
      if (track && capWithin(track, t, DIRECTOR_CAP_PREEMPT_SEC)) {
        capIndex = si;
        break;
      }
    }
    const currentTrack =
      subjects[currentIndex].kind === "flag"
        ? tracks.get((subjects[currentIndex] as { slot: number }).slot)
        : undefined;
    const currentCapping =
      currentTrack != null &&
      capWithin(currentTrack, t, DIRECTOR_CAP_PREEMPT_SEC);
    if (capIndex >= 0 && !currentCapping) {
      switchTo = capIndex;
    } else if (t < protectedUntil) {
      // Holding a cut made for fairness: see DIRECTOR_FAIR_SHARE_SEC.
    } else if (
      scores[bestIndex][i] >
      scores[currentIndex][i] + DIRECTOR_SWITCH_PENALTY
    ) {
      if (elapsed >= DIRECTOR_MIN_SHOT_SEC) {
        switchTo = bestIndex;
      } else if (
        elapsed >= DIRECTOR_HARD_FLOOR_SEC &&
        scores[bestIndex][i] >= DIRECTOR_PREEMPT_SCORE
      ) {
        switchTo = bestIndex;
      }
    } else if (
      !chase &&
      !isLiveFlag(currentIndex, t) &&
      elapsed >= DIRECTOR_MAX_STATIC_SEC &&
      scores[bestIndex][i] + DIRECTOR_SWITCH_PENALTY >= scores[currentIndex][i]
    ) {
      // Rotate a stale static shot even without a decisive challenger
      // — but never away from a flag that is OUT: a dropped flag deep
      // in the field is live play however long it lies there.
      switchTo = bestIndex;
    } else if (chase && elapsed >= DIRECTOR_MAX_CHASE_SEC) {
      // Both flags are out: alternate between the two drives instead of
      // riding whichever was grabbed first for its whole possession.
      // The challenger here is the best OTHER DRIVE, not the best
      // subject overall — during a base fight a barrage or a cluster
      // routinely out-scores the far flag, which would leave the other
      // carrier off camera for their entire run.
      let bestChase = -1;
      for (let si = 0; si < subjects.length; si++) {
        if (si === currentIndex || !isChasing(si, t)) continue;
        if (bestChase < 0 || scores[si][i] > scores[bestChase][i]) {
          bestChase = si;
        }
      }
      if (bestChase >= 0) {
        switchTo = bestChase;
        protectedUntil = t + DIRECTOR_FAIR_SHARE_SEC;
      }
    }
    if (switchTo >= 0) {
      segments.push({
        subject: subjects[currentIndex],
        startSec: segStartSec,
        endSec: t,
      });
      currentIndex = switchTo;
      segStartSec = t;
    }
  }
  segments.push({
    subject: subjects[currentIndex],
    startSec: segStartSec,
    endSec: dataset.durationSec,
  });
  return segments;
}
