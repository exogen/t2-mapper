/**
 * Shot builders for situations that are not a flag possession: shelling,
 * suit-ups, highlight kills, watching whichever knot of players is
 * actually doing something, and the B-roll that fills a lull.
 *
 * They share one shape — given a window of time and the situation in it,
 * return the shots that cover it, or nothing if there is no shot worth
 * taking. Returning nothing is a real answer: an empty field deserves no
 * camera.
 */
import type { DirectorDataset, DirectorVec3, Shot } from "./types";
import {
  DIRECTOR_BASE_ORBIT_RADIUS,
  DIRECTOR_BOMBARDMENT_CAM_HEIGHT,
  DIRECTOR_BOMBARDMENT_CAM_RADIUS,
  DIRECTOR_CLUSTER_CAM_HEIGHT,
  DIRECTOR_KILL_POSTROLL_SEC,
  DIRECTOR_KILL_PREROLL_SEC,
  DIRECTOR_MIN_SHOT_HOLD_SEC,
  DIRECTOR_CROWD_RADIUS,
  DIRECTOR_DIST_CHASE,
  DIRECTOR_FIXED_CHUNK_SEC,
  DIRECTOR_FIXED_HOLD_RADIUS,
  DIRECTOR_MIN_RUN_SEC,
  DIRECTOR_PLACE_NAME_RANGE,
  DIRECTOR_PITCH_CHASE,
  DIRECTOR_SHOOTER_CAM_RADIUS,
  DIRECTOR_STATION_CAM_HEIGHT,
  DIRECTOR_STATION_CAM_RADIUS,
  DIRECTOR_SUITUP_COOLDOWN_SEC,
  DIRECTOR_WIDE_ORBIT_RADIUS,
  DIRECTOR_VEHICLE_COOLDOWN_SEC,
  SCORE_STORY_BOMBARDMENT,
  SCORE_STORY_RAID,
  SCORE_STORY_VEHICLE,
  SCORE_STORY_SUITUP,
  SCORE_STORY_KILL,
  SCORE_STORY_KILL_MIDAIR,
  SCORE_STORY_KILL_FLAG,
  DIRECTOR_KILL_FOLLOW_SEPARATION,
  DIRECTOR_DIST_HERO,
  DIRECTOR_LULL_REPEAT_RANGE,
  DIRECTOR_BOMBARDMENT_CLOSE_RADIUS,
  DIRECTOR_BOMBARDMENT_CLOSE_HEIGHT,
} from "./tunables";
import { centroid, dist } from "./geometry";
import { playerName, playersAtSecFor } from "./dataset";
import type { PlayersAtSec } from "./dataset";
import {
  angleFacingLandmark,
  farLandmark,
  fixedFraming,
  newShotVariety,
  onBroadcastSide,
  orbitShot,
  radiusForSpread,
} from "./framing";
import type { ShotVariety } from "./framing";
import {
  assetRaid,
  bombardment,
  vehicleMoment,
  bestHero,
  busiestCluster,
  highlightKill,
  likelyTarget,
  mortarActionNear,
  travelDestination,
  stableCluster,
  suitUp,
} from "./analysis";

/** A PlayersAtSec view with everyone near `exclude` removed — for
 *  finding the best cluster somewhere OTHER than where we just looked. */
function playersAwayFrom(
  playersAtSec: PlayersAtSec,
  exclude: DirectorVec3,
  range: number,
): PlayersAtSec {
  const out: PlayersAtSec = new Map();
  for (const [sec, list] of playersAtSec) {
    out.set(
      sec,
      list.filter((p) => dist(p.pos, exclude) > range),
    );
  }
  return out;
}

/**
 * Cover a barrage: alternate between the shells landing on the base and
 * the crew lobbing them, chunked so each shot re-anchors on live fire.
 * Empty when nothing is being shelled.
 */
export function bombardmentShots(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
  variety: ShotVariety,
): Shot[] {
  const shots: Shot[] = [];
  for (let t = startSec; t < endSec; t += DIRECTOR_FIXED_CHUNK_SEC) {
    const chunkEnd = Math.min(t + DIRECTOR_FIXED_CHUNK_SEC, endSec);
    if (chunkEnd - t < DIRECTOR_MIN_RUN_SEC) {
      if (shots.length > 0) shots[shots.length - 1].endSec = chunkEnd;
      break;
    }
    const barrage = bombardment(t, chunkEnd, dataset);
    if (!barrage) {
      if (shots.length > 0) shots[shots.length - 1].endSec = chunkEnd;
      continue;
    }
    const crew = barrage.shooterTargetId;
    const showCrew = crew != null && variety.fixedCount % 2 === 1;
    variety.fixedCount++;
    const landmark = farLandmark(barrage.impact, dataset);
    // Impact shots rotate wide establishing ↔ down IN the impact zone,
    // so the barrage is sometimes felt from the middle of the chaos
    // rather than always surveyed from a distance.
    const closeUp = !showCrew && (variety.bombardmentViews ?? 0) % 2 === 1;
    if (!showCrew) {
      variety.bombardmentViews = (variety.bombardmentViews ?? 0) + 1;
    }
    shots.push(
      showCrew
        ? {
            kind: "followPlayer",
            targetId: crew,
            distance: DIRECTOR_SHOOTER_CAM_RADIUS,
            pitch: DIRECTOR_PITCH_CHASE,
            // Looking down their line of fire at what they're hitting.
            aim: { mode: "toward", target: barrage.impact },
            startSec: t,
            endSec: chunkEnd,
            transitionIn: "cut",
            reason: `Mortar fire — ${playerName(crew, dataset) ?? "crew"} shelling`,
          }
        : orbitShot({
            center: barrage.impact,
            radius: closeUp
              ? DIRECTOR_BOMBARDMENT_CLOSE_RADIUS
              : DIRECTOR_BOMBARDMENT_CAM_RADIUS,
            angle:
              landmark != null
                ? onBroadcastSide(
                    angleFacingLandmark(barrage.impact, landmark),
                    dataset,
                  )
                : undefined,
            still: true,
            heightFactor: closeUp
              ? DIRECTOR_BOMBARDMENT_CLOSE_HEIGHT
              : DIRECTOR_BOMBARDMENT_CAM_HEIGHT,
            startSec: t,
            endSec: chunkEnd,
            reason: closeUp
              ? `${barrage.shells} mortars raining down — in the impact zone`
              : `${barrage.shells} mortars hitting the base`,
          }),
    );
  }
  return shots;
}

/**
 * The situational shot for one chunk: every detector nominates the
 * story it found with a priority score (SCORE_STORY_*), and the best
 * one gets the window. Shared by lull coverage AND by crowded flag
 * play — without it, a 54-player match spends minutes ping-ponging
 * between two stand cameras while 1800 deaths go unwatched. Builders
 * run lazily so only the WINNER pays framing/variety side effects.
 */
export function situationalShot(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
  variety: ShotVariety,
): Shot | null {
  const candidates: { score: number; make: () => Shot | null }[] = [];

  if (bombardment(startSec, endSec, dataset)) {
    candidates.push({
      score: SCORE_STORY_BOMBARDMENT,
      make: () =>
        bombardmentShots(startSec, endSec, dataset, playersAtSec, variety)[0] ??
        null,
    });
  }

  // A raid succeeding — generators (or a cluster of assets) going down
  // — is the strategic story of the next several minutes: it explains
  // every disabled turret and empty vehicle pad the viewer is about to
  // see. Bracket the destruction like a kill highlight.
  const raid = assetRaid(startSec, endSec, dataset);
  if (raid) {
    candidates.push({
      score: SCORE_STORY_RAID,
      make: () =>
        orbitShot({
          center: raid.center,
          radius: DIRECTOR_STATION_CAM_RADIUS,
          framing: { dataset, variety },
          still: true,
          heightFactor: DIRECTOR_STATION_CAM_HEIGHT,
          startSec: Math.max(0, raid.firstSec - DIRECTOR_KILL_PREROLL_SEC),
          endSec: Math.min(endSec, raid.lastSec + DIRECTOR_KILL_POSTROLL_SEC),
          reason: raid.generators
            ? "Generators going down — raid inside the base"
            : `${raid.count} base assets going down — raid in progress`,
        }),
    });
  }

  const sinceVehicle =
    variety.lastVehicleSec == null
      ? Infinity
      : startSec - variety.lastVehicleSec;
  const moment =
    sinceVehicle >= DIRECTOR_VEHICLE_COOLDOWN_SEC
      ? vehicleMoment(startSec, endSec, dataset, playersAtSec)
      : null;
  if (moment) {
    candidates.push({
      score: SCORE_STORY_VEHICLE,
      make: () => {
        variety.lastVehicleSec = startSec;
        return orbitShot({
          center: moment.center,
          radius: radiusForSpread(moment.spread, dataset),
          framing: { dataset, variety },
          heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
          startSec,
          endSec,
          reason:
            moment.kind === "transport"
              ? `Loaded ${moment.vehicle === "havoc" ? "Havoc" : "bomber"} under way — ${moment.crew} aboard`
              : moment.kind === "dogfight"
                ? "Dogfight overhead"
                : `${moment.vehicle === "bomber" ? "Bomber" : "Shrike"} on a strafing run`,
        });
      },
    });
  }

  const sinceSuitUp =
    variety.lastSuitUpSec == null ? Infinity : startSec - variety.lastSuitUpSec;
  const suiting =
    sinceSuitUp >= DIRECTOR_SUITUP_COOLDOWN_SEC
      ? suitUp(startSec, endSec, dataset, playersAtSec)
      : null;
  if (suiting) {
    candidates.push({
      score: SCORE_STORY_SUITUP,
      make: () => {
        // Live fire beside the station trumps the queue at it: somebody
        // lobbing mortars feet from the inventory is action; people
        // topping up their packs is background.
        const action = mortarActionNear(
          suiting.center,
          startSec,
          endSec,
          dataset,
        );
        if (action) {
          const shooter =
            action.kind === "launch" ? action.shooterTargetId : null;
          return orbitShot({
            center: action.pos,
            radius: DIRECTOR_SHOOTER_CAM_RADIUS,
            framing: { dataset, variety },
            still: true,
            heightFactor: DIRECTOR_STATION_CAM_HEIGHT,
            lookSubject:
              shooter != null
                ? { type: "player", targetId: shooter }
                : undefined,
            startSec,
            endSec,
            reason:
              action.kind === "launch"
                ? `Mortar fire beside the inventory${
                    shooter != null
                      ? ` — ${playerName(shooter, dataset) ?? "a player"} shelling`
                      : ""
                  }`
                : "Mortar landing at the inventory",
          });
        }
        variety.lastSuitUpSec = startSec;
        return orbitShot({
          center: suiting.center,
          radius: DIRECTOR_STATION_CAM_RADIUS,
          framing: { dataset, variety },
          still: true,
          heightFactor: DIRECTOR_STATION_CAM_HEIGHT,
          startSec,
          endSec,
          reason: `${suiting.count} players suiting up at the inventory`,
        });
      },
    });
  }

  const highlight = highlightKill(startSec, endSec, dataset);
  if (highlight) {
    candidates.push({
      score: highlight.flagInvolved
        ? SCORE_STORY_KILL_FLAG
        : highlight.midair
          ? SCORE_STORY_KILL_MIDAIR
          : SCORE_STORY_KILL,
      make: () => {
        // Bracket the KILL, not the window it was found in: a highlight
        // that starts at the moment of the kill is a highlight the
        // viewer missed. The shot needs to be rolling several seconds
        // before it lands — even when the kill sits at the leading edge
        // of this window: the shot reaches BACK past the window
        // boundary, and pushReachingBack trims the previous shot's tail
        // to make room. That tail is filler; the pre-kill seconds are
        // the story.
        const from = Math.max(0, highlight.timeSec - DIRECTOR_KILL_PREROLL_SEC);
        const to = Math.min(
          endSec,
          highlight.timeSec + DIRECTOR_KILL_POSTROLL_SEC,
        );
        const label = highlight.weapon
          ? `${highlight.midair ? "MID-AIR " : ""}${highlight.weapon} kill by ${playerName(highlight.killerTargetId, dataset) ?? "a player"}`
          : `Duel — ${playerName(highlight.killerTargetId, dataset) ?? "a player"} gets one`;
        // A long-range kill framed to contain both bodies is two dots
        // in a wide blur — ride with the killer instead, looking down
        // their line of fire at where the shot lands.
        if (highlight.spread * 2 >= DIRECTOR_KILL_FOLLOW_SEPARATION) {
          return {
            kind: "followPlayer",
            targetId: highlight.killerTargetId,
            distance: DIRECTOR_DIST_HERO,
            pitch: DIRECTOR_PITCH_CHASE,
            aim: { mode: "toward", target: highlight.victimPos },
            startSec: from,
            endSec: to,
            transitionIn: "cut",
            reason: label,
          };
        }
        return orbitShot({
          center: highlight.center,
          radius: radiusForSpread(highlight.spread, dataset),
          framing: { dataset, variety },
          still: true,
          heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
          lookSubject: { type: "player", targetId: highlight.killerTargetId },
          startSec: from,
          endSec: to,
          reason: label,
        });
      },
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  for (const candidate of candidates) {
    const shot = candidate.make();
    if (shot) return shot;
  }
  return null;
}

/**
 * Cover a lull by watching PLAYERS rather than an idle flag or an empty
 * base: chunked so each shot re-anchors on a fresh, verified-stationary
 * cluster (a fixed camera on a stale anchor frames nothing), following
 * the group's own hero when they won't hold still, and only falling
 * back to base scenery when there is genuinely nobody grouped up.
 */
/**
 * Where a point is, for a shot reason: named after the base it is at,
 * or "midfield". A lull shot deliberately leaves its donor flag to film
 * the biggest knot of players wherever they are — labeling that with
 * the flag's name claimed the Storm flag was at the Inferno base.
 */
function placeName(pos: DirectorVec3, dataset: DirectorDataset): string {
  let bestName: string | null = null;
  let bestDist = Infinity;
  for (const stand of dataset.flagStands) {
    const d = dist(pos, stand.pos);
    if (d < bestDist) {
      bestDist = d;
      bestName = stand.name;
    }
  }
  return bestName != null && bestDist <= DIRECTOR_PLACE_NAME_RANGE
    ? `the ${bestName} base`
    : "midfield";
}

/**
 * Append a shot that may reach back before the previous one's end,
 * giving the newcomer the overlap: the previous shot's tail is trimmed
 * (never below a legible remnant — the min-duration pass absorbs any
 * sliver this leaves). Used for kill highlights whose pre-kill preroll
 * crosses a chunk boundary.
 */
export function pushReachingBack(
  shots: Shot[],
  shot: Shot,
  windowStartSec: number,
): void {
  const previous = shots[shots.length - 1];
  if (!previous) {
    // Nothing local to trim: the reach-back would overlap another
    // emitter's shot we cannot see. Settle for what the window allows.
    shot.startSec = Math.max(shot.startSec, windowStartSec);
    shots.push(shot);
    return;
  }
  if (previous.endSec > shot.startSec) {
    // Never gut the previous shot: it keeps at least a legible hold,
    // and the newcomer settles for partial preroll when it must.
    const floor = Math.min(
      previous.endSec,
      previous.startSec + DIRECTOR_MIN_SHOT_HOLD_SEC,
    );
    const cut = Math.max(shot.startSec, floor);
    previous.endSec = cut;
    shot.startSec = cut;
  }
  shots.push(shot);
}

export function watchPlayersShots(
  startSec: number,
  endSec: number,
  label: string,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
  standPos: DirectorVec3 | null,
  slot: number,
  variety: ShotVariety,
): Shot[] {
  const shots: Shot[] = [];
  for (let t = startSec; t < endSec; t += DIRECTOR_FIXED_CHUNK_SEC) {
    const chunkEnd = Math.min(t + DIRECTOR_FIXED_CHUNK_SEC, endSec);
    if (chunkEnd - t < DIRECTOR_MIN_RUN_SEC) {
      // Too short to stand on its own — extend the previous shot.
      if (shots.length > 0) shots[shots.length - 1].endSec = chunkEnd;
      break;
    }
    // With the flags quiet, shelling is the story: alternate between
    // the impacts and the crew putting them there, so the lull has some
    // variety in what kind of activity it shows.
    const situational = situationalShot(
      t,
      chunkEnd,
      dataset,
      playersAtSec,
      variety,
    );
    if (situational) {
      pushReachingBack(shots, situational, startSec);
      continue;
    }
    let held = stableCluster(
      t,
      chunkEnd,
      playersAtSec,
      DIRECTOR_FIXED_HOLD_RADIUS,
    );
    // Variety: a lull camera that keeps returning to the same knot of
    // players is a stuck channel — when the best cluster is where the
    // last lull already looked, take the best cluster ANYWHERE ELSE if
    // a watchable one exists.
    if (
      held &&
      variety.lastLullPos &&
      dist(held.center, variety.lastLullPos) <= DIRECTOR_LULL_REPEAT_RANGE
    ) {
      const elsewhere = stableCluster(
        t,
        chunkEnd,
        playersAwayFrom(playersAtSec, held.center, DIRECTOR_LULL_REPEAT_RANGE),
        DIRECTOR_FIXED_HOLD_RADIUS,
      );
      if (elsewhere && elsewhere.count >= 3) held = elsewhere;
    }
    if (held) {
      variety.lastLullPos = held.center;
      const framing = fixedFraming(held.center, dataset, variety);
      shots.push({
        kind: "fixedOrbit",
        center: held.center,
        radius: radiusForSpread(held.spread, dataset),
        startAngle: framing.startAngle,
        angularSpeed: framing.angularSpeed,
        heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
        startSec: t,
        endSec: chunkEnd,
        transitionIn: "cut",
        reason: `Lull — watching ${held.count} players at ${placeName(held.center, dataset)}`,
      });
      continue;
    }
    // Players are on the move: follow one of them rather than point a
    // fixed camera at where they used to be — and pick one who is DOING
    // something (about to get a kill, firing, or at least skiing fast),
    // not whichever body happens to be nearest the cluster's middle.
    const moving = busiestCluster(t, chunkEnd, playersAtSec);
    const hero = moving
      ? (bestHero(t, chunkEnd, moving.center, dataset, playersAtSec) ??
        playersAtSec
          .get(Math.round((t + chunkEnd) / 2))
          ?.find((p) => dist(p.pos, moving.center) <= DIRECTOR_CROWD_RADIUS)
          ?.targetId ??
        null)
      : null;
    if (hero != null) {
      // Aim at where they are GOING, not at the cluster they are in —
      // the cluster centroid is roughly their own position, which
      // degenerates the aim into a drifting orbit. A skier heading for
      // the enemy base should have the camera showing what they are
      // about to attack.
      const heading = travelDestination(
        hero,
        t,
        chunkEnd,
        dataset,
        playersAtSec,
      );
      // Travelling → aim where they are going; fighting in place → aim
      // at who they are shooting at; only then the cluster centre.
      const combat =
        heading == null ? likelyTarget(hero, t, chunkEnd, playersAtSec) : null;
      shots.push({
        kind: "followPlayer",
        targetId: hero,
        distance: DIRECTOR_DIST_CHASE,
        pitch: DIRECTOR_PITCH_CHASE,
        aim: { mode: "toward", target: heading ?? combat ?? moving!.center },
        startSec: t,
        endSec: chunkEnd,
        transitionIn: "cut",
        reason: `Lull — following ${playerName(hero, dataset) ?? "a player"} near ${placeName(moving!.center, dataset)}`,
      });
      continue;
    }
    if (standPos) {
      const framing = fixedFraming(standPos, dataset, variety);
      shots.push({
        kind: "fixedOrbit",
        center: standPos,
        radius: DIRECTOR_BASE_ORBIT_RADIUS,
        startAngle: framing.startAngle,
        angularSpeed: framing.angularSpeed,
        heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
        startSec: t,
        endSec: chunkEnd,
        transitionIn: "cut",
        reason: `${label} — quiet, wide on the base`,
      });
    }
  }
  return shots;
}

/** Idle B-roll: rotate wide establishing orbits across the bases. */
export function idleShots(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
  flip: number,
  variety: ShotVariety = newShotVariety(),
): Shot[] {
  const stands = dataset.flagStands;
  const shots: Shot[] = [];
  if (stands.length === 0) {
    // No landmarks: follow the action loosely with wide orbits around
    // the rolling player centroid, re-anchored every chunk.
    const overall = centroid(dataset.playerSamples.map((s) => s.pos));
    const chunkSec = 20;
    for (let t = startSec; t < endSec; t += chunkSec) {
      const chunkEnd = Math.min(t + chunkSec, endSec);
      const window = dataset.playerSamples.filter(
        (s) => s.timeSec >= t && s.timeSec < chunkEnd,
      );
      const center =
        window.length > 0 ? centroid(window.map((s) => s.pos)) : overall;
      const framing = fixedFraming(center, dataset, variety);
      shots.push({
        kind: "fixedOrbit",
        center,
        radius: DIRECTOR_WIDE_ORBIT_RADIUS,
        startAngle: framing.startAngle,
        angularSpeed: framing.angularSpeed,
        startSec: t,
        endSec: chunkEnd,
        transitionIn: "cut",
        reason: "Quiet moment — wide view",
      });
    }
    return shots;
  }
  // Even in a lull, players beat scenery — the shared helper watches
  // whoever is grouped up (or follows them when they won't hold still)
  // and only falls back to the bases when nobody is.
  const stand = stands[flip > 0 ? 0 : stands.length - 1];
  return watchPlayersShots(
    startSec,
    endSec,
    "Quiet moment",
    dataset,
    playersAtSecFor(dataset),
    stand.pos,
    stand.slot,
    variety,
  );
}
