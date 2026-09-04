/**
 * Pre-match roster line-ups. Before the whistle the teams stand
 * assembled at their bases and nothing moves, so the shot is a slow pass
 * along the ranks rather than an orbit of a flag that will not budge:
 * one wide establishing pass per team, then close-ups along the front
 * rank at head height, working across different knots of players so
 * successive passes show new faces.
 */
import type { DirectorVec3, Shot } from "./types";
import {
  DIRECTOR_LINEUP_HEIGHT,
  DIRECTOR_LINEUP_STANDOFF,
  DIRECTOR_LINEUP_STANDOFF_MAX_EXTRA,
  DIRECTOR_LINEUP_TRAVEL,
  DIRECTOR_ROSTER_EYE_HEIGHT,
  DIRECTOR_ROSTER_GROUP_RANGE,
  DIRECTOR_ROSTER_MIN_TRAVEL,
  DIRECTOR_ROSTER_STANDOFF,
} from "./tunables";
import { centroid, clamp, dist, sweepTravel } from "./geometry";

/** The wide establishing pass: the whole squad and their base. */
export function rosterWide(
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
    role: "rosterWide",
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
    moveSec: endSec - startSec,
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
export interface RosterFraming {
  /** Multiplier on the standoff — a pass that cannot fly at the usual
   *  distance may fly closer, or further out. */
  standoffScale?: number;
  /** Film the rank from behind instead of in front. A line facing a
   *  wall has no room on its own front side. */
  mirror?: boolean;
  /** Extra height, when the ground-level line is the problem. */
  lift?: number;
}

export function rosterCloseUp(
  startSec: number,
  endSec: number,
  squad: { targetId: number; pos: DirectorVec3; heading?: number }[],
  teamName: string,
  alreadyFeatured: Set<number>,
  framing: RosterFraming = {},
): Shot | null {
  // MULTI-SCALE group search: pre-match formations are often LOOSE
  // lines 20-40m across, not 9m huddles — a trio spread across open
  // ground is a better pan than a tight pair (the pan just moves a
  // little faster to cover it). Try widening radii; more members wins,
  // with a mild density preference and fresh faces as a bonus, never
  // the primary criterion (that once picked two stragglers over the
  // squad's actual line).
  const MIN_KNOT = 2;
  let group: typeof squad = [];
  let bestValue = -Infinity;
  for (const radius of [DIRECTOR_ROSTER_GROUP_RANGE, 18, 30]) {
    for (const anchor of squad) {
      const near = squad.filter((p) => dist(p.pos, anchor.pos) <= radius);
      if (near.length < MIN_KNOT) continue;
      const fresh = near.filter((p) => !alreadyFeatured.has(p.targetId)).length;
      const value = near.length + fresh * 0.5 - (radius / 30) * 0.75;
      if (value > bestValue) {
        bestValue = value;
        group = near;
      }
    }
  }
  if (group.length < Math.min(MIN_KNOT, squad.length)) return null;
  for (const p of group) alreadyFeatured.add(p.targetId);
  const center = centroid(group.map((p) => p.pos));
  // Their average facing, so the camera can sit in front of the rank.
  const headings = group
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
  // Where the FACES are — the aim, whatever height the camera works at.
  const faceZ = heights[heights.length >> 1] + DIRECTOR_ROSTER_EYE_HEIGHT;
  // ...and where the camera sits. Lifting both together would raise the
  // aim with the lens and point the pass over the rank it is filming,
  // which is the whole failure this framing exists to escape.
  const eye = faceZ + (framing.lift ?? 0);
  const front =
    DIRECTOR_ROSTER_STANDOFF *
    (framing.standoffScale ?? 1) *
    (framing.mirror ? -1 : 1);
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
    role: "rosterCloseUp",
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
    target: [center[0] + ax * aimFrom, center[1] + ay * aimFrom, faceZ],
    targetTo: [center[0] + ax * aimTo, center[1] + ay * aimTo, faceZ],
    startSec,
    endSec,
    moveSec: endSec - startSec,
    transitionIn: "cut",
    reason: `Pre-match — ${teamName} roster close-up (${group.length})`,
  };
}
