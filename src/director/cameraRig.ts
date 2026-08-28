/**
 * The camera rig: the geometry and easing the director's runtime uses to
 * place a camera, plus every constant that governs it.
 *
 * The interesting piece is the occlusion search. Finding somewhere a
 * subject can actually be SEEN from is done by casting outward from the
 * subject (clearStandoff), never by testing candidate camera positions
 * inward — from outside a wall every candidate reports "blocked",
 * however many are tried, so a subject indoors could never be framed.
 *
 * Positions here are Three-space; the collision system is Torque-space,
 * and the conversion (Three x, y, z = Torque y, z, x) happens at the ray
 * calls.
 */
import { Vector3 } from "three";
import { castWorldRay } from "../collision/worldCollision";
import { castTerrainRay } from "../collision/terrainCollision";
import type { DirectorVec3 } from "./types";

/** Slow broadcast-style orbit drift for aimless shots (radians/second). */
export const FOLLOW_YAW_DRIFT = 0.04;
/** Per-second easing rate for continuous distance/pitch transitions. */

export const PARAM_EASE_RATE = 2;
/** Max turn rate steering the orbit toward an aim (radians/second) —
 *  slow enough to stay watchable, fast enough to track a skiing turn. */

export const AIM_TURN_RATE = 0.7;
/** Below this horizontal speed (Torque u/s) the subject's facing aims
 *  the camera instead of their (jittery near-zero) velocity. */

export const AIM_MIN_SPEED = 4;
/** "toward" aim holds its last bearing inside this range of the target,
 *  where the direction to it is ill-defined. */

export const AIM_TOWARD_MIN_RANGE = 25;
/** Fixed orbits ride this high, as a fraction of their radius — an
 *  elevated press-box vantage rather than player height, which is the
 *  primary camera position in every field sport. */

export const ORBIT_HEIGHT_FACTOR = 0.6;
/** Fixed orbits look slightly above the ground at the center point. */

export const ORBIT_LOOK_LIFT = 2;
/** The lower lift used when VERIFYING a placement's view back onto the
 *  subject: high enough to clear the floor they stand on, low enough
 *  that the roof over their head still counts as blocking. */
const VERIFY_LOOK_LIFT = 1;
const _verifyCam = new Vector3();
const _verifyTarget = new Vector3();
/** Dolly: position/aim damping rates (per second) — the lag and ease
 *  are what make it read as a flying film camera, not a rigid mount. */

export const DOLLY_DAMPING = 2.5;

export const DOLLY_AIM_DAMPING = 3.5;
/** Dolly rides at a trailing three-quarter angle off the subject's
 *  path, not directly behind. */

export const DOLLY_SIDE_ANGLE = 0.6;
/** How fast the dolly's idea of "behind the subject" may turn
 *  (radians/second). The raw heading flicks with every jink, and at
 *  offset distance a flick is metres of instant camera motion. */
export const DOLLY_HEADING_RATE = 1.1;
/** Low-pass rate for the feed-forward velocity (per second) — raw ghost
 *  velocity is stepwise per tick and re-adds the jitter the position
 *  damping just removed. */
export const DOLLY_VELOCITY_SMOOTHING = 3;

export const DOLLY_DEFAULT_DISTANCE = 12;

export const DOLLY_DEFAULT_HEIGHT = 4;
/** Dolly aims at roughly chest height on the subject. */

export const DOLLY_LOOK_LIFT = 1;

/**
 * Loose-spring damping for the follow camera's target while the
 * director drives (streamPlaybackStore.orbitTargetDamping). The camera
 * catches up like a human operator instead of teleporting with every
 * flag drop, pass and pickup; at ski speed the lag is a few metres —
 * imperfect centering is the point.
 */
export const DIRECTOR_ORBIT_TARGET_DAMPING = 4.5;

/**
 * Cap on how far the loose spring may sag behind the true target. At
 * 4.5 damping a capper at ski speed settles ~15m behind — enough to
 * push them to the frame edge at stand-shot distances. Clamping the
 * lag keeps the spring feel on direction changes and slow drift while
 * fast straight-line movers stay comfortably in frame.
 */
export const DIRECTOR_ORBIT_TARGET_MAX_LAG = 7;

/** A pan-state change (subject gone / back / teleported home) must
 *  persist this long before the pan acts on it — the flag ghost
 *  flickers around captures, and reacting per-flicker swings the aim
 *  mid-ceremony. */
export const PAN_STATE_COMMIT_SEC = 0.4;

/** How fast a locked-off camera pans onto its subject (per second). */

export const STATIC_PAN_DAMPING = 1.2;
/**
 * Occlusion testing for fixed shots: a static camera stuck behind a
 * hillside or inside a base wall shows nothing for its whole duration,
 * so candidate angles are ray-tested against the scene and the first
 * clear one wins. Only run when the shot is applied (once per shot),
 * never per frame.
 */
/**
 * Ignore hits this close to the subject — the target's own body and the
 * floor under their feet are not "blocking". Kept TIGHT: players and
 * vehicles are not in the collision world (only terrain, interiors and
 * force fields are), so the only thing a generous margin ever hid was a
 * real wall — at 6 units, a subject standing within arm's reach of a
 * rampart read as visible from the far side of it.
 */

const OCCLUSION_TARGET_MARGIN = 2.5;
/**
 * Candidate angle offsets, smallest first: the planner's bearing already
 * sits on the broadcast side of the axis of action (the 180-degree
 * rule), and small offsets stay there. The wide ones cross the line and
 * flip the sense of play, so they are a last resort — taken only when
 * every same-side angle is blocked, since an unreadable angle still
 * beats a view of the inside of a wall.
 */

const OCCLUSION_ANGLE_OFFSETS = [
  0,
  Math.PI / 8,
  -Math.PI / 8,
  Math.PI / 4,
  -Math.PI / 4,
  (3 * Math.PI) / 8,
  (-3 * Math.PI) / 8,
  Math.PI / 2,
  -Math.PI / 2,
  (3 * Math.PI) / 4,
  (-3 * Math.PI) / 4,
  Math.PI,
];

const OCCLUSION_HEIGHT_BOOSTS = [1, 1.6, 2.4];
/** Clearance kept between the camera and the surface behind it. */

const STANDOFF_WALL_MARGIN = 1.5;
/** A placement squeezed below this fraction of the shot's intended
 *  radius is not that shot any more: a 55m area frame pulled to 9m is
 *  a portrait of the nearest wall, however visible the anchor is. */
export const STANDOFF_MIN_SCALE = 0.35;

/**
 * The closest standoff a placement may SELECT. This is a framing floor,
 * not a fits-at-all floor: the pull-in machinery once accepted any
 * bearing with 2.5m of room, which parked the lens 2.9m from a dropped
 * flag — a screen full of cloth. Below this, the bearing counts as
 * having no room and the search moves on (or holds the imperfect
 * frame); the turtle shots the user rates highly sit at 9-12m.
 */
export const STANDOFF_MIN = 7;
/**
 * Never pull further back than this fraction of the planned radius: a
 * bearing with room to spare should not turn a tight shot into a wide
 * one just because the space allows it.
 */

const STANDOFF_MAX_SCALE = 1;
/**
 * Beyond this the subject of a fixed camera is a dot in the fog. The
 * planner frames a shot around where its subject WILL be, but a turtled
 * flag can be picked up and skied half the map away mid-shot — leaving a
 * camera correctly aimed at an empty hillside for the rest of its
 * duration. Past this range the shot re-anchors on the subject.
 */

export const SUBJECT_MAX_RANGE = 90;
/**
 * A sweep's path is authored blind to geometry, so a close roster pass
 * can end up inside a hillside or behind a base wall — nameplates draw
 * over the occluder, so the frame reads as labels floating in darkness.
 * Lift the whole path by these amounts until both ends can see their
 * subject.
 */

export const SWEEP_LIFT_STEPS = [0, 3, 7, 14, 25];
/** Fraction of a sweep spent getting up to speed (see easeInHold). */

const SWEEP_EASE_IN_FRACTION = 0.25;
/**
 * Keeping the SUBJECT visible, not just the initial placement: a wall
 * or hillside between camera and subject ruins a shot for its whole
 * duration, and subjects move after the shot is framed. Re-checked on
 * this interval, and corrected only after it has been blocked for a
 * couple of checks running, so a teammate walking through frame does
 * not send the camera hunting.
 */

export const VISIBILITY_CHECK_SEC = 0.4;
/**
 * Minimum time between visibility corrections within one shot. Each
 * correction is a camera move; firing them back to back (a dropped flag
 * rolls, the previous travel has barely landed) reads as the camera
 * spinning in confusion. Steady beats current.
 */
export const REANCHOR_COOLDOWN_SEC = 5;
/**
 * Disruption budget for a mid-shot correction. Beyond these the "fix"
 * is worse than the fault: a correction that swings the view most of a
 * right angle, or has to whip to get there, or lands moments before the
 * cut, reads as the camera panicking — hold the imperfect frame and let
 * the next shot solve it instead.
 */
export const REANCHOR_MAX_SWEEP_RAD = 1.2;
export const REANCHOR_MAX_SWEEP_RATE = 1.4;
export const REANCHOR_MIN_REMAINING_SEC = 3.5;
/** No correction of any kind fires in a shot's final stretch: a cut is
 *  coming anyway, and a retarget seconds before it is pure jump with no
 *  time to pay off. */
export const CORRECTION_MIN_REMAINING_SEC = 2;

export const VISIBILITY_BLOCKED_STRIKES = 2;
/**
 * Yaw offsets tried when a follow shot's subject goes behind cover.
 * Offset 0 first: pulling in on the CURRENT bearing does not swing the
 * view at all, so it is always the least disruptive fix — swing only
 * when the present bearing has no room even up close.
 */
export const VISIBILITY_YAW_OFFSETS = [
  0,
  Math.PI / 6,
  -Math.PI / 6,
  Math.PI / 3,
  -Math.PI / 3,
  Math.PI / 2,
  -Math.PI / 2,
  (2 * Math.PI) / 3,
  (-2 * Math.PI) / 3,
  Math.PI,
];

/**
 * The camera must never sink into the ground — a shot from inside a hill
 * is an opaque green screen. The terrain sampler gives an exact height
 * in O(1) (the same one item physics uses), so this is enforced every
 * frame rather than probed.
 */
export const GROUND_MIN_CLEARANCE = 1;
/** Vertical span the ground probe searches, in Torque Z. */

const GROUND_PROBE_TOP = 2000;

const GROUND_PROBE_BOTTOM = -500;
/** Pitch search used to lift a follow orbit off the ground. */

export const FOLLOW_PITCH_STEP = 0.08;

export const FOLLOW_PITCH_MAX = 1.1;

export const FOLLOW_PITCH_STEPS = 14;

/**
 * Cuts between nearby camera positions read as a jolt rather than an
 * edit, so a new shot within this range of the current camera is flown
 * to instead of snapped to. Beyond it, a cut is the right call — you
 * cannot travel across a map without the shot becoming about the
 * travelling.
 */

export const TRANSITION_MAX_DISTANCE = 200;
/** Below this there is nothing to travel. */

export const TRANSITION_MIN_DISTANCE = 1.5;
/** Pace of the move, and the range its duration is clamped to. */

export const TRANSITION_SPEED = 110;

export const TRANSITION_MIN_SEC = 0.45;

export const TRANSITION_MAX_SEC = 1.8;
/** How many frames to wait for a shot's destination pose to appear
 *  before concluding there is nothing to travel to. */

export const TRANSITION_ARM_FRAMES = 6;

const _rayTo = new Vector3();

const _rayDir = new Vector3();

/** Symmetric ease so the move starts and stops gently. */
/**
 * Ease up to speed, then hold it to the end of the pass.
 *
 * A broadcast pan is cut while it is still moving — bringing it to rest
 * first reads as the camera operator running out of rank, and it is the
 * dead frames at the end of a decelerating move that make a sweep look
 * like it was aimed at nothing. Distance still integrates to exactly 1
 * over the shot, so the pass covers the same ground either way.
 */
export function easeInHold(t: number): number {
  if (t >= 1) return 1;
  const k = SWEEP_EASE_IN_FRACTION;
  // Constant speed after the ramp, chosen so total distance is 1.
  const speed = 1 / (1 - k / 2);
  return t <= k ? (speed * t * t) / (2 * k) : (speed * k) / 2 + speed * (t - k);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Step an angle toward a target along the shortest arc, rate-limited. */
export function approachAngle(
  current: number,
  target: number,
  maxStep: number,
): number {
  const TWO_PI = Math.PI * 2;
  let diff = (target - current) % TWO_PI;
  if (diff > Math.PI) diff -= TWO_PI;
  if (diff < -Math.PI) diff += TWO_PI;
  return current + Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
}

/**
 * Whether static world geometry blocks the view from `from` to `to`
 * (both Three-space). Uses the engine's own collision system —
 * terrain, interiors and force fields, BVH-accelerated, in Torque space
 * — rather than raycasting the render graph: it is the geometry that
 * actually blocks a shot, it costs a fraction as much, and it cannot
 * trip over nameplates or half-mounted objects.
 *
 * The last stretch before the target is ignored so the subject's own
 * surroundings (the floor they stand on, a teammate beside them) do not
 * count as blocking them.
 */
export function viewBlocked(from: Vector3, to: Vector3): boolean {
  _rayDir.subVectors(to, from);
  const distance = _rayDir.length();
  if (distance <= OCCLUSION_TARGET_MARGIN) return false;
  const shorten = OCCLUSION_TARGET_MARGIN / distance;
  // Three (x, y, z) → Torque (z, x, y).
  const startTorque: [number, number, number] = [from.z, from.x, from.y];
  const endTorque: [number, number, number] = [
    from.z + (to.z - from.z) * (1 - shorten),
    from.x + (to.x - from.x) * (1 - shorten),
    from.y + (to.y - from.y) * (1 - shorten),
  ];
  // Static shapes (a generator, a bunker prop) block a camera exactly
  // like interior walls do — only the roof/doorway probes stay
  // interiors-only, where a prop overhead must not read as a building.
  return castWorldRay(startTorque, endTorque, { includeStatics: true }) != null;
}

/**
 * The fixedOrbit bearing at which `camera` currently sits around a
 * Three-space anchor point — the same planar convention every orbit
 * placement uses (camera offset = (cosθ, sinθ)·r in Three x/z). The
 * two orbit-angle conventions in this codebase have been confused
 * before; never hand-roll this atan2 at a call site.
 */
export function orbitBearingOf(
  camera: { x: number; z: number },
  anchorThreeX: number,
  anchorThreeZ: number,
): number {
  return Math.atan2(camera.z - anchorThreeZ, camera.x - anchorThreeX);
}

/** Lateral spread of the multi-point visibility probes: a subject is
 *  "visible" only when most of a 2.5m halo around them is, so a single
 *  ray grazing past a wall edge cannot pass a frame that is mostly
 *  masonry. */
const VIEW_PROBE_SPREAD = 2.5;
const _probeRight = new Vector3();
const _probePoint = new Vector3();

/**
 * Multi-point occlusion test for a framed subject: the sightline must
 * reach the subject AND at least one of two points 2.5m either side of
 * them (perpendicular to the view). Requiring every probe would refuse
 * to frame a subject standing against a wall at all, but a single
 * centre ray threading a crack reads "clear" while the viewer sees
 * wall — majority-clear keeps most of the frame on the subject.
 */
export function subjectViewBlocked(from: Vector3, to: Vector3): boolean {
  if (viewBlocked(from, to)) return true;
  _probeRight.set(to.z - from.z, 0, -(to.x - from.x));
  if (_probeRight.lengthSq() < 1e-6) return false;
  _probeRight.normalize();
  _probePoint.copy(to).addScaledVector(_probeRight, VIEW_PROBE_SPREAD);
  const leftClear = !viewBlocked(from, _probePoint);
  if (leftClear) return false;
  _probePoint.copy(to).addScaledVector(_probeRight, -VIEW_PROBE_SPREAD);
  return viewBlocked(from, _probePoint);
}

const _standoffRight = new Vector3();
const _standoffOrigin = new Vector3();

/**
 * clearStandoff across the same 2.5m halo: the room a bearing really
 * offers is what the WORST of the majority-clear probes allows, so a
 * placement chosen down a crack between walls no longer counts as
 * having a view. A lateral probe with no room at all is tolerated
 * (subject against a wall) as long as the centre and the other side
 * have it.
 */
export function clearStandoffWide(
  target: Vector3,
  dir: Vector3,
  desired: number,
): number {
  const centre = clearStandoff(target, dir, desired);
  if (centre <= 0) return 0;
  _standoffRight.set(dir.z, 0, -dir.x);
  if (_standoffRight.lengthSq() < 1e-6) return centre;
  _standoffRight.normalize();
  _standoffOrigin
    .copy(target)
    .addScaledVector(_standoffRight, VIEW_PROBE_SPREAD);
  const left = clearStandoff(_standoffOrigin, dir, desired);
  _standoffOrigin
    .copy(target)
    .addScaledVector(_standoffRight, -VIEW_PROBE_SPREAD);
  const right = clearStandoff(_standoffOrigin, dir, desired);
  if (left <= 0 && right <= 0) return 0;
  if (left <= 0) return Math.min(centre, right);
  if (right <= 0) return Math.min(centre, left);
  return Math.min(centre, left, right);
}

/**
 * Ground height under a Three-space point, from the same terrain
 * collision data the projectile physics uses. Null when no terrain is
 * registered (nothing to clamp against).
 */
export function groundHeightAt(threeX: number, threeZ: number): number | null {
  // Straight down through the world, in Torque space.
  const hit = castTerrainRay(
    [threeZ, threeX, GROUND_PROBE_TOP],
    [threeZ, threeX, GROUND_PROBE_BOTTOM],
  );
  return hit ? hit.point[2] : null;
}

/** How far up the roof test looks, and how close together two door
 *  crossings must be to count as the same door. */
const ROOF_PROBE_HEIGHT = 60;
const DOOR_CLUSTER_RADIUS = 8;
/** A door needs this many independent crossings — one flip can be a
 *  sampling artifact at a roof edge. */
const DOOR_MIN_CROSSINGS = 2;

/** Extra height given to an anchor lifted out of the terrain. */
const ANCHOR_SURFACE_LIFT = 2;

/**
 * Planner anchors are computed from sample centroids, and on a slope
 * map the centroid of players spread across a hillside can land INSIDE
 * the hill — a camera then frames dirt, and every correction around the
 * buried point makes it worse. Returns a surface-lifted copy when the
 * anchor is under the terrain in the open; null to keep the original.
 * Anchors under a roof are left alone: rooms are legitimately built
 * into hillsides, and lifting a turtle anchor would break those shots.
 */
export function surfaceLiftedAnchor(anchor: DirectorVec3): DirectorVec3 | null {
  const ground = castTerrainRay(
    [anchor[0], anchor[1], anchor[2] + 400],
    [anchor[0], anchor[1], anchor[2] - 400],
  );
  if (!ground || anchor[2] >= ground.point[2] - 0.5) return null;
  if (isRoofed(anchor)) return null;
  return [anchor[0], anchor[1], ground.point[2] + ANCHOR_SURFACE_LIFT];
}

/** Whether a Torque-space point stands under interior geometry. */
export function isRoofed(pos: DirectorVec3): boolean {
  const hit = castWorldRay(
    [pos[0], pos[1], pos[2] + 2],
    [pos[0], pos[1], pos[2] + ROOF_PROBE_HEIGHT],
  );
  return hit?.source === "interior";
}

export interface Doorway {
  /** Torque-space door position (crossing-cluster centroid). */
  pos: DirectorVec3;
  /** Unit horizontal direction pointing OUT of the structure. */
  outward: [number, number];
  /** Independent player crossings that voted for this door. */
  crossings: number;
}

/**
 * Doorways found from where players actually walked: a player whose
 * consecutive samples flip between roofed and open sky crossed a door
 * between them, the midpoint marks it, and the unroofed side says which
 * way is out. Definitive where ray fans fail — a hold deep in cornered
 * corridors has no straight ray to daylight, but every attacker and
 * defender files through the real doors all match long.
 */
export function findDoorwaysFromPaths(
  samples: { timeSec: number; targetId: number; pos: DirectorVec3 }[],
  near: DirectorVec3,
  range: number,
): Doorway[] {
  interface Crossing {
    x: number;
    y: number;
    z: number;
    outX: number;
    outY: number;
  }
  const crossings: Crossing[] = [];
  const last = new Map<
    number,
    { timeSec: number; pos: DirectorVec3; roofed: boolean }
  >();
  for (const sample of samples) {
    const dx = sample.pos[0] - near[0];
    const dy = sample.pos[1] - near[1];
    if (dx * dx + dy * dy > range * range) continue;
    const roofed = isRoofed(sample.pos);
    const prev = last.get(sample.targetId);
    last.set(sample.targetId, {
      timeSec: sample.timeSec,
      pos: sample.pos,
      roofed,
    });
    if (!prev || sample.timeSec - prev.timeSec > 2.5) continue;
    if (prev.roofed === roofed) continue;
    const inside = roofed ? sample.pos : prev.pos;
    const outside = roofed ? prev.pos : sample.pos;
    const ox = outside[0] - inside[0];
    const oy = outside[1] - inside[1];
    const len = Math.hypot(ox, oy);
    if (len < 0.5) continue;
    crossings.push({
      x: (prev.pos[0] + sample.pos[0]) / 2,
      y: (prev.pos[1] + sample.pos[1]) / 2,
      z: Math.min(prev.pos[2], sample.pos[2]),
      outX: ox / len,
      outY: oy / len,
    });
  }
  // Greedy clustering: biggest knots of crossings are the doors.
  const doors: Doorway[] = [];
  const used = new Array<boolean>(crossings.length).fill(false);
  for (;;) {
    let seed = -1;
    let seedCount = 0;
    for (let i = 0; i < crossings.length; i++) {
      if (used[i]) continue;
      let count = 0;
      for (let j = 0; j < crossings.length; j++) {
        if (used[j]) continue;
        const d = Math.hypot(
          crossings[j].x - crossings[i].x,
          crossings[j].y - crossings[i].y,
        );
        if (d <= DOOR_CLUSTER_RADIUS) count++;
      }
      if (count > seedCount) {
        seedCount = count;
        seed = i;
      }
    }
    if (seed < 0 || seedCount < DOOR_MIN_CROSSINGS) break;
    let sx = 0;
    let sy = 0;
    let sz = 0;
    let ox = 0;
    let oy = 0;
    let n = 0;
    for (let j = 0; j < crossings.length; j++) {
      if (used[j]) continue;
      const d = Math.hypot(
        crossings[j].x - crossings[seed].x,
        crossings[j].y - crossings[seed].y,
      );
      if (d > DOOR_CLUSTER_RADIUS) continue;
      used[j] = true;
      sx += crossings[j].x;
      sy += crossings[j].y;
      sz += crossings[j].z;
      ox += crossings[j].outX;
      oy += crossings[j].outY;
      n++;
    }
    const outLen = Math.hypot(ox, oy) || 1;
    doors.push({
      pos: [sx / n, sy / n, sz / n],
      outward: [ox / outLen, oy / outLen],
      crossings: n,
    });
  }
  return doors.sort((a, b) => b.crossings - a.crossings);
}

/** Doorway probing: bearings tried, how far a ray must run clear of
 *  interior geometry to count as an opening, and the eye height the
 *  probes run at (torso height — door mouths, not windows or vents). */
const DOORWAY_PROBE_BEARINGS = 24;
const DOORWAY_MIN_CLEAR = 12;
const DOORWAY_PROBE_RANGE = 45;
const DOORWAY_PROBE_LIFT = 1.6;

/**
 * Openings in the interior around a point, by RAY FAN — the fallback
 * when no walked-path crossings exist (findDoorwaysFromPaths is the
 * definitive detector). Casts a fan of
 * horizontal rays outward from `inside` (Three-space): a bearing whose
 * ray leaves the structure (no interior hit before the probe range, and
 * nothing at all within the minimum clearance) is an opening; a hill
 * outside the door (a terrain hit beyond the clearance) does not
 * disqualify it. Returns bearings in the orbit-angle convention,
 * best-escape first.
 */
export function findOpeningsByRay(
  inside: Vector3,
): { angle: number; escape: number }[] {
  const out: { angle: number; escape: number }[] = [];
  for (let i = 0; i < DOORWAY_PROBE_BEARINGS; i++) {
    const angle = (i / DOORWAY_PROBE_BEARINGS) * Math.PI * 2;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const hit = castWorldRay(
      [inside.z, inside.x, inside.y + DOORWAY_PROBE_LIFT],
      [
        inside.z + dz * DOORWAY_PROBE_RANGE,
        inside.x + dx * DOORWAY_PROBE_RANGE,
        inside.y + DOORWAY_PROBE_LIFT,
      ],
    );
    const escape = hit ? hit.t * DOORWAY_PROBE_RANGE : DOORWAY_PROBE_RANGE;
    if (escape < DOORWAY_MIN_CLEAR) continue;
    if (hit && hit.source === "interior") continue;
    out.push({ angle, escape });
  }
  return out.sort((a, b) => b.escape - a.escape);
}

/**
 * How far from `target` a camera may sit along `dir` (a unit vector)
 * before static geometry gets in the way, capped at `desired`.
 *
 * Cast OUTWARD from the subject: that is the only query which answers
 * "how much room is there?". Testing candidate standoffs inward from
 * outside a wall can only ever report "blocked", however many are tried,
 * so a subject indoors could never be framed at all — the camera would
 * sit in the corridor outside staring at masonry for the whole shot.
 * Returns 0 when not even the minimum fits.
 */
export function clearStandoff(
  target: Vector3,
  dir: Vector3,
  desired: number,
): number {
  // Three (x, y, z) → Torque (z, x, y).
  const hit = castWorldRay(
    [target.z, target.x, target.y],
    [
      target.z + dir.z * desired,
      target.x + dir.x * desired,
      target.y + dir.y * desired,
    ],
    { includeStatics: true },
  );
  if (!hit) return desired;
  const allowed = hit.t * desired - STANDOFF_WALL_MARGIN;
  return allowed >= STANDOFF_MIN ? allowed : 0;
}

/**
 * Pick a camera placement for a fixed shot that can actually see its
 * subject, preferring the planned bearing and the widest framing the
 * available space allows. `clear` is false when nowhere had room, in
 * which case the planned angle is returned unchanged — a bad angle still
 * beats no shot.
 */
export function chooseClearPlacement(
  center: DirectorVec3,
  radius: number,
  heightFactor: number,
  plannedAngle: number,
  options?: {
    /**
     * Refuse placements squeezed below this fraction of the intended
     * radius. Shots that FRAME A SUBJECT (a lookSubject) may pull in as
     * far as the framing floor allows — the subject fills a close
     * frame. An anonymous AREA anchor may not: pulled to a fraction of
     * its intent it becomes a portrait of the nearest wall, however
     * visible the anchor point is (the r×0.17 corridor parking spot).
     */
    minScale?: number;
  },
): {
  angle: number;
  heightScale: number;
  radiusScale: number;
  clear: boolean;
} {
  _rayTo.set(center[1], center[2] + ORBIT_LOOK_LIFT, center[0]);
  // The eye the outward cast promises must be VERIFIED looking back in:
  // the cast origin is lifted, and a subject under a low roof or a
  // terrain lip lets the lifted origin escape the geometry — the cast
  // then reports room on a bearing whose actual camera position stares
  // at the outside of a wall. The verification aims at a barely-lifted
  // subject point, so the roof that fooled the cast blocks the check.
  _verifyTarget.set(center[1], center[2] + VERIFY_LOOK_LIFT, center[0]);
  let best: {
    angle: number;
    heightScale: number;
    radiusScale: number;
    clear: boolean;
  } | null = null;
  for (const heightScale of OCCLUSION_HEIGHT_BOOSTS) {
    for (const offset of OCCLUSION_ANGLE_OFFSETS) {
      const angle = plannedAngle + offset;
      // The eye sits at center + radius·(cos, heightFactor·boost, sin),
      // so that vector normalized is the direction to cast along and its
      // length is the standoff we would like to have.
      const lift = heightFactor * heightScale;
      const norm = Math.hypot(1, lift);
      _rayDir.set(Math.cos(angle) / norm, lift / norm, Math.sin(angle) / norm);
      const desired = radius * norm;
      const room = clearStandoffWide(_rayTo, _rayDir, desired);
      if (room <= 0) continue;
      const radiusScale = Math.min(STANDOFF_MAX_SCALE, room / desired);
      if (radiusScale < (options?.minScale ?? 0)) continue;
      const standRadius = radius * radiusScale;
      _verifyCam.set(
        center[1] + Math.cos(angle) * standRadius,
        center[2] + lift * standRadius,
        center[0] + Math.sin(angle) * standRadius,
      );
      if (subjectViewBlocked(_verifyCam, _verifyTarget)) continue;
      // Full room at this bearing: nothing further out is preferable, and
      // earlier offsets are better angles, so stop looking.
      if (radiusScale >= STANDOFF_MAX_SCALE) {
        return { angle, heightScale, radiusScale, clear: true };
      }
      if (best == null || radiusScale > best.radiusScale) {
        best = { angle, heightScale, radiusScale, clear: true };
      }
    }
  }
  return (
    best ?? {
      angle: plannedAngle,
      heightScale: 1,
      radiusScale: 1,
      clear: false,
    }
  );
}
