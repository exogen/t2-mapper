/**
 * Coverage for the team-picking period — the dead time before a match
 * that a real broadcast fills rather than sits through.
 *
 * The first version of this was bad, and specifically bad in ways worth
 * recording so they don't come back:
 *
 *   - It used FOUR tour stops (two stands, one generator a side) and
 *     cycled them ~40 times. The map actually carries 68 unique
 *     structure placements — inventory stations, sensors, turrets,
 *     generators — plus the stands.
 *   - Every orbit ran at the same radius, height, speed and direction,
 *     so even the varied subjects looked identical. A fixed 42-unit
 *     radius also framed a big base as a blank wall.
 *   - It never once cut to a player being ASSIGNED TO A TEAM, which is
 *     the whole story of this period and the booth's best cue
 *     ("Storm picks up Irvin"). Those are detectable at 1s resolution:
 *     42 of them before the whistle on the demo this was built against.
 *
 * ## Knowing how long there is
 *
 * Live, nobody knows when the whistle comes — captains can take half an
 * hour. The one honest signal is the OBSERVER COUNT: players sitting in
 * observer have not picked a side yet, and the match cannot start until
 * they mostly have. Measured on a 45-player pickup:
 *
 *     t= 31s  assigned= 0  observers=45
 *     t=217s  assigned=17  observers=27
 *     t=388s  assigned=31  observers=13
 *     t=524s  assigned=42  observers= 3   ← whistle at 681s
 *
 * so `observers × OBSERVER_DRAIN_SEC` is a usable estimate. It is only
 * ever an estimate: re-evaluated every rotation, and a real countdown
 * overrides it outright.
 */
import type { DirectorDataset, DirectorVec3, Shot } from "./types";
import { terrainHeightAt } from "../collision/terrainCollision";
import { PLAYER_DISTS, PLAYER_EYE_LIFTS } from "./humanScale";
import { GROUND_MIN_CLEARANCE } from "./cameraRig";
import { pointObstructed } from "../collision/worldCollision";
import { subjectVisible } from "./shotPath";
import { orbitArc, type FreeSpaceGrid } from "./freeSpace";
import { dist } from "./geometry";

/**
 * Seconds of picking each remaining observer implies. Deliberately
 * coarse — it decides PACING (tour the map vs. start the roster), not
 * anything anyone says out loud.
 */
export const OBSERVER_DRAIN_SEC = 30;

/** Above this estimate there is time to wander: tours and fly-throughs. */
export const PREMATCH_ROAMING_SEC = 300;
/** Below this, stop sightseeing and get on with the teams. */
export const PREMATCH_HURRY_SEC = 90;

const TOUR_HOLD_SEC = 10;
export const SIGNING_HOLD_SEC = 6;
/**
 * An establishing flyover travels at broadcast speed, NOT at
 * `DIRECTOR_SWEEP_MAX_SPEED` (9 u/s). That cap exists so a pan across a
 * rank of players stays slow enough to read faces; applied to a map
 * crossing it covered 135 of Damnation's 729 units — the camera drifted
 * around mid-map pointing at a stand it never reached.
 */
const FLYOVER_SPEED = 38;
const FLYOVER_MIN_SEC = 11;
const FLYOVER_MAX_SEC = 21;

export type PreMatchPace = "roaming" | "touring" | "hurrying";

export function preMatchPace(options: {
  observers: number;
  countdownSec?: number | null;
}): { estimateSec: number; pace: PreMatchPace; fromCountdown: boolean } {
  const fromCountdown = options.countdownSec != null;
  const estimateSec = fromCountdown
    ? options.countdownSec!
    : Math.max(0, options.observers) * OBSERVER_DRAIN_SEC;
  const pace: PreMatchPace =
    estimateSec >= PREMATCH_ROAMING_SEC
      ? "roaming"
      : estimateSec >= PREMATCH_HURRY_SEC
        ? "touring"
        : "hurrying";
  return { estimateSec, pace, fromCountdown };
}

export type LandmarkKind =
  "stand" | "generator" | "inventory" | "sensor" | "turret";

/** All a pass-by needs to know about what it is passing. Widened from
 *  `Landmark` so a PLAYER can be filmed the same way — a signing is a
 *  subject standing somewhere awkward exactly like a generator is. */
export type PassSubject = Pick<
  Landmark,
  "name" | "pos" | "radius" | "indoor" | "aimLift"
>;

export interface Landmark {
  name: string;
  pos: DirectorVec3;
  teamId: number | null;
  kind: LandmarkKind;
  /** Framing distance for this class of thing. A turret filmed from 42
   *  units is a speck; a base filmed from 42 units is a wall. */
  radius: number;
  /** Usually sits inside a building, so a tight orbit is worth trying —
   *  the staging pass solves interior placements and will pull it in. */
  indoor: boolean;
  /**
   * How far above `pos` the lens should look.
   *
   * Everything in this world is anchored at its FOOT, so aiming at the
   * anchor frames the ground it stands on: a person ends up at the
   * bottom of the picture, and a push-in on a sensor closes on the dirt
   * beneath it. For an asset this is its bounding-box centre; for a
   * person, chest height.
   */
  aimLift?: number;
}

const KIND_FRAMING: Record<
  LandmarkKind,
  { radius: number; indoor: boolean; label: string; aimLift: number }
> = {
  // `aimLift` is a FALLBACK. Where the asset has its own static
  // collider the box centre is measured instead — but flag stands and
  // base turrets are part of the building's interior geometry, and
  // resolving those against a collider would return the whole base.
  // Measured against the collider boxes that do exist: an inventory
  // station centres 1.5 above its foot, a sensor 3.2.
  stand: { radius: 34, indoor: false, label: "flag stand", aimLift: 3 },
  generator: { radius: 20, indoor: true, label: "generator", aimLift: 2 },
  inventory: {
    radius: 15,
    indoor: true,
    label: "inventory station",
    aimLift: 1.5,
  },
  sensor: { radius: 18, indoor: false, label: "sensor", aimLift: 3 },
  turret: { radius: 13, indoor: false, label: "turret", aimLift: 2 },
};

function kindOf(name: string): LandmarkKind | null {
  if (/generator/i.test(name)) return "generator";
  if (/inventory/i.test(name)) return "inventory";
  if (/sensor/i.test(name)) return "sensor";
  if (/turret/i.test(name)) return "turret";
  return null;
}

/**
 * Everything STANDING on the map at `nowSec` that is worth pointing a
 * camera at.
 *
 * The time bound is not optional. Most base hardware in Tribes 2 is
 * DEPLOYABLE — players place turrets, stations and sensors during the
 * match — so a tour built from the whole dataset films empty ground.
 * The first version did exactly that: it read the damage LOG
 * (`dataset.structures`, which only lists things that got shot) as an
 * inventory and toured 68 assets, all 68 of which were deployed after
 * the whistle. With a 2s lookahead none of them could legitimately have
 * been known about.
 *
 * Structures carry their own `teamId` from the ghost stream, so whose
 * base something sits in is the game's answer, not an inference.
 */
export function landmarksFor(
  dataset: DirectorDataset,
  nowSec: number,
): Landmark[] {
  const out: Landmark[] = [];
  for (const stand of dataset.flagStands) {
    out.push({
      name: `${teamNameFor(dataset, stand.teamId)} flag stand`,
      pos: stand.pos,
      teamId: stand.teamId,
      kind: "stand",
      radius: KIND_FRAMING.stand.radius,
      indoor: false,
      aimLift: KIND_FRAMING.stand.aimLift,
    });
  }
  const seen = new Set<string>();
  const byKind = new Map<string, Landmark[]>();
  for (const st of dataset.structureInventory) {
    // Not yet placed: showing it would be showing the future.
    if (st.firstSeenSec > nowSec) continue;
    const kind = kindOf(st.name);
    if (!kind) continue;
    const key = `${kind}|${st.pos.map((n) => Math.round(n / 8)).join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const framing = KIND_FRAMING[kind];
    const mark: Landmark = {
      name: `${teamNameFor(dataset, st.teamId ?? null)} ${st.name}`,
      pos: st.pos,
      teamId: st.teamId ?? null,
      kind,
      radius: framing.radius,
      indoor: framing.indoor,
      aimLift: framing.aimLift,
    };
    let list = byKind.get(kind);
    if (!list) byKind.set(kind, (list = []));
    list.push(mark);
  }
  // Interleave the kinds rather than appending them in blocks, so a
  // sequential tour alternates generator → turret → inventory → sensor
  // instead of visiting twenty-three turrets in a row.
  const lists = [...byKind.values()];
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

function teamNameFor(dataset: DirectorDataset, teamId: number | null): string {
  if (teamId == null || teamId <= 0) return "the";
  return (
    dataset.matchFacts?.teams.find((t) => t.teamId === teamId)?.name ??
    `team ${teamId}`
  );
}

/**
 * Deterministic pseudo-random in [0,1) from an integer. Shot variety
 * has to be reproducible — the same demo must plan the same way twice —
 * so this stands in for Math.random.
 */
function jitter(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The establishing run between the two flag stands.
 *
 * A FLY-BY, not a flyover. The old version drew a straight line at the
 * height of the tallest thing between the stands and aimed at a point
 * far ahead, so it opened a hundred metres up, looking away from the
 * flag it was leaving — the one landmark it most needed to establish.
 *
 * This starts low and BEHIND the near stand, so that flag is in frame
 * from the first moment; passes it; rises only where the ground or a
 * building demands it; and settles onto the far stand, which the aim
 * slides across to as it goes.
 */
export function flyThroughShot(
  startSec: number,
  from: Landmark,
  to: Landmark,
): Shot | null {
  // FLAG TO FLAG ONLY. "Generator to flag stand" and friends read as
  // the camera wandering: the endpoints mean nothing to a viewer and
  // the line between them is rarely the map's spine.
  if (from.kind !== "stand" || to.kind !== "stand") return null;
  const span = dist(from.pos, to.pos);
  if (span < 120) return null;
  const dx = (to.pos[0] - from.pos[0]) / span;
  const dy = (to.pos[1] - from.pos[1]) / span;
  // Perpendicular, for the lateral bow that keeps it from being a
  // ruler line across the map.
  const px = -dy;
  const py = dx;

  // Start BEHIND the near stand and below its top, so the approach
  // shows the flag against the sky rather than arriving on top of it.
  // Both ends get the same clearance treatment as the route. The
  // ground behind a stand can stand HIGHER than the stand itself — on
  // Damnation it does, and the run used to open seven metres inside a
  // hill.
  const startPoint = approachPoint(
    from.pos,
    dx,
    dy,
    px,
    py,
    FLYBY_LEAD,
    FLYBY_START_LIFT,
  );
  const endPoint = approachPoint(
    to.pos,
    dx,
    dy,
    px,
    py,
    FLYBY_ARRIVE,
    FLYBY_END_LIFT,
  );

  // Waypoints along the way, each raised only as far as that stretch of
  // ground and architecture requires.
  const via: DirectorVec3[] = [];
  for (let i = 1; i < FLYBY_WAYPOINTS; i++) {
    const f = i / FLYBY_WAYPOINTS;
    // A gentle sideways bow, strongest at the middle.
    const bow = Math.sin(f * Math.PI) * span * FLYBY_BOW;
    const x = startPoint[0] + (endPoint[0] - startPoint[0]) * f + px * bow;
    const y = startPoint[1] + (endPoint[1] - startPoint[1]) * f + py * bow;
    const cruise =
      startPoint[2] + (endPoint[2] - startPoint[2]) * f + FLYBY_CRUISE_LIFT;
    via.push([x, y, clearHeightAt(x, y, cruise)]);
  }
  // Smooth the climb so the camera does not step over every bump —
  // relaxing TOWARD the average, never below what that spot needs.
  // Taking a running max instead (the first version) propagated the
  // single highest requirement along the whole route, which is the
  // fly-at-the-height-of-the-worst-obstacle problem this replaced.
  const need = via.map((v) => v[2]);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < via.length; i++) {
      const prev = via[i - 1]?.[2] ?? startPoint[2];
      const next = via[i + 1]?.[2] ?? endPoint[2];
      via[i][2] = Math.max(need[i], (prev + next) / 2);
    }
  }

  const holdSec = Math.min(
    FLYOVER_MAX_SEC,
    Math.max(FLYOVER_MIN_SEC, span / FLYOVER_SPEED),
  );
  return {
    kind: "sweep",
    from: startPoint,
    to: endPoint,
    via,
    // Open ON the near flag and arrive ON the far one; the aim slides
    // between them across the shot.
    target: [from.pos[0], from.pos[1], from.pos[2] + FLYBY_AIM_LIFT],
    targetTo: [to.pos[0], to.pos[1], to.pos[2] + FLYBY_AIM_LIFT],
    // In between, look at the map going by, not at the ground under the
    // camera: the aim slides along at flag height while the route
    // climbs over whatever is in the middle, and measured mid-flight it
    // pitched 20-40 degrees down.
    maxPitch: FLYBY_MAX_PITCH,
    // Verified below by the caller's path check, and deliberately not
    // re-lifted by staging: the whole point is that it flies low.
    pathSolved: true,
    startSec,
    endSec: startSec + holdSec,
    moveSec: holdSec,
    transitionIn: "cut",
    reason: `Pre-match — across the map, ${from.name} to ${to.name}`,
    role: "tourMove",
  };
}

/** How far behind the near stand the run begins. */
const FLYBY_LEAD = 70;
/** And how far short of the far one it ends. */
const FLYBY_ARRIVE = 45;
/** Height above the stand at each end — low enough to read as a fly-by. */
const FLYBY_START_LIFT = 14;
const FLYBY_END_LIFT = 18;
/** Baseline height added mid-route before clearance is considered. */
const FLYBY_CRUISE_LIFT = 16;
/** Sideways bow at the midpoint, as a fraction of the span. */
const FLYBY_BOW = 0.08;
/** Waypoints sampled along the route. */
const FLYBY_WAYPOINTS = 8;
/** The aim sits at flag height, not at the base of the stand. */
const FLYBY_AIM_LIFT = 4;
/** Steepest the camera looks down mid-route; the horizon stays high in
 *  frame. Radians, from degrees. */
const FLYBY_MAX_PITCH = (14 * Math.PI) / 180;
/**
 * Room the camera keeps from terrain and buildings in flight.
 *
 * Deliberately modest. `pointObstructed` probes the ground a radius out
 * in every direction, so on a slope a generous value pushes the whole
 * route tens of metres up — at ten units the run opened thirty metres
 * above a flag it was meant to skim past.
 */
const FLYBY_CLEARANCE = 5;
/** Step taken while searching upward for clear air. */
const FLYBY_CLIMB_STEP = 3;
/** Ceiling on how far a waypoint may climb to find clear air. */
const FLYBY_MAX_CLIMB = 220;

/**
 * Where to begin (or end) the run, near a stand and as LOW as possible.
 *
 * Straight behind the stand is not automatically the right spot: the
 * ground there can stand higher than the stand itself — on Damnation it
 * is twenty metres higher — and a camera forced above it opens looking
 * down on the flag from a hilltop rather than skimming past it. So try
 * a spread of set-back distances and side offsets, and take whichever
 * sits lowest while still seeing the flag.
 */
function approachPoint(
  flag: DirectorVec3,
  dx: number,
  dy: number,
  px: number,
  py: number,
  lead: number,
  lift: number,
): DirectorVec3 {
  let best: DirectorVec3 | null = null;
  for (const back of [lead, lead * 0.7, lead * 1.3]) {
    for (const side of [0, 1, -1, 2, -2]) {
      const x = flag[0] - dx * back + px * side * FLYBY_SIDE_STEP;
      const y = flag[1] - dy * back + py * side * FLYBY_SIDE_STEP;
      const z = clearHeightAt(x, y, flag[2] + lift);
      const p: DirectorVec3 = [x, y, z];
      if (best != null && z >= best[2]) continue;
      // Lowest is only better if the flag is actually in shot from it.
      if (!subjectVisible(p, [flag[0], flag[1], flag[2] + FLYBY_AIM_LIFT]))
        continue;
      best = p;
    }
  }
  return (
    best ?? [
      flag[0] - dx * lead,
      flag[1] - dy * lead,
      clearHeightAt(flag[0] - dx * lead, flag[1] - dy * lead, flag[2] + lift),
    ]
  );
}
/** Lateral spacing when hunting for a low approach. */
const FLYBY_SIDE_STEP = 30;

/**
 * The lowest height at or above `wanted` that is clear here.
 *
 * "Only as necessary to clear hills and buildings" — so start at the
 * cruise height and rise until the point is free, rather than flying
 * the whole route at the height of the worst obstacle on it.
 */
function clearHeightAt(x: number, y: number, wanted: number): number {
  const ground = terrainHeightAt(x, y);
  let z = Math.max(wanted, (ground ?? wanted) + FLYBY_CLEARANCE);
  const cap = z + FLYBY_MAX_CLIMB;
  while (
    z < cap &&
    pointObstructed([x, y, z], FLYBY_CLEARANCE, {
      includeStatics: false,
    })
  ) {
    z += FLYBY_CLIMB_STEP;
  }
  return z;
}

/**
 * A slow push toward the subject.
 *
 * The camera holds one bearing and closes the distance — no rotation,
 * no orbit. Reads as interest rather than inspection, and it is the
 * move a tour of static hardware most obviously wants.
 */
export function dollyInShotAt(
  startSec: number,
  landmark: PassSubject,
  spot: DirectorVec3,
  index: number,
): Shot {
  const dx = spot[0] - landmark.pos[0];
  const dy = spot[1] - landmark.pos[1];
  const dz = spot[2] - landmark.pos[2];
  const out = Math.max(1e-3, Math.hypot(dx, dy, dz));
  const r = jitter(index * 11 + 3);
  // Finish nearer than the chosen spot, never closer than a sane lens
  // distance. The spot is the START, so the whole move stays in space
  // the grid already vouched for.
  // Proportional, with a floor that scales to the subject. A fixed
  // seven-unit floor against a player filmed from eight units produced
  // a "push" of one unit — a shot that reads as a stationary camera
  // with a hitch in it.
  const near = Math.max(
    Math.min(MIN_PUSH_DIST, out * 0.4),
    out * (0.45 + r * 0.15),
  );
  const f = near / out;
  const holdSec = TOUR_HOLD_SEC + Math.round(r * 4);
  return {
    kind: "sweep",
    from: spot,
    to: [
      landmark.pos[0] + dx * f,
      landmark.pos[1] + dy * f,
      landmark.pos[2] + dz * f,
    ],
    target: aimPoint(landmark),
    startSec,
    endSec: startSec + holdSec,
    moveSec: holdSec,
    transitionIn: "cut",
    reason: `Pre-match — closing on the ${landmark.name}`,
    role: "tourMove",
  };
}
/** Closest a push-in is allowed to end up, for a subject big enough
 *  to want that much room. */
const MIN_PUSH_DIST = 7;
/**
 * How far off-centre the subject sits at each end of a lateral pan,
 * in radians. About thirty-two degrees puts it near the frame edge on
 * a normal lens, so the move reads as the subject crossing the shot.
 */
const PAN_SWING = 0.56;

/**
 * A straight lateral pan across the subject's face.
 *
 * The camera tracks sideways with its look direction FIXED — `target`
 * and `targetTo` shift by the same vector as `from` and `to`, so the
 * lens never rotates. That parallel move is what makes it read as a
 * dolly on rails instead of another thing spinning slowly in place.
 */
export function lateralPanAt(
  startSec: number,
  landmark: PassSubject,
  spot: DirectorVec3,
  index: number,
  options?: { swing?: number },
): Shot {
  const dx = spot[0] - landmark.pos[0];
  const dy = spot[1] - landmark.pos[1];
  const horiz = Math.max(1e-3, Math.hypot(dx, dy));
  const r = jitter(index * 13 + 2);
  const side = r < 0.5 ? -1 : 1;
  // Perpendicular to the way the camera is facing.
  const px = (-dy / horiz) * side;
  const py = (dx / horiz) * side;
  // Sized so the SUBJECT crosses the picture: it should enter at one
  // edge, pass through the middle and leave at the other. Sizing this
  // as a fraction of the standoff instead gave a subject that started
  // centred and drifted off to one side — a pan AWAY, not a pan ACROSS.
  const swing = options?.swing ?? PAN_SWING;
  const travel = 2 * horiz * Math.tan(swing);
  const half = travel / 2;
  const from: DirectorVec3 = [
    spot[0] - px * half,
    spot[1] - py * half,
    spot[2],
  ];
  const to: DirectorVec3 = [spot[0] + px * half, spot[1] + py * half, spot[2]];
  return {
    kind: "sweep",
    from,
    to,
    // A tracking shot runs at ONE speed. Easing it in and out gives the
    // move a beginning and an end, when the point is that the camera
    // was already going when we cut to it and still going when we
    // leave.
    easing: "linear",
    // Shifted with the camera: constant look direction, no rotation.
    target: [
      landmark.pos[0] - px * half,
      landmark.pos[1] - py * half,
      landmark.pos[2] + (landmark.aimLift ?? 0),
    ],
    targetTo: [
      landmark.pos[0] + px * half,
      landmark.pos[1] + py * half,
      landmark.pos[2] + (landmark.aimLift ?? 0),
    ],
    startSec,
    endSec: startSec + TOUR_HOLD_SEC + Math.round(r * 3),
    moveSec: TOUR_HOLD_SEC + Math.round(r * 3),
    transitionIn: "cut",
    reason: `Pre-match — tracking across the ${landmark.name}`,
    role: "tourMove",
  };
}

/** Where a shot of this subject should point. */
function aimPoint(landmark: PassSubject): DirectorVec3 {
  return [
    landmark.pos[0],
    landmark.pos[1],
    landmark.pos[2] + (landmark.aimLift ?? 0),
  ];
}

/**
 * A tour orbit placed at a KNOWN-GOOD camera position.
 *
 * The geometric version picks a bearing and hopes; measured on
 * Damnation only 8% of naively chosen bearings had line of sight to
 * their subject, which is what left the staging pass re-anchoring shot
 * after shot ("subject behind geometry — re-anchoring, angle 108°").
 * Here the spot comes from the free-space grid, so it is already clear
 * of geometry and already known to see the subject; the orbit
 * parameters are just that point expressed in the shot's own terms.
 */
/**
 * How far back to stand from a landmark.
 *
 * A landmark's `radius` is its framing size in the open. Indoors that
 * is the wrong number: Damnation's generator room offers no sight line
 * at all inside 16m at 20m standoff, so the camera ends up across the
 * room with its walls filling most of the frame. Enclosed subjects want
 * a hero framing — close enough that the machine, not the room, is the
 * picture.
 */
export function standoffFor(landmark: Landmark): number {
  return landmark.indoor
    ? Math.min(landmark.radius, INDOOR_STANDOFF)
    : landmark.radius;
}
/** Working distance for a subject inside a room. */
const INDOOR_STANDOFF = 11;

/** Below this much free arc, drifting reads as a twitch: hold instead. */
const MIN_ORBIT_ARC = 0.25;

/**
 * Camera positions for a close-up of a PLAYER, best first.
 *
 * Not taken from the free-space grid. The grid samples every 8 units,
 * and a person is about two and a half units tall — so the lowest cell
 * above someone's feet already looks down on them from head height or
 * more, which is why pick-ups read as shot from a stepladder.
 *
 * Instead: an exact height between the knee and the chest, and a
 * bearing within thirty degrees of the way they are FACING, so the
 * camera sees a face rather than the back of a head. Candidates are
 * checked against real geometry by the caller's path test, so placing
 * them directly costs no safety.
 */
/** Clear of the rig's hard floor, so nothing shoves the camera later. */
const CAMERA_GROUND_MARGIN = GROUND_MIN_CLEARANCE + 0.3;

export function playerCloseUpSpots(
  player: { pos: DirectorVec3; heading?: number },
  index: number,
  options?: { maxOffset?: number },
): DirectorVec3[] {
  const r = jitter(index * 19 + 4);
  // Facing unknown: fall back to circling, still at the right height.
  const face = player.heading ?? r * Math.PI * 2;
  const spots: DirectorVec3[] = [];
  // Widen in tiers, and never abandon the face. Filming the back of
  // someone's head is worse than any three-quarter angle, so the last
  // resort here is a wide bearing — NOT a trailing follow, which is
  // what a third of pick-ups had degraded into.
  const maxOffset = options?.maxOffset ?? Infinity;
  for (const tier of PLAYER_BEARING_TIERS) {
    for (const dist of PLAYER_DISTS) {
      for (const off of tier) {
        if (Math.abs(off) > maxOffset) continue;
        for (const lift of PLAYER_EYE_LIFTS) {
          // The orbit-yaw convention: a camera at (sin, cos)·r on the
          // player's heading stands in front of them, looking back.
          const a = face + off;
          const x = player.pos[0] + Math.sin(a) * dist;
          const y = player.pos[1] + Math.cos(a) * dist;
          // Heights are chosen relative to the SUBJECT's feet, but the
          // ground under a camera eight units away can be higher — and
          // a lens below the rig's floor gets shoved up by it, which is
          // the one thing this placement exists to prevent. Lift to
          // clear the floor; the aim stays on the chest, so the frame
          // survives the slightly steeper angle.
          const ground = terrainHeightAt(x, y);
          const z = Math.max(
            player.pos[2] + lift,
            ground != null ? ground + CAMERA_GROUND_MARGIN : -Infinity,
          );
          spots.push([x, y, z]);
        }
      }
    }
  }
  return spots;
}
/**
 * Bearings off the player's facing, in widening tiers. The first tier
 * is the thirty-degree window a portrait wants; the rest exist only so
 * that someone backed into a corner is still shot from the front-ish
 * rather than from behind.
 */
const PLAYER_BEARING_TIERS = [
  [0, 0.21, -0.21, 0.42, -0.42],
  [0.63, -0.63, 0.84, -0.84],
];
/** Widest bearing a lateral pan may START from. The pan itself swings
 *  ±PAN_SWING on top, so anything wider ends the move looking at an
 *  ear. */
export const PAN_MAX_OFFSET = 0.42;

/**
 * The orbit a grid spot describes around a subject — bearing, standoff
 * and height in the fixedOrbit convention — with the placement handed
 * to staging already solved. The grid proved the spot clear and seeing
 * the subject, and solvePlacement casts outward from the anchor, so it
 * cannot even express a camera below its subject (a basement generator
 * was filmed from inside the ceiling above it).
 */
function solvedOrbitAt(
  landmark: Pick<PassSubject, "pos" | "aimLift">,
  spot: DirectorVec3,
) {
  const dx = spot[0] - landmark.pos[0];
  const dy = spot[1] - landmark.pos[1];
  const radius = Math.max(4, Math.hypot(dx, dy));
  // fixedOrbit convention: the camera sits at (sin θ, cos θ)·r.
  const startAngle = Math.atan2(dx, dy);
  // The rig puts the eye at anchor.z + liftFactor*radius. It does NOT
  // add its look-lift to the camera — that is the aim only — and
  // subtracting it here to "compensate" placed every portrait two units
  // below the spot the grid chose, which for a chest-height camera is
  // underground.
  const heightFactor = (spot[2] - landmark.pos[2]) / radius;
  return {
    center: landmark.pos,
    radius,
    startAngle,
    heightFactor,
    // Same aim point as every other move on this subject: its middle,
    // not the foot it is anchored at.
    ...(landmark.aimLift != null ? { lookLift: landmark.aimLift } : {}),
    staged: {
      angle: startAngle,
      radius,
      liftFactor: heightFactor,
      visibility: 1,
    },
  };
}

/** A locked-off camera: no orbit, no move. Stillness is a shot. */
export function holdShotAt(
  startSec: number,
  landmark: PassSubject,
  spot: DirectorVec3,
  index: number,
): Shot {
  const r = jitter(index * 17 + 9);
  return {
    kind: "fixedOrbit",
    ...solvedOrbitAt(landmark, spot),
    angularSpeed: 0,
    startSec,
    endSec: startSec + TOUR_HOLD_SEC + Math.round(r * 3),
    transitionIn: "cut",
    reason: `Pre-match — the ${landmark.name}`,
    role: "tourHold",
  };
}

export function tourShotAt(
  grid: FreeSpaceGrid,
  startSec: number,
  landmark: Landmark,
  spot: DirectorVec3,
  index: number,
): Shot {
  const orbit = solvedOrbitAt(landmark, spot);
  const r = jitter(index * 3 + 7);
  const dur = TOUR_HOLD_SEC + Math.round(r * 4);

  // The grid vouches for the START point; an orbit does not stay on it.
  // Base hardware sits in rooms whose walls the circle walks straight
  // into, which is why placing shots from the grid did not, by itself,
  // stop the re-anchoring. Ask how far this circle can actually turn and
  // fit the shot to that.
  const arc = orbitArc(
    grid,
    landmark.pos,
    aimPoint(landmark),
    orbit.radius,
    orbit.heightFactor,
    orbit.startAngle,
  );
  // Take the roomier side, so direction follows the geometry instead of
  // every shot in the tour drifting clockwise.
  const dir: 1 | -1 = arc.cw >= arc.ccw ? 1 : -1;
  // Leave some of the arc unspent rather than ending hard against the
  // wall that bounded it.
  const usable = Math.max(arc.cw, arc.ccw) * 0.8;
  // A boxed-in subject becomes a locked-off camera — which is the
  // variety the tour was missing, not a degraded case.
  const angularSpeed =
    usable < MIN_ORBIT_ARC ? 0 : dir * Math.min(0.03 + r * 0.05, usable / dur);

  return {
    kind: "fixedOrbit",
    ...orbit,
    angularSpeed,
    startSec,
    endSec: startSec + dur,
    transitionIn: "cut",
    reason: `Pre-match — ${landmark.name}`,
    role: "tourHold",
  };
}
