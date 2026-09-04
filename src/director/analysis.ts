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
  DIRECTOR_TRANSPORT_MIN_CREW,
  DIRECTOR_TRANSPORT_MIN_TRAVEL,
} from "./tunables";
import { boundingSpread, centroid, dist } from "./geometry";
import type { PlayersAtSec } from "./dataset";

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
