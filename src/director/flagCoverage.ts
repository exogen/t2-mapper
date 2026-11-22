import { orbitLiftFactor } from "./cameraRig";
import type { CausalView } from "./causalView";
import { flagLabel, targetIdForName } from "./dataset";
import { orbitShot, onBroadcastSide, type ShotVariety } from "./framing";
import { aimOf } from "./freeSpace";
import { bearingYaw, centroid, dist } from "./geometry";
import { PLAYER_AIM_LIFT } from "./humanScale";
import { shotPoseAt, subjectInFrame, type ShotPose } from "./shotPath";
import {
  DIRECTOR_CAP_REACTION_SEC,
  DIRECTOR_CAP_SHOT_DISTANCE,
  DIRECTOR_DEATH_REACTION_SEC,
  DIRECTOR_DIST_FAST,
  DIRECTOR_EVENT_LEAD_SEC,
  DIRECTOR_MIN_SHOT_SEC,
  DIRECTOR_PITCH_CHASE,
} from "./tunables";
import type {
  DirectorEvent,
  DirectorFlagSample,
  DirectorPlayerSample,
  DirectorVec3,
  Shot,
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
export function createFlagFightShot(
  view: CausalView,
  wide: FixedOrbit,
  sample: DirectorFlagSample,
): FixedOrbit | undefined {
  const { center, startSec } = wide;
  const angle = wide.startAngle ?? 0;
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
    [angle, angle + Math.PI / 2, angle - Math.PI / 2, angle + Math.PI],
    heightFactor,
    (pose) =>
      subjectInFrame(pose, sample.pos) &&
      (seesFlagFight(pose, now) || seesFlagFight(pose, soon)),
  );
}
