/**
 * Turning one flag's segment of screen time into shots.
 *
 * A segment is split into status runs (home / carried / on the ground),
 * and each run picks its camera from what is actually happening: a
 * turtled carrier alternates inside shots with the doorways outside, a
 * long carry rotates between a locked chase and the cinematic dolly, a
 * quiet stand goes looking for players instead, and a run ending in a
 * capture widens into ceremony framing before the score.
 */
import type {
  DirectorDataset,
  DirectorFlagSample,
  DirectorVec3,
  Shot,
  ShotAim,
} from "./types";
import {
  DIRECTOR_CAP_PREROLL_SEC,
  DIRECTOR_CHASE_SEGMENT_SEC,
  DIRECTOR_CHASE_STYLES,
  DIRECTOR_CLUSTER_CAM_HEIGHT,
  DIRECTOR_CLUSTER_CAM_MIN_PLAYERS,
  DIRECTOR_CONTESTED_RANGE,
  DIRECTOR_CROWD_ORBIT_HEIGHT,
  DIRECTOR_CROWD_ORBIT_RADIUS,
  DIRECTOR_DIST_CEREMONY,
  DIRECTOR_DIST_CROWD,
  DIRECTOR_DIST_HERO,
  DIRECTOR_DIST_HIP,
  DIRECTOR_STAND_APPROACH_TAIL_SEC,
  DIRECTOR_PITCH_HIP,
  DIRECTOR_DIST_STAND,
  DIRECTOR_DOLLY_DISTANCE,
  DIRECTOR_DOLLY_HEIGHT,
  DIRECTOR_DOLLY_MIN_SEC,
  DIRECTOR_DOORWAY_HEIGHT,
  DIRECTOR_DOORWAY_RADIUS,
  DIRECTOR_DROPPED_ORBIT_HEIGHT,
  DIRECTOR_DROPPED_ORBIT_RADIUS,
  DIRECTOR_AFTERMATH_HOLD_SEC,
  DIRECTOR_AFTERMATH_RADIUS,
  DIRECTOR_AFTERMATH_CROWD_RANGE,
  DIRECTOR_BATTLE_MIN_ENEMY_RATE,
  DIRECTOR_BATTLE_STAND_RANGE,
  DIRECTOR_FIXED_CHUNK_SEC,
  DIRECTOR_FIXED_HOLD_RADIUS,
  DIRECTOR_FIXED_MAX_SPEED,
  DIRECTOR_GOAL_CAM_HEIGHT,
  DIRECTOR_GOAL_CAM_RADIUS,
  DIRECTOR_MIN_RUN_SEC,
  DIRECTOR_PASS_CONTINUITY_SEC,
  DIRECTOR_MIN_SHOT_HOLD_SEC,
  DIRECTOR_PITCH_CHASE,
  DIRECTOR_PITCH_CROWD,
  DIRECTOR_PITCH_STAND,
  DIRECTOR_TURTLE_INSIDE_HEIGHT,
  DIRECTOR_TURTLE_INSIDE_RADIUS,
  DIRECTOR_TURTLE_THREAT_RANGE,
  DIRECTOR_DIST_CHASE,
  DIRECTOR_INBOUND_DEATH_BEAT_SEC,
  DIRECTOR_INBOUND_MAX_FOLLOW_SEC,
  DIRECTOR_INBOUND_PAYOFF_SEC,
  DIRECTOR_SCRAMBLE_MIN_RUNS,
  DIRECTOR_SCRAMBLE_ORBIT_SPEED,
  DIRECTOR_SCRAMBLE_RADIUS,
  DIRECTOR_SCRAMBLE_RUN_SEC,
  DIRECTOR_DIST_STAND_GUARDED_MAX,
  DIRECTOR_GRAB_OTS_LEAD_SEC,
  DIRECTOR_MIN_POSSESSION_SEC,
  DIRECTOR_DROP_SCENE_RANGE,
  DIRECTOR_REDUNDANT_CUT_RANGE,
} from "./tunables";
import { centroid, clamp, dist } from "./geometry";
import {
  carryDestination,
  eventFlagSlot,
  flagLabel,
  flagPathSpread,
  flagSpeed,
  flagStaysNear,
  playerName,
  sampleAt,
  settledPos,
  heldRunLength,
} from "./dataset";
import type { FlagTrack, PlayersAtSec } from "./dataset";
import {
  orbitShot,
  angleFacingLandmark,
  distanceForSpeed,
  farLandmark,
  onBroadcastSide,
  radiusForSpread,
} from "./framing";
import type { ShotVariety } from "./framing";
import {
  analyzeHeldRun,
  enemiesNear,
  standGuard,
  incomingAttacker,
  approachAim,
  busiestCluster,
  runCrowd,
  someoneNear,
  stableCluster,
  threatsNear,
  turtleHold,
  crowdNear,
} from "./analysis";
import {
  pushReachingBack,
  situationalShot,
  watchPlayersShots,
} from "./shotBuilders";

/** Split a flag segment into per-status sub-shots (chase/dropped/stand),
 *  widening into ceremony framing ahead of a capture. */
/** One contiguous stretch of a flag's status (home / held / field). */
interface StatusRun {
  status: DirectorFlagSample["status"];
  startSec: number;
  endSec: number;
  carrierTargetId: number | null;
}

export function flagSegmentShots(
  startSec: number,
  endSec: number,
  slot: number,
  context: {
    dataset: DirectorDataset;
    track: FlagTrack;
    previous: Shot | undefined;
    playersAtSec: PlayersAtSec;
    /** Plan-wide style rotation counters (shared across segments). */
    variety: ShotVariety;
    /** Match-relative "this is a crowd" threshold (crowdThreshold). */
    crowdMin: number;
  },
): Shot[] {
  const { dataset, track, previous, playersAtSec, variety, crowdMin } = context;
  const label = flagLabel(slot, dataset);
  const runs: StatusRun[] = [];
  for (const sample of track.samples) {
    if (sample.timeSec < startSec || sample.timeSec >= endSec) continue;
    const last = runs[runs.length - 1];
    if (last && last.status === sample.status) {
      last.endSec = sample.timeSec;
      if (sample.carrierTargetId != null) {
        last.carrierTargetId = sample.carrierTargetId;
      }
    } else {
      if (last) last.endSec = sample.timeSec;
      runs.push({
        status: sample.status,
        startSec: last ? sample.timeSec : startSec,
        endSec: sample.timeSec,
        carrierTargetId: sample.carrierTargetId,
      });
    }
  }
  if (runs.length === 0) {
    runs.push({ status: "home", startSec, endSec, carrierTargetId: null });
  }
  runs[runs.length - 1].endSec = endSec;
  // Merge blips shorter than the minimum run into their predecessor.
  for (let i = runs.length - 1; i > 0; i--) {
    if (runs[i].endSec - runs[i].startSec < DIRECTOR_MIN_RUN_SEC) {
      runs[i - 1].endSec = runs[i].endSec;
      runs.splice(i, 1);
    }
  }
  // A short grounding between two carries is a pass: fold the three
  // runs into one continuous carry so the camera rides through it
  // rather than cutting to a dropped-flag framing and back.
  for (let i = runs.length - 2; i > 0; i--) {
    if (
      runs[i].status === "field" &&
      runs[i].endSec - runs[i].startSec < DIRECTOR_PASS_CONTINUITY_SEC &&
      runs[i - 1].status === "held" &&
      runs[i + 1].status === "held"
    ) {
      runs[i - 1].endSec = runs[i + 1].endSec;
      runs.splice(i, 2);
    }
  }

  const capTimes = dataset.events
    .filter((e) => e.type === "flag-cap" && eventFlagSlot(e, dataset) === slot)
    .map((e) => e.timeSec);

  const shots: Shot[] = [];
  // "continuous" only glides between consecutive follows of this flag.
  const flagContinuity = (): "cut" | "continuous" => {
    const last = shots[shots.length - 1] ?? previous;
    return last?.kind === "followFlag" && last.slot === slot
      ? "continuous"
      : "cut";
  };
  const returnTimes = dataset.events
    .filter(
      (e) => e.type === "flag-return" && eventFlagSlot(e, dataset) === slot,
    )
    .map((e) => e.timeSec);
  /**
   * Hold a static camera on the spot where a capture or return just
   * happened. The flag itself has teleported home; following it there
   * is the most anti-climactic cut a broadcast can make — the story for
   * the next beat is the crowd at the scene, not the item.
   */
  /** The flag's sampled path across a span, for path-aware bearings. */
  const flagPath = (fromSec: number, toSec: number): DirectorVec3[] =>
    track.samples
      .filter((sm) => sm.timeSec >= fromSec && sm.timeSec <= toSec)
      .map((sm) => sm.pos);
  const otherFlagCapTimes = dataset.events
    .filter((e) => e.type === "flag-cap" && eventFlagSlot(e, dataset) !== slot)
    .map((e) => e.timeSec);
  const aftermath = (
    endSec: number,
    what: string,
    options?: {
      /** Returns can happen to an EMPTY field (the return timer just
       *  expired) — those get no hold. A capture always has its capper
       *  at the scene, so cap aftermaths never carry this check. */
      requireCrowd?: boolean;
      /**
       * When the aftermath would anchor where this shot already sits,
       * EXTEND it instead of cutting — a cut to a camera six units away
       * is a jolt that changes nothing, and it ruins the ceremony it is
       * supposed to crown. (The runtime's returned-home hold keeps the
       * extended shot from chasing the flag's teleport.)
       */
      mergeInto?: Shot;
    },
  ): void => {
    // The OTHER flag capping during the hold outranks it absolutely —
    // the returned-flag area is yesterday's news the moment a cap is in
    // flight. Skip the hold and let the cap's coverage own the time.
    // (This flag's own cap is what the aftermath is FOR — never
    // self-suppress on it.)
    if (
      otherFlagCapTimes.some(
        (c) => c > endSec - 1 && c < endSec + DIRECTOR_AFTERMATH_HOLD_SEC + 2,
      )
    ) {
      return;
    }
    // The last place the flag was BEFORE going home — on a short
    // possession, endSec can land after the teleport-home sample, which
    // would anchor the "aftermath" at the flag's own stand across the
    // map from where anything happened.
    let pos: DirectorVec3 | undefined;
    for (let back = 0.4; back <= 3; back += 0.5) {
      const sample = sampleAt(track.samples, endSec - back);
      if (sample && sample.status !== "home") {
        pos = sample.pos;
        break;
      }
    }
    if (!pos) return;
    // A return only earns a lingering hold when there is a SCENE — two
    // or more players doing something in the aftermath. One returner
    // touching an empty field (or a bare timer expiry) does not.
    if (
      options?.requireCrowd &&
      crowdNear(
        endSec - 1,
        endSec + 2,
        pos,
        DIRECTOR_AFTERMATH_CROWD_RANGE,
        playersAtSec,
      ) < 2
    ) {
      return;
    }
    const into = options?.mergeInto;
    if (
      into?.kind === "fixedOrbit" &&
      dist(pos, into.center) <= DIRECTOR_REDUNDANT_CUT_RANGE
    ) {
      into.endSec = endSec + DIRECTOR_AFTERMATH_HOLD_SEC;
      return;
    }
    shots.push(
      orbitShot({
        center: pos,
        radius: DIRECTOR_AFTERMATH_RADIUS,
        framing: { dataset, variety },
        still: true,
        heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
        startSec: endSec,
        endSec: endSec + DIRECTOR_AFTERMATH_HOLD_SEC,
        reason: `Aftermath — ${what}`,
      }),
    );
  };
  const ctx: RunCtx = {
    slot,
    label,
    dataset,
    track,
    playersAtSec,
    variety,
    crowdMin,
    shots,
    capTimes,
    returnTimes,
    flagPath,
    aftermath,
    flagContinuity,
  };
  for (let ri = 0; ri < runs.length; ri++) {
    const skipTo = scrambleGroupShots(ri, runs, ctx);
    if (skipTo != null) {
      ri = skipTo;
      continue;
    }
    const run = runs[ri];
    if (run.status === "field" && fieldRunShots(run, ctx)) continue;
    if (run.status !== "held") {
      standRunShots(run, ctx);
      continue;
    }
    heldRunShots(run, ctx);
  }
  return shots;
}

/** Everything a run-kind emitter needs, built once per flag segment. */
interface RunCtx {
  slot: number;
  label: string;
  dataset: DirectorDataset;
  track: FlagTrack;
  playersAtSec: PlayersAtSec;
  variety: ShotVariety;
  crowdMin: number;
  shots: Shot[];
  capTimes: number[];
  returnTimes: number[];
  flagPath: (fromSec: number, toSec: number) => DirectorVec3[];
  aftermath: (
    endSec: number,
    what: string,
    options?: { requireCrowd?: boolean; mergeInto?: Shot },
  ) => void;
  flagContinuity: () => "cut" | "continuous";
}

/**
 * A scramble — several short possessions in one area — collapses into
 * ONE slowly rotating overhead. Returns the run index to resume from,
 * or null when this run starts no scramble.
 */
function scrambleGroupShots(
  ri: number,
  runs: StatusRun[],
  ctx: RunCtx,
): number | null {
  const run = runs[ri];
  const {
    slot,
    label,
    dataset,
    track,
    playersAtSec,
    variety,
    shots,
    returnTimes,
    flagPath,
    aftermath,
  } = ctx;
  // A scramble — several short possessions in one area — gets ONE
  // slowly rotating overhead that pans with the flag, instead of a
  // jump cut on every grab and drop.
  const anchor = sampleAt(track.samples, run.startSec + 0.25)?.pos;
  let scrambleEnd = ri;
  while (
    anchor &&
    scrambleEnd < runs.length &&
    runs[scrambleEnd].endSec - runs[scrambleEnd].startSec <=
      DIRECTOR_SCRAMBLE_RUN_SEC &&
    flagStaysNear(
      runs[scrambleEnd].startSec,
      runs[scrambleEnd].endSec,
      track,
      anchor,
      DIRECTOR_SCRAMBLE_RADIUS,
    )
  ) {
    scrambleEnd++;
  }
  if (scrambleEnd - ri >= DIRECTOR_SCRAMBLE_MIN_RUNS) {
    const spanEnd = runs[scrambleEnd - 1].endSec;
    const spread = flagPathSpread(run.startSec, spanEnd, track, playersAtSec);
    const center = spread?.center ?? anchor!;
    const scrambleRadius = radiusForSpread(
      spread?.spread ?? DIRECTOR_SCRAMBLE_RADIUS / 2,
      dataset,
    );
    shots.push(
      orbitShot({
        center,
        radius: scrambleRadius,
        framing: { dataset, variety },
        avoidPath: flagPath(run.startSec, spanEnd),
        angularSpeed: DIRECTOR_SCRAMBLE_ORBIT_SPEED,
        heightFactor: DIRECTOR_CROWD_ORBIT_HEIGHT,
        lookSubject: { type: "flag", slot },
        startSec: run.startSec,
        endSec: spanEnd,
        reason: `Scramble over the ${label} — holding the overhead`,
      }),
    );
    const returned = returnTimes.some((rt) => Math.abs(rt - spanEnd) <= 2.5);
    if (returned) {
      aftermath(spanEnd, `${label} returned`, { requireCrowd: true });
    }
    return scrambleEnd - 1;
  }
  return null;
}

/**
 * A dropped flag lying in the field. True when this emitter covered the
 * run; false falls through to the stand treatment (an uncontested drop
 * with nobody grouped anywhere is exactly as dull as an idle stand).
 */
function fieldRunShots(run: StatusRun, ctx: RunCtx): boolean {
  const {
    slot,
    label,
    dataset,
    track,
    playersAtSec,
    variety,
    crowdMin,
    shots,
    returnTimes,
    flagPath,
    aftermath,
  } = ctx;
  // Dropped flag: a locked close orbit on a flag lying still is dead
  // air — park a stationary, zoomed-out camera over the area instead
  // and let returners/re-grabbers converge on screen.
  const center =
    settledPos(run, track) ??
    dataset.flagStands.find((s) => s.slot === slot)?.pos;
  // ...but only while somebody is actually contesting it. A flag
  // lying alone in a field is exactly as dull as an idle flagstand,
  // so when nobody is near it, go watch the players instead.
  const contested =
    center != null &&
    someoneNear(
      run.startSec,
      run.endSec,
      center,
      DIRECTOR_CONTESTED_RANGE,
      playersAtSec,
    );
  if (center && contested) {
    const crowded = runCrowd(run, track, playersAtSec) >= crowdMin;
    // Dead static and angled so a base sits behind the flag: the
    // point is to watch it fall, slide and get contested from a
    // vantage point, with the location established.
    variety.fixedCount++;
    const droppedAngle = farLandmark(center, dataset)
      ? onBroadcastSide(
          angleFacingLandmark(center, farLandmark(center, dataset)!),
          dataset,
        )
      : undefined;
    // Widen for whoever (and whatever) is converging on the drop: the
    // returner racing a re-grabber, or the shrike the capper is trying
    // to reach — the scene around the flag IS the shot.
    const sceneSpread = dropSceneSpread(run, center, dataset, playersAtSec);
    shots.push(
      orbitShot({
        center,
        radius: Math.max(
          DIRECTOR_DROPPED_ORBIT_RADIUS,
          radiusForSpread(sceneSpread, dataset),
        ),
        angle: droppedAngle,
        avoidPath: flagPath(run.startSec, run.endSec),
        still: true,
        heightFactor: crowded
          ? DIRECTOR_CROWD_ORBIT_HEIGHT
          : DIRECTOR_DROPPED_ORBIT_HEIGHT,
        lookSubject: { type: "flag", slot },
        startSec: run.startSec,
        endSec: run.endSec,
        reason: `${label} on the ground — wide view`,
      }),
    );
    if (returnTimes.some((rt) => Math.abs(rt - run.endSec) <= 2.5)) {
      aftermath(run.endSec, `${label} returned`, { requireCrowd: true });
    }
    return true;
  }
  const elsewhere = watchPlayersShots(
    run.startSec,
    run.endSec,
    `${label} down, uncontested`,
    dataset,
    playersAtSec,
    center ?? null,
    slot,
    variety,
  );
  if (elsewhere.length > 0) {
    shots.push(...elsewhere);
    return true;
  }
  return false;
}

/**
 * A contested stand — a MIXED crowd actually fighting at it — covered
 * as chunked battle overheads, with duels, barrages and suit-ups taking
 * every other turn. Early-game same-team spawn crowds do not qualify:
 * an overhead of teammates waiting is an overhead of nothing. True when
 * this emitter covered the run.
 */
function standBattleShots(run: StatusRun, ctx: RunCtx): boolean {
  const {
    slot,
    label,
    dataset,
    track,
    playersAtSec,
    variety,
    crowdMin,
    shots,
    flagPath,
  } = ctx;
  const stand = dataset.flagStands.find((s) => s.slot === slot);
  if (
    !stand ||
    runCrowd(run, track, playersAtSec) < crowdMin ||
    enemiesNear(run.startSec, run.endSec, stand.pos, slot, playersAtSec) <
      (run.endSec - run.startSec) * DIRECTOR_BATTLE_MIN_ENEMY_RATE
  ) {
    return false;
  }
  // A contested stand is a battle, but one camera on it for
  // minutes is a stare — chunk it and let duels, barrages and
  // suit-ups take their turn between the overheads.
  for (let t = run.startSec; t < run.endSec; t += DIRECTOR_FIXED_CHUNK_SEC) {
    const chunkEnd = Math.min(t + DIRECTOR_FIXED_CHUNK_SEC, run.endSec);
    if (chunkEnd - t < DIRECTOR_MIN_RUN_SEC) {
      if (shots.length > 0) shots[shots.length - 1].endSec = chunkEnd;
      break;
    }
    // Every other chunk goes looking for something else happening.
    const situational =
      variety.fixedCount % 2 === 1
        ? situationalShot(t, chunkEnd, dataset, playersAtSec, variety)
        : null;
    if (situational) {
      pushReachingBack(shots, situational, run.startSec);
      continue;
    }
    const cluster = stableCluster(
      t,
      chunkEnd,
      playersAtSec,
      DIRECTOR_FIXED_HOLD_RADIUS,
    );
    // The biggest knot on the MAP is not necessarily the battle at
    // THIS stand — early game it is usually the other team around
    // their own base. A shot named after this flag must be framed
    // here.
    const battle =
      cluster && dist(cluster.center, stand.pos) <= DIRECTOR_BATTLE_STAND_RANGE
        ? cluster
        : null;
    const battleCenter = battle?.center ?? stand.pos;
    const battleRadius = battle
      ? radiusForSpread(battle.spread, dataset)
      : DIRECTOR_CROWD_ORBIT_RADIUS;
    shots.push(
      orbitShot({
        center: battleCenter,
        radius: battleRadius,
        framing: { dataset, variety },
        avoidPath: flagPath(t, chunkEnd),
        heightFactor: DIRECTOR_CROWD_ORBIT_HEIGHT,
        lookSubject: { type: "flag", slot },
        startSec: t,
        endSec: chunkEnd,
        reason: `${label} stand — battle overhead`,
      }),
    );
  }
  return true;
}

/**
 * How far the scene around a dropped flag extends: players and vehicles
 * within converging range during the run's opening seconds.
 */
function dropSceneSpread(
  run: StatusRun,
  center: DirectorVec3,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): number {
  let spread = 0;
  const window = Math.min(run.endSec, run.startSec + 4);
  for (let sec = Math.floor(run.startSec); sec <= window; sec++) {
    for (const p of playersAtSec.get(sec) ?? []) {
      const d = dist(p.pos, center);
      if (d <= DIRECTOR_DROP_SCENE_RANGE && d > spread) spread = d;
    }
  }
  for (const v of dataset.vehicles ?? []) {
    if (v.timeSec < run.startSec || v.timeSec > window) continue;
    const d = dist(v.pos, center);
    if (d <= DIRECTOR_DROP_SCENE_RANGE && d > spread) spread = d;
  }
  return spread;
}

/** A real (non-fumble) grab arriving at this stand run's end, with the
 *  approach aim for the classic stand camera and whether this one takes
 *  the over-the-shoulder ride-in instead (every other grab does — the
 *  stand camera shouldn't be the only way a grab ever looks). */
function comingGrab(
  run: StatusRun,
  ctx: RunCtx,
): {
  aim: ShotAim | undefined;
  rideIn: boolean;
  grabber: number | null;
  anchor: DirectorVec3 | undefined;
} | null {
  const { slot, dataset, track, playersAtSec, variety } = ctx;
  const grab = track.grabTimes.find(
    (g) =>
      g >= run.endSec - 1 &&
      g <= run.endSec + 2.5 &&
      heldRunLength(track, g + 0.75) >= DIRECTOR_MIN_POSSESSION_SEC,
  );
  if (grab == null) return null;
  const stand = dataset.flagStands.find((s) => s.slot === slot);
  const anchor = sampleAt(track.samples, run.endSec - 0.25)?.pos ?? stand?.pos;
  const aim = anchor
    ? approachAim(grab, slot, anchor, dataset, playersAtSec)
    : undefined;
  const grabber = sampleAt(track.samples, grab + 0.75)?.carrierTargetId ?? null;
  variety.grabViews = (variety.grabViews ?? 0) + 1;
  const rideIn =
    grabber != null && variety.grabViews % 2 === 0 && anchor != null;
  return { aim, rideIn, grabber, anchor };
}

/** The over-the-shoulder grab: a quiet stand hold, then riding the
 *  grabber in for the final seconds, the stand coming to THEM. */
function standGrabRideIn(
  run: StatusRun,
  ctx: RunCtx,
  coming: { grabber: number | null; anchor: DirectorVec3 | undefined },
): void {
  const { slot, label, dataset, shots, flagContinuity } = ctx;
  const otsStart = Math.max(
    run.startSec,
    run.endSec - DIRECTOR_GRAB_OTS_LEAD_SEC,
  );
  if (otsStart - run.startSec >= DIRECTOR_MIN_SHOT_HOLD_SEC) {
    shots.push({
      kind: "followFlag",
      slot,
      transitionIn: flagContinuity(),
      distance: DIRECTOR_DIST_STAND,
      pitch: DIRECTOR_PITCH_STAND,
      startSec: run.startSec,
      endSec: otsStart,
      reason: `${label} at the stand`,
    });
  }
  shots.push({
    kind: "followPlayer",
    targetId: coming.grabber!,
    distance: DIRECTOR_DIST_HERO,
    pitch: DIRECTOR_PITCH_CHASE,
    aim: { mode: "toward", target: coming.anchor! },
    startSec: otsStart,
    endSec: run.endSec,
    transitionIn: "cut",
    reason: `${playerName(coming.grabber!, dataset) ?? "The grabber"} going in for the ${label}`,
  });
}

/**
 * A flag at (or falling back to) its stand: the battle treatment when a
 * mixed crowd is fighting over it, the grabber's approach or ride-in
 * when a grab is coming, players elsewhere when nothing is, and the
 * defender two-shot / hip-view rotation for a guarded quiet stand.
 */
function standRunShots(run: StatusRun, ctx: RunCtx): void {
  const { slot, label, dataset, playersAtSec, variety, shots, flagContinuity } =
    ctx;
  const stand = dataset.flagStands.find((s) => s.slot === slot);
  if (standBattleShots(run, ctx)) return;
  // Quiet stand: orbit the flag, holding the grabber's approach
  // bearing when a grab is coming. A grab that is instantly fumbled
  // gets NO approach treatment — the ride-in and the held bearing sell
  // a run that never happens.
  const coming = comingGrab(run, ctx);
  if (coming?.rideIn) {
    standGrabRideIn(run, ctx, coming);
    return;
  }
  const aim = coming?.aim;
  // Nothing coming: a flag sitting on its stand is the least
  // interesting thing on the map, so go find the players instead —
  // a wide overhead on the biggest knot of them. Only when nobody
  // is grouped up anywhere does the base itself get the shot. (An
  // imminent grab keeps the close shot on the flag regardless.)
  if (coming == null && run.endSec - run.startSec >= DIRECTOR_MIN_RUN_SEC) {
    const emitted = watchPlayersShots(
      run.startSec,
      run.endSec,
      `${label} home`,
      dataset,
      playersAtSec,
      stand?.pos ?? null,
      slot,
      variety,
    );
    if (emitted.length > 0) {
      shots.push(...emitted);
      return;
    }
  }
  // A defender posted by the flag makes the shot: widen so both read
  // together, and aim across the flag at them (a grab-approach aim,
  // when one exists, still wins).
  const guard = stand
    ? standGuard(run.startSec, run.endSec, stand.pos, slot, playersAtSec)
    : null;
  // Vary the guarded-stand POV: a tight low camera at the defender's
  // hip for the wait, handing off to the flag shot — same subject,
  // different eye, so a stretch of quiet stands isn't a string of
  // identical wide frames. Alternates with the classic widened two-shot
  // across the stands where a hip view fits (short pre-grab stands
  // aren't counted, or the rotation would skip without ever showing
  // one). A grab-approach aim still owns the final seconds either way.
  if (guard) {
    const hipEnd =
      aim != null
        ? Math.max(run.startSec, run.endSec - DIRECTOR_STAND_APPROACH_TAIL_SEC)
        : run.endSec;
    const hipFits = hipEnd - run.startSec >= DIRECTOR_MIN_SHOT_HOLD_SEC;
    const hipTurn = hipFits && (variety.standViews ?? 0) % 2 === 0;
    if (hipFits) variety.standViews = (variety.standViews ?? 0) + 1;
    if (hipTurn) {
      shots.push({
        kind: "followPlayer",
        targetId: guard.targetId,
        distance: DIRECTOR_DIST_HIP,
        pitch: DIRECTOR_PITCH_HIP,
        aim: { mode: "toward", target: stand!.pos },
        startSec: run.startSec,
        endSec: hipEnd,
        transitionIn: "cut",
        reason: `${label} at the stand — from ${playerName(guard.targetId, dataset) ?? "the defender"}'s hip`,
      });
      if (aim == null) return;
      shots.push({
        kind: "followFlag",
        slot,
        transitionIn: "cut",
        distance: DIRECTOR_DIST_STAND,
        pitch: DIRECTOR_PITCH_STAND,
        aim,
        startSec: hipEnd,
        endSec: run.endSec,
        reason: `${label} at the stand`,
      });
      return;
    }
  }
  shots.push({
    kind: "followFlag",
    slot,
    transitionIn: flagContinuity(),
    distance: guard
      ? clamp(
          guard.dist * 1.6,
          DIRECTOR_DIST_STAND,
          DIRECTOR_DIST_STAND_GUARDED_MAX,
        )
      : DIRECTOR_DIST_STAND,
    pitch: DIRECTOR_PITCH_STAND,
    aim: aim ?? (guard ? { mode: "toward", target: guard.pos } : undefined),
    startSec: run.startSec,
    endSec: run.endSec,
    reason: guard
      ? `${label} at the stand — with its defender`
      : `${label} at the stand`,
  });
  return;
}

/**
 * A turtled carrier: parked inside a base with the flag. Chunked so
 * each pass re-reads the siege — the carrier holed up inside, a
 * scan-verified inbound attacker, the doorway from outside — with
 * situational cut-ins (duels, barrages, suit-ups) taking every other
 * turn. True when this emitter covered the run.
 */
function turtleRunShots(run: StatusRun, ctx: RunCtx): boolean {
  const {
    slot,
    label,
    dataset,
    track,
    playersAtSec,
    variety,
    shots,
    flagPath,
  } = ctx;
  // Turtling: parked inside a base with the flag. Alternate the
  // carrier holed up inside with the attackers massing at the doors,
  // chunked so each pass re-reads the situation.
  const turtle = turtleHold(run, track, dataset, playersAtSec);
  if (!turtle) return false;
  {
    for (let t = run.startSec; t < run.endSec; t += DIRECTOR_FIXED_CHUNK_SEC) {
      const chunkEnd = Math.min(t + DIRECTOR_FIXED_CHUNK_SEC, run.endSec);
      if (chunkEnd - t < DIRECTOR_MIN_RUN_SEC) {
        if (shots.length > 0) shots[shots.length - 1].endSec = chunkEnd;
        break;
      }
      // Re-anchor per chunk: over a long hold the carrier shuffles
      // around inside the base, and a 12m camera pinned to the whole
      // run's centroid ends up staring at the wall they left.
      const holdCenter =
        flagPathSpread(t, chunkEnd, track)?.center ?? turtle.center;
      const threat = threatsNear(t, chunkEnd, holdCenter, slot, playersAtSec);
      const pressing =
        threat != null &&
        dist(threat.center, holdCenter) <= DIRECTOR_TURTLE_THREAT_RANGE;
      // With enemies right on top of them the inside shot is the
      // story; otherwise rotate inside → incoming attacker → doorway,
      // so a long stalemate shows the siege from outside too.
      const rotation = variety.fixedCount % 3;
      if (!pressing && rotation === 1) {
        const inbound = incomingAttacker(
          t,
          chunkEnd,
          holdCenter,
          slot,
          dataset,
          playersAtSec,
        );
        if (inbound) {
          variety.fixedCount++;
          // Ride THROUGH the payoff the scan verified — the kill, the
          // flag touch, the asset hit (or the death that ends the
          // charge) — never to a chunk boundary that cuts away right
          // before it. The turtle run's own end still caps the shot,
          // so a return or capture preempts.
          const horizon = Math.min(
            run.endSec,
            t + DIRECTOR_INBOUND_MAX_FOLLOW_SEC,
          );
          // Floor at a legible shot, NOT at the chunk: a death early
          // in the chunk ends the story — holding to the chunk edge
          // would follow a corpse.
          const followEnd = clamp(
            inbound.payoff.sec +
              (inbound.payoff.kind === "death"
                ? DIRECTOR_INBOUND_DEATH_BEAT_SEC
                : DIRECTOR_INBOUND_PAYOFF_SEC),
            Math.min(t + DIRECTOR_MIN_SHOT_HOLD_SEC, run.endSec),
            horizon,
          );
          shots.push({
            kind: "followPlayer",
            targetId: inbound.targetId,
            distance: DIRECTOR_DIST_CHASE,
            pitch: DIRECTOR_PITCH_CHASE,
            aim: { mode: "toward", target: holdCenter },
            startSec: t,
            endSec: followEnd,
            transitionIn: "cut",
            reason: `${playerName(inbound.targetId, dataset) ?? "An attacker"} inbound on the turtled ${label} — ${
              {
                kill: "gets a kill",
                flag: "reaches the flag",
                asset: "hits the base",
                death: "cut down",
              }[inbound.payoff.kind]
            }`,
          });
          // Skip the chunks the extended follow consumed.
          t = followEnd - DIRECTOR_FIXED_CHUNK_SEC;
          continue;
        }
      }
      const inside = pressing || rotation === 0;
      shots.push(
        inside
          ? orbitShot({
              center: holdCenter,
              radius: DIRECTOR_TURTLE_INSIDE_RADIUS,
              framing: { dataset, variety },
              avoidPath: flagPath(t, chunkEnd),
              still: true,
              heightFactor: DIRECTOR_TURTLE_INSIDE_HEIGHT,
              lookSubject: { type: "flag", slot },
              startSec: t,
              endSec: chunkEnd,
              reason: `${label} held inside the base${
                pressing ? " — enemies on top of them" : ""
              }`,
            })
          : orbitShot({
              center: threat?.center ?? holdCenter,
              radius: DIRECTOR_DOORWAY_RADIUS,
              framing: { dataset, variety },
              still: true,
              heightFactor: DIRECTOR_DOORWAY_HEIGHT,
              doorwayOf: holdCenter,
              startSec: t,
              endSec: chunkEnd,
              reason: `${label} turtled — watching the doors`,
            }),
      );
    }
  }
  return true;
}

/**
 * A carried flag: turtle coverage (inside / inbound attacker / doorway)
 * when the carrier holes up, otherwise chase segments rotating camera
 * styles, widening into the capture ceremony when the run ends in one.
 */
function heldRunShots(run: StatusRun, ctx: RunCtx): void {
  const {
    slot,
    label,
    dataset,
    track,
    playersAtSec,
    variety,
    crowdMin,
    shots,
    capTimes,
    flagPath,
    aftermath,
    flagContinuity,
  } = ctx;
  // A turtled carrier takes its own coverage — decide that before any
  // of the chase analysis below is paid for.
  if (turtleRunShots(run, ctx)) return;
  const carrier = playerName(run.carrierTargetId, dataset);
  // Carried flag: locked chase by default; long uncontested forward
  // chases alternate onto the cinematic dolly for variety.
  const { aim, crowded } = analyzeHeldRun(
    run,
    slot,
    dataset,
    track,
    playersAtSec,
    crowdMin,
  );
  const reason = `${label} carried${carrier ? ` by ${carrier}` : ""}${
    crowded ? " — heavy fighting" : ""
  }`;
  // A chase framed on the carrier's own instantaneous heading mostly
  // shows the ground they're crossing. Aim across them at where the
  // run is going instead — their own stand, or the crowd they're
  // skiing into — so defenders and the destination are in frame.
  const destination = carryDestination(slot, dataset);
  const crowdAhead = busiestCluster(run.startSec, run.endSec, playersAtSec);
  const chaseAim: ShotAim =
    aim.mode === "forward" && destination
      ? { mode: "toward", target: destination }
      : aim.mode === "forward" &&
          crowdAhead &&
          crowdAhead.count >= DIRECTOR_CLUSTER_CAM_MIN_PLAYERS
        ? { mode: "toward", target: crowdAhead.center }
        : aim;
  // Build the chase as one or more segments, each taking the next
  // camera style, so a long carry changes angle instead of holding a
  // single orbit for a minute and a half.
  const makeChase = (segStart: number, segEnd: number): Shot => {
    let style = 0;
    if (segEnd - segStart >= DIRECTOR_DOLLY_MIN_SEC) {
      // 0-based so the first qualifying segment is the plain locked
      // shot and the next is the dolly.
      style = variety.dollyCount % DIRECTOR_CHASE_STYLES;
      variety.dollyCount++;
    }
    if (style === 1 && !crowded) {
      // Tracking distance scales with pace, like every follow shot: a
      // 12m offset on a full-speed skier fills the frame with one body.
      const pace = flagSpeed(segStart, segEnd, track);
      const [a, b] = dataset.flagStands;
      return {
        kind: "dolly",
        subject: { type: "flag", slot },
        distance: Math.max(DIRECTOR_DOLLY_DISTANCE, distanceForSpeed(pace)),
        height: DIRECTOR_DOLLY_HEIGHT,
        awayFrom: a && b ? centroid([a.pos, b.pos]) : undefined,
        side:
          Math.floor(variety.dollyCount / DIRECTOR_CHASE_STYLES) % 2 === 0
            ? 1
            : -1,
        startSec: segStart,
        endSec: segEnd,
        transitionIn: "cut",
        reason: `${reason} — tracking shot`,
      };
    }
    // Whenever the carrier isn't actually covering ground — pinned
    // down, fighting through a base, waiting on a route — a fixed
    // wide angle beats orbiting them, so take it in preference to
    // the lock and let the lock be the last resort.
    const spread = flagPathSpread(segStart, segEnd, track, playersAtSec);
    const pace = flagSpeed(segStart, segEnd, track);
    if (
      spread != null &&
      spread.spread <= DIRECTOR_FIXED_HOLD_RADIUS &&
      (pace == null || pace <= DIRECTOR_FIXED_MAX_SPEED)
    ) {
      return orbitShot({
        center: spread.center,
        radius: radiusForSpread(spread.spread, dataset),
        framing: { dataset, variety },
        avoidPath: flagPath(segStart, segEnd),
        heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
        lookSubject: { type: "flag", slot },
        startSec: segStart,
        endSec: segEnd,
        reason: `${reason} — fixed angle`,
      });
    }
    return {
      kind: "followFlag",
      slot,
      transitionIn: flagContinuity(),
      // Width follows pace: tight on a walker, wide on a skier.
      distance: crowded
        ? DIRECTOR_DIST_CROWD
        : distanceForSpeed(flagSpeed(segStart, segEnd, track)),
      pitch: crowded ? DIRECTOR_PITCH_CROWD : DIRECTOR_PITCH_CHASE,
      aim: chaseAim,
      startSec: segStart,
      endSec: segEnd,
      reason,
    };
  };
  /** Split [from, to) into chase segments, styles rotating. */
  const chaseSegments = (from: number, to: number): Shot[] => {
    const out: Shot[] = [];
    const count = Math.max(
      1,
      Math.round((to - from) / DIRECTOR_CHASE_SEGMENT_SEC),
    );
    const step = (to - from) / count;
    for (let i = 0; i < count; i++) {
      const segStart = from + step * i;
      const segEnd = i === count - 1 ? to : from + step * (i + 1);
      out.push(makeChase(segStart, segEnd));
    }
    return out;
  };
  // Widen into ceremony framing ahead of a capture ending this run.
  // The cap message can lag the sampled "home" flip by a couple of
  // seconds, so accept caps landing shortly after the run.
  const cap = capTimes.find((t) => t > run.startSec && t <= run.endSec + 2.5);
  if (
    cap != null &&
    cap - run.startSec > DIRECTOR_CAP_PREROLL_SEC + DIRECTOR_MIN_RUN_SEC
  ) {
    const ceremonyStart = cap - DIRECTOR_CAP_PREROLL_SEC;
    const lead = chaseSegments(run.startSec, ceremonyStart);
    shots.push(...lead);
    // The cap itself is the one moment a camera at the stand works:
    // the carrier is arriving there, so a wide fixed shot holds them,
    // the base and the defence together. Only take it if the carrier
    // really is closing on the stand by then.
    const goalCam =
      destination != null &&
      flagStaysNear(
        ceremonyStart,
        run.endSec,
        track,
        destination,
        DIRECTOR_FIXED_HOLD_RADIUS * 2,
      );
    // Broadcast stays with the scorer after a goal; the capture shot
    // is followed by a beat on the player who made it.
    const capturer = dataset.events.find(
      (e) =>
        e.type === "flag-cap" &&
        Math.abs(e.timeSec - cap) <= 2.5 &&
        e.capturer != null,
    )?.capturer;
    const capturerTargetId =
      capturer != null
        ? (dataset.playerNames.find((pl) => pl.name === capturer.toLowerCase())
            ?.targetId ?? null)
        : null;
    shots.push(
      goalCam
        ? orbitShot({
            center: destination!,
            radius: DIRECTOR_GOAL_CAM_RADIUS,
            still: true,
            heightFactor: DIRECTOR_GOAL_CAM_HEIGHT,
            lookSubject: { type: "flag", slot },
            startSec: ceremonyStart,
            endSec: run.endSec,
            reason: `${label} capture incoming — fixed camera at the stand`,
          })
        : {
            kind: "followFlag",
            slot,
            // Only a locked chase has orbit continuity to inherit;
            // the dolly snaps in fresh.
            transitionIn:
              lead[lead.length - 1]?.kind === "followFlag"
                ? "continuous"
                : "cut",
            distance: DIRECTOR_DIST_CEREMONY,
            pitch: DIRECTOR_PITCH_CHASE,
            aim: destination
              ? { mode: "toward", target: destination }
              : { mode: "forward" },
            startSec: ceremonyStart,
            endSec: run.endSec,
            reason: `${label} capture incoming`,
          },
    );
    const ceremonyShot = shots[shots.length - 1];
    if (
      capturerTargetId != null &&
      run.endSec - cap >= DIRECTOR_MIN_SHOT_HOLD_SEC
    ) {
      // Trim the capture shot at the cap and hold on the scorer.
      shots[shots.length - 1].endSec = cap;
      shots.push({
        kind: "followPlayer",
        targetId: capturerTargetId,
        distance: DIRECTOR_DIST_HERO,
        pitch: DIRECTOR_PITCH_CHASE,
        aim: { mode: "backward" },
        startSec: cap,
        endSec: run.endSec,
        transitionIn: "cut",
        reason: `${capturer} celebrates the capture`,
      });
    }
    // A goal-cam ceremony already sits ON the aftermath spot: extend it
    // through the exhale rather than cutting to a camera feet away.
    aftermath(run.endSec, `${label} captured`, {
      mergeInto:
        goalCam && shots[shots.length - 1] === ceremonyShot
          ? ceremonyShot
          : undefined,
    });
  } else {
    shots.push(...chaseSegments(run.startSec, run.endSec));
    const cap2 = capTimes.find(
      (t) => Math.abs(t - run.endSec) <= 2.5 && t > run.startSec,
    );
    if (cap2 != null) aftermath(run.endSec, `${label} captured`);
  }
}
