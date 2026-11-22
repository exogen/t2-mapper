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
} from "./types";
import {
  DIRECTOR_CROWD_RADIUS,
  DIRECTOR_DOGFIGHT_MIN_MEETINGS,
  DIRECTOR_DOGFIGHT_RANGE,
  DIRECTOR_FLOOR_BAND,
  DIRECTOR_STRAFE_MIN_PASSES,
  DIRECTOR_STRAFE_RANGE,
  DIRECTOR_STATION_RANGE,
  DIRECTOR_TRANSPORT_MIN_CREW,
  DIRECTOR_TRANSPORT_MIN_TRAVEL,
} from "./tunables";
import { boundingSpread, centroid, dist } from "./geometry";
import { sampleIndexAt, type PlayersAtSec } from "./dataset";
import type { CausalView } from "./causalView";

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
    const cluster = busiestPlayerCluster(playersAtSec.get(sec) ?? []);
    if (cluster && cluster.count > (best?.count ?? 1)) best = cluster;
  }
  return best;
}

export function busiestPlayerCluster(
  players: readonly { pos: DirectorVec3 }[],
): { center: DirectorVec3; count: number } | null {
  let best: { pos: DirectorVec3 }[] = [];
  for (const anchor of players) {
    const group = dominantFloor(
      players.filter((p) => dist(p.pos, anchor.pos) <= DIRECTOR_CROWD_RADIUS),
    );
    if (group.length > best.length) best = group;
  }
  return best.length > 1
    ? { center: floorCentroid(best.map((p) => p.pos)), count: best.length }
    : null;
}

const motionCache = new WeakMap<
  CausalView,
  {
    dataset: DirectorDataset;
    timeSec: number;
    windowSec: number;
    samples: ReturnType<typeof samplePlayerMotion>;
  }
>();

export function playerMotion(view: CausalView, t: number, windowSec: number) {
  const previous = motionCache.get(view);
  if (
    previous?.dataset === view.dataset &&
    previous.timeSec === t &&
    previous.windowSec === windowSec
  )
    return previous.samples;
  const samples = samplePlayerMotion(view, t, windowSec);
  motionCache.set(view, {
    dataset: view.dataset,
    timeSec: t,
    windowSec,
    samples,
  });
  return samples;
}

/** Shared snapshot of player motion for judging approaches and group pushes. */
function samplePlayerMotion(view: CausalView, t: number, windowSec: number) {
  const dead = new Set(view.deathsIn(t - windowSec, t).map((d) => d.targetId));
  const previous = new Map(
    view.playersAt(t - windowSec).map((p) => [p.targetId, p]),
  );
  return view.playersAt(t).flatMap((player) => {
    const before = previous.get(player.targetId);
    if (!before || dead.has(player.targetId) || before.teamId !== player.teamId)
      return [];
    const elapsed = player.timeSec - before.timeSec;
    if (elapsed <= 0) return [];
    return [
      {
        player,
        before,
        elapsed,
        speed: dist(before.pos, player.pos) / elapsed,
      },
    ];
  });
}

export function busiestInventory(
  view: CausalView,
  t: number,
  {
    minimum,
    requireActive = false,
    awayFrom,
  }: {
    minimum: number;
    requireActive?: boolean;
    awayFrom?: DirectorVec3 | null;
  },
): { pos: DirectorVec3; count: number } | null {
  const players = view.playersAt(t);
  let best: { pos: DirectorVec3; count: number; score: number } | null = null;
  for (const station of view.dataset.stations) {
    if (station.kind !== "inventory" || station.deployed) continue;
    if (awayFrom && dist(station.pos, awayFrom) < 80) continue;
    const active = (station.activations ?? []).some(
      (a) => a >= t - 3 && a <= Math.min(t + 2, view.horizon),
    );
    if (requireActive && !active) continue;
    const count = players.filter(
      (p) =>
        p.health !== 0 && dist(p.pos, station.pos) <= DIRECTOR_STATION_RANGE,
    ).length;
    if (count < minimum) continue;
    const score = count + (active ? 2 : 0);
    if (!best || score > best.score) best = { pos: station.pos, count, score };
  }
  return best;
}

/** Look for a vehicle gaining its first rider at the pad. */
export function vehiclePadMoment(view: CausalView, t: number) {
  const vehicles = view.dataset.vehicles;
  if (!vehicles?.length) return null;
  const pads = view.dataset.stations.filter((s) => s.kind === "vehiclePad");
  if (!pads.length) return null;
  const previous = new Map<string, DirectorVehicleSample>();
  const at = Math.max(0, sampleIndexAt(vehicles, t - 5));
  const through = Math.min(t + 2, view.horizon);
  let best: { pad: DirectorVec3; vehicle: DirectorVehicleSample } | undefined;
  for (let i = at; i < vehicles.length; i++) {
    const vehicle = vehicles[i];
    if (vehicle.timeSec > through) break;
    const prior = previous.get(vehicle.key);
    previous.set(vehicle.key, vehicle);
    if (vehicle.timeSec < t - 2) continue;
    if (
      !prior ||
      vehicle.timeSec - prior.timeSec > 1.5 ||
      prior.passengers > 0 ||
      vehicle.passengers === 0
    )
      continue;
    for (const pad of pads) {
      if (dist(prior.pos, pad.pos) > 16 && dist(vehicle.pos, pad.pos) > 16)
        continue;
      if (
        !best ||
        Math.abs(vehicle.timeSec - t) < Math.abs(best.vehicle.timeSec - t)
      ) {
        best = { pad: pad.pos, vehicle };
      }
    }
  }
  if (!best) return null;
  const boarded = view
    .playersAt(best.vehicle.timeSec)
    .find((player) => player.vehicleId === best.vehicle.key);
  const rider = boarded && view.playerAt(boarded.targetId, t);
  return {
    ...best,
    rider:
      rider &&
      (rider.vehicleId === best.vehicle.key || dist(rider.pos, best.pad) <= 20)
        ? rider
        : undefined,
  };
}

/** Only show a verified impact when it threatens a player or a flag stand. */
export function importantImpact(view: CausalView, t: number) {
  const impacts = view.dataset.ordnanceImpacts ?? [];
  const through = Math.min(t + 2.5, view.horizon);
  for (let i = sampleIndexAt(impacts, through); i >= 0; i--) {
    const impact = impacts[i];
    if (impact.timeSec < t - 0.5) break;
    const stand = view.stands.find(
      (s) =>
        dist(impact.pos, s.pos) <= 22 &&
        view.flagAt(s.slot, impact.timeSec)?.status === "home",
    );
    const threatened =
      impact.teamId != null &&
      impact.teamId > 0 &&
      view
        .playersAt(impact.timeSec)
        .some(
          (player) =>
            player.teamId != null &&
            player.teamId !== impact.teamId &&
            dist(player.pos, impact.pos) <= 15,
        );
    if (stand || threatened) return { impact, stand };
  }
  return null;
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
):
  | ({
      center: DirectorVec3;
      spread: number;
    } & (
      | {
          kind: "transport";
          vehicle: DirectorVehicleSample["kind"];
          vehicleId: string;
          crew: number;
        }
      | { kind: "dogfight"; observations: number; velocity: DirectorVec3 }
      | { kind: "strafe"; observations: number }
    ))
  | null {
  const vehicles = dataset.vehicles ?? [];
  let beforeWindow = sampleIndexAt(vehicles, startSec);
  while (vehicles[beforeWindow]?.timeSec === startSec) beforeWindow--;
  const inWindow = vehicles.slice(
    beforeWindow + 1,
    sampleIndexAt(vehicles, endSec) + 1,
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
    const latest = samples[samples.length - 1];
    if (latest.timeSec < endSec - 1.5) continue;
    const crew = latest.passengers;
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
      vehicleId: transport.samples[0].key,
      crew: transport.crew,
    };
  }
  // Require recent travel while crewed before proximity counts as combat.
  const flying = new Set<string>();
  for (const samples of byKey.values()) {
    const latest = samples[samples.length - 1];
    if (
      (latest.kind === "shrike" || latest.kind === "bomber") &&
      latest.passengers > 0 &&
      latest.timeSec >= endSec - 1.5 &&
      samples.some(
        (sample) =>
          sample.passengers > 0 &&
          latest.timeSec - sample.timeSec <= 3 &&
          dist(sample.pos, latest.pos) >= 5,
      )
    )
      flying.add(latest.key);
  }
  const flyers = inWindow.filter((v) => v.passengers > 0 && flying.has(v.key));
  const pairs = new Map<
    string,
    { pos: DirectorVec3; timeSec: number; spread: number }[]
  >();
  const byTime = new Map<number, DirectorVehicleSample[]>();
  for (const flyer of flyers) {
    let at = byTime.get(flyer.timeSec);
    if (!at) byTime.set(flyer.timeSec, (at = []));
    for (const other of at) {
      if (
        flyer.teamId == null ||
        other.teamId == null ||
        flyer.teamId === other.teamId
      )
        continue;
      const spread = dist(flyer.pos, other.pos) / 2;
      if (spread > DIRECTOR_DOGFIGHT_RANGE / 2) continue;
      const key = JSON.stringify([flyer.key, other.key].sort());
      let moments = pairs.get(key);
      if (!moments) pairs.set(key, (moments = []));
      moments.push({
        pos: centroid([flyer.pos, other.pos]),
        timeSec: flyer.timeSec,
        spread,
      });
    }
    at.push(flyer);
  }
  const dogfight = [...pairs.values()]
    .filter(
      (moments) =>
        moments.length >= DIRECTOR_DOGFIGHT_MIN_MEETINGS &&
        moments[moments.length - 1].timeSec >= endSec - 1.5,
    )
    .sort((a, b) => b.length - a.length)[0];
  if (dogfight) {
    const latest = dogfight[dogfight.length - 1];
    const before = dogfight.find(
      (sample) => latest.timeSec - sample.timeSec <= 3,
    )!;
    const elapsed = latest.timeSec - before.timeSec;
    const velocity: DirectorVec3 =
      elapsed > 0
        ? (latest.pos.map(
            (value, axis) => (value - before.pos[axis]) / elapsed,
          ) as DirectorVec3)
        : [0, 0, 0];
    const lag = endSec - latest.timeSec;
    return {
      kind: "dogfight",
      center: latest.pos.map(
        (value, axis) => value + velocity[axis] * lag,
      ) as DirectorVec3,
      spread: latest.spread,
      observations: dogfight.length,
      velocity,
    };
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
    let observations = 0;
    let last:
      { center: DirectorVec3; spread: number; timeSec: number } | undefined;
    for (const v of samples) {
      const target = (playersAtSec.get(Math.round(v.timeSec)) ?? []).find(
        (p) =>
          p.timeSec <= v.timeSec &&
          v.teamId != null &&
          p.teamId != null &&
          p.teamId !== v.teamId &&
          !p.vehicleId &&
          dist(p.pos, v.pos) <= DIRECTOR_STRAFE_RANGE,
      );
      if (!target) continue;
      observations++;
      last = {
        center: centroid([v.pos, target.pos]),
        spread: dist(v.pos, target.pos) / 2,
        timeSec: v.timeSec,
      };
    }
    if (
      last &&
      last.timeSec >= endSec - 1.5 &&
      observations >= DIRECTOR_STRAFE_MIN_PASSES
    )
      return {
        kind: "strafe",
        center: last.center,
        spread: last.spread,
        observations,
      };
  }
  return null;
}
