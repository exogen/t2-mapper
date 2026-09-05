/**
 * The commentary layer: a structured, factual description of what each
 * shot shows, computed as the planner's final pass with the same full
 * knowledge the shot selection had. The consumer is an LLM commentator
 * — the facts live here, the color lives there. Anything the scan can
 * only know because it read the future is quarantined under `future`,
 * so a live-style commentator can ignore it and never spoil a result.
 */
import type {
  DirectorDataset,
  DirectorVec3,
  FramePosition,
  SceneChatter,
  SceneEvent,
  SceneFlagState,
  ScenePlayer,
  SceneTopic,
  Shot,
  ShotPlan,
  ShotScene,
} from "./types";
import { dist } from "./geometry";
import { shotSubjectOf } from "./shotPath";
import { liquidLabel, submergedWaterAt } from "../collision/waterLevel";
import {
  buildFlagTracks,
  flagLabel,
  playersAtSecFor,
  identityAt,
  playerName,
  sampleAt,
  spokenName,
  type FlagTrack,
  type PlayersAtSec,
  playerSampleAt,
} from "./dataset";

// The scene type shapes live in types.ts (the leaf of the director's
// dependency DAG — Shot carries a ShotScene, so defining them here
// would make the graph circular); re-exported for existing importers.
export type {
  FramePosition,
  SceneEvent,
  SceneFlagState,
  ScenePlayer,
  SceneTopic,
  ShotScene,
} from "./types";

/** Kills further than this from the shot are not called (unless a
 *  carrier is involved) — the viewer cannot see them. */
const SCENE_KILL_RANGE = 100;
/** Players further than this from the CAMERA are announced only when
 *  nobody closer is on screen. */
const SCENE_PLAYER_CAM_RANGE = 100;
/** A teamkill this close to the enemy flag is a disaster worth calling
 *  wherever the camera is — the victim was moments from a grab. */
const TEAMKILL_FLAG_RANGE = 12;
/** A kill this close to a flag stand is stand defence or a stand
 *  clear, not a random duel. */
const KILL_STAND_RANGE = 40;
/** Hardware players place themselves. It comes and goes by the dozen,
 *  so it is reported as a raid, never piece by piece. */
const DEPLOYABLE_NAMES = new Set([
  "spider clamp turret",
  "land spike turret",
  "motion sensor",
  "pulse sensor",
  "deployable inventory",
]);
/** A raid of this many deployables is worth a line on its own. */
const RAID_NOTABLE_COUNT = 3;
/** A raid is judged over this trailing window, not over one shot:
 *  shots run five to ten seconds, and a farm being stripped one clamp
 *  per shot is one raid, not ten small ones. */
const RAID_WINDOW_SEC = 30;
/** Window for "recent" captures, the match's momentum. */
const RECENT_CAPS_WINDOW_SEC = 300;
/** Sampling cadence for the flag timeline, and how often to refresh a
 *  moving flag's distances while nothing else has changed. */
const FLAG_TIMELINE_STEP_SEC = 0.5;
const FLAG_TIMELINE_MOVING_SEC = 2;

/** Assumed horizontal FOV for framing labels (Tribes plays ~110°). */
const FRAME_HALF_FOV_RAD = (110 / 2) * (Math.PI / 180);
const FRAME_CENTER_BAND_RAD = (18 * Math.PI) / 180;

/** Planned camera estimate: position + horizontal forward, Torque x/y. */
interface CameraEstimate {
  pos: [number, number];
  forward: [number, number];
  /** Horizontal distance to the shot's anchor (depth reference). */
  anchorDist: number;
}

function estimateCamera(
  shot: Shot,
  anchor: DirectorVec3,
  dataset: DirectorDataset,
  midSec: number,
): CameraEstimate | null {
  const make = (
    pos: [number, number],
    lookAt: [number, number],
  ): CameraEstimate | null => {
    const fx = lookAt[0] - pos[0];
    const fy = lookAt[1] - pos[1];
    const len = Math.hypot(fx, fy);
    if (len < 1e-3) return null;
    return { pos, forward: [fx / len, fy / len], anchorDist: len };
  };
  switch (shot.kind) {
    case "fixedOrbit": {
      // The SOLVED placement when staging has run: the rig flies
      // `staged`, and a description of the planned bearing would put the
      // camera somewhere it never went.
      const angle = shot.staged?.angle ?? shot.startAngle;
      if (angle == null) return null;
      // fixedOrbit convention: camera offset (sin θ, cos θ)·r in Torque.
      const r = shot.staged?.radius ?? shot.radius;
      const center = shot.staged?.anchor ?? shot.center;
      return make(
        [center[0] + Math.sin(angle) * r, center[1] + Math.cos(angle) * r],
        [center[0], center[1]],
      );
    }
    case "sweep": {
      return make(
        [(shot.from[0] + shot.to[0]) / 2, (shot.from[1] + shot.to[1]) / 2],
        [shot.target[0], shot.target[1]],
      );
    }
    case "followFlag":
    case "followPlayer": {
      // The aim decides the yaw the camera FACES (orbit convention);
      // the camera sits pulled back behind that facing.
      let yaw: number | null = null;
      const aim = shot.aim;
      if (aim?.mode === "hold") yaw = aim.yaw;
      else if (aim?.mode === "toward") {
        yaw = Math.atan2(aim.target[0] - anchor[0], aim.target[1] - anchor[1]);
      } else {
        const heading = headingOf(shot, anchor, dataset, midSec);
        if (heading != null) {
          yaw = aim?.mode === "backward" ? heading + Math.PI : heading;
        }
      }
      if (yaw == null) return null;
      const distance = shot.distance ?? 20;
      return make(
        [
          anchor[0] - Math.sin(yaw) * distance,
          anchor[1] - Math.cos(yaw) * distance,
        ],
        [anchor[0], anchor[1]],
      );
    }
    case "dolly": {
      const heading = headingOf(shot, anchor, dataset, midSec);
      if (heading == null) return null;
      const angle = heading + Math.PI + (shot.side ?? 1) * 0.6;
      const distance = shot.distance ?? 24;
      return make(
        [
          anchor[0] + Math.sin(angle) * distance,
          anchor[1] + Math.cos(angle) * distance,
        ],
        [anchor[0], anchor[1]],
      );
    }
  }
}

/** The subject's travel heading near midSec, in the orbit-yaw
 *  convention, from the sampled positions either side of it. */
function headingOf(
  shot: Shot,
  anchor: DirectorVec3,
  dataset: DirectorDataset,
  midSec: number,
): number | null {
  const targetId =
    shot.kind === "followPlayer"
      ? shot.targetId
      : shot.kind === "dolly" && shot.subject.type === "player"
        ? shot.subject.targetId
        : null;
  if (targetId != null) {
    const before = playerPosAt(targetId, midSec - 1.5, dataset);
    if (before) {
      const dx = anchor[0] - before[0];
      const dy = anchor[1] - before[1];
      if (Math.hypot(dx, dy) > 2) return Math.atan2(dx, dy);
    }
    return null;
  }
  // Flag subjects: heading from the flag's own track around midSec.
  const slot =
    shot.kind === "followFlag"
      ? shot.slot
      : shot.kind === "dolly" && shot.subject.type === "flag"
        ? shot.subject.slot
        : null;
  if (slot == null) return null;
  const samples = dataset.flagSamples.filter(
    (f) => f.slot === slot && Math.abs(f.timeSec - midSec) <= 2,
  );
  if (samples.length < 2) return null;
  const first = samples[0].pos;
  const last = samples[samples.length - 1].pos;
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  return Math.hypot(dx, dy) > 2 ? Math.atan2(dx, dy) : null;
}

function frameOf(camera: CameraEstimate, pos: DirectorVec3): FramePosition {
  const vx = pos[0] - camera.pos[0];
  const vy = pos[1] - camera.pos[1];
  const [fx, fy] = camera.forward;
  const along = vx * fx + vy * fy;
  // Screen right for a Torque x/y camera facing (fx, fy), up = +z.
  const lateral = vx * fy - vy * fx;
  if (along <= 0) return "offscreen";
  const angle = Math.atan2(Math.abs(lateral), along);
  if (angle > FRAME_HALF_FOV_RAD) return "offscreen";
  const side =
    angle <= FRAME_CENTER_BAND_RAD ? "center" : lateral > 0 ? "right" : "left";
  const depthRatio = along / Math.max(1, camera.anchorDist);
  const depth = depthRatio < 0.7 ? "front" : depthRatio > 1.3 ? "back" : "mid";
  return `${depth} ${side}` as FramePosition;
}

/** Which liquid, if any, a Torque-space point is sitting in. */
function liquidAt(
  pos: DirectorVec3,
): "water" | "lava" | "quicksand" | undefined {
  const info = submergedWaterAt(pos[0], pos[1], pos[2]);
  return info ? liquidLabel(info.liquidType) : undefined;
}

/** Distances are approximate on purpose ("~80 meters") — a booth
 *  saying "413 meters" reads as a computer talking. */
function approxMeters(range: number): string {
  return `~${Math.round(range / 10) * 10} meters`;
}

const BEARINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

function compass(from: DirectorVec3, to: DirectorVec3): ScenePlayer["bearing"] {
  const angle = Math.atan2(to[0] - from[0], to[1] - from[1]);
  const index = Math.round((angle / (Math.PI * 2)) * 8 + 8) % 8;
  return BEARINGS[index];
}

/** The anchor a shot's scene is described around. */
function shotAnchor(
  shot: Shot,
  tracks: Map<number, FlagTrack>,
  dataset: DirectorDataset,
  atSec: number,
): DirectorVec3 | null {
  switch (shot.kind) {
    case "fixedOrbit":
      return shot.staged?.anchor ?? shot.center;
    case "sweep":
      return shot.target;
    case "followFlag":
      return sampleAt(tracks.get(shot.slot)?.samples ?? [], atSec)?.pos ?? null;
    case "dolly":
      if (shot.subject.type === "flag") {
        return (
          sampleAt(tracks.get(shot.subject.slot)?.samples ?? [], atSec)?.pos ??
          null
        );
      }
      return playerPosAt(shot.subject.targetId, atSec, dataset);
    case "followPlayer":
      return playerPosAt(shot.targetId, atSec, dataset);
  }
}

function playerPosAt(
  targetId: number,
  atSec: number,
  dataset: DirectorDataset,
): DirectorVec3 | null {
  return playerSampleAt(dataset, targetId, atSec)?.pos ?? null;
}

function teamOfAt(
  targetId: number | null,
  atSec: number,
  playersAtSec: PlayersAtSec,
): number | null {
  if (targetId == null) return null;
  const sec = Math.round(atSec);
  for (const dt of [0, -1, 1, -2, 2, -3, 3]) {
    const team = playersAtSec
      .get(sec + dt)
      ?.find((p) => p.targetId === targetId)?.teamId;
    if (team != null) return team;
  }
  return null;
}

function identityOf(
  targetId: number,
  dataset: DirectorDataset,
  atSec?: number,
) {
  return identityAt(targetId, dataset, atSec) ?? undefined;
}

/** The one spoken name (see playerName), with a stand-in for a player
 *  the dataset cannot name. */
function displayName(
  targetId: number | null,
  dataset: DirectorDataset,
  atSec?: number,
): string {
  if (targetId == null) return "someone";
  return playerName(targetId, dataset, atSec) ?? `player ${targetId}`;
}

/**
 * Chat messages name players with whatever decoration the client sent
 * — "^i^Irvin", "sf.SterIO", "yeaunome[nif", and sometimes the bare
 * "Irvin" for the same person in a different message. The roster knows
 * the real split (official clan tag vs base name), so resolve a chat
 * spelling back to the ONE canonical name `displayName` already gives
 * scene players. Without this, `actors` and `players` disagree about
 * who somebody is, and a consumer has no way to connect them.
 *
 * Matching ignores punctuation and case, and tries the tag on either
 * side of the name, because clients place it both ways.
 */
function makeActorResolver(
  dataset: DirectorDataset,
): (raw: string | undefined) => string | undefined {
  const key = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
  const canonical = new Map<string, string>();
  for (const entry of dataset.playerNames ?? []) {
    const base = spokenName(entry.baseName ?? entry.displayName ?? entry.name);
    if (!base) continue;
    const tag = entry.clan ? spokenName(entry.clan) : "";
    for (const variant of [
      entry.name,
      entry.displayName,
      entry.baseName,
      base,
      tag && `${tag}${base}`,
      tag && `${base}${tag}`,
    ]) {
      if (variant) canonical.set(key(variant), base);
    }
  }
  return (raw) =>
    raw == null ? undefined : (canonical.get(key(raw)) ?? spokenName(raw));
}

function teamName(
  teamId: number | null,
  dataset: DirectorDataset,
): string | null {
  if (teamId == null) return null;
  return dataset.teams.find((t) => t.teamId === teamId)?.name ?? null;
}

/** Within this of an inventory station counts as using it. */
const SUIT_RANGE = 8;

/**
 * Per-target times at an inventory station, plus deaths — the booth
 * may only read loadout tells (armor/pack) for players who have
 * ACTUALLY suited up since their last spawn: pre-match and fresh
 * spawns are forced loadouts that say nothing about intent.
 */
/**
 * "Did this player suit up before that moment?"
 *
 * Built INCREMENTALLY. It walks every player sample against every
 * inventory station — a million distance checks on a long match — and a
 * cast planned as it plays asks for it each time a shot closes.
 * Rebuilding it every time was 4.8 of the 5.3 seconds `describeScenes`
 * spent, and the largest single cost in planning a whole cast.
 *
 * The trackers' arrays only ever grow, and the same array object comes
 * back each tick, so the work already done is still good. A station
 * appearing (someone deploying an inventory) does invalidate it: a
 * sample already dismissed might be beside the new one. That is rare,
 * so it simply starts again.
 */
interface SuitIndex {
  suitTimes: Map<number, number[]>;
  deathTimes: Map<number, number[]>;
  samplesDone: number;
  deathsDone: number;
  stationCount: number;
}
const suitIndexes = new WeakMap<object, SuitIndex>();

function buildSuitIndex(dataset: DirectorDataset) {
  const stations = dataset.stations.filter((s) => s.kind === "inventory");
  let idx = suitIndexes.get(dataset.playerSamples);
  if (!idx || idx.stationCount !== stations.length) {
    idx = {
      suitTimes: new Map(),
      deathTimes: new Map(),
      samplesDone: 0,
      deathsDone: 0,
      stationCount: stations.length,
    };
    suitIndexes.set(dataset.playerSamples, idx);
  }
  const { suitTimes, deathTimes } = idx;
  for (let i = idx.samplesDone; i < dataset.playerSamples.length; i++) {
    const p = dataset.playerSamples[i];
    for (const st of stations) {
      if (dist(p.pos, st.pos) <= SUIT_RANGE) {
        let list = suitTimes.get(p.targetId);
        if (!list) suitTimes.set(p.targetId, (list = []));
        list.push(p.timeSec);
        break;
      }
    }
  }
  idx.samplesDone = dataset.playerSamples.length;
  for (let i = idx.deathsDone; i < dataset.deaths.length; i++) {
    const d = dataset.deaths[i];
    let list = deathTimes.get(d.targetId);
    if (!list) deathTimes.set(d.targetId, (list = []));
    list.push(d.timeSec);
  }
  idx.deathsDone = dataset.deaths.length;
  return (targetId: number, atSec: number): boolean => {
    let lastDeath = -1;
    for (const t of deathTimes.get(targetId) ?? []) {
      if (t < atSec && t > lastDeath) lastDeath = t;
    }
    return (suitTimes.get(targetId) ?? []).some(
      (t) => t > lastDeath && t <= atSec,
    );
  };
}

/** How wide a net to cast for "in this scene". */
/**
 * Ensure the shot's own subject is in `players`, flagged.
 *
 * `describePlayers` collects whoever stands near the anchor, which
 * misses the subject in two ways: they can be outside the radius, and
 * on a follow shot the anchor is the subject's own position — so if
 * that sample is missing there is no anchor, no radius, and nobody
 * described at all. Measured: 9 follow shots on one demo showed a named
 * player or flag carrier and reported an empty scene, with 34-41
 * players alive at the time.
 */
function markFocus(
  shot: Shot,
  players: ScenePlayer[],
  midSec: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
  tracks: Map<number, FlagTrack>,
): void {
  // The rig's subject first, then the shot's own say-so: a pick-up's
  // camera is placed on a position, not on a tracked player, so without
  // `subject` its scene named nobody and the booth guessed from whoever
  // was first in frame.
  const subject = shotSubjectOf(shot) ?? shot.subject ?? null;
  if (!subject) return;
  const targetId =
    subject.type === "player"
      ? subject.targetId
      : (sampleAt(tracks.get(subject.slot)?.samples ?? [], midSec)
          ?.carrierTargetId ?? null);
  if (targetId == null) return;
  const already = players.find((p) => p.targetId === targetId);
  if (already) {
    already.focus = true;
    return;
  }
  // Not in range, or not sampled at this instant: still name them. The
  // position-derived fields are left at zero rather than guessed —
  // `focus` says this is the subject, and `dist` is meaningless when
  // the anchor IS them.
  const identity = identityOf(targetId, dataset, midSec);
  players.unshift({
    name: displayName(targetId, dataset, midSec),
    targetId,
    team: teamName(teamOfAt(targetId, midSec, playersAtSec), dataset),
    skin: identity?.skin,
    clan: identity?.clan,
    focus: true,
    dist: 0,
    bearing: "N",
  });
}

/** A player closing on the enemy stand this fast, and this few
 *  seconds from it at that speed, is making a run at it. 60 kph is
 *  well above a walk; twelve seconds is about as far ahead as a line
 *  of commentary needs to see — "building speed across midfield" is
 *  five or six seconds out for a capper. */
const INBOUND_MIN_KPH = 150;
const INBOUND_ETA_SEC = 12;
/** Closing on the stand at this share of their speed or more: heading
 *  AT it, not skiing past it. With 60 kph and any closing at all, most
 *  of the map read as inbound most of the time — 405 of 451 in-match
 *  ticks on Raindance. */
const INBOUND_DIRECTNESS = 0.8;
/** How far ahead the map-wide list looks at a shot's START, so it
 *  still has the runner as the shot plays out. */
const INBOUND_LOOKAHEAD_SEC = 16;

/**
 * Seconds until a player reaches `stand` at their current pace, when
 * they are making a run at it: fast, closing on it directly, and no
 * further out than `withinSec`. Null otherwise. Samples are a second
 * apart, so a metre of travel between them is a metre per second.
 */
function inboundEta(
  p: { pos: DirectorVec3 },
  prev: { pos: DirectorVec3 } | undefined,
  stand: { pos: DirectorVec3 } | undefined,
  withinSec: number,
): number | null {
  if (!prev || !stand) return null;
  const mps = dist(p.pos, prev.pos);
  if (mps * 3.6 < INBOUND_MIN_KPH) return null;
  const toStand = dist(p.pos, stand.pos);
  if (dist(prev.pos, stand.pos) - toStand < INBOUND_DIRECTNESS * mps) {
    return null;
  }
  const eta = toStand / mps;
  return eta <= withinSec ? eta : null;
}

/**
 * What each player has done so far this map, as of a moment — the
 * start of a role: a player who has taken a flag off the enemy stand
 * is a capper, and the only kind of player whose run at a stand is
 * worth calling "inbound". Read from the flag tracks (a stand grab is
 * a flag going from home to held; a cap is an out-period that ends in
 * one), so it is causal: nothing after `atSec` counts.
 */
export interface PlayerHistory {
  standGrabsBefore(targetId: number, atSec: number): number;
  capsBefore(targetId: number, atSec: number): number;
}

export function buildPlayerHistory(
  tracks: Map<number, FlagTrack>,
): PlayerHistory {
  const grabs = new Map<number, number[]>();
  const caps = new Map<number, number[]>();
  const push = (map: Map<number, number[]>, id: number, t: number) => {
    let list = map.get(id);
    if (!list) map.set(id, (list = []));
    list.push(t);
  };
  for (const track of tracks.values()) {
    const { samples } = track;
    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const cur = samples[i];
      if (
        prev.status === "home" &&
        cur.status === "held" &&
        cur.carrierTargetId != null
      ) {
        push(grabs, cur.carrierTargetId, cur.timeSec);
      }
    }
    for (const period of track.outPeriods) {
      if (!period.endsInCap) continue;
      // The last carrier before the flag went home is the capper.
      let capper: number | null = null;
      for (let i = samples.length - 1; i >= 0; i--) {
        const sample = samples[i];
        if (sample.timeSec > period.endSec) continue;
        if (sample.timeSec < period.startSec) break;
        if (sample.status === "held" && sample.carrierTargetId != null) {
          capper = sample.carrierTargetId;
          break;
        }
      }
      if (capper != null) push(caps, capper, period.endSec);
    }
  }
  const countBefore = (map: Map<number, number[]>, id: number, at: number) =>
    (map.get(id) ?? []).filter((t) => t <= at).length;
  return {
    standGrabsBefore: (id, at) => countBefore(grabs, id, at),
    capsBefore: (id, at) => countBefore(caps, id, at),
  };
}

/**
 * Everyone running at the enemy stand as the shot begins, wherever the
 * camera is. The booth sizes its lines by the nearest: Doc opened a
 * two-sentence read while the camera followed someone ELSE and the
 * capper was six seconds out, and the grab call had to cut across him.
 */
function describeInbound(
  shot: Shot,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
  tracks: Map<number, FlagTrack>,
  history: PlayerHistory,
): NonNullable<ShotScene["inbound"]> {
  // Sampled through the shot, not just at its first second — a run
  // that starts (or first gets a speed sample) a second in was missed
  // entirely, and the shot is already planned with the same look-ahead
  // its player list uses. Each runner keeps their EARLIEST predicted
  // arrival, expressed from the shot's start.
  const from = Math.round(shot.startSec);
  const to = Math.round(
    Math.min(shot.endSec, shot.startSec + INBOUND_LOOKAHEAD_SEC),
  );
  const arrival = new Map<number, { teamId: number | null; atSec: number }>();
  for (let t = from; t <= to; t++) {
    const players = playersAtSec.get(t) ?? [];
    const previous = playersAtSec.get(t - 1) ?? [];
    const carriers = new Set<number>();
    for (const track of tracks.values()) {
      const sample = sampleAt(track.samples, t);
      if (sample?.carrierTargetId != null) carriers.add(sample.carrierTargetId);
    }
    // Nothing to grab at a stand whose flag is already out: a runner
    // heading there is chasing, or arriving to fight.
    const flagHome = (slot: number) =>
      sampleAt(tracks.get(slot)?.samples ?? [], t)?.status === "home";
    for (const p of players) {
      if (carriers.has(p.targetId)) continue;
      const prev = previous.find((q) => q.targetId === p.targetId);
      const enemy = dataset.flagStands.find(
        (st) => st.teamId != null && st.teamId !== p.teamId,
      );
      if (!enemy || !flagHome(enemy.slot)) continue;
      // Only a player who has already taken a flag off the stand this
      // map. Speed and heading alone read every heavy on its way to
      // the base as a capper, and the booth called "incoming" on
      // players who were never going to the flag.
      if (history.standGrabsBefore(p.targetId, t) === 0) continue;
      const eta = inboundEta(p, prev, enemy, INBOUND_LOOKAHEAD_SEC);
      if (eta == null) continue;
      const at = t + eta;
      const known = arrival.get(p.targetId);
      if (!known || at < known.atSec) {
        arrival.set(p.targetId, { teamId: p.teamId ?? null, atSec: at });
      }
    }
  }
  return [...arrival.entries()]
    .map(([targetId, { teamId, atSec }]) => ({
      name: displayName(targetId, dataset, shot.startSec),
      team: teamName(teamId, dataset) ?? "neutral",
      etaSec: Math.max(0, Math.round(atSec - shot.startSec)),
    }))
    .sort((a, b) => a.etaSec - b.etaSec);
}

function sceneRange(shot: Shot): number {
  if (shot.kind === "fixedOrbit") return Math.max(40, shot.radius * 1.3);
  if (shot.kind === "sweep") return 60;
  return 50;
}

function describePlayers(
  shot: Shot,
  anchor: DirectorVec3,
  midSec: number,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
  tracks: Map<number, FlagTrack>,
  camera: CameraEstimate | null,
  hasSuited: (targetId: number, atSec: number) => boolean,
  history: PlayerHistory,
): ScenePlayer[] {
  const range = sceneRange(shot);
  const players = playersAtSec.get(Math.round(midSec)) ?? [];
  const previous = playersAtSec.get(Math.round(midSec) - 1) ?? [];
  const carriers = new Set<number>();
  for (const track of tracks.values()) {
    const sample = sampleAt(track.samples, midSec);
    if (sample?.carrierTargetId != null) carriers.add(sample.carrierTargetId);
  }
  const stands = dataset.flagStands;
  const out: ScenePlayer[] = [];
  const camDist = new Map<number, number>();
  for (const p of players) {
    const d = dist(p.pos, anchor);
    if (d > range) continue;
    const identity = identityOf(p.targetId, dataset, midSec);
    const prev = previous.find((q) => q.targetId === p.targetId);
    // kph (samples are 1s apart and T2 world units are meters) —
    // the same units as the in-game speedometer, so eyeball-checkable.
    const speed = prev ? dist(p.pos, prev.pos) * 3.6 : undefined;
    // Inbound: closing on the ENEMY stand at pace and near enough that
    // the grab attempt is imminent — with how long that is at the
    // current speed. The booth sizes its line by it: Doc opened a
    // two-sentence read on a capper "building speed across midfield"
    // and the grab call had to cut across him.
    const enemyStand = stands.find(
      (st) => st.teamId != null && st.teamId !== p.teamId,
    );
    const standGrabs = history.standGrabsBefore(p.targetId, midSec);
    const caps = history.capsBefore(p.targetId, midSec);
    // A run at the stand is only "inbound" from a player who has
    // grabbed before (see describeInbound).
    const eta =
      standGrabs > 0 ? inboundEta(p, prev, enemyStand, INBOUND_ETA_SEC) : null;
    let etaSec = eta == null ? undefined : Math.round(eta);
    let doing: ScenePlayer["doing"];
    if (carriers.has(p.targetId)) {
      doing = "carrying the flag";
      etaSec = undefined;
    } else if (
      [...carriers].some((c) => {
        const cp = players.find((q) => q.targetId === c);
        return cp && dist(cp.pos, p.pos) <= 40;
      })
    ) {
      doing = "chasing the carrier";
      etaSec = undefined;
    } else if (etaSec != null) {
      doing = "inbound";
    } else if (
      (speed ?? 0) < 18 &&
      stands.some((st) => st.teamId === p.teamId && dist(st.pos, p.pos) <= 45)
    ) {
      doing = "posted on defense";
    } else if (
      // The projectile packets name their shooter — no inference.
      dataset.mortarShots.some(
        (m) =>
          Math.abs(m.timeSec - midSec) <= 4 && m.shooterTargetId === p.targetId,
      )
    ) {
      doing = "firing mortars";
    } else if (
      dataset.stations.some(
        (st) => st.kind === "inventory" && dist(st.pos, p.pos) <= SUIT_RANGE,
      )
    ) {
      doing = "suiting up";
    } else if ((speed ?? 0) >= 144) {
      doing = "skiing";
    }
    // Direction relative to the bases, from the sampled displacement —
    // so "pouring out" vs "heading in to suit up" is data, not a guess.
    let moving: ScenePlayer["moving"];
    if (prev && (speed ?? 0) >= 14) {
      const own = stands.find((st) => st.teamId === p.teamId);
      const enemy = stands.find(
        (st) => st.teamId != null && st.teamId !== p.teamId,
      );
      const closing = (st: (typeof stands)[number]) =>
        dist(p.pos, st.pos) - dist(prev.pos, st.pos);
      if (own && closing(own) < -2 && dist(p.pos, own.pos) < 120) {
        moving = "into their own base";
      } else if (own && closing(own) > 2 && dist(prev.pos, own.pos) < 120) {
        moving = "out of their base";
      } else if (enemy && closing(enemy) < -2) {
        moving = "toward the enemy base";
      } else if (own && closing(own) < -2) {
        moving = "back toward their base";
      }
    }
    // Loadout tells only for players who actually visited an invo
    // this life — a spawn loadout says nothing about their plans.
    const suited = hasSuited(p.targetId, midSec);
    out.push({
      name: displayName(p.targetId, dataset, midSec),
      targetId: p.targetId,
      team: teamName(p.teamId, dataset),
      armor: suited ? p.armor : undefined,
      skin: identity?.skin,
      // Only the control-code-delimited official tag — typed "=USA="
      // conventions stay part of the name (intent is unknowable). The
      // separator character is not spoken ("TF_" → "TF").
      clan: identity?.clan ? spokenName(identity.clan) : undefined,
      pack: suited ? p.pack : undefined,
      dist: Math.round(d),
      bearing: compass(anchor, p.pos),
      frame: camera ? frameOf(camera, p.pos) : undefined,
      doing,
      ...(etaSec != null ? { etaSec } : {}),
      ...(standGrabs > 0 ? { standGrabs } : {}),
      ...(caps > 0 ? { caps } : {}),
      moving,
      speed: speed != null ? Math.round(speed) : undefined,
      health: p.health != null ? Math.round(p.health * 100) : undefined,
    });
    camDist.set(
      p.targetId,
      camera
        ? Math.hypot(p.pos[0] - camera.pos[0], p.pos[1] - camera.pos[1])
        : d,
    );
  }
  // Nearest-to-camera first — commentators read the foreground before
  // the background, so someone deep in the frame must not lead a
  // lineup call just because they stand near the look target.
  out.sort((a, b) => camDist.get(a.targetId)! - camDist.get(b.targetId)!);
  // Prefer players near the CAMERA itself: someone deep in the
  // background is unidentifiable on screen, so announce them only when
  // nobody closer is in the scene.
  const close = out.filter(
    (p) => camDist.get(p.targetId)! <= SCENE_PLAYER_CAM_RANGE,
  );
  return (close.length > 0 ? close : out).slice(0, 12);
}

function describeEvents(
  shot: Shot,
  anchor: DirectorVec3 | null,
  dataset: DirectorDataset,
  tracks: Map<number, FlagTrack>,
  playersAtSec: PlayersAtSec,
): SceneEvent[] {
  const events: SceneEvent[] = [];
  const inWindow = (t: number) => t >= shot.startSec - 0.5 && t <= shot.endSec;
  // Death-derived events name players by targetId, which resolves
  // canonically. Chat-derived ones (flag plays, skill shots) carry
  // whatever spelling the client sent, so they go through the roster.
  const resolveActor = makeActorResolver(dataset);
  const carrierAt = (timeSec: number, targetId: number | null) =>
    targetId != null &&
    [...tracks.values()].some(
      (track) => sampleAt(track.samples, timeSec)?.carrierTargetId === targetId,
    );
  for (const death of dataset.deaths) {
    if (!inWindow(death.timeSec) || death.killerTargetId == null) continue;
    // A kill the viewer cannot SEE is not worth calling: it must happen
    // near the shot (killer or victim), or involve a flag carrier.
    const near =
      anchor != null &&
      (dist(death.pos, anchor) <= SCENE_KILL_RANGE ||
        (death.killerPos != null &&
          dist(death.killerPos, anchor) <= SCENE_KILL_RANGE));
    // A teamkill that costs a flag play — the victim was carrying, or
    // standing on the enemy flag about to grab — is always worth
    // calling; other kills stay gated by visibility.
    const victimTeam =
      death.teamId ?? teamOfAt(death.targetId, death.timeSec, playersAtSec);
    const killerTeam = teamOfAt(
      death.killerTargetId,
      death.timeSec,
      playersAtSec,
    );
    const sameSide =
      killerTeam != null &&
      victimTeam != null &&
      killerTeam === victimTeam &&
      death.killerTargetId !== death.targetId;
    // A teammate's DEPLOYED turret is credited to its owner by the game
    // (defaultGame.cs: "player got in the way of a teammates deployed
    // but uncontrolled turret", msgCTurretKill), which is an accident,
    // not a teamkill — the game keeps "TEAMKILLED" for a player's own
    // shot. Raindance 6:54: "Friendo got in the way of a spike turret"
    // went out as friendly fire on defence.
    const turretAccident = sameSide && /turret/i.test(death.weapon ?? "");
    const teamkill = sameSide && !turretAccident;
    const victimCarried = carrierAt(death.timeSec, death.targetId);
    let atEnemyFlag = false;
    if (teamkill && !victimCarried) {
      const enemyStand = dataset.flagStands.find(
        (st) => st.teamId != null && st.teamId !== victimTeam,
      );
      const flagPos = enemyStand
        ? sampleAt(tracks.get(enemyStand.slot)?.samples ?? [], death.timeSec)
            ?.pos
        : null;
      atEnemyFlag =
        flagPos != null && dist(death.pos, flagPos) <= TEAMKILL_FLAG_RANGE;
    }
    const criticalTeamkill = teamkill && (victimCarried || atEnemyFlag);
    if (
      !near &&
      !victimCarried &&
      !carrierAt(death.timeSec, death.killerTargetId) &&
      !criticalTeamkill
    ) {
      continue;
    }
    const range = death.killerPos ? dist(death.pos, death.killerPos) : null;
    const midair = death.midair === true;
    // What the kill is worth: a carrier on either end makes it a flag
    // play; at a stand it is defence or a clear; anywhere else it is
    // the background of a Tribes match.
    const flagPlay =
      victimCarried || carrierAt(death.timeSec, death.killerTargetId);
    const atStand = dataset.flagStands.some(
      (st) => dist(death.pos, st.pos) <= KILL_STAND_RANGE,
    );
    // A distance earns a mention only when it makes the shot special —
    // most kills carry none, long-range ones carry the story.
    events.push({
      timeSec: death.timeSec,
      type: "kill",
      weight: flagPlay ? 3 : atStand || midair || death.headshot ? 2 : 1,
      detail: [
        teamkill ? "TEAMKILL — their own teammate" : null,
        turretAccident ? "got in the way of a teammate's" : null,
        midair ? "mid-air" : null,
        death.headshot ? "headshot" : null,
        death.weapon ?? null,
        range == null
          ? null
          : range > 300
            ? "long range"
            : range >= 75
              ? approxMeters(range)
              : null,
      ]
        .filter(Boolean)
        .join(" "),
      actors: [
        {
          name: displayName(death.killerTargetId, dataset, death.timeSec),
          role: "killer",
        },
        {
          name: displayName(death.targetId, dataset, death.timeSec),
          role: "victim",
        },
      ],
      weapon: death.weapon,
      midair,
    });
    if (criticalTeamkill) {
      events.push({
        timeSec: death.timeSec,
        type: "teamkill",
        weight: 3,
        detail: victimCarried
          ? "shot down their OWN teammate carrying the flag"
          : "shot down their OWN teammate right on the enemy flag",
        actors: [
          {
            name: displayName(death.killerTargetId, dataset, death.timeSec),
            role: "killer",
          },
          {
            name: displayName(death.targetId, dataset, death.timeSec),
            role: "victim",
          },
        ],
      });
    }
    // Near-miss: a carrier cut down close to completing the capture.
    for (const track of tracks.values()) {
      const before = sampleAt(track.samples, death.timeSec - 0.5);
      if (before?.carrierTargetId !== death.targetId) continue;
      const goal = captureStandFor(track.slot, dataset);
      if (goal && dist(death.pos, goal.pos) <= 60) {
        events.push({
          timeSec: death.timeSec,
          type: "near-miss",
          weight: 3,
          detail: `carrier killed ${approxMeters(dist(death.pos, goal.pos))} short of the capture`,
          actors: [
            {
              name: displayName(death.targetId, dataset, death.timeSec),
              role: "carrier",
            },
          ],
        });
      }
    }
  }
  for (const event of dataset.events) {
    if (!inWindow(event.timeSec)) continue;
    const map: Record<string, SceneEvent["type"] | undefined> = {
      "flag-grab": "grab",
      "flag-drop": "drop",
      "flag-cap": "cap",
      "flag-return": "return",
    };
    const type = map[event.type];
    if (!type) continue;
    const actor = event.actor ?? event.capturer;
    // A grab OFF THE STAND (flag was home) is the marquee version of
    // the play — flagged so the booth knows to light up (and may call
    // it a regrab/e-grab); a loose-field pickup is not.
    const stand =
      type === "grab" || type === "cap" || type === "return" || type === "drop"
        ? dataset.flagStands.find(
            (st) =>
              st.name != null &&
              event.flagTeamName != null &&
              st.name.toLowerCase() === event.flagTeamName.toLowerCase(),
          )
        : undefined;
    const flagPosAt = stand
      ? (sampleAt(tracks.get(stand.slot)?.samples ?? [], event.timeSec)?.pos ??
        null)
      : null;
    let offTheStand = false;
    if (type === "grab") {
      const before = stand
        ? sampleAt(tracks.get(stand.slot)?.samples ?? [], event.timeSec - 0.7)
        : null;
      offTheStand = before?.status === "home";
    }
    // `detail` says WHAT happened and never WHO — the player belongs
    // to `actors`, in one canonical spoken spelling. The raw chat
    // description embeds the game's own display name ("b l a k e",
    // "^i^Irvin"), which does NOT match spokenName(actor); shipping
    // both spellings in one payload is how a consumer loses track of
    // who did what. Drops additionally carry the carrier's INTENT,
    // which is the framing a booth needs.
    const theFlag = event.flagTeamName
      ? `the ${event.flagTeamName} flag`
      : "the flag";
    const detail =
      type === "grab"
        ? offTheStand
          ? `grabbed ${theFlag} off the stand — it was home`
          : `picked up ${theFlag}, loose in the field`
        : type === "cap"
          ? `captured ${theFlag}`
          : type === "return"
            ? `returned ${theFlag}`
            : event.dropKind === "died"
              ? `killed carrying ${theFlag} — it is loose`
              : event.dropKind === "pass"
                ? `passed ${theFlag} forward to a teammate`
                : event.dropKind === "thrown"
                  ? `threw ${theFlag} deliberately`
                  : `dropped ${theFlag}`;
    // How long the capper carried it, measured from the flag's own
    // track (the last grab before the cap) rather than scraped out of
    // the chat message — the wording of that message varies by scanner
    // path, and a number belongs in a field anyway.
    const lastGrabSec =
      type === "cap" && stand
        ? (tracks.get(stand.slot)?.grabTimes ?? [])
            .filter((t) => t <= event.timeSec)
            .pop()
        : undefined;
    events.push({
      timeSec: event.timeSec,
      type,
      // A grab, a cap or a pass is the game itself; a return or any
      // other drop changes the picture but is calmer.
      weight:
        type === "grab" || type === "cap" || event.dropKind === "pass" ? 3 : 2,
      detail,
      actors: actor
        ? [
            {
              name: resolveActor(actor)!,
              role: type === "cap" ? "capturer" : "actor",
            },
          ]
        : [],
      dropKind: type === "drop" ? event.dropKind : undefined,
      flagTeam: stand
        ? flagLabel(stand.slot, dataset).replace(/ flag$/, "")
        : (event.flagTeamName ?? undefined),
      // A capture is always "seen" — it settles the match, so the booth
      // calls it even when the director was looking elsewhere. Every
      // other flag play is judged on whether the camera was near it.
      // Flag events carry no position of their own, so visibility is
      // judged from where the FLAG was at that moment — the thing the
      // camera would have had to be near.
      onScreen:
        type === "cap"
          ? true
          : anchor != null && flagPosAt != null
            ? dist(flagPosAt, anchor) <= SCENE_KILL_RANGE
            : undefined,
      holdSec:
        lastGrabSec != null
          ? Math.round((event.timeSec - lastGrabSec) * 10) / 10
          : undefined,
    });
  }
  // Non-lethal server-announced skill shots near the camera — an MA
  // that didn't kill is still the play of the moment.
  for (const skill of dataset.skillShots ?? []) {
    if (skill.lethal || !inWindow(skill.timeSec) || skill.targetId == null) {
      continue;
    }
    const pos = playerPosAt(skill.targetId, skill.timeSec, dataset);
    if (anchor == null || pos == null || dist(pos, anchor) > SCENE_KILL_RANGE) {
      continue;
    }
    events.push({
      timeSec: skill.timeSec,
      type: "skill-shot",
      weight: 2,
      detail:
        skill.kind === "midair"
          ? `mid-air ${skill.weapon ?? "disc"}${
              skill.rangeM != null && skill.rangeM > 300
                ? " from long range"
                : skill.rangeM != null && skill.rangeM >= 30
                  ? ` ${approxMeters(skill.rangeM)}`
                  : ""
            } — target survived`
          : "sniper headshot",
      actors: [{ name: resolveActor(skill.name)!, role: "shooter" }],
      midair: skill.kind === "midair" || undefined,
    });
  }
  // Base hardware is reported piece by piece: a generator going down
  // changes what a base can do. Deployables are not — a clamp farm
  // being traded produced 257 events in one match, and a booth handed
  // them one at a time narrated a turret ledger. They roll up into one
  // raid per team per shot; repairs of deployables are noise.
  const raids = new Map<string, { timeSec: number; kinds: string[] }>();
  for (const st of dataset.structures) {
    if (!inWindow(st.timeSec)) continue;
    const destroyed = st.to > st.from;
    // Whose base this was, from the structure ghost's own team — the
    // game's answer. A consumer told only "base turret destroyed"
    // cannot say whose defence fell, so it guesses.
    const team =
      st.teamId != null
        ? (teamName(st.teamId, dataset) ?? undefined)
        : undefined;
    if (DEPLOYABLE_NAMES.has(st.name)) {
      if (!destroyed) continue;
      const key = team ?? "";
      const raid = raids.get(key) ?? { timeSec: st.timeSec, kinds: [] };
      raid.timeSec = Math.max(raid.timeSec, st.timeSec);
      raid.kinds.push(st.name);
      raids.set(key, raid);
      continue;
    }
    events.push({
      timeSec: st.timeSec,
      type: destroyed ? "structure-destroyed" : "structure-repaired",
      weight: destroyed ? 2 : 1,
      detail: `${st.name}`,
      team,
      actors: [],
    });
  }
  for (const [team, raid] of raids) {
    const tally = new Map<string, number>();
    for (const kind of raid.kinds) tally.set(kind, (tally.get(kind) ?? 0) + 1);
    // Weighed over the trailing window, so a sustained raid reads as
    // one whatever the camera's cut rhythm was.
    const recent = dataset.structures.filter(
      (st) =>
        st.to > st.from &&
        DEPLOYABLE_NAMES.has(st.name) &&
        (st.teamId != null ? (teamName(st.teamId, dataset) ?? "") : "") ===
          team &&
        st.timeSec > raid.timeSec - RAID_WINDOW_SEC &&
        st.timeSec <= raid.timeSec,
    ).length;
    const kinds = [...tally.entries()]
      .map(([kind, n]) => (n > 1 ? `${n} × ${kind}` : kind))
      .join(", ");
    events.push({
      timeSec: raid.timeSec,
      type: "raid",
      weight: recent >= RAID_NOTABLE_COUNT ? 2 : 1,
      count: recent,
      detail: `${recent} deployable${recent === 1 ? "" : "s"} destroyed in the last ${RAID_WINDOW_SEC}s; just now: ${kinds}`,
      team: team || undefined,
      actors: [],
    });
  }
  events.sort((a, b) => a.timeSec - b.timeSec);
  return events;
}

/**
 * Flag state as a CHANGE-DRIVEN timeline, independent of camera cuts.
 *
 * Scene flag state is one snapshot per shot, and shots run to 20s — so
 * a consumer reading state between cuts can be badly stale (measured:
 * up to 12.5s on a real slice), long enough to describe a carrier who
 * has already been cut down. The trackers sample flags every
 * FLAG_STEP_SEC, so an accurate series already exists; this exposes
 * it, compressed to the moments it actually changes.
 *
 * This is NOT a licence to commentate off-camera action. It exists so
 * that what the camera IS showing gets described accurately and
 * currently; `SceneEvent.onScreen` still says what was visible.
 */
export function buildFlagTimeline(
  dataset: DirectorDataset,
  tracks: Map<number, FlagTrack>,
): { timeSec: number; flags: SceneFlagState[] }[] {
  const out: { timeSec: number; flags: SceneFlagState[] }[] = [];
  // Identity ignores distances, which drift every sample; a run's
  // changing distance is refreshed by the interval rule below instead.
  const identity = (flags: SceneFlagState[]) =>
    flags.map((f) => `${f.slot}:${f.status}:${f.carrier ?? ""}`).join("|");
  let lastId = "";
  let lastPush = Number.NEGATIVE_INFINITY;
  for (let t = 0; t <= dataset.durationSec; t += FLAG_TIMELINE_STEP_SEC) {
    const flags = describeFlags(t, dataset, tracks).map(
      ({ future: _future, ...rest }) => rest,
    );
    if (flags.length === 0) continue;
    const id = identity(flags);
    const live = flags.some((f) => f.status !== "home");
    // Push on any change, and while a flag is OUT keep distances fresh.
    if (id !== lastId || (live && t - lastPush >= FLAG_TIMELINE_MOVING_SEC)) {
      out.push({ timeSec: Math.round(t * 10) / 10, flags });
      lastId = id;
      lastPush = t;
    }
  }
  return out;
}

/** The stand a carried flag is being taken TO: the other team's. */
function captureStandFor(slot: number, dataset: DirectorDataset) {
  return dataset.flagStands.find((st) => st.slot !== slot) ?? null;
}

function describeFlags(
  atSec: number,
  dataset: DirectorDataset,
  tracks: Map<number, FlagTrack>,
): SceneFlagState[] {
  const out: SceneFlagState[] = [];
  for (const stand of dataset.flagStands) {
    const track = tracks.get(stand.slot);
    const sample = track ? sampleAt(track.samples, atSec) : null;
    if (!sample) continue;
    const carried = sample.status === "held";
    const goal = captureStandFor(stand.slot, dataset);
    const period = track!.outPeriods.find(
      (p) => atSec >= p.startSec && atSec <= p.endSec,
    );
    out.push({
      slot: stand.slot,
      team: flagLabel(stand.slot, dataset).replace(/ flag$/, ""),
      status:
        sample.status === "home" ? "home" : carried ? "carried" : "dropped",
      carrier: carried
        ? displayName(sample.carrierTargetId, dataset, sample.timeSec)
        : undefined,
      distFromHome: Math.round(dist(sample.pos, stand.pos)),
      // A dropped flag lying in lava or quicksand is a different
      // proposition from one in water — the retrieval is lethal ground.
      liquid: liquidAt(sample.pos),
      distToCapture:
        carried && goal ? Math.round(dist(sample.pos, goal.pos)) : undefined,
      future: period
        ? {
            outcome: period.endsInCap ? "cap" : "return",
            atSec: period.endSec,
          }
        : undefined,
    });
  }
  return out;
}

/** Topics a shot's ROLE settles outright. Every pre-match shot used to
 *  match a `/Pre-match/` reason pattern and come out as "lineup" — a
 *  pick-up, a fly-by and a generator all read to the booth as a rank
 *  of players to be named. */
const TOPIC_BY_ROLE: Partial<Record<NonNullable<Shot["role"]>, SceneTopic>> = {
  rosterWide: "lineup",
  rosterCloseUp: "lineup",
  signing: "pick-up",
  establishing: "base",
  tourHold: "base",
  tourMove: "base",
  quiet: "lull",
};

/**
 * The builder's own word first, then the role. Nothing is read out of
 * `reason`: a pattern table tuned to the oracle planner's wording sat
 * here and called every live kill cut-in and cap approach "action".
 */
function topicOf(shot: Shot): SceneTopic {
  return shot.topic ?? (shot.role && TOPIC_BY_ROLE[shot.role]) ?? "action";
}

/** Raw story key for a shot; runs of CONSECUTIVE shots sharing a key
 *  become one sequence (a key alone is not enough — every bombardment
 *  of the match is not one story). */
function sequenceKey(
  shot: Shot,
  topic: SceneTopic,
  tracks: Map<number, FlagTrack>,
): string {
  const slot =
    shot.kind === "followFlag"
      ? shot.slot
      : shot.kind === "fixedOrbit" && shot.lookSubject?.type === "flag"
        ? shot.lookSubject.slot
        : shot.kind === "dolly" && shot.subject.type === "flag"
          ? shot.subject.slot
          : null;
  if (slot != null) {
    const period = tracks
      .get(slot)
      ?.outPeriods.find(
        (p) => shot.startSec >= p.startSec - 5 && shot.startSec <= p.endSec + 8,
      );
    if (period) return `flag-${slot}-out-${Math.round(period.startSec)}`;
    return `flag-${slot}-home`;
  }
  if (topic === "bombardment") return "bombardment";
  if (topic === "lineup" || topic === "kickoff") return "opening";
  return `${topic}-${Math.round(shot.startSec)}`;
}

/** Voice binds fired during the shot, from anywhere on the map. */
function describeChatter(
  shot: Shot,
  dataset: DirectorDataset,
  playersAtSec: PlayersAtSec,
): SceneChatter[] {
  const out: SceneChatter[] = [];
  for (const bind of dataset.voiceBinds ?? []) {
    if (bind.timeSec < shot.startSec - 0.5 || bind.timeSec > shot.endSec) {
      continue;
    }
    const sample =
      bind.targetId != null
        ? playersAtSec
            .get(Math.round(bind.timeSec))
            ?.find((p) => p.targetId === bind.targetId)
        : undefined;
    const team = teamName(sample?.teamId ?? null, dataset);
    out.push({
      timeSec: bind.timeSec,
      kind: bind.kind,
      name:
        bind.targetId != null
          ? displayName(bind.targetId, dataset, bind.timeSec)
          : spokenName(bind.name),
      ...(team ? { team } : {}),
      text: bind.text,
    });
  }
  return out;
}

/** Attach a ShotScene to every shot in the plan, in place. */
export function describeScenes(
  plan: ShotPlan,
  dataset: DirectorDataset,
  /**
   * Re-describe shots that already have a scene.
   *
   * A cast planned as it plays calls this each time a shot closes, and
   * describing the whole plan every time is quadratic — measured at 7.7
   * of the 19.8 seconds a full cast spent planning. So by default a
   * shot that has been described is left alone, and the pass costs only
   * the new ones. The run state and the flag timeline are still rebuilt
   * across every shot, because a run spans cuts.
   */
  redescribeAll = false,
): void {
  const tracks = buildFlagTracks(dataset);
  // Flag state independent of the camera cuts, so a live consumer is
  // never reading a snapshot that went stale mid-shot.
  plan.flagTimeline = buildFlagTimeline(dataset, tracks);
  const playersAtSec = playersAtSecFor(dataset);
  const hasSuited = buildSuitIndex(dataset);
  const history = buildPlayerHistory(tracks);
  let prevKey: string | null = null;
  let runStartSec = 0;
  for (let i = 0; i < plan.shots.length; i++) {
    const shot = plan.shots[i];
    // An already-described shot still takes part in the run-key
    // bookkeeping — a run spans cuts — but its description stands.
    //
    // Keyed on the SHOT, not on an index: the audit passes remove shots
    // from this same array, so an index-based watermark would silently
    // skip the ones that shuffled down past it.
    if (!redescribeAll && shot.scene) {
      // The SAME key the main pass computes — a run spans cuts, so the
      // bookkeeping has to walk every shot. What it skips is the
      // expensive part: the anchor solve, the camera estimate and the
      // player description.
      const key = sequenceKey(shot, topicOf(shot), tracks);
      if (key !== prevKey) {
        prevKey = key;
        runStartSec = shot.startSec;
      }
      continue;
    }
    const midSec = (shot.startSec + shot.endSec) / 2;
    const anchor =
      shotAnchor(shot, tracks, dataset, midSec) ??
      shotAnchor(shot, tracks, dataset, shot.startSec);
    const topic = topicOf(shot);
    const rawKey = sequenceKey(shot, topic, tracks);
    if (rawKey !== prevKey) {
      prevKey = rawKey;
      runStartSec = shot.startSec;
    }
    const camera = anchor
      ? estimateCamera(shot, anchor, dataset, midSec)
      : null;
    const players = anchor
      ? describePlayers(
          shot,
          anchor,
          midSec,
          dataset,
          playersAtSec,
          tracks,
          camera,
          hasSuited,
          history,
        )
      : [];
    // WHO THIS SHOT IS OF. A follow names its subject, so it belongs in
    // the scene whether or not the proximity pass happened to catch it
    // — and whether or not a position sample exists at this instant.
    markFocus(shot, players, midSec, dataset, playersAtSec, tracks);
    const events = describeEvents(shot, anchor, dataset, tracks, playersAtSec);
    const chatter = describeChatter(shot, dataset, playersAtSec);
    const flags = describeFlags(shot.startSec, dataset, tracks);
    const inbound = describeInbound(
      shot,
      dataset,
      playersAtSec,
      tracks,
      history,
    );
    const scoreAt = (dataset.scoreSamples ?? []).filter(
      (s) => s.timeSec <= shot.startSec,
    );
    const latest = new Map<number, number>();
    for (const s of scoreAt) latest.set(s.teamId, s.score);
    shot.scene = {
      topic,
      sequenceId: `${rawKey}@${Math.round(runStartSec)}`,
      players,
      events,
      flags,
      score:
        latest.size > 0
          ? [...latest.entries()].map(([teamId, score]) => ({
              team:
                dataset.teams.find((t) => t.teamId === teamId)?.name ??
                `team ${teamId}`,
              score,
            }))
          : undefined,
      ...describeMatchState(shot.startSec, dataset, tracks),
      ...(inbound.length > 0 ? { inbound } : {}),
      ...(chatter.length > 0 ? { chatter } : {}),
    };
  }
}

/**
 * The macro picture as a shot begins — clock, momentum, who is carrying
 * each side — so a lull can be filled with the match rather than with
 * whatever hardware happens to be on screen. Causal: every value is
 * the last one known at `atSec`.
 */
function describeMatchState(
  atSec: number,
  dataset: DirectorDataset,
  tracks: Map<number, FlagTrack>,
): Partial<Pick<ShotScene, "clockRemainingSec" | "recentCaps" | "topScorers">> {
  const facts = dataset.matchFacts;
  if (!facts) return {};
  const lastAt = <T extends { timeSec: number }>(
    series: T[],
  ): T | undefined => {
    let last: T | undefined;
    for (const entry of series) {
      if (entry.timeSec <= atSec) last = entry;
      else break;
    }
    return last;
  };
  const clock = lastAt(facts.clock ?? []);
  // Negative counts DOWN to the end; the remainder shrinks by the time
  // elapsed since the sample. A sample from BEFORE the whistle is the
  // countdown to the start, not the match clock — and it is never
  // "time left": read by a shot spanning the kickoff it had the booth
  // saying "under a minute left" as the match began.
  const fromBeforeWhistle =
    clock != null &&
    facts.matchStartSec != null &&
    clock.timeSec < facts.matchStartSec;
  const clockRemainingSec =
    clock && clock.clockMs < 0 && !fromBeforeWhistle
      ? Math.max(0, -clock.clockMs / 1000 - (atSec - clock.timeSec))
      : null;
  // A capture of slot S is scored by the OTHER side.
  const recentCaps = dataset.teams.map((team) => ({
    team: team.name,
    caps: [...tracks.values()].reduce(
      (n, track) =>
        n +
        track.outPeriods.filter(
          (p) =>
            p.endsInCap &&
            p.endSec <= atSec &&
            p.endSec > atSec - RECENT_CAPS_WINDOW_SEC &&
            dataset.flagStands.find((st) => st.slot === track.slot)?.teamId !==
              team.teamId,
        ).length,
      0,
    ),
  }));
  const roster = lastAt(facts.roster ?? []);
  const topScorers = roster?.scorers.slice(0, 3).map((s) => ({
    name: spokenName(s.name),
    team: teamName(s.teamId, dataset) ?? null,
    score: s.score,
  }));
  return { clockRemainingSec, recentCaps, topScorers };
}
