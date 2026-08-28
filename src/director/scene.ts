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
  SceneEvent,
  SceneFlagState,
  ScenePlayer,
  SceneTopic,
  Shot,
  ShotPlan,
} from "./types";
import { dist } from "./geometry";
import {
  buildFlagTracks,
  flagLabel,
  playersAtSecFor,
  sampleAt,
  type FlagTrack,
  type PlayersAtSec,
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
      if (shot.startAngle == null) return null;
      // fixedOrbit convention: camera offset (sin θ, cos θ)·r in Torque.
      const r = shot.radius;
      return make(
        [
          shot.center[0] + Math.sin(shot.startAngle) * r,
          shot.center[1] + Math.cos(shot.startAngle) * r,
        ],
        [shot.center[0], shot.center[1]],
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
      return shot.center;
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
  let best: { dt: number; pos: DirectorVec3 } | null = null;
  for (const p of dataset.playerSamples) {
    if (p.targetId !== targetId) continue;
    const dt = Math.abs(p.timeSec - atSec);
    if (dt <= 3 && (!best || dt < best.dt)) best = { dt, pos: p.pos };
  }
  return best?.pos ?? null;
}

function identityOf(targetId: number, dataset: DirectorDataset) {
  return dataset.playerNames.find((p) => p.targetId === targetId);
}

function displayName(
  targetId: number | null,
  dataset: DirectorDataset,
): string {
  if (targetId == null) return "someone";
  const entry = identityOf(targetId, dataset);
  return entry?.displayName ?? entry?.name ?? `player ${targetId}`;
}

function teamName(
  teamId: number | null,
  dataset: DirectorDataset,
): string | null {
  if (teamId == null) return null;
  return dataset.teams.find((t) => t.teamId === teamId)?.name ?? null;
}

/** How wide a net to cast for "in this scene". */
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
    const identity = identityOf(p.targetId, dataset);
    const prev = previous.find((q) => q.targetId === p.targetId);
    const speed = prev ? dist(p.pos, prev.pos) : undefined;
    let doing: ScenePlayer["doing"];
    if (carriers.has(p.targetId)) {
      doing = "carrying the flag";
    } else if (
      [...carriers].some((c) => {
        const cp = players.find((q) => q.targetId === c);
        return cp && dist(cp.pos, p.pos) <= 40;
      })
    ) {
      doing = "chasing the carrier";
    } else if (
      (speed ?? 0) < 5 &&
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
      doing = "shelling";
    } else if (
      dataset.stations.some(
        (st) => st.kind === "inventory" && dist(st.pos, p.pos) <= 8,
      )
    ) {
      doing = "suiting up";
    } else if ((speed ?? 0) >= 40) {
      doing = "skiing";
    }
    out.push({
      name: displayName(p.targetId, dataset),
      targetId: p.targetId,
      team: teamName(p.teamId, dataset),
      armor: p.armor,
      skin: identity?.skin,
      pack: p.pack,
      dist: Math.round(d),
      bearing: compass(anchor, p.pos),
      frame: camera ? frameOf(camera, p.pos) : undefined,
      doing,
      speed: speed != null ? Math.round(speed) : undefined,
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
  return out.slice(0, 12);
}

function describeEvents(
  shot: Shot,
  dataset: DirectorDataset,
  tracks: Map<number, FlagTrack>,
): SceneEvent[] {
  const events: SceneEvent[] = [];
  const inWindow = (t: number) => t >= shot.startSec - 0.5 && t <= shot.endSec;
  for (const death of dataset.deaths) {
    if (!inWindow(death.timeSec) || death.killerTargetId == null) continue;
    const range = death.killerPos ? dist(death.pos, death.killerPos) : null;
    const midair = death.airborne === true && (death.speed ?? 0) >= 15;
    events.push({
      timeSec: death.timeSec,
      type: "kill",
      detail: "",
      actors: [
        { name: displayName(death.killerTargetId, dataset), role: "killer" },
        { name: displayName(death.targetId, dataset), role: "victim" },
      ],
      weapon: death.weapon,
      midair,
    });
    const last = events[events.length - 1];
    last.detail = [
      last.midair ? "mid-air" : null,
      death.weapon ?? null,
      range != null ? `${Math.round(range)}m` : null,
    ]
      .filter(Boolean)
      .join(" ");
    // Near-miss: a carrier cut down close to completing the capture.
    for (const track of tracks.values()) {
      const before = sampleAt(track.samples, death.timeSec - 0.5);
      if (before?.carrierTargetId !== death.targetId) continue;
      const goal = captureStandFor(track.slot, dataset);
      if (goal && dist(death.pos, goal.pos) <= 60) {
        events.push({
          timeSec: death.timeSec,
          type: "near-miss",
          detail: `carrier killed ${Math.round(dist(death.pos, goal.pos))}m short of the capture`,
          actors: [
            { name: displayName(death.targetId, dataset), role: "carrier" },
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
    events.push({
      timeSec: event.timeSec,
      type,
      detail: event.description,
      actors: actor
        ? [{ name: actor, role: type === "cap" ? "capturer" : "actor" }]
        : [],
    });
  }
  for (const st of dataset.structures) {
    if (!inWindow(st.timeSec)) continue;
    events.push({
      timeSec: st.timeSec,
      type: st.to > st.from ? "structure-destroyed" : "structure-repaired",
      detail: `${st.name}`,
      actors: [],
    });
  }
  events.sort((a, b) => a.timeSec - b.timeSec);
  return events;
}

/** The stand a carried flag is being taken TO: the other team's. */
function captureStandFor(slot: number, dataset: DirectorDataset) {
  return dataset.flagStands.find((st) => st.slot !== slot) ?? null;
}

function describeFlags(
  shot: Shot,
  dataset: DirectorDataset,
  tracks: Map<number, FlagTrack>,
): SceneFlagState[] {
  const out: SceneFlagState[] = [];
  for (const stand of dataset.flagStands) {
    const track = tracks.get(stand.slot);
    const sample = track ? sampleAt(track.samples, shot.startSec) : null;
    if (!sample) continue;
    const carried = sample.status === "held";
    const goal = captureStandFor(stand.slot, dataset);
    const period = track!.outPeriods.find(
      (p) => shot.startSec >= p.startSec && shot.startSec <= p.endSec,
    );
    out.push({
      slot: stand.slot,
      team: flagLabel(stand.slot, dataset).replace(/ flag$/, ""),
      status:
        sample.status === "home" ? "home" : carried ? "carried" : "dropped",
      carrier: carried
        ? displayName(sample.carrierTargetId, dataset)
        : undefined,
      distFromHome: Math.round(dist(sample.pos, stand.pos)),
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

function aOrAn(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}

const TOPIC_PATTERNS: [RegExp, SceneTopic][] = [
  [/line-up|Pre-match/i, "lineup"],
  [/kickoff|spawn rush/i, "kickoff"],
  [/capture incoming|celebrates the capture/i, "capture"],
  [/Aftermath/i, "aftermath"],
  [/turtled|held inside the base/i, "turtle"],
  [/kill by|Duel —/i, "kill"],
  [/raid/i, "raid"],
  [/mortars (hitting|raining)|Mortar fire|Mortar landing/i, "bombardment"],
  [/Havoc|strafing run|Dogfight/i, "vehicle"],
  [/suiting up/i, "suit-up"],
  [/Lull|Quiet moment/i, "lull"],
  [/ base$/i, "base"],
  [/carried|at the stand|on the ground|Scramble|going in for/i, "flag-run"],
];

function topicOf(shot: Shot): SceneTopic {
  for (const [pattern, topic] of TOPIC_PATTERNS) {
    if (pattern.test(shot.reason)) return topic;
  }
  return "action";
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

function summarize(
  shot: Shot,
  topic: SceneTopic,
  players: ScenePlayer[],
  events: SceneEvent[],
  flags: SceneFlagState[],
): string {
  const parts: string[] = [shot.reason];
  const carried = flags.find((f) => f.status === "carried");
  if (carried && topic !== "lull") {
    parts.push(
      `${carried.team} flag carried by ${carried.carrier}, ${carried.distFromHome}m from home` +
        (carried.distToCapture != null
          ? `, ${carried.distToCapture}m from a capture`
          : ""),
    );
  }
  const kills = events.filter((e) => e.type === "kill");
  if (kills.length > 0) {
    const first = kills[0];
    parts.push(
      `${first.actors[0]?.name} kills ${first.actors[1]?.name}${first.detail ? ` (${first.detail})` : ""}` +
        (kills.length > 1 ? ` — ${kills.length} kills in this window` : ""),
    );
  }
  const notable = players.filter((p) => p.doing && p.doing !== "skiing");
  if (notable.length > 0 && kills.length === 0) {
    const p = notable[0];
    parts.push(
      `${p.name} ${p.doing}${p.armor ? ` in ${p.armor} armor` : ""}${
        p.pack ? ` with ${aOrAn(p.pack)}` : ""
      }`,
    );
  }
  return parts.join(". ");
}

/** Attach a ShotScene to every shot in the plan, in place. */
export function describeScenes(plan: ShotPlan, dataset: DirectorDataset): void {
  const tracks = buildFlagTracks(dataset);
  const playersAtSec = playersAtSecFor(dataset);
  let prevKey: string | null = null;
  let runStartSec = 0;
  for (const shot of plan.shots) {
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
        )
      : [];
    const events = describeEvents(shot, dataset, tracks);
    const flags = describeFlags(shot, dataset, tracks);
    const scoreAt = (dataset.scoreSamples ?? []).filter(
      (s) => s.timeSec <= shot.startSec,
    );
    const latest = new Map<number, number>();
    for (const s of scoreAt) latest.set(s.teamId, s.score);
    shot.scene = {
      summary: summarize(shot, topic, players, events, flags),
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
    };
  }
}
