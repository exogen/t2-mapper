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
  DirectorPlayerSample,
  DirectorVec3,
} from "./types";

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
    health?: number;
  }[]
>;

/**
 * One shared proximity index per SAMPLE ARRAY (several passes want it).
 *
 * Keyed on the array, not the dataset object: a streamed scan hands out
 * a fresh dataset object every slice over the same growing arrays, so
 * keying on the object missed every second and rebuilt the index from
 * zero. Indexing resumes where it left off.
 */
const _playersAtSecCache = new WeakMap<
  DirectorPlayerSample[],
  { index: PlayersAtSec; done: number }
>();

export function playersAtSecFor(dataset: DirectorDataset): PlayersAtSec {
  const samples = dataset.playerSamples;
  let cached = _playersAtSecCache.get(samples);
  if (!cached) {
    cached = { index: new Map(), done: 0 };
    _playersAtSecCache.set(samples, cached);
  }
  if (cached.done < samples.length) {
    indexPlayerSamples(samples, cached.done, cached.index);
    cached.done = samples.length;
  }
  return cached.index;
}

/**
 * Each player's samples in time order, shared and grown incrementally
 * like the per-second index. Three passes used to walk every sample of
 * every player to find one player's position.
 */
const _playerTracksCache = new WeakMap<
  DirectorPlayerSample[],
  { tracks: Map<number, DirectorPlayerSample[]>; done: number }
>();

export function playerTracksFor(
  dataset: DirectorDataset,
): Map<number, DirectorPlayerSample[]> {
  const samples = dataset.playerSamples;
  let cached = _playerTracksCache.get(samples);
  if (!cached) {
    cached = { tracks: new Map(), done: 0 };
    _playerTracksCache.set(samples, cached);
  }
  for (let i = cached.done; i < samples.length; i++) {
    const sample = samples[i];
    let list = cached.tracks.get(sample.targetId);
    if (!list) cached.tracks.set(sample.targetId, (list = []));
    list.push(sample);
  }
  cached.done = samples.length;
  return cached.tracks;
}

/** The player's sample nearest `timeSec`, within `withinSec` of it. */
export function playerSampleAt(
  dataset: DirectorDataset,
  targetId: number,
  timeSec: number,
  withinSec = 3,
): DirectorPlayerSample | null {
  const samples = playerTracksFor(dataset).get(targetId);
  if (!samples || samples.length === 0) return null;
  // Last sample at or before the time, then the one after if closer.
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (samples[mid].timeSec <= timeSec) lo = mid;
    else hi = mid - 1;
  }
  let best = samples[lo];
  const next = samples[lo + 1];
  if (
    next &&
    Math.abs(next.timeSec - timeSec) < Math.abs(best.timeSec - timeSec)
  ) {
    best = next;
  }
  return Math.abs(best.timeSec - timeSec) <= withinSec ? best : null;
}

function indexPlayerSamples(
  samples: DirectorPlayerSample[],
  from: number,
  playersAtSec: PlayersAtSec,
): void {
  for (let i = from; i < samples.length; i++) {
    const sample = samples[i];
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
      health: sample.health,
    });
  }
}

export interface FlagTrack {
  slot: number;
  samples: DirectorFlagSample[];
  /** Times where the status transitions into "held" (grabs). */
  grabTimes: number[];
  /** Runs where the flag is away from its stand, with cap outcome. */
  outPeriods: { startSec: number; endSec: number; endsInCap: boolean }[];
}

/**
 * Flag tracks, shared across the passes that read them.
 *
 * Keyed on the sample array (see playersAtSecFor for why not the
 * dataset object) and rebuilt only when samples or events have been
 * added — the view, staging, the audit and the scene pass each built
 * their own copy on every streamed slice.
 */
const _flagTracksCache = new WeakMap<
  DirectorFlagSample[],
  {
    tracks: Map<number, FlagTrack>;
    samples: number;
    events: number;
    teams: number;
  }
>();

export function buildFlagTracks(
  dataset: DirectorDataset,
): Map<number, FlagTrack> {
  const cached = _flagTracksCache.get(dataset.flagSamples);
  if (
    cached &&
    cached.samples === dataset.flagSamples.length &&
    cached.events === dataset.events.length &&
    cached.teams === dataset.teams.length
  ) {
    return cached.tracks;
  }
  const tracks = computeFlagTracks(dataset);
  _flagTracksCache.set(dataset.flagSamples, {
    tracks,
    samples: dataset.flagSamples.length,
    events: dataset.events.length,
    teams: dataset.teams.length,
  });
  return tracks;
}

function computeFlagTracks(dataset: DirectorDataset): Map<number, FlagTrack> {
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

/**
 * The ONE name a player is called on air — in shot reasons and in the
 * scene alike. An official (control-code-delimited) tag lets us speak
 * the base name confidently; otherwise the display name, then the raw
 * one. Two resolvers used to disagree, and "TF_Irvin" and "Irvin"
 * named the same person in one payload.
 */
export function playerName(
  targetId: number | null,
  dataset: DirectorDataset,
  atSec?: number,
): string | null {
  if (targetId == null) return null;
  const entry = identityAt(targetId, dataset, atSec);
  if (!entry) return null;
  return spokenName(entry.baseName ?? entry.displayName ?? entry.name);
}

/** Samples are a second apart, and a message can precede the first
 *  sample of the player it names — a beat of slack either side. */
const IDENTITY_SLACK_SEC = 1.5;

/**
 * Who wore this target id at `atSec` — target ids are recycled, so
 * the same number can be two people over one recording. Without a
 * time, the latest wearer. Null when nobody has.
 */
export function identityAt(
  targetId: number,
  dataset: DirectorDataset,
  atSec?: number,
): DirectorDataset["playerNames"][number] | null {
  let best: DirectorDataset["playerNames"][number] | null = null;
  for (const entry of dataset.playerNames) {
    if (entry.targetId !== targetId) continue;
    const from = entry.fromSec ?? 0;
    if (atSec != null && from > atSec + IDENTITY_SLACK_SEC) continue;
    if (!best || from >= (best.fromSec ?? 0)) best = entry;
  }
  return best;
}

/**
 * The target id a name referred to at `atSec`: a message names whoever
 * the player was at the time, and players rename mid-match on some
 * servers, so every name a player has had counts. The latest wearer
 * wins a clash.
 */
export function targetIdForName(
  name: string,
  dataset: DirectorDataset,
  atSec?: number,
): number | null {
  const key = name.toLowerCase();
  let best: DirectorDataset["playerNames"][number] | null = null;
  for (const entry of dataset.playerNames) {
    if (entry.name !== key && !entry.aliases?.includes(key)) continue;
    if (atSec != null) {
      if ((entry.fromSec ?? 0) > atSec + IDENTITY_SLACK_SEC) continue;
      if (entry.toSec != null && entry.toSec < atSec - IDENTITY_SLACK_SEC) {
        continue;
      }
    }
    if (!best || (entry.fromSec ?? 0) >= (best.fromSec ?? 0)) best = entry;
  }
  return best?.targetId ?? null;
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

/**
 * Player name → spoken form. Pipes and underscores are word breaks
 * ("AUTOTAUNT|Cannon" is two words, "The_D_e_V_i_L" is "The DeViL");
 * single-letter runs are joined ("d K" style spacing); decoration is
 * stripped from the edges.
 */
export function spokenName(name: string): string {
  const spaced = name.replace(/[|_]+/g, " ").replace(/\s+/g, " ").trim();
  const joined = spaced.replace(
    /(^|\s)((?:\S ){2,}\S)(?=\s|$)/g,
    (_m, pre: string, run: string) => pre + run.replace(/ /g, ""),
  );
  const stripped = joined.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  return stripped.length > 0 ? stripped : name;
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
