import { castWorldRay } from "../collision/worldCollision";
import { orbitLiftFactor, sweepClock, sweepProgress } from "./cameraRig";
import type { CausalView } from "./causalView";
import { flagLabel, targetIdForName } from "./dataset";
import {
  distanceForSpeed,
  orbitShot,
  onBroadcastSide,
  type ShotVariety,
} from "./framing";
import { aimOf } from "./freeSpace";
import { bearingYaw, centroid, dist } from "./geometry";
import { PLAYER_AIM_LIFT } from "./humanScale";
import {
  shotPoseAt,
  subjectInFrame,
  subjectVisible,
  type ShotPose,
} from "./shotPath";
import {
  DIRECTOR_CAP_REACTION_SEC,
  DIRECTOR_CAP_SHOT_DISTANCE,
  DIRECTOR_DEATH_REACTION_SEC,
  DIRECTOR_DIST_FAST,
  DIRECTOR_DROPPED_ORBIT_HEIGHT,
  DIRECTOR_DROPPED_ORBIT_RADIUS,
  DIRECTOR_EVENT_LEAD_SEC,
  DIRECTOR_FIXED_MAX_SPEED,
  DIRECTOR_GRAB_CHASE_DIST,
  DIRECTOR_MIN_SHOT_SEC,
  DIRECTOR_PITCH_CHASE,
} from "./tunables";
import type {
  DirectorEvent,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  Shot,
  ShotSubject,
} from "./types";

/** Keep the scorer or the stand in view across the score. */
export function createCaptureShot(
  view: CausalView,
  variety: ShotVariety,
  slot: number,
  event: DirectorEvent,
  now: number,
): Shot | null {
  const capSec = event.timeSec;
  const endSec = capSec + DIRECTOR_CAP_REACTION_SEC;
  const at = view.flagAt(slot, capSec - 0.5);
  const stand = view.carryDestination(slot);
  const scorer =
    (event.capturer
      ? targetIdForName(event.capturer, view.dataset, capSec)
      : null) ?? (at?.status === "held" ? at.carrierTargetId : null);
  const reason = `${flagLabel(slot, view.dataset)} — scoring play`;
  const subject = { type: "flag" as const, slot };
  const runner = scorer == null ? null : view.playerAt(scorer);
  if (stand && runner) {
    const finish = finishAtStand(view, runner.targetId, stand, capSec, {
      startSec: now,
      endSec,
      reason: `${reason} at the stand`,
      topic: "capture",
    });
    if (finish) return { ...finish, subject };
  }
  // Follow the scorer if the approach does not fit in a single frame.
  // The flag itself teleports back to the other base on a score.
  if (runner && now - runner.timeSec <= 1.5) {
    return {
      kind: "followPlayer",
      subject,
      targetId: runner.targetId,
      distance: DIRECTOR_DIST_FAST,
      pitch: DIRECTOR_PITCH_CHASE,
      aim: { mode: "forward" },
      startSec: now,
      endSec,
      transitionIn: "cut",
      reason,
      topic: "capture",
    };
  }
  // Without a scoped runner, cover the scoring end in a single fixed shot.
  const finish = scorer == null ? null : view.playerAt(scorer, capSec)?.pos;
  // A stale carry sample can still be halfway along the approach. Set
  // the cut at the scoring end and fit the scorer and stand together.
  const observed = finish ?? (at?.status === "held" ? at.pos : null);
  const center =
    stand && observed && dist(stand, observed) <= DIRECTOR_CAP_SHOT_DISTANCE
      ? centroid([stand, observed])
      : (stand ?? observed);
  if (!center) return null;
  const shot = orbitShot({
    center,
    radius: DIRECTOR_CAP_SHOT_DISTANCE,
    still: true,
    startSec: now,
    endSec,
    framing: { dataset: view.dataset, variety },
    reason,
    topic: "capture",
  });
  shot.subject = subject;
  return shot;
}

type FixedOrbit = ReturnType<typeof orbitShot>;
type Sweep = Extract<Shot, { kind: "sweep" }>;
type FlagAreaShot = FixedOrbit | Sweep;

export function flagAreaSubject(
  shot?: Pick<Shot, "kind" | "subject"> & { lookSubject?: ShotSubject },
) {
  if (shot?.kind !== "fixedOrbit" && shot?.kind !== "sweep") return;
  if (shot.subject?.type === "flag") return shot.subject;
  if (shot.kind === "fixedOrbit" && shot.lookSubject?.type === "flag")
    return shot.lookSubject;
}

/** An area view can hold a pickup only while the runner stays in the scene. */
export function flagAreaViewSees(
  shot: FlagAreaShot,
  pos: DirectorVec3,
  timeSec: number,
): boolean {
  const aim = playerAim(pos);
  if (shot.kind === "sweep") {
    const pose = shotPoseAt(
      shot,
      sweepProgress(shot, sweepClock(shot, timeSec)),
    )!;
    return (
      dist(pose.aim, pos) <= DIRECTOR_DROPPED_ORBIT_RADIUS &&
      subjectInFrame(pose, aim)
    );
  }
  const anchor = shot.staged?.anchor ?? shot.center;
  const radius = Math.max(
    shot.staged?.radius ?? shot.radius,
    DIRECTOR_GRAB_CHASE_DIST,
  );
  if (dist(anchor, pos) > radius) return false;

  const elapsed = Math.max(0, timeSec - shot.startSec);
  const fraction = elapsed / Math.max(0.001, shot.endSec - shot.startSec);
  const pose = shotPoseAt(shot, fraction)!;
  return shot.trackSubject
    ? subjectVisible(pose.eye, aim)
    : subjectInFrame(pose, aim);
}

const FLAG_SWEEP_SEC = 5;
const SCENE_FRACTIONS = [0, 0.25, 0.5, 0.75, 1];
const SWEEP_HALF_ANGLE = Math.PI / 12;

function sceneAngles(shot: FixedOrbit): number[] {
  const angle = shot.staged?.angle ?? shot.startAngle ?? 0;
  return [angle, angle + Math.PI / 2, angle - Math.PI / 2, angle + Math.PI];
}

/** A short lateral move on one scene. The camera stays off the subject's
 * route, and comes to a stop on the action after the move. */
function flagSceneSweep(
  wide: FixedOrbit,
  covers: (pose: ShotPose, index: number) => boolean,
): Sweep | undefined {
  for (const angle of sceneAngles(wide)) {
    const from = shotPoseAt(
      { ...wide, staged: undefined, startAngle: angle - SWEEP_HALF_ANGLE },
      0,
    )!;
    const to = shotPoseAt(
      { ...wide, staged: undefined, startAngle: angle + SWEEP_HALF_ANGLE },
      0,
    )!;
    const sweep: Sweep = {
      kind: "sweep",
      from: from.eye,
      to: to.eye,
      target: from.aim,
      subject: wide.subject,
      startSec: wide.startSec,
      endSec: wide.startSec + FLAG_SWEEP_SEC,
      moveSec: FLAG_SWEEP_SEC,
      transitionIn: "cut",
      easing: "settle",
      topic: wide.topic,
      reason: wide.reason,
    };
    if (castWorldRay(sweep.from, sweep.to, { includeStatics: true })) continue;
    if (
      SCENE_FRACTIONS.every((fraction, i) =>
        covers(shotPoseAt(sweep, sweepProgress(sweep, fraction))!, i),
      )
    ) {
      sweep.pathSolved = true;
      return sweep;
    }
  }
}

/** Keep the same geometry the planner checked when staging the shot. */
function stageStillOrbit(
  shot: FixedOrbit,
  angles: readonly number[],
  heightFactor: number,
  coversAction: (pose: ShotPose) => boolean,
): FixedOrbit | undefined {
  for (const angle of angles) {
    const candidate = {
      ...shot,
      staged: {
        angle,
        radius: shot.radius,
        liftFactor: orbitLiftFactor(shot.radius, heightFactor),
        visibility: 1,
      },
    };
    const pose = shotPoseAt(candidate, 0)!;
    if (subjectInFrame(pose, pose.aim) && coversAction(pose)) return candidate;
  }
}

function finishAtStand(
  view: CausalView,
  scorer: number,
  stand: DirectorVec3,
  capSec: number,
  framing: Pick<FixedOrbit, "startSec" | "endSec" | "reason" | "topic">,
): FixedOrbit | undefined {
  const route: DirectorVec3[] = [];
  const last = capSec - 0.1;
  for (let t = Math.min(framing.startSec, last); ; t = Math.min(t + 1, last)) {
    const sample = view.playerAt(scorer, t);
    if (!sample || t - sample.timeSec > 1.5) return;
    route.push(playerAim(sample.pos));
    if (t === last) break;
  }
  const finish = route.at(-1)!;
  if (dist(stand, finish) > DIRECTOR_CAP_SHOT_DISTANCE / 2) return;

  const center = centroid([
    stand,
    dist(stand, route[0]) <= DIRECTOR_CAP_SHOT_DISTANCE * 1.5
      ? route[0]
      : finish,
  ]);
  const across = onBroadcastSide(
    bearingYaw(stand, route[0]) + Math.PI / 2,
    view.dataset,
  );
  const heightFactor = 0.35;
  const shot = orbitShot({
    ...framing,
    center,
    radius: DIRECTOR_CAP_SHOT_DISTANCE,
    heightFactor,
    angle: across,
    still: true,
  });
  return stageStillOrbit(
    shot,
    [across, across + Math.PI],
    heightFactor,
    (pose) => {
      if (!subjectInFrame(pose, stand) || !subjectInFrame(pose, finish))
        return false;
      if (route.every((point) => subjectInFrame(pose, point))) return true;
      // An early cut is still useful when there's something to see at
      // the destination while a fast carrier is on their way into frame.
      let visiblePlayers = 0;
      for (const player of view.playersAt()) {
        if (
          player.targetId !== scorer &&
          player.health !== 0 &&
          dist(player.pos, stand) <= DIRECTOR_CAP_SHOT_DISTANCE &&
          subjectInFrame(pose, playerAim(player.pos))
        ) {
          visiblePlayers++;
          if (visiblePlayers === 2) return true;
        }
      }
      return false;
    },
  );
}

function playerAim(pos: DirectorVec3): DirectorVec3 {
  return aimOf({ pos, aimLift: PLAYER_AIM_LIFT });
}

/** Is there a local contest in this frame, independent of who has the flag? */
function seesFlagFight(
  pose: ShotPose,
  players: readonly DirectorPlayerSample[],
): boolean {
  let team: number | null = null;
  for (const player of players) {
    if (
      player.teamId == null ||
      player.teamId <= 0 ||
      player.teamId === team ||
      player.health === 0 ||
      !subjectInFrame(pose, playerAim(player.pos))
    )
      continue;
    if (team != null) return true;
    team = player.teamId;
  }
  return false;
}

function flagChanged(
  from: DirectorFlagSample | null,
  to: DirectorFlagSample | null,
): boolean {
  return (
    from != null &&
    to != null &&
    (from.status !== to.status || from.carrierTargetId !== to.carrierTargetId)
  );
}

/** Let a local exchange play out, then return control to normal shot selection. */
export function holdsFlagFight(
  view: CausalView,
  shot: Shot,
  startSec = shot.startSec,
): boolean {
  if (
    shot.kind !== "fixedOrbit" ||
    shot.topic !== "flag-run" ||
    shot.subject?.type !== "flag" ||
    shot.lookSubject
  )
    return false;

  const pose = shotPoseAt(shot, 0)!;
  const { center, radius } = shot;
  const { slot } = shot.subject;
  const now = view.now;
  const since = Math.max(startSec, now - DIRECTOR_DEATH_REACTION_SEC);
  const contains = (pos: DirectorVec3) =>
    dist(pos, center) <= radius && subjectInFrame(pose, pos);
  const flag = view.flagAt(slot);
  const lastFlag = view.flagAt(slot, since);
  // A return moves the flag across the map. Keep the reaction where the
  // return happened, provided the nearby players are still in frame.
  const localFlag = flag?.status === "home" ? lastFlag : flag;
  const seesFlag =
    flag != null &&
    now - flag.timeSec <= 3 &&
    localFlag != null &&
    localFlag.status !== "home" &&
    contains(localFlag.pos);
  if (
    seesFlag &&
    seesFlagFight(
      pose,
      view.playersAt().filter((player) => dist(player.pos, center) <= radius),
    )
  ) {
    if (now - startSec < DIRECTOR_MIN_SHOT_SEC) return true;
    if (flagChanged(lastFlag, flag)) return true;
    const ahead = now + DIRECTOR_EVENT_LEAD_SEC;
    if (
      view
        .eventsIn(since, ahead)
        .some(
          (event) =>
            (event.type === "flag-grab" ||
              event.type === "flag-drop" ||
              event.type === "flag-return") &&
            view.eventSlot(event) === slot &&
            (!event.pos || contains(event.pos)),
        )
    )
      return true;
    const nextFlag = view.flagAt(slot, ahead);
    if (
      nextFlag &&
      flagChanged(flag, nextFlag) &&
      (nextFlag.status === "home" || contains(nextFlag.pos))
    )
      return true;
  }

  return view
    .deathsIn(since, now)
    .some((death) => contains(playerAim(death.pos)));
}

/** Try a fixed framing when both teams are converging on the dropped flag. */
function createFlagFightShot(
  view: CausalView,
  wide: FixedOrbit,
  sample: DirectorFlagSample,
  positions: readonly DirectorVec3[],
): FixedOrbit | undefined {
  const { center, startSec } = wide;
  const radius = 30;
  const heightFactor = 0.2;
  const nearbyAt = (t: number) =>
    view.playersAt(t).filter((player) => dist(player.pos, center) <= radius);
  const now = nearbyAt(startSec);
  const soon = nearbyAt(startSec + DIRECTOR_EVENT_LEAD_SEC);
  if (now.length < 2 && soon.length < 2) return;
  return stageStillOrbit(
    {
      ...wide,
      radius,
      heightFactor,
      lookSubject: undefined,
      subject: { type: "flag", slot: sample.slot },
      reason: `${flagLabel(sample.slot, view.dataset)} — contest for the loose flag`,
    },
    sceneAngles(wide),
    heightFactor,
    (pose) =>
      positions.every((pos) => subjectInFrame(pose, pos)) &&
      (seesFlagFight(pose, now) || seesFlagFight(pose, soon)),
  );
}

export function createLooseFlagShot(
  view: CausalView,
  variety: ShotVariety,
  sample: DirectorFlagSample,
  parked: boolean,
  allowSweep: boolean,
): Shot {
  const { slot, pos } = sample;
  const t = view.now;
  const label = flagLabel(slot, view.dataset);
  const subject = { type: "flag" as const, slot };
  const past = view.flagAt(slot, t - 1);
  const recentSpeed =
    past?.status === "field" && sample.timeSec > past.timeSec
      ? dist(past.pos, pos) / (sample.timeSec - past.timeSec)
      : 0;
  const follow: Shot = {
    kind: "followFlag",
    slot,
    distance: distanceForSpeed(recentSpeed),
    pitch: DIRECTOR_PITCH_CHASE,
    aim: { mode: "forward" },
    startSec: t,
    endSec: t,
    transitionIn: "cut",
    reason: `${label} loose — still moving`,
    topic: "flag-run",
  };

  // Only frame this loose run. A return, pickup or subsequent drop may
  // place the flag somewhere that has nothing to do with the current shot.
  const [nextPlay] = view.peekFlagEvents(slot, ["flag-grab", "flag-return"]);
  const preview = Math.min(t + FLAG_SWEEP_SEC, view.horizon);
  const positions: DirectorVec3[] = [pos];
  let last = sample;
  for (const fraction of SCENE_FRACTIONS.slice(1)) {
    const time = t + fraction * (preview - t);
    if (nextPlay && time >= nextPlay.timeSec) break;
    const next = view.flagAt(slot, time);
    if (next?.status !== "field") break;
    if (time - next.timeSec > view.dataset.flagSampleStepSec * 2) break;
    positions.push(next.pos);
    last = next;
  }
  const dx = last.pos[0] - pos[0];
  const dy = last.pos[1] - pos[1];
  const travelled = Math.hypot(dx, dy);
  // No useful preview of a fast throw. Let the normal follow camera
  // carry it until there is a safe area framing.
  if (last === sample && recentSpeed > DIRECTOR_FIXED_MAX_SPEED) return follow;

  const wide = orbitShot({
    center: centroid([pos, last.pos]),
    radius: DIRECTOR_DROPPED_ORBIT_RADIUS,
    heightFactor: DIRECTOR_DROPPED_ORBIT_HEIGHT,
    still: true,
    lookSubject: subject,
    ...(travelled > 1
      ? { angle: onBroadcastSide(Math.atan2(-dy, dx), view.dataset) }
      : { framing: { dataset: view.dataset, variety } }),
    startSec: t,
    endSec: t,
    reason: parked
      ? `${label} still parked in the field — checking in`
      : `${label} loose — wide view`,
    topic: "flag-run",
  });
  const fight = createFlagFightShot(view, wide, sample, positions);
  if (fight) return fight;
  if (
    allowSweep &&
    positions.length === SCENE_FRACTIONS.length &&
    preview === t + FLAG_SWEEP_SEC &&
    travelled >= 5
  ) {
    const sweep = flagSceneSweep(
      {
        ...wide,
        subject,
        reason: `${label} loose — sideline sweep`,
      },
      (pose, i) => subjectInFrame(pose, positions[i]),
    );
    if (sweep) return sweep;
  }
  if (travelled < 5) return wide;

  return (
    stageStillOrbit(
      { ...wide, lookSubject: undefined, subject },
      sceneAngles(wide),
      DIRECTOR_DROPPED_ORBIT_HEIGHT,
      (pose) => positions.every((point) => subjectInFrame(pose, point)),
    ) ?? follow
  );
}

/** A pass across a contested stand, once it is clear the players will
 * stay in the scene long enough to follow the move. */
export function createStandFightSweep(
  view: CausalView,
  wide: FixedOrbit,
  slot: number,
  stand: DirectorVec3,
): Sweep | undefined {
  if (
    view.horizon < wide.startSec + FLAG_SWEEP_SEC ||
    view.peekFlagEvents(slot, ["flag-grab"]).length > 0
  )
    return;
  const audience = SCENE_FRACTIONS.map((fraction) => {
    const time = wide.startSec + FLAG_SWEEP_SEC * fraction;
    return view
      .playersAt(time)
      .filter(
        (player) =>
          time - player.timeSec <= view.dataset.playerSampleStepSec * 2 &&
          dist(player.pos, stand) <= 30,
      );
  });
  if (audience.some((players) => players.length < 2)) return;
  return flagSceneSweep(
    {
      ...wide,
      radius: Math.min(35, wide.radius),
      heightFactor: 0.3,
      subject: { type: "flag", slot },
      reason: `${flagLabel(slot, view.dataset)} stand — battle sweep`,
    },
    (pose, i) =>
      subjectInFrame(pose, stand) && seesFlagFight(pose, audience[i]),
  );
}
