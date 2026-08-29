import { createLogger } from "../logger";
import type { TimelineEvent } from "../state/demoTimelineStore";
import type {
  DirectorDataset,
  DirectorEvent,
  DirectorFlagSample,
  DirectorFlagStand,
  DirectorPlayerSample,
  DirectorVec3,
  DirectorDeath,
  DirectorStation,
  DirectorVehicleSample,
  MortarShot,
  SkillShot,
  StructureTransition,
} from "../director/types";
import { createDemoStreamingRecording } from "./demoStreaming";
import { castWorldRay } from "../collision/worldCollision";
import { parseColorSegments, threeForwardHeading } from "./streamHelpers";
import type { StreamEntity, StreamSnapshot } from "./types";

const log = createLogger("demoDirectorScanner");

/** Flag track cadence — carriers move ~70 u/s, so ≥2 Hz. */
const FLAG_STEP_SEC = 0.5;
/** Players sample every other flag step (1 s). */
const PLAYER_EVERY_STEPS = 2;
/** Yield to the event loop every N seconds of demo time. */
const YIELD_EVERY_SEC = 5;
/** Kill events adopt the victim's nearest sample within this window. */
const KILL_POS_WINDOW_SEC = 1.5;
/** A carrier death message within this BEFORE the drop message means
 *  they died holding the flag (drop-then-death = intentional throw). */
const DROP_DEATH_WINDOW_SEC = 1.5;
/** A throw is a PASS when a teammate is this close at the toss… */
const PASS_FRIENDLY_RANGE = 100;
/** …or picks the flag up this soon (before any return). */
const PASS_PICKUP_WINDOW_SEC = 4;

/** Base structures worth tracking for damageState transitions. */
const STRUCTURE_DATABLOCK = /generator|sensor|turret|station|solar/i;
/** Mortar shells, identified by their projectile shape (verified
 *  against real demos: GrenadeProjectile / mortar_projectile.dts). */
const MORTAR_DATABLOCK = /mortar_projectile/i;
/** Spinfusor discs, for flavouring a kill as a disc hit. */
const DISC_DATABLOCK = /^disc\.dts$/i;
/** Grenade-launcher rounds (also hand grenades — same shape). */
const GRENADE_DATABLOCK = /grenade_projectile/i;
/** Server skill-shot announcements: chat kind "server", colorCode 5
 *  (live-verified) — the authoritative mid-air / headshot source. */
const SKILL_SHOT_COLOR = 5;
const MIDAIR_MSG = /^(.+) hit a mid air shot\.(?: \[(\d+)m, ([^\]]+)\])?$/;
const HEADSHOT_MSG = /^(.+) hit a sniper rifle headshot\.$/;
/** A skill shot within this of a death by the same shooter is the
 *  killing blow (message and death sampling both jitter). */
const SKILL_SHOT_KILL_WINDOW_SEC = 2;
/** Inventory stations — where players suit up (verified from demos:
 *  station_inv_human.dts, plus deployable inventories). */
/** ShapeBase thread slot for the activate animation ($ActivateThread). */
const ACTIVATE_THREAD_SLOT = 2;

const STATION_DATABLOCK = /station_inv_human|deploy_inventory/i;
/** Generators, the other fixture that only ever sits inside a base
 *  (verified from demos: station_generator_large.dts). */
const GENERATOR_DATABLOCK = /station_generator|generator_large/i;
/** Ordnance landing this close to a death, this recently, flavours it. */
const ORDNANCE_KILL_RANGE = 12;
const ORDNANCE_KILL_WINDOW_SEC = 1.5;
/** Feet-to-ground clearance below which a death does not count as
 *  mid-air. Generous: a disc landing on someone 6m up IS an MA. */
const MIDAIR_CLEARANCE = 6;
/** $BackpackSlot = 2 (item.cs): the mounted image that IS the pack. */
const BACKPACK_SLOT = 2;
/** pack_<key>.dts → commentary name. */
const PACK_NAMES: Record<string, string> = {
  upgrade_ammo: "ammo pack",
  upgrade_cloaking: "cloaking pack",
  upgrade_energy: "energy pack",
  upgrade_repair: "repair pack",
  upgrade_satchel: "satchel charge",
  upgrade_sensorjammer: "sensor jammer pack",
  upgrade_shield: "shield pack",
  barrel_aa: "AA turret barrel",
  barrel_elf: "ELF turret barrel",
  barrel_fusion: "plasma turret barrel",
  barrel_missile: "missile turret barrel",
  barrel_mortar: "mortar turret barrel",
  deploy_inventory: "deployable inventory",
  deploy_sensor_motion: "motion sensor",
  deploy_sensor_pulse: "pulse sensor",
  deploy_turreti: "deployable clamp turret",
  deploy_turreto: "deployable spike turret",
};

function packName(shapeName: string | undefined): string | undefined {
  if (!shapeName) return undefined;
  const m = /^pack_([a-z_]+)\.dts$/i.exec(shapeName);
  return m ? (PACK_NAMES[m[1].toLowerCase()] ?? m[1]) : undefined;
}

function isAlive(entity: StreamEntity): boolean {
  return (entity.damageState ?? 0) === 0;
}

function copyPos(pos: [number, number, number]): DirectorVec3 {
  return [pos[0], pos[1], pos[2]];
}

/**
 * Where the entity actually is: mounted entities (players in vehicles)
 * stop receiving their own position — walk to the outermost carrier,
 * like StreamingController's resolveCameraTarget.
 */
function resolvePosition(
  entity: StreamEntity,
  byId: Map<string, StreamEntity>,
): DirectorVec3 | null {
  let current = entity;
  for (let hops = 0; hops < 4 && current.mountObjectId; hops++) {
    const mount = byId.get(current.mountObjectId);
    if (!mount) break;
    current = mount;
  }
  return current.position ? copyPos(current.position) : null;
}

/**
 * Resolve a flag-marked entity's team, mirroring resolveFlagTeam
 * (components/flagTeam.ts) against this scan's own snapshot: items carry
 * the team as their sensor group; carriers identify it by the mounted
 * flag image's team skin.
 */
function flagTeamId(
  entity: StreamEntity,
  snapshot: StreamSnapshot,
): number | null {
  if (entity.type === "Player") {
    const slot = entity.imageSlots?.find((s) =>
      s?.shapeName?.toLowerCase().startsWith("flag"),
    );
    const skin = slot?.skinName?.toLowerCase();
    if (!skin) return null;
    return (
      snapshot.teamScores.find((t) => t.skinName === skin)?.teamId ??
      (skin === "base" ? 1 : skin === "baseb" ? 2 : null)
    );
  }
  const teamId = entity.teamId ?? null;
  return teamId != null && teamId > 0 ? teamId : null;
}

interface FlagCandidate {
  entity: StreamEntity;
  teamId: number | null;
  targetId: number;
  ghostIndex: number;
}

/**
 * Flag-marked entities (targetRenderFlags bit 0x2) in the same stable
 * order watchFollow's flagEntities uses, so slot numbers line up with
 * the flag-follow keys.
 */
function collectFlagCandidates(snapshot: StreamSnapshot): FlagCandidate[] {
  const flags: FlagCandidate[] = [];
  for (const entity of snapshot.entities) {
    if (((entity.targetRenderFlags ?? 0) & 0x2) === 0 || !isAlive(entity)) {
      continue;
    }
    flags.push({
      entity,
      teamId: flagTeamId(entity, snapshot),
      targetId:
        entity.targetId != null && entity.targetId >= 0
          ? entity.targetId
          : Number.MAX_SAFE_INTEGER,
      ghostIndex: entity.ghostIndex ?? 0,
    });
  }
  return flags.sort(
    (a, b) =>
      (a.teamId ?? Number.MAX_SAFE_INTEGER) -
        (b.teamId ?? Number.MAX_SAFE_INTEGER) ||
      a.targetId - b.targetId ||
      a.ghostIndex - b.ghostIndex ||
      a.entity.id.localeCompare(b.entity.id),
  );
}

/**
 * One background pass over the demo with an independent headless
 * StreamingPlayback, sampling flag/player positions and base-structure
 * damage transitions on a fixed cadence, plus position-correlating the
 * timeline events. Yields to the event loop to stay responsive; safe to
 * run while the same buffer plays back (separate parser, no shared
 * state).
 */
export async function scanDemoDirector(
  buffer: ArrayBuffer,
  timelineEvents: readonly TimelineEvent[],
  killEvents: readonly TimelineEvent[] = [],
  onProgress?: (progress: number) => void,
  signal?: AbortSignal,
): Promise<DirectorDataset> {
  const recording = await createDemoStreamingRecording(buffer);
  const playback = recording.streamingPlayback;
  const durationSec = Number.isFinite(recording.duration)
    ? Math.max(recording.duration, FLAG_STEP_SEC)
    : FLAG_STEP_SEC;

  const flagSamples: DirectorFlagSample[] = [];
  const playerSamples: DirectorPlayerSample[] = [];
  const vehicleSamples: DirectorVehicleSample[] = [];
  const structures: StructureTransition[] = [];
  const flagStands = new Map<number, DirectorFlagStand>();
  const nameToTarget = new Map<string, number>();
  /** Original-case name + skin, captured at first sight — for the
   *  commentary layer, which needs "ActionSwanson", not the lowercase
   *  matching key. */
  const playerIdentity = new Map<
    number,
    { displayName: string; skin?: string }
  >();
  /** Official clan tags (color-7 rawName segments) and the base name
   *  (color-6 segments), by lowercase full name. The tag includes its
   *  separator character as sent ("TF_", ">You"). */
  const officialNameParts = new Map<string, { clan: string; base: string }>();
  /** Sparse team-score timeline: one row per change. */
  const scoreSamples: {
    timeSec: number;
    teamId: number;
    score: number;
  }[] = [];
  const lastScores = new Map<number, number>();
  const samplesByTarget = new Map<number, DirectorPlayerSample[]>();
  const structureStates = new Map<string, number>();
  const mortarShots: MortarShot[] = [];
  const discShots: MortarShot[] = [];
  const grenadeShots: MortarShot[] = [];
  const skillShots: SkillShot[] = [];
  const seenChatIds = new Set<number>();
  const deaths: DirectorDeath[] = [];
  const stations = new Map<string, DirectorStation>();
  // Last seen alive-state and position per player, to catch the moment
  // they die (entity state gives this for EVERY player, where chat kill
  // messages only ever cover the recorder).
  const playerAlive = new Map<
    number,
    {
      alive: boolean;
      pos: DirectorVec3;
      teamId: number | null;
      timeSec: number;
      /** One sample further back, for the victim's speed at death. */
      prevPos?: DirectorVec3;
      prevTimeSec?: number;
    }
  >();
  // Shells in flight, keyed by entity id: first sighting is near the
  // shooter, last sighting near the impact.
  const mortarsInFlight = new Map<string, MortarShot>();
  const discsInFlight = new Map<string, MortarShot>();
  const grenadesInFlight = new Map<string, MortarShot>();

  const sampleFlags = (snapshot: StreamSnapshot, timeSec: number) => {
    const candidates = collectFlagCandidates(snapshot);
    if (candidates.length === 0) return;
    const byId = new Map(snapshot.entities.map((e) => [e.id, e]));
    const anyTeamed = candidates.some((c) => c.teamId != null);
    // While carried, the item ghost lingers hidden alongside the carrier
    // with the same team — group per slot and prefer the carrier.
    const bySlot = new Map<number, FlagCandidate[]>();
    candidates.forEach((candidate, index) => {
      const slot = anyTeamed ? candidate.teamId : index + 1;
      if (slot == null) return;
      let list = bySlot.get(slot);
      if (!list) bySlot.set(slot, (list = []));
      list.push(candidate);
    });
    for (const [slot, list] of bySlot) {
      const carrier = list.find((c) => c.entity.type === "Player");
      const chosen = carrier ?? list[0];
      const pos = resolvePosition(chosen.entity, byId);
      if (!pos) continue;
      const teamStatus =
        chosen.teamId != null
          ? snapshot.teamScores.find((t) => t.teamId === chosen.teamId)
              ?.flagStatus
          : undefined;
      const status: DirectorFlagSample["status"] =
        teamStatus ?? (carrier ? "held" : "home");
      const carrierTargetId =
        carrier &&
        carrier.entity.targetId != null &&
        carrier.entity.targetId >= 0
          ? carrier.entity.targetId
          : null;
      flagSamples.push({ timeSec, slot, pos, carrierTargetId, status });
      if (!flagStands.has(slot) && status === "home") {
        const teams = snapshot.teamScores;
        flagStands.set(slot, {
          slot,
          teamId: chosen.teamId,
          name:
            chosen.teamId != null
              ? (teams.find((t) => t.teamId === chosen.teamId)?.name ?? null)
              : (chosen.entity.playerName ?? null),
          pos,
        });
      }
    }
  };

  const samplePlayers = (snapshot: StreamSnapshot, timeSec: number) => {
    const byId = new Map(snapshot.entities.map((e) => [e.id, e]));
    for (const entity of snapshot.entities) {
      if (entity.type !== "Player" || !isAlive(entity)) continue;
      const targetId =
        entity.targetId != null && entity.targetId >= 0
          ? entity.targetId
          : null;
      if (targetId == null) continue;
      const pos = resolvePosition(entity, byId);
      if (!pos) continue;
      // Facing, for shots that need to be in front of someone. The
      // rotation is already Three-space; threeForwardHeading yields the
      // same convention the orbit/aim code uses.
      const rotation = entity.rotation;
      const shape = entity.dataBlock?.toLowerCase() ?? "";
      const sample: DirectorPlayerSample = {
        timeSec,
        targetId,
        teamId:
          entity.teamId != null && entity.teamId > 0 ? entity.teamId : null,
        pos,
        armor: shape.includes("heavy")
          ? "heavy"
          : shape.includes("medium")
            ? "medium"
            : shape.includes("light")
              ? "light"
              : undefined,
        pack: packName(entity.imageSlots?.[BACKPACK_SLOT]?.shapeName),
        health: entity.health,
        heading: rotation
          ? threeForwardHeading({
              x: rotation[0],
              y: rotation[1],
              z: rotation[2],
              w: rotation[3],
            })
          : undefined,
      };
      playerSamples.push(sample);
      let track = samplesByTarget.get(targetId);
      if (!track) samplesByTarget.set(targetId, (track = []));
      track.push(sample);
      if (entity.playerName) {
        nameToTarget.set(entity.playerName.toLowerCase(), targetId);
        if (!playerIdentity.has(targetId)) {
          playerIdentity.set(targetId, {
            displayName: entity.playerName,
            skin: entity.skinName ?? entity.skinPrefName ?? undefined,
          });
        }
      }
    }
  };

  // Keyed by SHAPE FILE — that is what the stream reports as a
  // vehicle entity's dataBlock, not the datablock's script name.
  const VEHICLE_KINDS: Record<string, DirectorVehicleSample["kind"]> = {
    "vehicle_air_scout.dts": "shrike",
    "vehicle_air_bomber.dts": "bomber",
    "vehicle_air_hapc.dts": "havoc",
    "vehicle_grav_tank.dts": "tank",
    "vehicle_land_mpbase.dts": "mpb",
    "vehicle_grav_scout.dts": "wildcat",
  };

  const sampleVehicles = (snapshot: StreamSnapshot, timeSec: number) => {
    // Riders per mount: players report the entity id they are mounted
    // on, so one pass over the players counts every vehicle's crew.
    let riders: Map<string, number> | null = null;
    for (const entity of snapshot.entities) {
      const kind = entity.dataBlock
        ? VEHICLE_KINDS[entity.dataBlock.toLowerCase()]
        : undefined;
      if (!kind || !entity.position) continue;
      if (!riders) {
        riders = new Map();
        for (const p of snapshot.entities) {
          if (p.type !== "Player" || !p.mountObjectId) continue;
          riders.set(p.mountObjectId, (riders.get(p.mountObjectId) ?? 0) + 1);
        }
      }
      vehicleSamples.push({
        timeSec,
        key: entity.id,
        kind,
        teamId:
          entity.teamId != null && entity.teamId > 0 ? entity.teamId : null,
        pos: copyPos(entity.position),
        passengers: riders.get(entity.id) ?? 0,
      });
    }
  };

  const sampleOrdnance = (
    snapshot: StreamSnapshot,
    timeSec: number,
    match: RegExp,
    inFlight: Map<string, MortarShot>,
    landed: MortarShot[],
  ) => {
    const alive = new Set<string>();
    let byGhostIndex: Map<number, StreamSnapshot["entities"][number]> | null =
      null;
    for (const entity of snapshot.entities) {
      if (
        entity.type !== "Projectile" ||
        !entity.dataBlock ||
        !match.test(entity.dataBlock) ||
        !entity.position
      ) {
        continue;
      }
      alive.add(entity.id);
      const tracked = inFlight.get(entity.id);
      if (tracked) {
        tracked.toPrev = tracked.to;
        tracked.to = copyPos(entity.position);
        tracked.endSec = timeSec;
        if (tracked.shooterTargetId == null) {
          tracked.shooterTargetId = resolveShooter(entity);
        }
      } else {
        const pos = copyPos(entity.position);
        inFlight.set(entity.id, {
          timeSec,
          from: pos,
          to: pos,
          shooterTargetId: resolveShooter(entity),
        });
      }
    }
    // The packet names the shooter: sourceObject is the firing ghost.
    function resolveShooter(entity: {
      sourceGhostIndex?: number;
    }): number | null {
      if (entity.sourceGhostIndex == null) return null;
      if (!byGhostIndex) {
        byGhostIndex = new Map();
        for (const e of snapshot.entities) {
          if (e.ghostIndex != null) byGhostIndex.set(e.ghostIndex, e);
        }
      }
      const source = byGhostIndex.get(entity.sourceGhostIndex);
      return source?.type === "Player" &&
        source.targetId != null &&
        source.targetId >= 0
        ? source.targetId
        : null;
    }
    // A round that vanished has landed — retire it to the shot list.
    for (const [id, shot] of inFlight) {
      if (!alive.has(id)) {
        landed.push(shot);
        inFlight.delete(id);
      }
    }
  };

  const sampleStations = (snapshot: StreamSnapshot, timeSec: number) => {
    for (const entity of snapshot.entities) {
      if (!entity.dataBlock || !entity.position) continue;
      const isStation = STATION_DATABLOCK.test(entity.dataBlock);
      const isGenerator =
        !isStation && GENERATOR_DATABLOCK.test(entity.dataBlock);
      if (!isStation && !isGenerator) continue;
      // Keyed by rounded position, not entity id: station ghosts are
      // recreated as they come in and out of scope, and one physical
      // station must not become dozens of camera anchors.
      const key = entity.position.map((n) => Math.round(n / 5)).join(",");
      let station = stations.get(key);
      if (!station) {
        station = {
          pos: copyPos(entity.position),
          kind: isGenerator ? "generator" : "inventory",
          deployed: /deploy/i.test(entity.dataBlock),
          activations: [],
        };
        stations.set(key, station);
      }
      // The activate thread ($ActivateThread = 2) playing means somebody
      // is USING this station right now — the signal that separates the
      // inventory actually in use from one people happen to stand near.
      // A finished animation freezes at state Play with atEnd set, so
      // without the atEnd check a station used once reads as
      // "activating" for the rest of the demo.
      const active = entity.threads?.some(
        (th) =>
          th.index === ACTIVATE_THREAD_SLOT && th.state === 0 && !th.atEnd,
      );
      if (active) {
        const sec = Math.round(timeSec);
        const activations = (station.activations ??= []);
        if (activations[activations.length - 1] !== sec) {
          activations.push(sec);
        }
      }
    }
  };

  /** Catch alive → dead transitions, attributing a likely killer. */
  const sampleDeaths = (snapshot: StreamSnapshot, timeSec: number) => {
    const byId = new Map(snapshot.entities.map((e) => [e.id, e]));
    const living: {
      targetId: number;
      teamId: number | null;
      pos: DirectorVec3;
    }[] = [];
    const seen = new Map<
      number,
      { alive: boolean; pos: DirectorVec3; teamId: number | null }
    >();
    for (const entity of snapshot.entities) {
      if (entity.type !== "Player") continue;
      const targetId =
        entity.targetId != null && entity.targetId >= 0
          ? entity.targetId
          : null;
      if (targetId == null) continue;
      const pos = resolvePosition(entity, byId);
      if (!pos) continue;
      const teamId =
        entity.teamId != null && entity.teamId > 0 ? entity.teamId : null;
      const alive = isAlive(entity);
      // A respawned body reads as alive again on a fresh ghost, which is
      // exactly the transition we want to arm for the next death.
      const previous = seen.get(targetId);
      if (!previous || alive) seen.set(targetId, { alive, pos, teamId });
      if (alive) living.push({ targetId, teamId, pos });
    }
    for (const [targetId, now] of seen) {
      const before = playerAlive.get(targetId);
      playerAlive.set(targetId, {
        ...now,
        timeSec,
        prevPos: before?.pos,
        prevTimeSec: before?.timeSec,
      });
      if (!before?.alive || now.alive) continue;
      // Died since the last sample: frame it from where they fell. The
      // killer is attributed AFTER the scan from the kill chat messages
      // (the only authority — a nearby enemy is just a bystander, and a
      // suicide has no killer at all).
      const pos = before.pos;
      const near = (rounds: MortarShot[]) =>
        rounds.some(
          (r) =>
            Math.abs(r.timeSec - timeSec) <= ORDNANCE_KILL_WINDOW_SEC + 4 &&
            Math.hypot(r.to[0] - pos[0], r.to[1] - pos[1], r.to[2] - pos[2]) <=
              ORDNANCE_KILL_RANGE,
        );
      // Mid-air detection: the game's signature skill shot is the
      // airborne disc — nothing under the victim's feet, and moving.
      // castWorldRay (terrain + interiors) so an indoor upper floor
      // does not read as "airborne".
      const airborne =
        castWorldRay(
          [pos[0], pos[1], pos[2] + 0.5],
          [pos[0], pos[1], pos[2] - MIDAIR_CLEARANCE],
        ) == null;
      const speed =
        before.prevPos != null &&
        before.prevTimeSec != null &&
        before.timeSec > before.prevTimeSec
          ? Math.hypot(
              before.pos[0] - before.prevPos[0],
              before.pos[1] - before.prevPos[1],
              before.pos[2] - before.prevPos[2],
            ) /
            (before.timeSec - before.prevTimeSec)
          : undefined;
      deaths.push({
        timeSec,
        targetId,
        teamId: now.teamId,
        pos,
        killerTargetId: null,
        killerPos: undefined,
        weapon: near(mortarShots)
          ? "mortar"
          : near(discShots)
            ? "disc"
            : undefined,
        airborne: airborne || undefined,
        speed,
      });
    }
  };

  const sampleStructures = (snapshot: StreamSnapshot, timeSec: number) => {
    for (const entity of snapshot.entities) {
      if (
        entity.type === "Player" ||
        !entity.dataBlock ||
        !STRUCTURE_DATABLOCK.test(entity.dataBlock) ||
        entity.damageState == null ||
        !entity.position
      ) {
        continue;
      }
      const previous = structureStates.get(entity.id);
      if (previous != null && previous !== entity.damageState) {
        structures.push({
          timeSec,
          name: entity.dataBlock,
          className: entity.className ?? entity.type,
          pos: copyPos(entity.position),
          from: previous,
          to: entity.damageState,
        });
      }
      structureStates.set(entity.id, entity.damageState);
    }
  };

  let lastYield = 0;
  let step = 0;
  for (let t = 0; t <= durationSec; t += FLAG_STEP_SEC, step++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const snapshot = playback.stepToTime(t);
    sampleFlags(snapshot, t);
    if (step % PLAYER_EVERY_STEPS === 0) {
      samplePlayers(snapshot, t);
      sampleVehicles(snapshot, t);
      for (const team of snapshot.teamScores) {
        if (team.teamId > 0 && lastScores.get(team.teamId) !== team.score) {
          lastScores.set(team.teamId, team.score);
          scoreSamples.push({
            timeSec: t,
            teamId: team.teamId,
            score: team.score,
          });
        }
      }
    }
    sampleStructures(snapshot, t);
    sampleOrdnance(snapshot, t, MORTAR_DATABLOCK, mortarsInFlight, mortarShots);
    sampleOrdnance(snapshot, t, DISC_DATABLOCK, discsInFlight, discShots);
    sampleOrdnance(
      snapshot,
      t,
      GRENADE_DATABLOCK,
      grenadesInFlight,
      grenadeShots,
    );
    sampleStations(snapshot, t);
    sampleDeaths(snapshot, t);
    for (const entry of snapshot.playerRoster ?? []) {
      if (!entry.rawName || officialNameParts.has(entry.name.toLowerCase())) {
        continue;
      }
      // Stock server.cs wraps names "\cp\c7" @ tag @ "\c6" @ name @
      // "\co" (or tag appended) — the official clan tag is exactly the
      // color-7 segments, the base name the color-6 ones. Verified live
      // (ski-club server): TF_flyersfan → [c7]"TF_" [c6]"flyersfan".
      const segments = parseColorSegments(entry.rawName, {
        taggedColors: true,
      });
      const tag = segments
        .filter((seg) => seg.colorCode === 7)
        .map((seg) => seg.text)
        .join("")
        .trim();
      const base = segments
        .filter((seg) => seg.colorCode === 6)
        .map((seg) => seg.text)
        .join("")
        .trim();
      if (tag && base) {
        officialNameParts.set(entry.name.toLowerCase(), { clan: tag, base });
      }
    }
    for (const msg of snapshot.chatMessages ?? []) {
      if (
        seenChatIds.has(msg.id) ||
        msg.kind !== "server" ||
        msg.colorCode !== SKILL_SHOT_COLOR
      ) {
        continue;
      }
      seenChatIds.add(msg.id);
      const ma = MIDAIR_MSG.exec(msg.text);
      const hs = ma ? null : HEADSHOT_MSG.exec(msg.text);
      const name = ma?.[1] ?? hs?.[1];
      if (!name) continue;
      skillShots.push({
        timeSec: msg.timeSec,
        targetId: nameToTarget.get(name.toLowerCase()) ?? null,
        name,
        kind: ma ? "midair" : "headshot",
        rangeM: ma?.[2] != null ? parseInt(ma[2], 10) : undefined,
        weapon: ma?.[3],
      });
    }
    if (snapshot.exhausted) break;
    if (t - lastYield >= YIELD_EVERY_SEC) {
      lastYield = t;
      onProgress?.(Math.min(t / durationSec, 1));
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  // Attribute deaths from the kill chat messages: victim name → target
  // id → the entity-state death nearest in time gets the message's
  // killer and weapon. This is the ONLY killer attribution — a death
  // with no matching kill message (suicide, turret, fall) keeps
  // killerTargetId null. The projectile inference stays as the weapon
  // fallback for demos whose messages lack the damage-type argument.
  const killsByVictim = new Map<number, TimelineEvent[]>();
  for (const kill of killEvents) {
    if (!kill.victim) continue;
    const targetId = nameToTarget.get(kill.victim.toLowerCase());
    if (targetId == null) continue;
    let list = killsByVictim.get(targetId);
    if (!list) killsByVictim.set(targetId, (list = []));
    list.push(kill);
  }
  // Each kill message attributes AT MOST one death: a scope-flickered
  // ghost can produce two death transitions inside one message's
  // window, and crediting both would invent a kill.
  const usedKills = new Set<TimelineEvent>();
  for (const death of deaths) {
    const candidates = killsByVictim.get(death.targetId);
    if (!candidates) continue;
    let best: TimelineEvent | null = null;
    for (const kill of candidates) {
      if (usedKills.has(kill)) continue;
      const dt = Math.abs(kill.timeSec - death.timeSec);
      if (dt > KILL_POS_WINDOW_SEC) continue;
      if (!best || dt < Math.abs(best.timeSec - death.timeSec)) best = kill;
    }
    if (!best) continue;
    usedKills.add(best);
    if (best.weapon) death.weapon = best.weapon.toLowerCase();
    const killerId = best.killer
      ? nameToTarget.get(best.killer.toLowerCase())
      : undefined;
    if (killerId != null) {
      death.killerTargetId = killerId;
      // The killer's position at the kill, from their own samples.
      let nearest: DirectorPlayerSample | null = null;
      for (const sample of samplesByTarget.get(killerId) ?? []) {
        if (
          Math.abs(sample.timeSec - death.timeSec) <= KILL_POS_WINDOW_SEC &&
          (!nearest ||
            Math.abs(sample.timeSec - death.timeSec) <
              Math.abs(nearest.timeSec - death.timeSec))
        ) {
          nearest = sample;
        }
        if (sample.timeSec > death.timeSec + KILL_POS_WINDOW_SEC) break;
      }
      death.killerPos = nearest?.pos;
    }
  }

  // MID-AIR / HEADSHOT verdicts: the server announces every skill
  // shot itself (chat color 5) — correlate each announcement to the
  // nearest death by that shooter. No geometry, no inference; a shot
  // with no matching death was non-lethal (kept in skillShots for the
  // scenes to call anyway).
  for (const shot of skillShots) {
    if (shot.targetId == null) continue;
    let best: DirectorDeath | null = null;
    for (const death of deaths) {
      if (death.killerTargetId !== shot.targetId) continue;
      const dt = Math.abs(death.timeSec - shot.timeSec);
      if (dt > SKILL_SHOT_KILL_WINDOW_SEC) continue;
      if (shot.kind === "midair" ? death.midair : death.headshot) continue;
      if (!best || dt < Math.abs(best.timeSec - shot.timeSec)) {
        best = death;
      }
    }
    if (!best) continue;
    shot.lethal = true;
    if (shot.kind === "midair") best.midair = true;
    else best.headshot = true;
  }

  // Position-correlate kill events: victim name → target id → the
  // victim's nearest sample. Position-less events degrade gracefully
  // (the planner skips them for clustering).
  const events: DirectorEvent[] = timelineEvents.map((event) => {
    if (event.type !== "kill" && event.type !== "death") return { ...event };
    const victim = event.victim?.toLowerCase();
    const targetId = victim != null ? nameToTarget.get(victim) : undefined;
    const track = targetId != null ? samplesByTarget.get(targetId) : undefined;
    if (!track) return { ...event };
    let best: DirectorPlayerSample | null = null;
    for (const sample of track) {
      if (
        Math.abs(sample.timeSec - event.timeSec) <= KILL_POS_WINDOW_SEC &&
        (!best ||
          Math.abs(sample.timeSec - event.timeSec) <
            Math.abs(best.timeSec - event.timeSec))
      ) {
        best = sample;
      }
      if (sample.timeSec > event.timeSec + KILL_POS_WINDOW_SEC) break;
    }
    return best ? { ...event, pos: best.pos } : { ...event };
  });

  const finalSnapshot = playback.getSnapshot();

  // Flag drops: died-holding vs thrown vs a pass — the intent question
  // the booth keeps getting wrong. The chat ORDER tells the truth: the
  // server prints the carrier's death message BEFORE the drop message
  // when they died holding it; a drop with no immediately-preceding
  // death is an intentional throw. A throw with teammates in reach, or
  // one a teammate picks up within seconds, reads as a pass.
  for (const event of events) {
    if (event.type !== "flag-drop") continue;
    const actorKey = event.actor?.toLowerCase();
    const throwerId = actorKey != null ? nameToTarget.get(actorKey) : undefined;
    const died = killEvents.some(
      (k) =>
        k.victim?.toLowerCase() === actorKey &&
        event.timeSec - k.timeSec >= 0 &&
        event.timeSec - k.timeSec <= DROP_DEATH_WINDOW_SEC,
    );
    if (died) {
      event.dropKind = "died";
      continue;
    }
    event.dropKind = "thrown";
    // Thrower's team and position, from their nearest sample.
    let thrower: DirectorPlayerSample | null = null;
    for (const sample of samplesByTarget.get(throwerId ?? -1) ?? []) {
      const dt = Math.abs(sample.timeSec - event.timeSec);
      if (
        dt <= 2 &&
        (!thrower || dt < Math.abs(thrower.timeSec - event.timeSec))
      ) {
        thrower = sample;
      }
      if (sample.timeSec > event.timeSec + 2) break;
    }
    let pass = false;
    if (thrower?.teamId != null) {
      for (const p of playerSamples) {
        if (
          p.targetId !== throwerId &&
          p.teamId === thrower.teamId &&
          Math.abs(p.timeSec - event.timeSec) <= 1 &&
          Math.hypot(
            p.pos[0] - thrower.pos[0],
            p.pos[1] - thrower.pos[1],
            p.pos[2] - thrower.pos[2],
          ) <= PASS_FRIENDLY_RANGE
        ) {
          pass = true;
          break;
        }
      }
    }
    if (!pass && thrower?.teamId != null) {
      // A teammate picking it up before it returns is a completed pass.
      const slot = finalSnapshot.teamScores.find(
        (t) => t.name.toLowerCase() === event.flagTeamName?.toLowerCase(),
      )?.teamId;
      for (const f of flagSamples) {
        if (f.slot !== slot || f.timeSec <= event.timeSec) continue;
        if (f.timeSec > event.timeSec + PASS_PICKUP_WINDOW_SEC) break;
        if (f.status === "home") break;
        if (f.carrierTargetId != null && f.carrierTargetId !== throwerId) {
          let grabber: DirectorPlayerSample | null = null;
          for (const sample of samplesByTarget.get(f.carrierTargetId) ?? []) {
            const dt = Math.abs(sample.timeSec - f.timeSec);
            if (
              dt <= 2 &&
              (!grabber || dt < Math.abs(grabber.timeSec - f.timeSec))
            ) {
              grabber = sample;
            }
            if (sample.timeSec > f.timeSec + 2) break;
          }
          if (grabber?.teamId === thrower.teamId) pass = true;
          break;
        }
      }
    }
    if (pass) event.dropKind = "pass";
  }
  // How far the map lets a camera see. A wide shot placed beyond the fog
  // frames a screen of haze, however many players are nominally inside
  // it, and Tribes maps range from 50m pea soup to 1200m clear air.
  const sky = finalSnapshot.entities.find(
    (e) => e.sceneData?.className === "Sky",
  )?.sceneData;
  const visibility =
    sky?.className === "Sky"
      ? { fogDistance: sky.fogDistance, visibleDistance: sky.visibleDistance }
      : undefined;
  const dataset: DirectorDataset = {
    durationSec,
    visibility,
    flagSampleStepSec: FLAG_STEP_SEC,
    playerSampleStepSec: FLAG_STEP_SEC * PLAYER_EVERY_STEPS,
    gameClassName: playback.gameClassName,
    teams: finalSnapshot.teamScores.map((t) => ({
      teamId: t.teamId,
      name: t.name,
    })),
    flagStands: [...flagStands.values()].sort((a, b) => a.slot - b.slot),
    events,
    flagSamples,
    playerSamples,
    structures,
    mortarShots: [...mortarShots, ...mortarsInFlight.values()].sort(
      (a, b) => a.timeSec - b.timeSec,
    ),
    discShots: [...discShots, ...discsInFlight.values()].sort(
      (a, b) => a.timeSec - b.timeSec,
    ),
    grenadeShots: [...grenadeShots, ...grenadesInFlight.values()].sort(
      (a, b) => a.timeSec - b.timeSec,
    ),
    skillShots,
    deaths,
    stations: [...stations.values()],
    vehicles: vehicleSamples,
    // Keyed by TARGET ID, not name: a player who rejoins gets a new
    // target id, and a name-keyed map would orphan their earlier id
    // (the "player 79" lineup bug — the entity had the name all along).
    playerNames: [...playerIdentity.entries()].map(([targetId, id]) => ({
      targetId,
      name: id.displayName.toLowerCase(),
      displayName: id.displayName,
      skin: id.skin,
      clan: officialNameParts.get(id.displayName.toLowerCase())?.clan,
      baseName: officialNameParts.get(id.displayName.toLowerCase())?.base,
    })),
    scoreSamples,
  };
  log.info(
    "Scanned %ds: %d flag samples (%d stands), %d player samples, %d structure transitions, %d mortar shots, %d deaths, %d stations",
    Math.round(durationSec),
    flagSamples.length,
    dataset.flagStands.length,
    playerSamples.length,
    structures.length,
    dataset.mortarShots.length,
    dataset.deaths.length,
    dataset.stations.length,
  );
  onProgress?.(1);
  return dataset;
}
