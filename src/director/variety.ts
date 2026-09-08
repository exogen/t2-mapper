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
  DIRECTOR_STATION_RANGE,
  DIRECTOR_VARIETY_FRESH_SEC,
  DIRECTOR_VARIETY_MIN_VALUE,
  DIRECTOR_VARIETY_WEIGHTS,
  DIRECTOR_LINEUP_HEIGHT,
} from "./tunables";
import { busiestCluster, vehicleMoment } from "./analysis";
import { orbitShot, type ShotVariety } from "./framing";
import { playerName, targetIdForName } from "./dataset";
import { dist, sweepTravel } from "./geometry";

export type VarietyFamily = keyof typeof DIRECTOR_VARIETY_WEIGHTS;

/** When each family last aired (demo seconds). */
export type VarietyMemory = Map<VarietyFamily, number>;

/** Evidence a developing shot still needs while it owns the screen. */
export interface VarietyContinuation {
  kind: "capperSetup";
  targetId: number;
  flagSlot: number;
}

export interface VarietyPick {
  family: VarietyFamily;
  shot: Shot;
  continuation?: VarietyContinuation;
}

interface Candidate extends VarietyPick {
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
  const candidates: Candidate[] = [];
  const add = (candidate: Candidate | null) => {
    if (candidate) candidates.push(candidate);
  };
  add(detectKillCutIn(view, t));
  add(detectDestruction(view, t, defaultHold, variety));
  add(detectRepair(view, t, defaultHold, variety));
  add(detectCapperSetup(view, t, defaultHold));
  add(detectVehicle(view, t, defaultHold));
  add(detectSuitUp(view, t, defaultHold, variety));
  add(detectCluster(view, t, defaultHold, variety));
  add(detectFlyThrough(view, t, defaultHold, memory));
  let best: { candidate: Candidate; value: number } | null = null;
  for (const candidate of candidates) {
    const weight = DIRECTOR_VARIETY_WEIGHTS[candidate.family];
    if (weight <= 0) continue;
    if (currentMax >= DIRECTOR_VARIETY_INTERRUPT[candidate.family]) continue;
    const since =
      t - (memory.get(candidate.family) ?? Number.NEGATIVE_INFINITY);
    const freshness = Math.min(1, since / DIRECTOR_VARIETY_FRESH_SEC);
    const value = candidate.confidence * weight * freshness;
    if (value < DIRECTOR_VARIETY_MIN_VALUE) continue;
    if (!best || value > best.value) best = { candidate, value };
  }
  if (!best) return null;
  memory.set(best.candidate.family, t);
  const { confidence: _confidence, ...pick } = best.candidate;
  return pick;
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
  // Whole-second samples at or BEFORE the picture; nearest-bucket rounding
  // would read a future player sample on half-second ticks in batch mode.
  const sec = Math.floor(view.now);
  const current = view.playersAt(sec).find((p) => p.targetId === targetId);
  const before = view
    .playersAt(sec - MOTION_WINDOW_SEC)
    .find((p) => p.targetId === targetId);
  if (!stand || !current || !before) return true;
  if (current.teamId != null && current.teamId === stand.teamId) return false;
  const speed = dist(before.pos, current.pos) / MOTION_WINDOW_SEC;
  const closing =
    (dist(before.pos, stand.pos) - dist(current.pos, stand.pos)) /
    MOTION_WINDOW_SEC;
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
    shot: orbitShot({
      center: kill.pos,
      radius: DIRECTOR_CLUSTER_CAM_RADIUS,
      still: true,
      lookSubject:
        victimId != null ? { type: "player", targetId: victimId } : undefined,
      angle: undefined,
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
  variety: ShotVariety,
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
    shot: orbitShot({
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
  variety: ShotVariety,
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
    shot: orbitShot({
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
  const sec = Math.floor(t);
  const before = new Map(
    view.playersAt(sec - MOTION_WINDOW_SEC).map((p) => [p.targetId, p]),
  );
  const died = new Set(
    view.deathsIn(sec - MOTION_WINDOW_SEC, t).map((d) => d.targetId),
  );
  let best: { targetId: number; flagSlot: number; speed: number } | null = null;
  for (const p of view.playersAt(sec)) {
    if (p.teamId == null || p.teamId <= 0) continue;
    if (died.has(p.targetId)) continue;
    const enemyStand = view.stands.find((s) => s.teamId !== p.teamId);
    if (!enemyStand) continue;
    const flag = view.flagAt(enemyStand.slot);
    if (flag && flag.status !== "home") continue;
    const prev = before.get(p.targetId);
    if (!prev) continue;
    const speed = dist(prev.pos, p.pos) / MOTION_WINDOW_SEC;
    if (speed < CAPPER_MIN_SPEED) continue;
    const range = dist(p.pos, enemyStand.pos);
    if (range < CAPPER_MIN_RANGE) continue;
    const closing =
      (dist(prev.pos, enemyStand.pos) - range) / MOTION_WINDOW_SEC;
    if (closing < speed * 0.5) continue;
    if (!best || speed > best.speed)
      best = { targetId: p.targetId, flagSlot: enemyStand.slot, speed };
  }
  if (!best) return null;
  const name = playerName(best.targetId, view.dataset, t);
  return {
    family: "capperSetup",
    continuation: {
      kind: "capperSetup",
      targetId: best.targetId,
      flagSlot: best.flagSlot,
    },
    confidence: Math.min(1, best.speed / 70),
    shot: {
      kind: "followPlayer",
      targetId: best.targetId,
      distance: DIRECTOR_DIST_CHASE,
      pitch: DIRECTOR_PITCH_CHASE,
      aim: { mode: "forward" },
      startSec: t,
      endSec: t + hold,
      transitionIn: "cut",
      reason: `${name ?? "A capper"} winding up the route`,
      topic: "flag-run",
    },
  };
}

/** A loaded transport under way (or a dogfight): ride along with a
 *  mounted player — riders' resolved positions sit ON the vehicle. */
function detectVehicle(
  view: CausalView,
  t: number,
  hold: number,
): Candidate | null {
  const moment = vehicleMoment(
    Math.max(0, t - 6),
    t + 0.1,
    view.dataset,
    view.playersAtSec,
  );
  if (!moment) return null;
  const rider = view
    .playersAt(t)
    .find((p) => dist(p.pos, moment.center) <= Math.max(8, moment.spread));
  if (!rider) return null;
  const name = playerName(rider.targetId, view.dataset, t);
  return {
    family: "vehicle",
    confidence: Math.min(1, moment.crew / 4),
    shot: {
      kind: "followPlayer",
      targetId: rider.targetId,
      distance: 28,
      pitch: DIRECTOR_PITCH_CHASE,
      aim: { mode: "forward" },
      startSec: t,
      endSec: t + hold,
      transitionIn: "cut",
      reason: `Ride-along — ${moment.vehicle} with ${moment.crew} aboard${
        name ? ` (${name})` : ""
      }`,
      topic: "vehicle",
    },
  };
}

/** An actively-used inventory with a queue (outside kickoff, where the
 *  suit-up phase owns this picture). */
function detectSuitUp(
  view: CausalView,
  t: number,
  hold: number,
  variety: ShotVariety,
): Candidate | null {
  const players = view.playersAt(t);
  let best: { pos: DirectorVec3; count: number } | null = null;
  for (const station of view.dataset.stations) {
    if (station.kind !== "inventory" || station.deployed) continue;
    const active = (station.activations ?? []).some(
      (a) => a >= t - 3 && a <= t + 2,
    );
    if (!active) continue;
    const near = players.filter(
      (p) => dist(p.pos, station.pos) <= DIRECTOR_STATION_RANGE,
    ).length;
    if (near < STATION_MIN_PLAYERS) continue;
    if (!best || near > best.count) best = { pos: station.pos, count: near };
  }
  if (!best) return null;
  return {
    family: "suitUp",
    confidence: Math.min(1, best.count / 6),
    shot: orbitShot({
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
  variety: ShotVariety,
): Candidate | null {
  const cluster = busiestCluster(Math.max(0, t - 4), t, view.playersAtSec);
  if (!cluster || cluster.count < CLUSTER_MIN_PLAYERS) return null;
  return {
    family: "cluster",
    confidence: Math.min(1, cluster.count / 8),
    shot: orbitShot({
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
    shot: {
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
    },
  };
}
