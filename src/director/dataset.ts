/**
 * Derived views over a scanned DirectorDataset: per-second player
 * buckets, per-flag possession tracks, and the small queries the
 * planning rules ask of them ("how fast is this flag moving?", "where
 * did it settle?").
 *
 * Everything here is a pure function of the dataset, memoized per
 * dataset object where the derivation is expensive.
 */
import type {
  DirectorDataset,
  DirectorEvent,
  DirectorFlagSample,
  DirectorVec3,
} from "./types";
import {
  DIRECTOR_CROWD_MAX_ABSOLUTE,
  DIRECTOR_CROWD_MIN_ABSOLUTE,
  DIRECTOR_CROWD_PERCENTILE,
  DIRECTOR_CROWD_RADIUS,
} from "./tunables";
import { boundingSpread, dist } from "./geometry";

/** Player positions bucketed to whole seconds, for proximity queries. */
export type PlayersAtSec = Map<
  number,
  {
    targetId: number;
    teamId: number | null;
    pos: DirectorVec3;
    heading?: number;
    armor?: "light" | "medium" | "heavy";
    pack?: string;
  }[]
>;

/** One shared proximity index per dataset (several passes want it). */
const _playersAtSecCache = new WeakMap<DirectorDataset, PlayersAtSec>();

export function playersAtSecFor(dataset: DirectorDataset): PlayersAtSec {
  let cached = _playersAtSecCache.get(dataset);
  if (!cached) {
    cached = buildPlayersAtSec(dataset);
    _playersAtSecCache.set(dataset, cached);
  }
  return cached;
}

export function buildPlayersAtSec(dataset: DirectorDataset): PlayersAtSec {
  const playersAtSec: PlayersAtSec = new Map();
  for (const sample of dataset.playerSamples) {
    const sec = Math.round(sample.timeSec);
    let list = playersAtSec.get(sec);
    if (!list) playersAtSec.set(sec, (list = []));
    list.push({
      targetId: sample.targetId,
      teamId: sample.teamId,
      pos: sample.pos,
      heading: sample.heading,
      armor: sample.armor,
      pack: sample.pack,
    });
  }
  return playersAtSec;
}

/**
 * The nearby-player count that counts as "crowded" for this match:
 * a high percentile of how many players are actually near the flags
 * across the whole recording (see DIRECTOR_CROWD_PERCENTILE).
 */
export function crowdThreshold(
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): number {
  const counts: number[] = [];
  for (const sample of dataset.flagSamples) {
    if (Math.round(sample.timeSec * 2) % 2 !== 0) continue;
    const players = playersAtSec.get(Math.round(sample.timeSec)) ?? [];
    let near = 0;
    for (const p of players) {
      if (dist(p.pos, sample.pos) <= DIRECTOR_CROWD_RADIUS) near++;
    }
    counts.push(near);
  }
  if (counts.length === 0) return DIRECTOR_CROWD_MIN_ABSOLUTE;
  counts.sort((a, b) => a - b);
  const percentile =
    counts[
      Math.min(
        counts.length - 1,
        Math.floor(counts.length * DIRECTOR_CROWD_PERCENTILE),
      )
    ];
  return Math.min(
    DIRECTOR_CROWD_MAX_ABSOLUTE,
    Math.max(DIRECTOR_CROWD_MIN_ABSOLUTE, percentile),
  );
}

export interface FlagTrack {
  slot: number;
  samples: DirectorFlagSample[];
  /** Times where the status transitions into "held" (grabs). */
  grabTimes: number[];
  /** Runs where the flag is away from its stand, with cap outcome. */
  outPeriods: { startSec: number; endSec: number; endsInCap: boolean }[];
}

/** Whether this flag's current possession caps within `windowSec`. */
export function capWithin(
  track: FlagTrack,
  t: number,
  windowSec: number,
): boolean {
  return track.outPeriods.some(
    (p) => p.endsInCap && t >= p.endSec - windowSec && t <= p.endSec,
  );
}

export function buildFlagTracks(
  dataset: DirectorDataset,
): Map<number, FlagTrack> {
  const bySlot = new Map<number, DirectorFlagSample[]>();
  for (const sample of dataset.flagSamples) {
    let list = bySlot.get(sample.slot);
    if (!list) bySlot.set(sample.slot, (list = []));
    list.push(sample);
  }
  const capTimes = new Map<number, number[]>();
  for (const event of dataset.events) {
    if (event.type !== "flag-cap") continue;
    const slot = eventFlagSlot(event, dataset);
    if (slot == null) continue;
    let list = capTimes.get(slot);
    if (!list) capTimes.set(slot, (list = []));
    list.push(event.timeSec);
  }
  const grabEvents = new Map<number, number[]>();
  for (const event of dataset.events) {
    if (event.type !== "flag-grab") continue;
    const slot = eventFlagSlot(event, dataset);
    if (slot == null) continue;
    let list = grabEvents.get(slot);
    if (!list) grabEvents.set(slot, (list = []));
    list.push(event.timeSec);
  }
  const tracks = new Map<number, FlagTrack>();
  for (const [slot, samples] of bySlot) {
    const grabTimes: number[] = [];
    const outPeriods: FlagTrack["outPeriods"] = [];
    let outStart: number | null = null;
    for (let i = 0; i < samples.length; i++) {
      const status = samples[i].status;
      const prev = i > 0 ? samples[i - 1].status : "home";
      if (status === "held" && prev !== "held") {
        grabTimes.push(samples[i].timeSec);
      }
      if (status !== "home" && outStart == null) {
        outStart = samples[i].timeSec;
      } else if (status === "home" && outStart != null) {
        const endSec = samples[i].timeSec;
        const endsInCap = (capTimes.get(slot) ?? []).some(
          (t) => Math.abs(t - endSec) <= 2,
        );
        outPeriods.push({ startSec: outStart, endSec, endsInCap });
        outStart = null;
      }
    }
    if (outStart != null) {
      const endSec = samples[samples.length - 1].timeSec;
      const endsInCap = (capTimes.get(slot) ?? []).some(
        (t) => Math.abs(t - endSec) <= 2,
      );
      outPeriods.push({ startSec: outStart, endSec, endsInCap });
    }
    // Merge event-reported grabs: an instant grab-and-drop (carrier died
    // on the flag) never shows a "held" sample, so track transitions
    // alone would miss it — anticipation still wants the camera there.
    const merged = [...grabTimes, ...(grabEvents.get(slot) ?? [])].sort(
      (a, b) => a - b,
    );
    const deduped: number[] = [];
    for (const t of merged) {
      if (deduped.length === 0 || t - deduped[deduped.length - 1] > 1.5) {
        deduped.push(t);
      }
    }
    tracks.set(slot, { slot, samples, grabTimes: deduped, outPeriods });
  }
  return tracks;
}

/** Resolve an event's flag slot via its team name (teamless → slot 1). */
export function eventFlagSlot(
  event: DirectorEvent,
  dataset: DirectorDataset,
): number | null {
  if (event.flagTeamName) {
    const name = event.flagTeamName.toLowerCase();
    const team = dataset.teams.find((t) => t.name.toLowerCase() === name);
    if (team) return team.teamId;
  }
  const teamless = dataset.flagStands.filter((s) => s.teamId == null);
  if (teamless.length === 1 && dataset.flagStands.length === 1) {
    return teamless[0].slot;
  }
  return null;
}

/** Binary-search the last sample at or before `timeSec`. */
export function sampleAt(
  samples: DirectorFlagSample[],
  timeSec: number,
): DirectorFlagSample | null {
  let lo = 0;
  let hi = samples.length - 1;
  if (hi < 0 || samples[0].timeSec > timeSec) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].timeSec <= timeSec) lo = mid;
    else hi = mid - 1;
  }
  return samples[lo];
}

export function flagLabel(slot: number, dataset: DirectorDataset): string {
  const stand = dataset.flagStands.find((s) => s.slot === slot);
  return stand?.name ? `${stand.name} flag` : `flag ${slot}`;
}

export function playerName(
  targetId: number | null,
  dataset: DirectorDataset,
): string | null {
  if (targetId == null) return null;
  const entry = dataset.playerNames.find((p) => p.targetId === targetId);
  if (!entry) return null;
  return spokenName(entry.displayName ?? entry.name);
}

/**
 * A display name normalized FOR COMMENTARY ONLY (matching always uses
 * target ids or the exact name string): gamer-tag decorations are
 * shorn from the edges ("--Gunther--" → "Gunther", "|HP|" → "HP"),
 * and runs of three-plus single spaced-out characters are joined
 * ("B i s h" → "Bish", "s l u s h" → "slush"). Falls back to the
 * original when stripping would erase it.
 */
/**
 * A mission name normalized FOR SPEECH: community release prefixes
 * (S5/S8/TWL/TWL2/DMP/DMP2) and suffixes (_nef, LT) are packaging, not
 * the map's name — "S5_Woodymyrk" is spoken "Woodymyrk",
 * "Raindance_nef" is "Raindance", "DangerousCrossingLT" is
 * "DangerousCrossing". Display only; matching always uses the exact
 * mission name.
 */
export function spokenMapName(name: string): string {
  let out = name;
  out = out.replace(/^(?:S5|S8|TWL2?|DMP2?)[-_ ]+/i, "");
  out = out.replace(/[-_ ]nef$/i, "");
  // "LT" only when it reads as an appended marker (after a lowercase
  // letter, digit, or separator) — never the tail of an all-caps name.
  out = out.replace(/(?<=[a-z0-9])LT$/, "").replace(/[-_ ]LT$/i, "");
  out = out.replace(/_/g, " ").trim();
  return out.length > 0 ? out : name;
}

export function spokenName(name: string): string {
  const joined = name.replace(
    /(^|\s)((?:\S ){2,}\S)(?=\s|$)/g,
    (_m, pre: string, run: string) => pre + run.replace(/ /g, ""),
  );
  const stripped = joined.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return stripped.length > 0 ? stripped : name;
}

/** Average speed of a flag over a window, from its own samples. */
export function flagSpeed(
  startSec: number,
  endSec: number,
  track: FlagTrack,
): number | null {
  const samples = track.samples.filter(
    (x) => x.timeSec >= startSec && x.timeSec < endSec,
  );
  if (samples.length < 2) return null;
  let travelled = 0;
  for (let i = 1; i < samples.length; i++) {
    travelled += dist(samples[i - 1].pos, samples[i].pos);
  }
  const span = samples[samples.length - 1].timeSec - samples[0].timeSec;
  return span > 0 ? travelled / span : null;
}

/** Length of the contiguous "held" stretch containing `t`, or 0. */
export function heldRunLength(track: FlagTrack, t: number): number {
  const samples = track.samples;
  let i = samples.findIndex((s) => s.timeSec > t) - 1;
  if (i < 0) i = samples.length - 1;
  if (i < 0 || samples[i].status !== "held") return 0;
  let lo = i;
  while (lo > 0 && samples[lo - 1].status === "held") lo--;
  let hi = i;
  while (hi < samples.length - 1 && samples[hi + 1].status === "held") hi++;
  return samples[hi].timeSec - samples[lo].timeSec;
}

/**
 * Where a dropped flag comes to REST. Flags are physics objects: after
 * a drop they keep falling and sliding, measurably 30–120u downhill on
 * steep maps, so the position right after the drop is the wrong thing
 * to frame. Takes the median of the run's last third, by which point
 * the flag has settled (and which ignores a final bounce or pickup).
 */
export function settledPos(
  run: { startSec: number; endSec: number },
  track: FlagTrack,
): DirectorVec3 | null {
  const positions = track.samples
    .filter((s) => s.timeSec >= run.startSec && s.timeSec < run.endSec)
    .map((s) => s.pos);
  if (positions.length === 0) return null;
  const tail = positions.slice(Math.floor((positions.length * 2) / 3));
  const pick = (axis: 0 | 1 | 2) => {
    const values = tail.map((p) => p[axis]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  };
  return [pick(0), pick(1), pick(2)];
}

/**
 * How far a flag ranges over a window, and the centre of that range —
 * the test for whether a fixed camera can cover this stretch of a
 * carry (a carrier crossing the map cannot be framed from one spot,
 * but one pinned in a base can).
 */
export function flagPathSpread(
  startSec: number,
  endSec: number,
  track: FlagTrack,
  playersAtSec?: PlayersAtSec,
): { center: DirectorVec3; spread: number } | null {
  const positions = track.samples
    .filter((s) => s.timeSec >= startSec && s.timeSec < endSec)
    .map((s) => s.pos);
  if (positions.length === 0) return null;
  const { center, spread: baseSpread } = boundingSpread(positions);
  let spread = baseSpread;
  // A tight follow frames the carrier AND the nearest defender, not the
  // carrier alone — the contest is the shot. Widen enough to keep the
  // closest opponent in it.
  if (playersAtSec) {
    for (let sec = Math.ceil(startSec); sec < endSec; sec++) {
      let nearest = Infinity;
      for (const p of playersAtSec.get(sec) ?? []) {
        nearest = Math.min(nearest, dist(p.pos, center));
      }
      if (Number.isFinite(nearest)) spread = Math.max(spread, nearest);
    }
  }
  return { center, spread };
}

/**
 * Where a flag carrier is HEADED: their own team's stand, which is the
 * other flag's stand in stock CTF (you carry the enemy flag home). Used
 * as the aim target so a chase frames the run's destination — and the
 * defenders between them and it — rather than whatever is underfoot.
 */
export function carryDestination(
  slot: number,
  dataset: DirectorDataset,
): DirectorVec3 | null {
  const own = dataset.flagStands.find((s) => s.slot !== slot);
  return own?.pos ?? null;
}

/**
 * Whether a flag stays within `holdRadius` of one point for a window —
 * the same stay-put test for flag-anchored fixed cameras.
 */
export function flagStaysNear(
  startSec: number,
  endSec: number,
  track: FlagTrack,
  center: DirectorVec3,
  holdRadius: number,
): boolean {
  const positions = track.samples
    .filter((s) => s.timeSec >= startSec && s.timeSec < endSec)
    .map((s) => s.pos);
  return (
    positions.length > 0 &&
    positions.every((p) => dist(p, center) <= holdRadius)
  );
}
