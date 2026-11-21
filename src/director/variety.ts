/**
 * The variety scheduler — what fills the screen when no flag story is
 * hot. A good cast rotates through many kinds of picture: kill shots,
 * clusters, destruction and repair stories, capper wind-ups, vehicle
 * rides, suit-up queues, map fly-throughs. Each family has a causal
 * DETECTOR (present state + the peek, never the future) returning a
 * confidence and a shot; the scheduler picks by
 *
 *     confidence × DIRECTOR_VARIETY_WEIGHTS[family] × freshness
 *
 * where freshness recovers over DIRECTOR_VARIETY_FRESH_SEC since the
 * family last aired — the balance knobs live in tunables, this module
 * only ranks.
 */
import type { DirectorVec3, Shot } from "./types";
import type { CausalView } from "./causalView";
import {
  DIRECTOR_VARIETY_INTERRUPT,
  DIRECTOR_CLUSTER_CAM_HEIGHT,
  DIRECTOR_CLUSTER_CAM_RADIUS,
  DIRECTOR_DIST_CHASE,
  DIRECTOR_PITCH_CHASE,
  DIRECTOR_STATION_CAM_HEIGHT,
  DIRECTOR_STATION_CAM_RADIUS,
  DIRECTOR_VARIETY_FRESH_SEC,
  DIRECTOR_VARIETY_MIN_VALUE,
  DIRECTOR_VARIETY_WEIGHTS,
  DIRECTOR_LINEUP_HEIGHT,
  DIRECTOR_BOMBARDMENT_CAM_HEIGHT,
  DIRECTOR_BOMBARDMENT_CAM_RADIUS,
} from "./tunables";
import {
  busiestCluster,
  busiestInventory,
  importantImpact,
  playerMotion,
  vehiclePadMoment,
  vehicleMoment,
} from "./analysis";
import {
  onBroadcastSide,
  orbitShot,
  radiusForSpread,
  type ShotVariety,
} from "./framing";
import { playerName, targetIdForName } from "./dataset";
import { boundingSpread, centroid, dist, sweepTravel } from "./geometry";

export type VarietyFamily = keyof typeof DIRECTOR_VARIETY_WEIGHTS;

/** When each family last aired (demo seconds). */
export type VarietyKey =
  VarietyFamily | `offensiveWave:${number}` | "flagGrabPov";
export type VarietyMemory = Map<VarietyKey, number>;

/** Evidence a developing shot still needs while it owns the screen. */
export interface VarietyContinuation {
  kind: "capperSetup";
  targetId: number;
  flagSlot: number;
}

export interface VarietyPick {
  family: VarietyFamily;
  cooldownKey?: VarietyKey;
  latestStartSec?: number;
  shot: Shot;
  continuation?: VarietyContinuation;
}

interface Candidate extends Omit<VarietyPick, "shot"> {
  buildShot: (variety: ShotVariety) => Shot;
  /** Detector confidence, 0..1. */
  confidence: number;
}

/** A capper wind-up reads as: fast, far out, and closing on the stand
 *  they would grab from. */
const CAPPER_MIN_SPEED = 38;
const CAPPER_MIN_RANGE = 250;
/** Trailing window for motion differencing. */
const MOTION_WINDOW_SEC = 3;
/** Let a selected route slow or turn more than a new candidate can.
 *  A three-second average below half the entry speed ends the wind-up. */
const CAPPER_CONTINUE_SPEED = CAPPER_MIN_SPEED / 2;
/** Players at an inventory before it reads as a suit-up queue. */
const STATION_MIN_PLAYERS = 3;
/** Players in a knot before a lull watches it rather than the base. */
const CLUSTER_MIN_PLAYERS = 2;

/**
 * Rank every available story and return the best worth airing, or null
 * when nothing clears the value floor. `defaultHold` sizes shots for
 * families without a natural end.
 */
export function pickVarietyShot(
  view: CausalView,
  t: number,
  memory: VarietyMemory,
  variety: ShotVariety,
  defaultHold: number,
  /** The hottest current subject score — families only interrupt what
   *  their DIRECTOR_VARIETY_INTERRUPT ceiling allows. */
  currentMax: number,
): VarietyPick | null {
  let best: Candidate | undefined;
  let bestValue = 0;
  const consider = (family: VarietyFamily, detect: () => Candidate | null) => {
    const weight = DIRECTOR_VARIETY_WEIGHTS[family];
    if (weight <= 0 || currentMax >= DIRECTOR_VARIETY_INTERRUPT[family]) return;
    const availableWeight = weight * freshness(memory, family, t);
    if (
      availableWeight < DIRECTOR_VARIETY_MIN_VALUE ||
      availableWeight <= bestValue
    )
      return;
    const candidate = detect();
    if (!candidate) return;
    const freshWeight = candidate.cooldownKey
      ? weight * freshness(memory, candidate.cooldownKey, t)
      : availableWeight;
    const value = candidate.confidence * freshWeight;
    if (value < DIRECTOR_VARIETY_MIN_VALUE || value <= bestValue) return;
    best = candidate;
    bestValue = value;
  };
  consider("killCutIn", () => detectKillCutIn(view, t));
  consider("destruction", () => detectDestruction(view, t, defaultHold));
  consider("repair", () => detectRepair(view, t, defaultHold));
  consider("offensiveWave", () => {
    const wave = offensiveWaveShot(view, t, memory);
    return (
      wave && {
        family: "offensiveWave",
        cooldownKey: wave.cooldownKey,
        confidence: wave.confidence,
        buildShot: () => wave.shot,
      }
    );
  });
  consider("ordnanceImpact", () => detectOrdnanceImpact(view, t));
  consider("capperSetup", () => detectCapperSetup(view, t, defaultHold));
  consider("vehicle", () => detectVehicle(view, t, defaultHold));
  consider("vehiclePad", () => detectVehiclePad(view, t));
  consider("suitUp", () => detectSuitUp(view, t, defaultHold));
  consider("cluster", () => detectCluster(view, t, defaultHold));
  consider("flyThrough", () => detectFlyThrough(view, t, defaultHold, memory));
  if (!best) return null;
  return {
    family: best.family,
    cooldownKey: best.cooldownKey,
    latestStartSec: best.latestStartSec,
    continuation: best.continuation,
    shot: best.buildShot(variety),
  };
}

function freshness(memory: VarietyMemory, key: VarietyKey, t: number): number {
  return Math.min(
    1,
    (t - (memory.get(key) ?? -Infinity)) / DIRECTOR_VARIETY_FRESH_SEC,
  );
}

/** Revalidate at picture time, without anticipating a death or interpreting
 *  absent player samples as an aborted route. A respawn with the same target
 *  ID does not revive the original attempt. Other families (for example a
 *  kill's aftermath) deliberately have no movement/death dependency. */
export function canContinueVarietyShot(
  view: CausalView,
  continuation: VarietyContinuation,
  startedAt: number,
): boolean {
  const { targetId, flagSlot } = continuation;
  if (
    view
      .deathsIn(startedAt, view.now)
      .some((death) => death.targetId === targetId)
  )
    return false;
  const flag = view.flagAt(flagSlot);
  if (flag && flag.status !== "home") return false;
  const stand = view.standFor(flagSlot);
  const motion = playerMotion(view, view.now, MOTION_WINDOW_SEC).find(
    ({ player }) => player.targetId === targetId,
  );
  if (!stand || !motion) return true;
  const { player, before, elapsed, speed } = motion;
  if (player.teamId === stand.teamId || player.vehicleId) return false;
  const closing =
    (dist(before.pos, stand.pos) - dist(player.pos, stand.pos)) / elapsed;
  return speed >= CAPPER_CONTINUE_SPEED && closing >= -speed * 0.5;
}

/** A kill landing inside the peek: cut now, land as it happens. */
function detectKillCutIn(view: CausalView, t: number): Candidate | null {
  const kill = view
    .eventsIn(t, view.horizon)
    .find((e) => e.type === "kill" && e.pos != null && e.timeSec > t);
  if (!kill?.pos) return null;
  const victimId = kill.victim
    ? (targetIdForName(kill.victim, view.dataset, kill.timeSec) ?? undefined)
    : undefined;
  return {
    family: "killCutIn",
    confidence: 1,
    buildShot: () =>
      orbitShot({
        center: kill.pos!,
        radius: DIRECTOR_CLUSTER_CAM_RADIUS,
        still: true,
        lookSubject:
          victimId != null ? { type: "player", targetId: victimId } : undefined,
        startSec: t,
        endSec: kill.timeSec + 3.5,
        reason: `${kill.weapon ? `${kill.weapon} kill` : "Kill"}${
          kill.victim ? ` — ${kill.victim} down` : ""
        }`,
        topic: "kill",
      }),
  };
}

/** Structures freshly destroyed nearby in time: a raid in progress. */
function detectDestruction(
  view: CausalView,
  t: number,
  hold: number,
): Candidate | null {
  const hit = view.dataset.structures.find(
    (s) =>
      s.to > s.from &&
      s.timeSec >= t - 8 &&
      s.timeSec <= Math.min(t + 2, view.horizon),
  );
  if (!hit) return null;
  return {
    family: "destruction",
    confidence: 1,
    buildShot: (variety) =>
      orbitShot({
        center: hit.pos,
        radius: DIRECTOR_CLUSTER_CAM_RADIUS,
        framing: { dataset: view.dataset, variety },
        still: true,
        startSec: t,
        endSec: t + hold,
        reason: `${hit.name} destroyed — raid in progress`,
        topic: "raid",
      }),
  };
}

/** Structures coming back online: the repair story. */
function detectRepair(
  view: CausalView,
  t: number,
  hold: number,
): Candidate | null {
  const fixed = view.dataset.structures.find(
    (s) =>
      s.to < s.from &&
      s.timeSec >= t - 10 &&
      s.timeSec <= Math.min(t + 2, view.horizon),
  );
  if (!fixed) return null;
  return {
    family: "repair",
    confidence: 0.9,
    buildShot: (variety) =>
      orbitShot({
        center: fixed.pos,
        radius: DIRECTOR_CLUSTER_CAM_RADIUS,
        framing: { dataset: view.dataset, variety },
        still: true,
        startSec: t,
        endSec: t + hold,
        reason: `${fixed.name} back online — repairs going in`,
        topic: "base",
      }),
  };
}

/** A fast mover far out, closing on the stand they'd grab from. */
function detectCapperSetup(
  view: CausalView,
  t: number,
  hold: number,
): Candidate | null {
  let best: { targetId: number; flagSlot: number; speed: number } | null = null;
  for (const { player: p, before, elapsed, speed } of playerMotion(
    view,
    t,
    MOTION_WINDOW_SEC,
  )) {
    if (p.teamId == null || p.teamId <= 0 || p.vehicleId) continue;
    const enemyStand = view.stands.find((s) => s.teamId !== p.teamId);
    if (!enemyStand) continue;
    const flag = view.flagAt(enemyStand.slot);
    if (flag && flag.status !== "home") continue;
    if (speed < CAPPER_MIN_SPEED) continue;
    const range = dist(p.pos, enemyStand.pos);
    if (range < CAPPER_MIN_RANGE) continue;
    const closing = (dist(before.pos, enemyStand.pos) - range) / elapsed;
    if (closing < speed * 0.5) continue;
    if (!best || speed > best.speed)
      best = { targetId: p.targetId, flagSlot: enemyStand.slot, speed };
  }
  if (!best) return null;
  const { targetId, flagSlot, speed } = best;
  const name = playerName(targetId, view.dataset, t);
  return {
    family: "capperSetup",
    continuation: {
      kind: "capperSetup",
      targetId,
      flagSlot,
    },
    confidence: Math.min(1, speed / 70),
    buildShot: () => ({
      kind: "followPlayer",
      targetId,
      distance: DIRECTOR_DIST_CHASE,
      pitch: DIRECTOR_PITCH_CHASE,
      aim: { mode: "forward" },
      startSec: t,
      endSec: t + hold,
      transitionIn: "cut",
      reason: `${name ?? "A capper"} winding up the route`,
      topic: "flag-run",
    }),
  };
}

/** Follow a cohesive push toward a base before it becomes a flag fight. */
export function offensiveWaveShot(
  view: CausalView,
  t: number,
  memory: VarietyMemory,
  flagSlot?: number,
): { shot: Shot; confidence: number; cooldownKey: VarietyKey } | null {
  const motion = playerMotion(view, t, MOTION_WINDOW_SEC);
  let best:
    | {
        group: typeof motion;
        destination: DirectorVec3;
        cooldownKey: VarietyKey;
        value: number;
      }
    | undefined;
  for (const stand of view.stands) {
    const cooldownKey = `offensiveWave:${stand.slot}` as const;
    const fresh = freshness(memory, cooldownKey, t);
    if (
      fresh < 0.5 ||
      stand.teamId == null ||
      (flagSlot != null && stand.slot !== flagSlot) ||
      view.flagAt(stand.slot)?.status !== "home"
    )
      continue;
    // Leave room for the usual stand framing to show the touch itself.
    if (
      view
        .peekFlagEvents(stand.slot, ["flag-grab"])
        .some((grab) => grab.timeSec - t < 4)
    )
      continue;
    const attackers = motion.filter(({ player, before, elapsed }) => {
      if (
        player.teamId == null ||
        player.teamId <= 0 ||
        player.teamId === stand.teamId ||
        player.vehicleId ||
        before.vehicleId
      )
        return false;
      const range = dist(player.pos, stand.pos);
      return (
        range >= 60 &&
        range <= 400 &&
        (dist(before.pos, stand.pos) - range) / elapsed >= 9
      );
    });
    for (const leader of attackers) {
      const group = attackers.filter(
        ({ player, before }) =>
          dist(player.pos, leader.player.pos) <= 55 &&
          dist(before.pos, leader.before.pos) <= 65,
      );
      // Two attackers are enough when they have stayed close and
      // travelled together, rather than just crossing paths.
      if (group.length === 2) {
        const [a, b] = group;
        if (
          dist(a.player.pos, b.player.pos) > 45 ||
          dist(a.before.pos, b.before.pos) > 45
        )
          continue;
      }
      const value = group.length * fresh;
      if (group.length >= 2 && value > (best?.value ?? 0))
        best = { group, destination: stand.pos, cooldownKey, value };
    }
  }
  if (!best) return null;
  const { group, destination } = best;
  const { center, spread } = boundingSpread(
    group.map(({ player }) => player.pos),
  );
  const velocity = centroid(
    group.map(
      ({ player, before, elapsed }) =>
        player.pos.map(
          (pos, axis) => (pos - before.pos[axis]) / elapsed,
        ) as DirectorVec3,
    ),
  );
  const bearing = onBroadcastSide(
    Math.atan2(-velocity[1], velocity[0]),
    view.dataset,
  );
  const distance = Math.max(34, radiusForSpread(spread, view.dataset));
  const hold = 4;
  const travelTime = Math.min(
    hold,
    Math.max(0, dist(center, destination) - 25) /
      Math.max(1, Math.hypot(...velocity)),
  );
  return {
    confidence: Math.min(1, 0.65 + group.length * 0.07),
    cooldownKey: best.cooldownKey,
    shot: movingWideShot({
      t,
      hold,
      center,
      bearing,
      distance,
      height: 15,
      delta: velocity.map((speed) => speed * travelTime) as DirectorVec3,
      reason: `${group.length} attackers pushing the enemy base`,
      topic: "action",
    }),
  };
}

function movingWideShot({
  t,
  hold,
  center,
  bearing,
  distance,
  height,
  delta,
  reason,
  topic,
}: {
  t: number;
  hold: number;
  center: DirectorVec3;
  bearing: number;
  distance: number;
  height: number;
  delta: DirectorVec3;
  reason: string;
  topic: Shot["topic"];
}): Shot {
  const aim: DirectorVec3 = [center[0], center[1], center[2] + 2];
  const from: DirectorVec3 = [
    center[0] + Math.sin(bearing) * distance,
    center[1] + Math.cos(bearing) * distance,
    center[2] + height,
  ];
  const advance = (point: DirectorVec3) =>
    point.map((value, axis) => value + delta[axis]) as DirectorVec3;
  return {
    kind: "sweep",
    from,
    to: advance(from),
    target: aim,
    targetTo: advance(aim),
    startSec: t,
    endSec: t + hold,
    moveSec: hold,
    easing: "linear",
    transitionIn: "cut",
    reason,
    topic,
  };
}

function detectVehiclePad(view: CausalView, t: number): Candidate | null {
  const moment = vehiclePadMoment(view, t);
  if (!moment) return null;
  const { pad, vehicle, rider } = moment;
  const reason = `Boarding a ${vehicle.kind} at the vehicle pad`;
  return {
    family: "vehiclePad",
    latestStartSec: vehicle.timeSec + 2,
    confidence: 0.85,
    buildShot: (variety) =>
      rider
        ? {
            kind: "followPlayer",
            targetId: rider.targetId,
            distance: 25,
            pitch: DIRECTOR_PITCH_CHASE,
            aim: { mode: "forward" },
            startSec: t,
            endSec: t + 5,
            transitionIn: "cut",
            reason,
            topic: "vehicle",
          }
        : orbitShot({
            center: pad,
            radius: 24,
            heightFactor: 0.45,
            framing: { dataset: view.dataset, variety },
            still: true,
            startSec: t,
            endSec: Math.max(t + 4, vehicle.timeSec + 4),
            reason,
            topic: "vehicle",
          }),
  };
}

function detectOrdnanceImpact(view: CausalView, t: number): Candidate | null {
  const moment = importantImpact(view, t);
  if (!moment) return null;
  const { impact, stand } = moment;
  const weapon = impact.kind === "mortar" ? "Mortar" : "Missile";
  return {
    family: "ordnanceImpact",
    latestStartSec: impact.timeSec + 0.5,
    confidence: stand ? 0.9 : 0.82,
    buildShot: (variety) =>
      orbitShot({
        center: stand ? centroid([impact.pos, stand.pos]) : impact.pos,
        radius: DIRECTOR_BOMBARDMENT_CAM_RADIUS,
        heightFactor: DIRECTOR_BOMBARDMENT_CAM_HEIGHT,
        framing: { dataset: view.dataset, variety },
        still: true,
        startSec: t,
        endSec: Math.max(t + 3.5, impact.timeSec + 2),
        reason: stand
          ? `${weapon} impact at the flag stand`
          : `${weapon} impact near an opposing player`,
        topic: "action",
      }),
  };
}

/** Follow a mounted rider on a transport, or show both sides of an engagement. */
function detectVehicle(
  view: CausalView,
  t: number,
  hold: number,
  dogfightOnly = false,
): Candidate | null {
  const moment = vehicleMoment(
    Math.max(0, t - 6),
    Math.min(t, view.horizon),
    view.dataset,
    view.playersAtSec,
  );
  if (!moment || (dogfightOnly && moment.kind !== "dogfight")) return null;
  if (moment.kind === "dogfight" && Math.hypot(...moment.velocity) >= 5) {
    const span = Math.min(hold, 4);
    const [vx, vy] = moment.velocity;
    return {
      family: "vehicle",
      confidence: Math.min(1, 0.5 + moment.observations / 16),
      buildShot: () =>
        movingWideShot({
          t,
          hold: span,
          center: moment.center,
          bearing: onBroadcastSide(Math.atan2(-vy, vx), view.dataset),
          distance: Math.max(DIRECTOR_CLUSTER_CAM_RADIUS, moment.spread * 2),
          height: 20,
          delta: moment.velocity.map((speed) => speed * span) as DirectorVec3,
          reason: "Dogfight — opposing aircraft",
          topic: "vehicle",
        }),
    };
  }
  if (moment.kind !== "transport") {
    const dogfight = moment.kind === "dogfight";
    return {
      family: "vehicle",
      confidence: Math.min(1, 0.5 + moment.observations / 16),
      buildShot: (variety) =>
        orbitShot({
          center: moment.center,
          radius: Math.max(DIRECTOR_CLUSTER_CAM_RADIUS, moment.spread * 2),
          heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
          framing: { dataset: view.dataset, variety },
          still: true,
          startSec: t,
          endSec: t + Math.min(hold, 5),
          reason: dogfight
            ? "Dogfight — opposing aircraft"
            : "Aircraft over ground troops",
          topic: "vehicle",
        }),
    };
  }
  const rider = view.playersAt(t).find((p) => p.vehicleId === moment.vehicleId);
  if (!rider) return null;
  const name = playerName(rider.targetId, view.dataset, t);
  return {
    family: "vehicle",
    confidence: Math.min(1, moment.crew / 4),
    buildShot: () => ({
      kind: "followPlayer",
      targetId: rider.targetId,
      distance: 28,
      pitch: DIRECTOR_PITCH_CHASE,
      aim: { mode: "forward" },
      startSec: t,
      endSec: t + hold,
      transitionIn: "cut",
      reason: `Ride-along — ${moment.vehicle} with ${moment.crew} aboard${name ? ` (${name})` : ""}`,
      topic: "vehicle",
    }),
  };
}

/** A short air cutaway for a stalled flag story. */
export function pickDogfightShot(
  view: CausalView,
  t: number,
  memory: VarietyMemory,
  variety: ShotVariety,
): VarietyPick | null {
  if (freshness(memory, "vehicle", t) < 0.5) return null;
  const candidate = detectVehicle(view, t, 4, true);
  return (
    candidate && {
      family: "vehicle",
      shot: candidate.buildShot(variety),
    }
  );
}

/** An actively-used inventory with a queue (outside kickoff, where the
 *  suit-up phase owns this picture). */
function detectSuitUp(
  view: CausalView,
  t: number,
  hold: number,
): Candidate | null {
  const best = busiestInventory(view, t, {
    minimum: STATION_MIN_PLAYERS,
    requireActive: true,
  });
  if (!best) return null;
  return {
    family: "suitUp",
    confidence: Math.min(1, best.count / 6),
    buildShot: (variety) =>
      orbitShot({
        center: best.pos,
        radius: DIRECTOR_STATION_CAM_RADIUS,
        heightFactor: DIRECTOR_STATION_CAM_HEIGHT,
        framing: { dataset: view.dataset, variety },
        still: true,
        startSec: t,
        endSec: t + hold,
        reason: `${best.count} players suiting up at the inventory`,
        topic: "suit-up",
      }),
  };
}

/** The busiest knot of players anywhere (trailing window). */
function detectCluster(
  view: CausalView,
  t: number,
  hold: number,
): Candidate | null {
  const cluster = busiestCluster(Math.max(0, t - 4), t, view.playersAtSec);
  if (!cluster || cluster.count < CLUSTER_MIN_PLAYERS) return null;
  return {
    family: "cluster",
    confidence: Math.min(1, cluster.count / 8),
    buildShot: (variety) =>
      orbitShot({
        center: cluster.center,
        radius: DIRECTOR_CLUSTER_CAM_RADIUS,
        heightFactor: DIRECTOR_CLUSTER_CAM_HEIGHT,
        framing: { dataset: view.dataset, variety },
        startSec: t,
        endSec: t + hold,
        reason: `Lull — watching ${cluster.count} players`,
        topic: "lull",
      }),
  };
}

/** A slow pass across the map between the bases — alternating
 *  direction so revisits do not replay the identical flight. */
function detectFlyThrough(
  view: CausalView,
  t: number,
  hold: number,
  memory: VarietyMemory,
): Candidate | null {
  const [a, b] = view.stands;
  if (!a || !b) return null;
  const flip = ((memory.get("flyThrough") ?? 0) / 100) % 2 >= 1;
  const fromStand = flip ? b : a;
  const toStand = flip ? a : b;
  const travel = sweepTravel(hold, dist(a.pos, b.pos) * 0.35);
  const dir = [
    (toStand.pos[0] - fromStand.pos[0]) / dist(a.pos, b.pos),
    (toStand.pos[1] - fromStand.pos[1]) / dist(a.pos, b.pos),
  ];
  const start: DirectorVec3 = [
    fromStand.pos[0] + dir[0] * 120,
    fromStand.pos[1] + dir[1] * 120,
    Math.max(fromStand.pos[2], toStand.pos[2]) + DIRECTOR_LINEUP_HEIGHT * 3,
  ];
  return {
    family: "flyThrough",
    confidence: 0.6,
    buildShot: () => ({
      kind: "sweep",
      from: start,
      to: [start[0] + dir[0] * travel, start[1] + dir[1] * travel, start[2]],
      target: [toStand.pos[0], toStand.pos[1], toStand.pos[2] + 6],
      startSec: t,
      endSec: t + hold,
      moveSec: hold,
      transitionIn: "cut",
      reason: `Map fly-through — toward the ${toStand.name ?? "far"} base`,
      topic: "base",
    }),
  };
}
