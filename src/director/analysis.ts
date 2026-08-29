/**
 * Reading the situation: what the players are doing around a flag, a
 * base or a moment in time.
 *
 * These are the questions the shot rules ask before choosing a camera —
 * where the crowd is, who is threatening the carrier, whether they are
 * holed up inside a base, whether anything is being shelled. Each
 * returns a plain description of the situation and never a Shot, so the
 * framing decisions all live in one place (the shot builders).
 */
import type {
  DirectorDataset,
  DirectorVec3,
  DirectorVehicleSample,
  ShotAim,
} from "./types";
import {
  DIRECTOR_APPROACH_LOOKBACK_SEC,
  DIRECTOR_APPROACH_MAX_RANGE,
  DIRECTOR_BOMBARDMENT_MIN_SHELLS,
  DIRECTOR_BOMBARDMENT_RANGE,
  DIRECTOR_CHASE_FRACTION,
  DIRECTOR_CHASE_RADIUS,
  DIRECTOR_CLUSTER_CAM_MIN_PLAYERS,
  DIRECTOR_CROWD_RADIUS,
  DIRECTOR_FLOOR_BAND,
  DIRECTOR_HERO_DEST_AHEAD,
  DIRECTOR_HERO_DEST_CONE_COS,
  DIRECTOR_HERO_DEST_MIN_TRAVEL,
  DIRECTOR_HERO_MIN_SPEED,
  DIRECTOR_INBOUND_MAX_FOLLOW_SEC,
  DIRECTOR_INBOUND_MAX_FRACTION,
  DIRECTOR_INBOUND_MIN_APPROACH,
  DIRECTOR_INBOUND_MIN_FRACTION,
  DIRECTOR_INBOUND_MORTAR_RANGE,
  DIRECTOR_INBOUND_PAYOFF_RANGE,
  DIRECTOR_STAND_GUARD_RANGE,
  DIRECTOR_THREAT_RANGE,
  DIRECTOR_HIGHLIGHT_MAX_SEPARATION,
  DIRECTOR_STATION_ACTION_RANGE,
  DIRECTOR_STATION_MIN_PLAYERS,
  DIRECTOR_STATION_RANGE,
  DIRECTOR_SUITUP_KICKOFF_SEC,
  DIRECTOR_SUITUP_REPAIR_SEC,
  DIRECTOR_TURTLE_ASSET_RANGE,
  DIRECTOR_TURTLE_MIN_SEC,
  DIRECTOR_TURTLE_SPEED,
  DIRECTOR_TURTLE_THREAT_RANGE,
  DIRECTOR_RAID_RANGE,
  DIRECTOR_TRANSPORT_MIN_CREW,
  DIRECTOR_TRANSPORT_MIN_TRAVEL,
  DIRECTOR_DOGFIGHT_RANGE,
  DIRECTOR_DOGFIGHT_MIN_MEETINGS,
  DIRECTOR_STRAFE_RANGE,
  DIRECTOR_STRAFE_MIN_PASSES,
  DIRECTOR_SUITUP_REPAIR_RANGE,
} from "./tunables";
import { bearingYaw, boundingSpread, centroid, dist } from "./geometry";
import { eventFlagSlot, flagPathSpread, flagSpeed } from "./dataset";
import type { FlagTrack, PlayersAtSec } from "./dataset";

/**
 * The densest knot of players during a window, as a place to point a
 * camera: the centroid of the largest group within CROWD_RADIUS of any
 * one player, sampled across the window. Players are the show — an
 * idle flag on its stand is not — so quiet stretches watch this
 * instead of the flagstand.
 */
/**
 * Keep only the dominant floor of an XY-near group (see
 * DIRECTOR_FLOOR_BAND), so mixed indoor/outdoor knots anchor on a real
 * place rather than the structure between them.
 */
function dominantFloor<T extends { pos: DirectorVec3 }>(group: T[]): T[] {
  let best: T[] = [];
  for (const anchor of group) {
    const band = group.filter(
      (p) => Math.abs(p.pos[2] - anchor.pos[2]) <= DIRECTOR_FLOOR_BAND,
    );
    if (band.length > best.length) best = band;
  }
  return best;
}

/** Centroid with its height taken from the MEDIAN member, so the anchor
 *  sits on the floor the group stands on. */
function floorCentroid(positions: DirectorVec3[]): DirectorVec3 {
  const center = centroid(positions);
  const heights = positions.map((p) => p[2]).sort((a, b) => a - b);
  center[2] = heights[heights.length >> 1];
  return center;
}

export function busiestCluster(
  startSec: number,
  endSec: number,
  playersAtSec: PlayersAtSec,
): { center: DirectorVec3; count: number } | null {
  let best: { center: DirectorVec3; count: number } | null = null;
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    const players = playersAtSec.get(sec);
    if (!players || players.length === 0) continue;
    for (const anchor of players) {
      const group = dominantFloor(
        players.filter((p) => dist(p.pos, anchor.pos) <= DIRECTOR_CROWD_RADIUS),
      );
      if (group.length > (best?.count ?? 1)) {
        best = {
          center: floorCentroid(group.map((p) => p.pos)),
          count: group.length,
        };
      }
    }
  }
  return best;
}

/**
 * A cluster of players that STAYS PUT for the whole window, which is
 * what a fixed camera needs: it takes the group that exists at the
 * window's midpoint and only accepts it if every one of their sampled
 * positions across the window stays inside `holdRadius` of the
 * centroid. Without this check a fixed camera gets anchored on a knot
 * that has since skied 300m away, and frames an empty map — measurably
 * the worst shot the director can produce.
 */
export function stableCluster(
  startSec: number,
  endSec: number,
  playersAtSec: PlayersAtSec,
  maxSpread: number,
): { center: DirectorVec3; count: number; spread: number } | null {
  const midSec = Math.round((startSec + endSec) / 2);
  const atMid = playersAtSec.get(midSec);
  if (!atMid || atMid.length === 0) return null;
  let group: typeof atMid = [];
  for (const anchor of atMid) {
    const near = dominantFloor(
      atMid.filter((p) => dist(p.pos, anchor.pos) <= DIRECTOR_CROWD_RADIUS),
    );
    if (near.length > group.length) group = near;
  }
  if (group.length < DIRECTOR_CLUSTER_CAM_MIN_PLAYERS) return null;
  const ids = new Set(group.map((p) => p.targetId));
  const positions: DirectorVec3[] = [];
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    for (const p of playersAtSec.get(sec) ?? []) {
      if (ids.has(p.targetId)) positions.push(p.pos);
    }
  }
  if (positions.length === 0) return null;
  const center = floorCentroid(positions);
  // How far the group ranges over the window decides how wide the shot
  // has to be — not whether to take it. Only a group that scatters
  // across the map is beyond framing.
  const spread = Math.max(...positions.map((p) => dist(p, center)));
  if (spread > maxSpread) return null;
  return { center, count: group.length, spread };
}

/** Enemies of the flag's holder within striking distance of the hold. */
/**
 * Enemy presence near a HOME stand — the attackers coming for the flag.
 * The mirror of threatsNear, which is the turtle-side question (there
 * the flag is deep in enemy hands and its own team are the threats).
 * Without this gate, a crowd of teammates milling around their own
 * spawn reads as a "battle" and earns an overhead of nothing.
 */
export function enemiesNear(
  startSec: number,
  endSec: number,
  center: DirectorVec3,
  slot: number,
  playersAtSec: PlayersAtSec,
): number {
  let count = 0;
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    for (const p of playersAtSec.get(sec) ?? []) {
      if (p.teamId == null || p.teamId === slot) continue;
      if (dist(p.pos, center) <= DIRECTOR_TURTLE_THREAT_RANGE * 3) count++;
    }
  }
  return count;
}

export function threatsNear(
  startSec: number,
  endSec: number,
  center: DirectorVec3,
  slot: number,
  playersAtSec: PlayersAtSec,
): { count: number; center: DirectorVec3 } | null {
  const positions: DirectorVec3[] = [];
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    for (const p of playersAtSec.get(sec) ?? []) {
      // The flag's own team are the ones trying to get it back.
      if (p.teamId != null && p.teamId !== slot) continue;
      if (dist(p.pos, center) <= DIRECTOR_TURTLE_THREAT_RANGE * 3) {
        positions.push(p.pos);
      }
    }
  }
  if (positions.length === 0) return null;
  return { count: positions.length, center: centroid(positions) };
}

/** Whether any player comes within `range` of a point during a window. */
export function someoneNear(
  startSec: number,
  endSec: number,
  point: DirectorVec3,
  range: number,
  playersAtSec: PlayersAtSec,
): boolean {
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    for (const p of playersAtSec.get(sec) ?? []) {
      if (dist(p.pos, point) <= range) return true;
    }
  }
  return false;
}

/** Average players near the flag across a run's whole-second samples. */
export function runCrowd(
  run: { startSec: number; endSec: number; carrierTargetId: number | null },
  track: FlagTrack,
  playersAtSec: PlayersAtSec,
): number {
  let sampleCount = 0;
  let total = 0;
  for (const sample of track.samples) {
    if (sample.timeSec < run.startSec || sample.timeSec >= run.endSec) {
      continue;
    }
    if (Math.round(sample.timeSec * 2) % 2 !== 0) continue;
    const players = playersAtSec.get(Math.round(sample.timeSec)) ?? [];
    sampleCount++;
    for (const p of players) {
      if (p.targetId === run.carrierTargetId) continue;
      if (dist(p.pos, sample.pos) <= DIRECTOR_CROWD_RADIUS) total++;
    }
  }
  return sampleCount > 0 ? total / sampleCount : 0;
}

/**
 * The best highlight kill in a window: a death with a killer close
 * enough to frame with them, preferring ordnance kills (a mortar hit or
 * a disc) over a plain one. Returns the pair to frame.
 */
/**
 * Weapons whose kills are worth a highlight on their own: skill shots
 * and heavy ordnance that read on camera. Substring match, so vehicle
 * variants ("tank mortar", "mpb missile") qualify with their weapon.
 * Chaingun sprays, blaster plinks and unknown causes make dull
 * television unless the flag is involved.
 */
const HIGHLIGHT_WEAPON_WORDS = [
  "satchel",
  "shocklance",
  "disc",
  "mortar",
  "missile",
  "plasma",
  "laser",
  "sniper",
];

function isHighlightWeapon(weapon: string | undefined): boolean {
  if (!weapon) return false;
  // Automated base turrets shoot people all game; "plasma turret" is
  // not a plasma hero moment.
  if (weapon.includes("turret")) return false;
  return HIGHLIGHT_WEAPON_WORDS.some((w) => weapon.includes(w));
}

/** Was this player carrying a flag around `timeSec`? */
function carriedFlagAt(
  targetId: number | null,
  timeSec: number,
  dataset: DirectorDataset,
): boolean {
  if (targetId == null) return false;
  const slack = dataset.flagSampleStepSec + 0.5;
  for (const sample of dataset.flagSamples) {
    if (sample.timeSec < timeSec - slack) continue;
    if (sample.timeSec > timeSec + slack) break;
    if (sample.carrierTargetId === targetId) return true;
  }
  return false;
}

export function highlightKill(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
): {
  timeSec: number;
  center: DirectorVec3;
  spread: number;
  weapon?: string;
  killerTargetId: number;
  victimPos: DirectorVec3;
  midair: boolean;
  flagInvolved: boolean;
} | null {
  let best: {
    timeSec: number;
    center: DirectorVec3;
    spread: number;
    weapon?: string;
    killerTargetId: number;
    victimPos: DirectorVec3;
    midair: boolean;
    flagInvolved: boolean;
    rank: number;
  } | null = null;
  for (const death of dataset.deaths) {
    if (death.timeSec < startSec || death.timeSec >= endSec) continue;
    if (death.killerTargetId == null || !death.killerPos) continue;
    const separation = dist(death.pos, death.killerPos);
    if (separation > DIRECTOR_HIGHLIGHT_MAX_SEPARATION) continue;
    // A random chaingun (or unclassified) kill between two non-carriers
    // is not a hero moment — skip it and let the window find another
    // subject. The flag being involved makes ANY kill the story.
    const flagInvolved =
      carriedFlagAt(death.targetId, death.timeSec, dataset) ||
      carriedFlagAt(death.killerTargetId, death.timeSec, dataset);
    if (!isHighlightWeapon(death.weapon) && !flagInvolved) continue;
    // The MA: the scanner's verified direct-hit verdict — a disc,
    // grenade or mortar CONNECTING with an airborne, moving victim.
    const midair = death.midair === true;
    // Ordnance kills read best on camera; a long-range hit beats a
    // point-blank scrum for legibility, and a kill on (or by) a flag
    // carrier outranks everything.
    const rank =
      (flagInvolved ? 4 : 0) +
      (midair ? 3 : 0) +
      (isHighlightWeapon(death.weapon) ? 2 : 0) +
      separation / 100;
    if (!best || rank > best.rank) {
      best = {
        timeSec: death.timeSec,
        center: centroid([death.pos, death.killerPos]),
        spread: separation / 2,
        weapon: death.weapon,
        killerTargetId: death.killerTargetId,
        victimPos: death.pos,
        midair,
        flagInvolved,
        rank,
      };
    }
  }
  return best;
}

/**
 * Base assets going DOWN inside a window — a raid succeeding. The
 * guides' first rule of strategy: "generators are the single most
 * important asset in your entire base". Any generator kill qualifies;
 * lesser assets need a concentrated pair (one deployable popping is
 * noise). Returns the fight's centre and when it happened.
 */
export function assetRaid(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
): {
  center: DirectorVec3;
  firstSec: number;
  lastSec: number;
  count: number;
  generators: boolean;
} | null {
  const destroyed = dataset.structures.filter(
    (st) => st.to > st.from && st.timeSec >= startSec && st.timeSec < endSec,
  );
  if (destroyed.length === 0) return null;
  const generators = destroyed.filter((st) =>
    /generator/i.test(`${st.name} ${st.className}`),
  );
  let cluster = generators;
  if (cluster.length === 0) {
    // No gens: require two asset kills close together in space.
    cluster = destroyed.filter((st) =>
      destroyed.some(
        (other) =>
          other !== st && dist(other.pos, st.pos) <= DIRECTOR_RAID_RANGE,
      ),
    );
    if (cluster.length < 2) return null;
  }
  return {
    center: centroid(cluster.map((st) => st.pos)),
    firstSec: Math.min(...cluster.map((st) => st.timeSec)),
    lastSec: Math.max(...cluster.map((st) => st.timeSec)),
    count: cluster.length,
    generators: generators.length > 0,
  };
}

/**
 * A vehicle set piece worth a camera. Two kinds, in priority order:
 * a LOADED TRANSPORT under way (a Havoc/bomber with a crew aboard is a
 * raid announcement — "its primary use is the transport of a group of
 * heavies to attack"), and a DOGFIGHT (opposing flyers tangling at
 * close range). Returns the flight's path centre and spread so the
 * camera can frame the pass, not one stale point of it.
 */
export function vehicleMoment(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): {
  kind: "transport" | "dogfight" | "strafe";
  center: DirectorVec3;
  spread: number;
  vehicle: DirectorVehicleSample["kind"];
  crew: number;
} | null {
  const inWindow = (dataset.vehicles ?? []).filter(
    (v) => v.timeSec >= startSec && v.timeSec < endSec,
  );
  if (inWindow.length === 0) return null;
  const byKey = new Map<string, DirectorVehicleSample[]>();
  for (const v of inWindow) {
    let list = byKey.get(v.key);
    if (!list) byKey.set(v.key, (list = []));
    list.push(v);
  }
  // Loaded transport: most crew aboard wins; it must actually be under
  // way (a full Havoc idling on the pad is a queue, not a raid).
  let transport: {
    samples: DirectorVehicleSample[];
    crew: number;
  } | null = null;
  for (const samples of byKey.values()) {
    const kind = samples[0].kind;
    if (kind !== "havoc" && kind !== "bomber") continue;
    const crew = Math.max(...samples.map((v) => v.passengers));
    if (crew < DIRECTOR_TRANSPORT_MIN_CREW) continue;
    const travel = dist(samples[0].pos, samples[samples.length - 1].pos);
    if (travel < DIRECTOR_TRANSPORT_MIN_TRAVEL) continue;
    if (!transport || crew > transport.crew) transport = { samples, crew };
  }
  if (transport) {
    const { center, spread } = boundingSpread(
      transport.samples.map((v) => v.pos),
    );
    return {
      kind: "transport",
      center,
      spread,
      vehicle: transport.samples[0].kind,
      crew: transport.crew,
    };
  }
  // Dogfight: opposing flyers within range of each other repeatedly.
  const flyers = inWindow.filter(
    (v) => v.kind === "shrike" || v.kind === "bomber",
  );
  const meetings: DirectorVec3[] = [];
  for (const a of flyers) {
    for (const b of flyers) {
      if (
        a.key >= b.key ||
        a.timeSec !== b.timeSec ||
        a.teamId == null ||
        b.teamId == null ||
        a.teamId === b.teamId
      ) {
        continue;
      }
      if (dist(a.pos, b.pos) <= DIRECTOR_DOGFIGHT_RANGE) {
        meetings.push(centroid([a.pos, b.pos]));
      }
    }
  }
  if (meetings.length >= DIRECTOR_DOGFIGHT_MIN_MEETINGS) {
    const { center, spread } = boundingSpread(meetings);
    return { kind: "dogfight", center, spread, vehicle: "shrike", crew: 0 };
  }
  // A lone flyer working GROUND targets — repeatedly passing close to
  // opposing players while under way — is a strafing run: the shrike
  // hounding somebody out of frame is more engaging than any lull.
  for (const samples of byKey.values()) {
    const kind = samples[0].kind;
    if (kind !== "shrike" && kind !== "bomber") continue;
    if (
      dist(samples[0].pos, samples[samples.length - 1].pos) <
      DIRECTOR_TRANSPORT_MIN_TRAVEL
    ) {
      continue;
    }
    const passes: DirectorVec3[] = [];
    for (const v of samples) {
      const near = (playersAtSec.get(Math.round(v.timeSec)) ?? []).some(
        (p) =>
          (v.teamId == null || p.teamId == null || p.teamId !== v.teamId) &&
          dist(p.pos, v.pos) <= DIRECTOR_STRAFE_RANGE,
      );
      if (near) passes.push(v.pos);
    }
    if (passes.length >= DIRECTOR_STRAFE_MIN_PASSES) {
      const { center, spread } = boundingSpread(passes);
      return { kind: "strafe", center, spread, vehicle: kind, crew: 0 };
    }
  }
  return null;
}

/**
 * A sustained bombardment: mortar shells landing near one place (a
 * base, its generators, its turrets) inside a window. When the flags
 * are static this is usually the most interesting thing on the map, and
 * it comes with a second shot for free — whoever is lobbing them.
 */
export function bombardment(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
): {
  impact: DirectorVec3;
  origin: DirectorVec3;
  shells: number;
  shooterTargetId: number | null;
} | null {
  const shells = dataset.mortarShots.filter(
    (m) => m.timeSec >= startSec && m.timeSec < endSec,
  );
  if (shells.length < DIRECTOR_BOMBARDMENT_MIN_SHELLS) return null;
  // Anchor on whichever base is being shelled, so the camera watches
  // the target rather than the midpoint of scattered fire.
  let best: { impact: DirectorVec3; hits: typeof shells } | null = null;
  for (const stand of dataset.flagStands) {
    const hits = shells.filter(
      (m) => dist(m.to, stand.pos) <= DIRECTOR_BOMBARDMENT_RANGE,
    );
    if (
      hits.length >= DIRECTOR_BOMBARDMENT_MIN_SHELLS &&
      hits.length > (best?.hits.length ?? 0)
    ) {
      best = { impact: stand.pos, hits };
    }
  }
  // No base under fire, but a concentrated barrage somewhere still is.
  if (!best) {
    const impact = centroid(shells.map((m) => m.to));
    const near = shells.filter(
      (m) => dist(m.to, impact) <= DIRECTOR_BOMBARDMENT_RANGE,
    );
    if (near.length < DIRECTOR_BOMBARDMENT_MIN_SHELLS) return null;
    best = { impact, hits: near };
  }
  // The crew is named by the shells themselves: every projectile packet
  // carries its shooter (sourceObject) — the dominant one is the crew.
  const byShooter = new Map<number, number>();
  for (const m of best.hits) {
    if (m.shooterTargetId == null) continue;
    byShooter.set(
      m.shooterTargetId,
      (byShooter.get(m.shooterTargetId) ?? 0) + 1,
    );
  }
  let shooterTargetId: number | null = null;
  let most = 0;
  for (const [id, n] of byShooter) {
    if (n > most) {
      most = n;
      shooterTargetId = id;
    }
  }
  return {
    impact: best.impact,
    origin: centroid(best.hits.map((m) => m.from)),
    shells: best.hits.length,
    shooterTargetId,
  };
}

/**
 * Mortar action near a point inside a window — a launch or an impact.
 * Launches rank over impacts (the firing player is a subject; a crater
 * is scenery), earliest first so the shot can bracket it.
 */
export function mortarActionNear(
  center: DirectorVec3,
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
): {
  pos: DirectorVec3;
  kind: "launch" | "impact";
  timeSec: number;
  shooterTargetId: number | null;
} | null {
  let best: {
    pos: DirectorVec3;
    kind: "launch" | "impact";
    timeSec: number;
    shooterTargetId: number | null;
  } | null = null;
  for (const m of dataset.mortarShots) {
    if (m.timeSec < startSec || m.timeSec >= endSec) continue;
    const launch = dist(m.from, center) <= DIRECTOR_STATION_ACTION_RANGE;
    const impact = dist(m.to, center) <= DIRECTOR_STATION_ACTION_RANGE;
    if (!launch && !impact) continue;
    const candidate = {
      pos: launch ? m.from : m.to,
      kind: launch ? ("launch" as const) : ("impact" as const),
      timeSec: m.timeSec,
      shooterTargetId: m.shooterTargetId ?? null,
    };
    if (
      !best ||
      (candidate.kind === "launch" && best.kind === "impact") ||
      (candidate.kind === best.kind && candidate.timeSec < best.timeSec)
    ) {
      best = candidate;
    }
  }
  return best;
}

/**
 * What an inbound attacker DOES when they get there — the reason to air
 * the travel at all. A follow that shows the run but cuts before the
 * payoff is a shot of somebody commuting; the scan knows the future, so
 * a candidate with no payoff in the window is simply not taken.
 */
export interface InboundPayoff {
  sec: number;
  kind: "kill" | "flag" | "asset" | "death";
}

export interface InboundPick {
  targetId: number;
  score: number;
  payoff: InboundPayoff;
}

const PAYOFF_WEIGHT: Record<InboundPayoff["kind"], number> = {
  flag: 40,
  kill: 30,
  asset: 25,
  death: 5,
};

function inboundPayoff(
  targetId: number,
  name: string | undefined,
  fromSec: number,
  horizonSec: number,
  basePos: DirectorVec3,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): InboundPayoff | null {
  let best: InboundPayoff | null = null;
  const consider = (sec: number, kind: InboundPayoff["kind"]) => {
    if (sec < fromSec || sec >= horizonSec) return;
    if (
      !best ||
      PAYOFF_WEIGHT[kind] > PAYOFF_WEIGHT[best.kind] ||
      (PAYOFF_WEIGHT[kind] === PAYOFF_WEIGHT[best.kind] && sec < best.sec)
    ) {
      best = { sec, kind };
    }
  };
  for (const d of dataset.deaths) {
    if (d.timeSec < fromSec || d.timeSec >= horizonSec) continue;
    if (
      d.killerTargetId === targetId &&
      dist(d.pos, basePos) <= DIRECTOR_INBOUND_PAYOFF_RANGE
    ) {
      consider(d.timeSec, "kill");
    }
    if (d.targetId === targetId) consider(d.timeSec, "death");
  }
  if (name != null) {
    for (const e of dataset.events) {
      if (e.type !== "flag-grab" && e.type !== "flag-return") continue;
      if (e.actor?.toLowerCase() !== name) continue;
      consider(e.timeSec, "flag");
    }
  }
  for (const st of dataset.structures) {
    if (st.to <= st.from) continue;
    if (st.timeSec < fromSec || st.timeSec >= horizonSec) continue;
    const at = playersAtSec
      .get(Math.round(st.timeSec))
      ?.find((p) => p.targetId === targetId);
    if (at && dist(at.pos, st.pos) <= DIRECTOR_INBOUND_PAYOFF_RANGE) {
      consider(st.timeSec, "asset");
    }
  }
  return best;
}

/**
 * An attacker inbound on a turtled base: one of the flag's own team
 * (the side fighting to get back in), currently in the midfield band,
 * closing on the base fast — AND with a scan-verified payoff when they
 * arrive (a kill at the base, a flag touch, asset damage, or at least
 * dying in the attempt). Mortar fire from their position ranks them up.
 */
export function incomingAttacker(
  startSec: number,
  endSec: number,
  basePos: DirectorVec3,
  slot: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): InboundPick | null {
  const [a, b] = dataset.flagStands;
  const span = a && b ? dist(a.pos, b.pos) : 400;
  const horizonSec = startSec + DIRECTOR_INBOUND_MAX_FOLLOW_SEC;
  const names = new Map(
    dataset.playerNames.map((p) => [p.targetId, p.name] as const),
  );
  const byPlayer = new Map<
    number,
    { samples: { sec: number; pos: DirectorVec3 }[] }
  >();
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    for (const p of playersAtSec.get(sec) ?? []) {
      if (p.teamId == null || p.teamId !== slot) continue;
      let entry = byPlayer.get(p.targetId);
      if (!entry) byPlayer.set(p.targetId, (entry = { samples: [] }));
      entry.samples.push({ sec, pos: p.pos });
    }
  }
  let best: InboundPick | null = null;
  for (const [targetId, e] of byPlayer) {
    const first = e.samples[0];
    const last = e.samples[e.samples.length - 1];
    const elapsed = last.sec - first.sec;
    if (elapsed < 2) continue;
    const d0 = dist(first.pos, basePos);
    const d1 = dist(last.pos, basePos);
    const mid = (d0 + d1) / 2;
    if (
      mid < span * DIRECTOR_INBOUND_MIN_FRACTION ||
      mid > span * DIRECTOR_INBOUND_MAX_FRACTION
    ) {
      continue;
    }
    const approach = (d0 - d1) / elapsed;
    if (approach < DIRECTOR_INBOUND_MIN_APPROACH) continue;
    // No payoff, no shot: the whole point is what they DO on arrival.
    const payoff = inboundPayoff(
      targetId,
      names.get(targetId),
      startSec,
      horizonSec,
      basePos,
      dataset,
      playersAtSec,
    );
    if (!payoff) continue;
    // Attribute a launch by where the player was WHEN it fired — a
    // skier covers hundreds of units per window, so endpoints alone
    // never sit near a mid-route launch.
    const shelling = dataset.mortarShots.filter((m) => {
      if (m.timeSec < startSec || m.timeSec >= endSec) return false;
      const at = e.samples.find((sm) => Math.abs(sm.sec - m.timeSec) <= 1);
      return (
        at != null && dist(m.from, at.pos) <= DIRECTOR_INBOUND_MORTAR_RANGE
      );
    }).length;
    const score = approach + shelling * 20 + PAYOFF_WEIGHT[payoff.kind];
    if (!best || score > best.score) best = { targetId, score, payoff };
  }
  return best;
}

/**
 * The most watchable player near a point in a window: somebody about to
 * get a kill, firing ordnance, or at least skiing properly fast. A
 * follow shot of a player doing nothing is a shot of nothing — when no
 * candidate scores, the fastest mover is still the least-nothing choice.
 */
export function bestHero(
  startSec: number,
  endSec: number,
  near: DirectorVec3,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): number | null {
  const tracks = new Map<number, { timeSec: number; pos: DirectorVec3 }[]>();
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    for (const p of playersAtSec.get(sec) ?? []) {
      let list = tracks.get(p.targetId);
      if (!list) tracks.set(p.targetId, (list = []));
      list.push({ timeSec: sec, pos: p.pos });
    }
  }
  let best: { targetId: number; score: number; speed: number } | null = null;
  for (const [targetId, list] of tracks) {
    if (!list.some((s) => dist(s.pos, near) <= DIRECTOR_CROWD_RADIUS)) {
      continue;
    }
    const kills = dataset.deaths.filter(
      (d) =>
        d.killerTargetId === targetId &&
        d.timeSec >= startSec &&
        d.timeSec < endSec,
    ).length;
    const firing = dataset.mortarShots.filter(
      (m) =>
        m.timeSec >= startSec &&
        m.timeSec < endSec &&
        list.some((s) => dist(m.from, s.pos) <= DIRECTOR_INBOUND_MORTAR_RANGE),
    ).length;
    let peak = 0;
    for (let i = 1; i < list.length; i++) {
      const dt = list[i].timeSec - list[i - 1].timeSec;
      if (dt > 0) {
        peak = Math.max(peak, dist(list[i].pos, list[i - 1].pos) / dt);
      }
    }
    const score =
      kills * 3 +
      firing * 2 +
      (peak >= DIRECTOR_HERO_MIN_SPEED ? 1 + peak / 40 : 0);
    if (
      !best ||
      score > best.score ||
      (score === best.score && peak > best.speed)
    ) {
      best = { targetId, score, speed: peak };
    }
  }
  return best?.targetId ?? null;
}

/**
 * Where a moving player is heading, as an aim target: the base their
 * travel points at when one does (the thing they are about to attack),
 * otherwise a point projected ahead along their path. Null while they
 * are not really going anywhere — a loiterer has no destination and the
 * caller should aim at the scene instead.
 */
export function travelDestination(
  targetId: number,
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): DirectorVec3 | null {
  let first: DirectorVec3 | null = null;
  let last: DirectorVec3 | null = null;
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    const p = playersAtSec.get(sec)?.find((s) => s.targetId === targetId);
    if (!p) continue;
    if (!first) first = p.pos;
    last = p.pos;
  }
  if (!first || !last) return null;
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const travelled = Math.hypot(dx, dy);
  if (travelled < DIRECTOR_HERO_DEST_MIN_TRAVEL) return null;
  const ux = dx / travelled;
  const uy = dy / travelled;
  for (const stand of dataset.flagStands) {
    const sx = stand.pos[0] - last[0];
    const sy = stand.pos[1] - last[1];
    const range = Math.hypot(sx, sy);
    if (range < 50) continue;
    if ((sx * ux + sy * uy) / range >= DIRECTOR_HERO_DEST_CONE_COS) {
      return stand.pos;
    }
  }
  return [
    last[0] + ux * DIRECTOR_HERO_DEST_AHEAD,
    last[1] + uy * DIRECTOR_HERO_DEST_AHEAD,
    last[2],
  ];
}

/**
 * The defender posted nearest a home stand during a window — the other
 * half of a good stand shot. Same team as the flag, sampled at the
 * window's middle so a passer-by doesn't count.
 */
export function standGuard(
  startSec: number,
  endSec: number,
  standPos: DirectorVec3,
  slot: number,
  playersAtSec: PlayersAtSec,
): { pos: DirectorVec3; dist: number; targetId: number } | null {
  const mid = Math.round((startSec + endSec) / 2);
  let best: { pos: DirectorVec3; dist: number; targetId: number } | null = null;
  for (const p of playersAtSec.get(mid) ?? []) {
    if (p.teamId == null || p.teamId !== slot) continue;
    const d = dist(p.pos, standPos);
    if (d > DIRECTOR_STAND_GUARD_RANGE) continue;
    if (!best || d < best.dist) {
      best = { pos: p.pos, dist: d, targetId: p.targetId };
    }
  }
  return best;
}

/**
 * Where a FIGHTING (non-travelling) player's attention is: the centroid
 * of enemies near them. Aiming the follow camera across them at this
 * point shows what they are shooting at, instead of an arbitrary
 * rotation around someone mid-firefight.
 */
export function likelyTarget(
  targetId: number,
  startSec: number,
  endSec: number,
  playersAtSec: PlayersAtSec,
): DirectorVec3 | null {
  const mid = Math.round((startSec + endSec) / 2);
  const at = playersAtSec.get(mid) ?? [];
  const self = at.find((p) => p.targetId === targetId);
  if (!self) return null;
  const enemies = at.filter(
    (p) =>
      p.teamId != null &&
      self.teamId != null &&
      p.teamId !== self.teamId &&
      dist(p.pos, self.pos) <= DIRECTOR_THREAT_RANGE,
  );
  if (enemies.length === 0) return null;
  return centroid(enemies.map((p) => p.pos));
}

/** Peak simultaneous player count within range of a point. */
export function crowdNear(
  startSec: number,
  endSec: number,
  point: DirectorVec3,
  range: number,
  playersAtSec: PlayersAtSec,
): number {
  let peak = 0;
  for (let sec = Math.floor(startSec); sec <= Math.ceil(endSec); sec++) {
    let count = 0;
    for (const p of playersAtSec.get(sec) ?? []) {
      if (dist(p.pos, point) <= range) count++;
    }
    if (count > peak) peak = count;
  }
  return peak;
}

/**
 * An inventory station with a crowd around it: players stacked on a
 * station means a suit-up — the match start, or a base just repaired —
 * which is worth a tight angle on the station itself.
 */
export function suitUp(
  startSec: number,
  endSec: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): { center: DirectorVec3; count: number } | null {
  // Only around a kickoff or a repair: otherwise a busy server's
  // stations are permanently crowded and this stops being a moment.
  const kickoff = dataset.events.some(
    (e) =>
      e.type === "match-start" &&
      startSec >= e.timeSec - DIRECTOR_SUITUP_KICKOFF_SEC &&
      startSec <= e.timeSec + DIRECTOR_SUITUP_KICKOFF_SEC,
  );
  // Only GENERATOR repairs count, and only for stations in the same
  // base: on a busy server something somewhere is always being patched
  // up, and a turret repaired across the map is not this inventory's
  // story.
  const repairs = dataset.structures.filter(
    (st) =>
      st.to < st.from &&
      /generator/i.test(`${st.name} ${st.className}`) &&
      startSec >= st.timeSec &&
      startSec <= st.timeSec + DIRECTOR_SUITUP_REPAIR_SEC,
  );
  if (!kickoff && repairs.length === 0) return null;
  let best: { center: DirectorVec3; count: number; active: boolean } | null =
    null;
  // When the scan recorded activation data at all, an in-window
  // activation is REQUIRED: a crowd standing near an idle inventory is
  // not a suit-up, it is people waiting near a machine. Proximity alone
  // is only trusted for datasets scanned before activations existed.
  const haveActivations = dataset.stations.some(
    (st) => (st.activations?.length ?? 0) > 0,
  );
  for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
    const players = playersAtSec.get(sec);
    if (!players || players.length < DIRECTOR_STATION_MIN_PLAYERS) continue;
    for (const station of dataset.stations) {
      // Inventory stations only. Generators sit in the same rooms and a
      // generator with players milling past it is not a suit-up shot —
      // it is a shot of a machine. A generator earns the camera when it
      // is being ATTACKED, which arrives as a structure transition.
      if (station.kind !== "inventory") continue;
      if (
        !kickoff &&
        !repairs.some(
          (st) => dist(st.pos, station.pos) <= DIRECTOR_SUITUP_REPAIR_RANGE,
        )
      ) {
        continue;
      }
      const near = players.filter(
        (p) => dist(p.pos, station.pos) <= DIRECTOR_STATION_RANGE,
      ).length;
      if (near < DIRECTOR_STATION_MIN_PLAYERS) continue;
      // The activate animation playing is ground truth for "this is the
      // station being USED" — proximity alone picks whichever inventory
      // a passing crowd happens to stand near.
      const active = (station.activations ?? []).some(
        (a) => a >= startSec - 2 && a <= endSec + 2,
      );
      if (haveActivations && !active) continue;
      if (!best || (active && !best.active) || near > best.count) {
        best = { center: station.pos, count: near, active };
      }
    }
  }
  return best;
}

/**
 * Is the carrier turtling — holding the flag, barely moving, and parked
 * next to base fixtures that only exist indoors (a generator or an
 * inventory station)? Returns the holed-up position plus how threatened
 * they are, which decides whether to watch them or the doors.
 */
export function turtleHold(
  run: { startSec: number; endSec: number; carrierTargetId: number | null },
  track: FlagTrack,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): { center: DirectorVec3; asset: DirectorVec3 } | null {
  if (run.endSec - run.startSec < DIRECTOR_TURTLE_MIN_SEC) return null;
  const speed = flagSpeed(run.startSec, run.endSec, track);
  if (speed == null || speed > DIRECTOR_TURTLE_SPEED) return null;
  const spread = flagPathSpread(run.startSec, run.endSec, track);
  if (!spread) return null;
  // Sitting still is only turtling if they are sitting still INSIDE
  // something; in the open it is just a stalled runner.
  let nearest: { d: number; pos: DirectorVec3 } | null = null;
  for (const station of dataset.stations) {
    const d = dist(station.pos, spread.center);
    if (!nearest || d < nearest.d) nearest = { d, pos: station.pos };
  }
  if (!nearest || nearest.d > DIRECTOR_TURTLE_ASSET_RANGE) return null;
  void playersAtSec;
  return { center: spread.center, asset: nearest.pos };
}

/**
 * How to aim a carried-flag chase, from what actually happens during
 * the run: a carrier who gets kills shoots forward — sit behind them so
 * the shots land on screen; a carrier with defenders on their tail and
 * no kills is prey — sit ahead and watch the pursuit. Also flags the
 * run as crowded (widen/steepen the framing) when the fight around the
 * carrier stays dense.
 */
export function analyzeHeldRun(
  run: { startSec: number; endSec: number; carrierTargetId: number | null },
  slot: number,
  dataset: DirectorDataset,
  track: FlagTrack,
  playersAtSec: PlayersAtSec,
  crowdMin: number,
): { aim: ShotAim; crowded: boolean } {
  // Entity-state deaths, not timeline kill events: observer recordings
  // carry no kill events, which made every chased carrier read as prey.
  const kills = dataset.deaths.filter(
    (d) =>
      d.timeSec >= run.startSec &&
      d.timeSec <= run.endSec &&
      d.killerTargetId != null &&
      d.killerTargetId === run.carrierTargetId,
  ).length;
  let sampleCount = 0;
  let chaserSamples = 0;
  let crowdTotal = 0;
  for (const sample of track.samples) {
    if (sample.timeSec < run.startSec || sample.timeSec >= run.endSec) {
      continue;
    }
    // Whole-second flag samples only, matching the player buckets.
    if (Math.round(sample.timeSec * 2) % 2 !== 0) continue;
    const players = playersAtSec.get(Math.round(sample.timeSec)) ?? [];
    sampleCount++;
    let chaser = false;
    let crowd = 0;
    for (const p of players) {
      if (p.targetId === run.carrierTargetId) continue;
      const d = dist(p.pos, sample.pos);
      if (d <= DIRECTOR_CROWD_RADIUS) crowd++;
      // Chasers are the flag's own team trying to return it.
      if (
        d <= DIRECTOR_CHASE_RADIUS &&
        (p.teamId == null || p.teamId === slot)
      ) {
        chaser = true;
      }
    }
    if (chaser) chaserSamples++;
    crowdTotal += crowd;
  }
  const chased =
    sampleCount > 0 && chaserSamples / sampleCount >= DIRECTOR_CHASE_FRACTION;
  const crowded = sampleCount > 0 && crowdTotal / sampleCount >= crowdMin;
  return {
    aim: chased && kills === 0 ? { mode: "backward" } : { mode: "forward" },
    crowded,
  };
}

/**
 * Aim for a stand/dropped shot leading into a grab: a fixed bearing
 * from the flag toward where the grabber was a few seconds earlier —
 * their approach corridor — so the pickup happens facing the action.
 * Prefers the grab event's actor; falls back to the nearest likely
 * attacker at that moment.
 */
export function approachAim(
  grabTime: number,
  slot: number,
  anchorPos: DirectorVec3,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): ShotAim | undefined {
  const bucket =
    playersAtSec.get(Math.round(grabTime - DIRECTOR_APPROACH_LOOKBACK_SEC)) ??
    [];
  const grabEvent = dataset.events.find(
    (e) =>
      e.type === "flag-grab" &&
      Math.abs(e.timeSec - grabTime) <= 2.5 &&
      eventFlagSlot(e, dataset) === slot,
  );
  const actorTargetId = grabEvent?.actor
    ? dataset.playerNames.find((p) => p.name === grabEvent.actor!.toLowerCase())
        ?.targetId
    : undefined;
  let approach =
    actorTargetId != null
      ? bucket.find((p) => p.targetId === actorTargetId)?.pos
      : undefined;
  if (!approach) {
    let bestDist = DIRECTOR_APPROACH_MAX_RANGE;
    for (const p of bucket) {
      if (p.teamId != null && p.teamId === slot) continue;
      const d = dist(p.pos, anchorPos);
      if (d < bestDist) {
        bestDist = d;
        approach = p.pos;
      }
    }
  }
  if (!approach || dist(approach, anchorPos) < 5) return undefined;
  return { mode: "hold", yaw: bearingYaw(anchorPos, approach) };
}
