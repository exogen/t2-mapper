/**
 * Where to put a camera and which way to point it — the broadcast
 * geometry layer.
 *
 * Two ideas drive everything here. A shot must CONTAIN its subject, so
 * radius follows the spread of what is being framed (bounded by the
 * map's own fog and the size of the pitch). And a shot must be
 * READABLE, so every fixed camera is pinned to one side of the axis of
 * action between the two bases — the 180-degree rule — and aimed so a
 * landmark sits behind the subject to say where on the map we are.
 */
import type {
  DirectorDataset,
  DirectorVec3,
  Shot,
  ShotRole,
  ShotSubject,
} from "./types";
import type { SceneTopic } from "./castContract";
import {
  DIRECTOR_BROADCAST_SIDE,
  DIRECTOR_CLUSTER_CAM_RADIUS,
  DIRECTOR_DIST_CHASE,
  DIRECTOR_DIST_FAST,
  DIRECTOR_DIST_SLOW,
  DIRECTOR_FAST_SPEED,
  DIRECTOR_FOG_TOLERANCE,
  DIRECTOR_LANDMARK_MAX_RANGE,
  DIRECTOR_PATH_STANDOFF_FRACTION,
  DIRECTOR_SLOW_SPEED,
  DIRECTOR_STAND_BATTLE_SPEED,
  DIRECTOR_WIDE_CAM_MARGIN,
  DIRECTOR_WIDE_CAM_MAX_RADIUS,
  DIRECTOR_WIDE_FIELD_FRACTION,
} from "./tunables";
import { dist } from "./geometry";

/**
 * Fixed-camera radius that actually contains a group of the given
 * spread. At Tribes' ~100° horizontal FOV the frame spans roughly
 * 2.4x the standoff distance, so a radius of spread + margin holds the
 * whole group with room to breathe.
 */
export function radiusForSpread(
  spread: number,
  dataset?: DirectorDataset,
): number {
  // Soccer coverage frames a quarter to a half of the pitch, never the
  // whole thing; scale the ceiling to this map's own base separation so
  // a wide shot stays readable instead of becoming an aerial map.
  const [a, b] = dataset?.flagStands ?? [];
  const fieldCap =
    a && b
      ? dist(a.pos, b.pos) * DIRECTOR_WIDE_FIELD_FRACTION
      : DIRECTOR_WIDE_CAM_MAX_RADIUS;
  return Math.min(
    Math.min(DIRECTOR_WIDE_CAM_MAX_RADIUS, fieldCap, fogCap(dataset)),
    Math.max(DIRECTOR_CLUSTER_CAM_RADIUS, spread + DIRECTOR_WIDE_CAM_MARGIN),
  );
}

/**
 * Furthest a camera may stand off on this map before the fog eats the
 * subject. Tribes maps range from 50m pea soup to 1200m clear air, so
 * this cannot be a constant: on Ymir a 190m wide shot frames a screen of
 * haze with nameplates floating in it, while on a clear map the same
 * shot is the best angle available.
 */
function fogCap(dataset?: DirectorDataset): number {
  const visibility = dataset?.visibility;
  if (!visibility) return DIRECTOR_WIDE_CAM_MAX_RADIUS;
  // Allow a little way into the fog — some haze reads as depth — but
  // stay well short of the distance where things vanish outright.
  const intoFog =
    visibility.fogDistance +
    (visibility.visibleDistance - visibility.fogDistance) *
      DIRECTOR_FOG_TOLERANCE;
  return Math.max(DIRECTOR_CLUSTER_CAM_RADIUS, intoFog);
}

/**
 * Orbit angle that puts a base BEHIND the subject, so the shot
 * establishes where on the map we are. The camera sits at
 * center + (cos θ, sin θ)·R in Three space — where Three x is Torque y
 * and Three z is Torque x (see DirectorController) — and looks back at
 * the center, so aiming past the subject at `landmark` means placing
 * the camera diametrically opposite it.
 */
export function angleFacingLandmark(
  center: DirectorVec3,
  landmark: DirectorVec3,
): number {
  const dx3 = landmark[1] - center[1];
  const dz3 = landmark[0] - center[0];
  if (Math.hypot(dx3, dz3) < 1) return 0;
  return Math.atan2(-dz3, -dx3);
}

/**
 * The match's axis of action, in Three-space (x, z) terms: the line
 * between the two bases, along which all attacking movement happens.
 * Broadcast keeps every camera on ONE side of this line (the
 * 180-degree rule) so a team always attacks the same way across the
 * screen; crossing it flips left and right and disorients the viewer.
 */
function actionAxis(dataset: DirectorDataset): { x: number; z: number } | null {
  const [a, b] = dataset.flagStands;
  if (!a || !b) return null;
  const x = b.pos[1] - a.pos[1];
  const z = b.pos[0] - a.pos[0];
  const length = Math.hypot(x, z);
  if (length < 1) return null;
  return { x: x / length, z: z / length };
}

/**
 * The "sideline" camera bearing: perpendicular to the axis of action, on
 * the broadcast side. This is the primary angle in every field sport —
 * the press-box/centre-line camera — because movement along the axis
 * reads cleanly left-to-right from here.
 */
function sidelineAngle(dataset: DirectorDataset): number | null {
  const axis = actionAxis(dataset);
  if (!axis) return null;
  // Rotate the axis 90°; DIRECTOR_BROADCAST_SIDE picks which of the two
  // perpendiculars is "our" side, and it never changes within a plan.
  return Math.atan2(
    -axis.x * DIRECTOR_BROADCAST_SIDE,
    axis.z * DIRECTOR_BROADCAST_SIDE,
  );
}

/**
 * Keep a camera bearing on the broadcast side of the axis, mirroring it
 * across the axis when it strays. Preserves how far along the axis the
 * camera looks (an end-on angle stays end-on) while guaranteeing the
 * left-right sense of play never flips between shots.
 */
export function onBroadcastSide(
  angle: number,
  dataset: DirectorDataset,
): number {
  const axis = actionAxis(dataset);
  if (!axis) return angle;
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  // Signed distance from the axis: positive is the broadcast side.
  const side = (-axis.z * dx + axis.x * dz) * DIRECTOR_BROADCAST_SIDE;
  if (side >= 0) return angle;
  // Reflect the bearing about the axis: d' = 2(d·a)a − d.
  const dot = dx * axis.x + dz * axis.z;
  return Math.atan2(2 * dot * axis.z - dz, 2 * dot * axis.x - dx);
}

/**
 * The landmark to shoot TOWARD: the farthest flag stand, i.e. the
 * enemy base relative to whatever the shot is centred on. Putting that
 * behind the subject means the camera sits behind the near (friendly)
 * stand looking down the map, so the frame carries the local flag in
 * the foreground and the enemy base beyond it — the standard
 * establishing angle. (Aiming at the NEAREST stand instead just points
 * the camera into the base it is already standing in.)
 */
export function farLandmark(
  point: DirectorVec3,
  dataset: DirectorDataset,
): DirectorVec3 | null {
  let best: { d: number; pos: DirectorVec3 } | null = null;
  for (const stand of dataset.flagStands) {
    const d = dist(stand.pos, point);
    // A base beyond the fog is not a landmark — aiming at one just
    // fills the frame with haze. Past that range the sideline angle is
    // used instead (see fixedFraming).
    if (d > DIRECTOR_LANDMARK_MAX_RANGE) continue;
    if (!best || d > best.d) best = { d, pos: stand.pos };
  }
  return best?.pos ?? null;
}

/**
 * Build a fixedOrbit shot with the house framing rules applied in ONE
 * place: broadcast-side bearing via fixedFraming (or an explicit
 * angle), path-aware steering clear of the subject's coming route, and
 * a hard cut in. Every hand-built literal was one forgotten
 * pathAwareAngle away from a camera the flag skis straight through.
 */
export function orbitShot(opts: {
  center: DirectorVec3;
  radius: number;
  startSec: number;
  endSec: number;
  reason: string;
  /** House framing: bearing + drift from fixedFraming (advances the
   *  variety rotation). Omit only with an explicit `angle`. */
  framing?: { dataset: DirectorDataset; variety: ShotVariety };
  /** Explicit bearing, instead of fixedFraming. */
  angle?: number;
  /** Steer the chosen bearing clear of this route. */
  avoidPath?: DirectorVec3[];
  /** Force a dead-static camera regardless of the framing's drift. */
  still?: boolean;
  /** Explicit drift (radians/sec), instead of the framing's. */
  angularSpeed?: number;
  heightFactor?: number;
  lookSubject?: ShotSubject;
  doorwayOf?: DirectorVec3;
  /** What this shot is, for staging decisions (see ShotRole). */
  role?: ShotRole;
  /** What it is about, for the booth (see ShotBase.topic). */
  topic?: SceneTopic;
}): Shot {
  let startAngle: number | undefined;
  let drift = 0;
  // An explicit angle replaces the framing entirely — never burn a
  // variety-rotation tick for a bearing that would then be discarded.
  if (opts.framing && opts.angle == null) {
    const f = fixedFraming(
      opts.center,
      opts.framing.dataset,
      opts.framing.variety,
    );
    startAngle = f.startAngle;
    drift = f.angularSpeed;
  }
  if (opts.angle != null) startAngle = opts.angle;
  if (opts.avoidPath && startAngle != null) {
    startAngle = pathAwareAngle(
      opts.center,
      opts.radius,
      opts.avoidPath,
      startAngle,
    );
  }
  return {
    kind: "fixedOrbit",
    center: opts.center,
    radius: opts.radius,
    startAngle,
    angularSpeed: opts.still ? 0 : (opts.angularSpeed ?? drift),
    heightFactor: opts.heightFactor,
    lookSubject: opts.lookSubject,
    doorwayOf: opts.doorwayOf,
    startSec: opts.startSec,
    endSec: opts.endSec,
    transitionIn: "cut",
    reason: opts.reason,
    role: opts.role,
    topic: opts.topic,
  };
}

/**
 * Rotating state that keeps successive shots from looking alike: how
 * many fixed cameras and chases have been emitted so far (used to
 * alternate bearings, styles and sides), and when the last suit-up shot
 * ran so it does not recur.
 *
 * Threaded through the shot builders and mutated as shots are emitted —
 * it is deliberately shared, since "different from the last one" is a
 * property of the sequence, not of any single shot.
 */
export interface ShotVariety {
  fixedCount: number;
  dollyCount: number;
  lastSuitUpSec?: number;
  /** Grab-view rotation: stand camera ↔ grabber over-the-shoulder. */
  grabViews?: number;
  /** Guarded-stand rotation: defender hip view ↔ widened two-shot. */
  standViews?: number;
  /** Last vehicle set piece, so ferry runs don't repeat every lull. */
  lastVehicleSec?: number;
  /** Last lull anchor, so quiet stretches rotate what they watch. */
  lastLullPos?: DirectorVec3;
  /** Impact-shot rotation: wide establishing ↔ in the impact zone. */
  bombardmentViews?: number;
}

/** A fresh variety counter for one plan. */
export function newShotVariety(): ShotVariety {
  return { fixedCount: 0, dollyCount: 0 };
}

/**
 * Camera framing for a fixed shot: an angle that keeps a base in shot
 * for orientation, and a treatment that alternates static ↔ slow orbit
 * so consecutive fixed shots don't all drift the same way.
 */
/**
 * Bearing offsets tried when steering a fixed camera clear of the
 * subject's path — same family as the runtime's occlusion offsets:
 * small deviations first (they stay on the broadcast side), the wide
 * ones a last resort.
 */
const PATH_ANGLE_OFFSETS = [
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

/**
 * Steer a fixed camera's bearing so the subject's KNOWN path through
 * the shot never runs it over. The scan holds the whole trajectory, so
 * this is a deterministic sweep: take the preferred bearing when the
 * path keeps its distance from that camera spot, otherwise the nearest
 * acceptable deviation, otherwise the bearing whose worst-case is best.
 */
export function pathAwareAngle(
  center: DirectorVec3,
  radius: number,
  path: DirectorVec3[],
  preferredAngle: number,
): number {
  if (path.length === 0) return preferredAngle;
  const floor = radius * DIRECTOR_PATH_STANDOFF_FRACTION;
  let best = preferredAngle;
  let bestMin = -Infinity;
  for (const offset of PATH_ANGLE_OFFSETS) {
    const angle = preferredAngle + offset;
    // The runtime places the eye at Torque (center.x + sinθ·r,
    // center.y + cosθ·r) — see DirectorController's orbit maths.
    const camX = center[0] + Math.sin(angle) * radius;
    const camY = center[1] + Math.cos(angle) * radius;
    let min = Infinity;
    for (const p of path) {
      const d = Math.hypot(p[0] - camX, p[1] - camY);
      if (d < min) min = d;
    }
    if (min >= floor) return angle;
    if (min > bestMin) {
      bestMin = min;
      best = angle;
    }
  }
  return best;
}

export function fixedFraming(
  center: DirectorVec3,
  dataset: DirectorDataset,
  variety: ShotVariety,
): { startAngle: number | undefined; angularSpeed: number } {
  const n = variety.fixedCount++;
  // Mostly the sideline angle — the primary camera in every field sport,
  // square to the axis of action so play reads across the screen. Every
  // third shot takes the end-on view down the axis toward the far base
  // for variety, and both are pinned to the broadcast side.
  const sideline = sidelineAngle(dataset);
  const landmark = farLandmark(center, dataset);
  const endOn =
    landmark != null ? angleFacingLandmark(center, landmark) : undefined;
  const preferred = n % 3 === 2 && endOn != null ? endOn : (sideline ?? endOn);
  const startAngle =
    preferred != null ? onBroadcastSide(preferred, dataset) : undefined;
  // Two out of three fixed shots are dead static; the third drifts.
  const angularSpeed =
    n % 3 === 1 ? DIRECTOR_STAND_BATTLE_SPEED * (n % 2 === 0 ? 1 : -1) : 0;
  return { startAngle, angularSpeed };
}

/** Framing distance for a subject moving at `speed`: tight when slow,
 *  wide when fast, linear between the two anchors. */
export function distanceForSpeed(speed: number | null): number {
  if (speed == null) return DIRECTOR_DIST_CHASE;
  const t = Math.min(
    1,
    Math.max(
      0,
      (speed - DIRECTOR_SLOW_SPEED) /
        (DIRECTOR_FAST_SPEED - DIRECTOR_SLOW_SPEED),
    ),
  );
  return DIRECTOR_DIST_SLOW + (DIRECTOR_DIST_FAST - DIRECTOR_DIST_SLOW) * t;
}
