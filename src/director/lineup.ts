/**
 * Pre-match roster line-ups. Before the whistle the teams stand
 * assembled at their bases and nothing moves, so the shot is a slow pass
 * along the ranks rather than an orbit of a flag that will not budge:
 * one wide establishing pass per team, then close-ups along the front
 * rank at head height, working across different knots of players so
 * successive passes show new faces.
 */
import type { DirectorDataset, DirectorVec3, Shot } from "./types";
import {
  DIRECTOR_LINEUP_HEIGHT,
  DIRECTOR_LINEUP_STANDOFF,
  DIRECTOR_LINEUP_STANDOFF_MAX_EXTRA,
  DIRECTOR_LINEUP_SWEEP_SEC,
  DIRECTOR_LINEUP_TRAVEL,
  DIRECTOR_MIN_SHOT_HOLD_SEC,
  DIRECTOR_ROSTER_EYE_HEIGHT,
  DIRECTOR_ROSTER_GROUP_RANGE,
  DIRECTOR_ROSTER_MIN_TRAVEL,
  DIRECTOR_ROSTER_STANDOFF,
} from "./tunables";
import { centroid, clamp, dist, sweepTravel } from "./geometry";
import type { PlayersAtSec } from "./dataset";

/**
 * Roster line-up sweeps for the pre-match window: before the whistle
 * the teams stand assembled at their bases and nothing moves, so a slow
 * pass along each line-up is the shot. One sweep per team, flying
 * across the line rather than orbiting a flag that will not budge.
 */
export function lineupShots(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): Shot[] {
  const shots: Shot[] = [];
  const teams = [...new Set(dataset.teams.map((t) => t.teamId))].sort(
    (a, b) => a - b,
  );
  if (teams.length === 0) return shots;
  // Alternate teams pass by pass, and alternate wide with close-up, so
  // the two sides get equal time and neither treatment dominates.
  // A whole number of ROUNDS, so every team gets the same number of
  // passes — an odd count quietly handed one side half again as much
  // screen time as the other.
  const rounds = Math.max(
    1,
    Math.round(
      (endSec - startSec) / (DIRECTOR_LINEUP_SWEEP_SEC * teams.length),
    ),
  );
  const passes = rounds * teams.length;
  const perPass = (endSec - startSec) / passes;
  if (perPass < DIRECTOR_MIN_SHOT_HOLD_SEC) return shots;
  // Which players each team has already had a close-up of: one pass
  // catches a third of a squad at most, so without this the repeated
  // "densest knot" pick would show the same handful of faces every time
  // and never reach the rest of the team.
  const featured = new Map<number, Set<number>>();
  for (let i = 0; i < passes; i++) {
    const from = startSec + perPass * i;
    const to = i === passes - 1 ? endSec : startSec + perPass * (i + 1);
    const teamId = teams[i % teams.length];
    const teamName =
      dataset.teams.find((t) => t.teamId === teamId)?.name ?? `team ${teamId}`;
    const mid = Math.round((from + to) / 2);
    const squad = (playersAtSec.get(mid) ?? []).filter(
      (p) => p.teamId === teamId,
    );
    if (squad.length === 0) continue;
    // One wide establishing pass per team, then close-ups along the
    // ranks — the faces are the shot, and a second distant fly-by adds
    // nothing a viewer has not already seen.
    const closeUp = Math.floor(i / teams.length) >= 1;
    let seen = featured.get(teamId);
    if (!seen) {
      seen = new Set<number>();
      featured.set(teamId, seen);
    }
    const shot = closeUp
      ? rosterCloseUp(
          from,
          to,
          squad,
          teamName,
          dataset,
          playersAtSec,
          mid,
          seen,
        )
      : rosterWide(from, to, squad, teamName);
    if (shot) shots.push(shot);
  }
  // A small remainder extends the last pass so the window stays
  // covered. A large one must NOT: absorbing it turned a 9-second pass
  // into a 13-minute stare on a tournament demo's team-picking period.
  if (shots.length > 0 && endSec - shots[shots.length - 1].endSec <= perPass) {
    shots[shots.length - 1].endSec = endSec;
  }
  return shots;
}

/** The wide establishing pass: the whole squad and their base. */
function rosterWide(
  startSec: number,
  endSec: number,
  squad: { pos: DirectorVec3 }[],
  teamName: string,
): Shot {
  const center = centroid(squad.map((p) => p.pos));
  // Fly along the line the squad forms — its widest spread axis — so
  // the pass reads across the ranks rather than into them.
  let axis = { x: 1, y: 0 };
  let widest = 0;
  for (const p of squad) {
    const dx = p.pos[0] - center[0];
    const dy = p.pos[1] - center[1];
    const d = Math.hypot(dx, dy);
    if (d > widest) {
      widest = d;
      axis = { x: dx / (d || 1), y: dy / (d || 1) };
    }
  }
  const outX = -axis.y;
  const outY = axis.x;
  const travel = sweepTravel(
    endSec - startSec,
    Math.max(DIRECTOR_LINEUP_TRAVEL, widest * 1.5),
  );
  const standoff =
    DIRECTOR_LINEUP_STANDOFF +
    Math.min(widest, DIRECTOR_LINEUP_STANDOFF_MAX_EXTRA);
  return {
    kind: "sweep",
    from: [
      center[0] + outX * standoff - axis.x * travel * 0.5,
      center[1] + outY * standoff - axis.y * travel * 0.5,
      center[2] + DIRECTOR_LINEUP_HEIGHT,
    ],
    to: [
      center[0] + outX * standoff + axis.x * travel * 0.5,
      center[1] + outY * standoff + axis.y * travel * 0.5,
      center[2] + DIRECTOR_LINEUP_HEIGHT,
    ],
    target: [center[0], center[1], center[2] + 1],
    startSec,
    endSec,
    transitionIn: "cut",
    reason: `Pre-match — ${teamName} line-up (${squad.length})`,
  };
}

/**
 * The close-up pass: pick a knot of players standing near each other,
 * stand off in FRONT of them using their own facing, and dolly along
 * the rank at head height with the look-at panning with it — a roster
 * shot of faces rather than another distant fly-by.
 *
 * Adds the players it features to `alreadyFeatured`, so successive
 * passes work across the squad instead of revisiting the same knot.
 */
function rosterCloseUp(
  startSec: number,
  endSec: number,
  squad: { targetId: number; pos: DirectorVec3 }[],
  teamName: string,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
  midSec: number,
  alreadyFeatured: Set<number>,
): Shot | null {
  // The knot with the most faces not yet shown, densest as a tie-break.
  let group: typeof squad = [];
  let mostFresh = -1;
  for (const anchor of squad) {
    const near = squad.filter(
      (p) => dist(p.pos, anchor.pos) <= DIRECTOR_ROSTER_GROUP_RANGE,
    );
    const fresh = near.filter((p) => !alreadyFeatured.has(p.targetId)).length;
    if (
      fresh > mostFresh ||
      (fresh === mostFresh && near.length > group.length)
    ) {
      mostFresh = fresh;
      group = near;
    }
  }
  if (group.length === 0) return null;
  for (const p of group) alreadyFeatured.add(p.targetId);
  const center = centroid(group.map((p) => p.pos));
  // Their average facing, so the camera can sit in front of the rank.
  const headings = (playersAtSec.get(midSec) ?? [])
    .filter((p) => group.some((g) => g.targetId === p.targetId))
    .map((p) => p.heading)
    .filter((h): h is number => h != null);
  if (headings.length === 0) return null;
  const facing = Math.atan2(
    headings.reduce((a, h) => a + Math.sin(h), 0) / headings.length,
    headings.reduce((a, h) => a + Math.cos(h), 0) / headings.length,
  );
  // heading is atan2(dx, dy) over Torque x/y, so forward is (sin, cos).
  const fx = Math.sin(facing);
  const fy = Math.cos(facing);
  // Along the rank is perpendicular to their facing.
  const ax = -fy;
  const ay = fx;
  const spread = Math.max(
    ...group.map((p) =>
      Math.abs((p.pos[0] - center[0]) * ax + (p.pos[1] - center[1]) * ay),
    ),
  );
  // Travel the width of the rank and no further. Sweeping 2.5x the
  // group's half-spread ran the camera clean past the last player and
  // ended the shot aiming at empty ground with somebody clinging to the
  // edge of frame.
  const travel = sweepTravel(
    endSec - startSec,
    Math.max(DIRECTOR_ROSTER_MIN_TRAVEL, spread * 2),
  );
  // Eye height off the MEDIAN member's feet, not the centroid: one
  // player up on a ledge lifts a mean and the whole pass floats above
  // the faces it is meant to be at.
  const heights = group.map((p) => p.pos[2]).sort((a, b) => a - b);
  const eye = heights[heights.length >> 1] + DIRECTOR_ROSTER_EYE_HEIGHT;
  const front = DIRECTOR_ROSTER_STANDOFF;
  // The camera tracks along the rank at `front` metres out, and the
  // look-at tracks the SAME lateral position on the rank itself — so the
  // view stays square to the line and faces pass through frame. (Panning
  // the target laterally *with* the camera instead pointed the lens
  // along the rank and framed players 100m down the line.) A small lead
  // gives the next face a three-quarter angle rather than dead-on.
  const lead = travel * 0.15;
  // The camera path sits BEHIND the aim by the lead (shifted back along
  // the travel direction), so the aim window stays symmetric over the
  // rank while every face still gets its three-quarter angle. Leading
  // the AIM instead biased the whole pass toward the direction of
  // travel and clipped the players at the trailing edge out of frame.
  const aimFrom = clamp(-travel * 0.5, -spread, spread);
  const aimTo = clamp(travel * 0.5, -spread, spread);
  return {
    kind: "sweep",
    from: [
      center[0] + fx * front - ax * (travel * 0.5 + lead),
      center[1] + fy * front - ay * (travel * 0.5 + lead),
      eye,
    ],
    to: [
      center[0] + fx * front + ax * (travel * 0.5 - lead),
      center[1] + fy * front + ay * (travel * 0.5 - lead),
      eye,
    ],
    target: [center[0] + ax * aimFrom, center[1] + ay * aimFrom, eye],
    targetTo: [center[0] + ax * aimTo, center[1] + ay * aimTo, eye],
    startSec,
    endSec,
    transitionIn: "cut",
    reason: `Pre-match — ${teamName} roster close-up (${group.length})`,
  };
}
