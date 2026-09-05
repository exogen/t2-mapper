/**
 * Incremental match trackers — the causal core of cast generation.
 *
 * One reducer accumulates everything the director's dataset holds, fed
 * strictly forward, one `step(snapshot, t)` per sampled tick, with the
 * raw server messages on each snapshot as the events. No
 * code here may read ahead of the data it has been fed — this is what
 * makes the same engine work over a demo (pumped faster than realtime)
 * and a delayed live stream (see the causal-director design: decisions
 * get a 2s information horizon).
 *
 * Events come from the raw server-message feed on each snapshot,
 * parsed by CastGenius's own scanner (directorEventScanner) — the chat
 * log is ground truth, stamped at the moment of the kill or flag touch
 * itself. Some derived FACTS still finalize late: matching a kill
 * message to an entity-state death needs the neighbouring position
 * samples either side of it, and a thrown flag is only provably a pass
 * once a teammate picks it up. Those resolve on cursors a fixed few
 * seconds behind `step` time — sample-availability latency, not
 * lookahead — and a snapshot at the end of the recording drains every
 * cursor.
 */
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
  MatchFacts,
  MortarShot,
  SkillShot,
  VoiceBind,
  StructureTransition,
} from "../director/types";
import { castWorldRay } from "../collision/worldCollision";
import { scanDirectorEvent } from "./directorEventScanner";
import { parseColorSegments, threeForwardHeading } from "./streamHelpers";
import type { PlayerRosterEntry, StreamEntity, StreamSnapshot } from "./types";

/** Flag track cadence — carriers move ~70 u/s, so ≥2 Hz. */
export const FLAG_STEP_SEC = 0.5;
/** Players sample every other flag step (1 s). */
export const PLAYER_EVERY_STEPS = 2;
/** Kill events adopt the victim's nearest sample within this window. */
const KILL_POS_WINDOW_SEC = 1.5;
/** A carrier death message within this BEFORE the drop message means
 *  they died holding the flag (drop-then-death = intentional throw). */
const DROP_DEATH_WINDOW_SEC = 1.5;
/** A throw is a PASS when a teammate is this close at the toss… */
const PASS_FRIENDLY_RANGE = 100;
/** …or picks the flag up this soon (before any return). */
const PASS_PICKUP_WINDOW_SEC = 4;

/**
 * Resolution lags: how far behind `step` time each cursor runs, chosen
 * so every input a resolution reads is necessarily already ingested
 * (message windows, neighbour samples, and the cursors it depends on).
 * Facts are immutable once resolved, so these must be generous rather
 * than tight; they are latency, never lookahead.
 */
const RESOLVE_KILLS_LAG_SEC = 4;
/** Skill shots read deaths' RESOLVED attribution ±2s around them. */
const RESOLVE_SKILL_LAG_SEC = 8;
const RESOLVE_EVENT_POS_LAG_SEC = 4;
/** Drop classification waits out the pass-pickup window plus the
 *  grabber's neighbour samples. */
const RESOLVE_DROPS_LAG_SEC = 8;

/** Base structures worth tracking for damageState transitions. */
const STRUCTURE_DATABLOCK = /generator|sensor|turret|station|solar/i;
/** Pieces of a structure that are not structures: a base turret's
 *  belly mount ghosts separately, and counted as four extra turrets per
 *  base (and four extra "destroyed" events when the turret died). */
const STRUCTURE_IGNORE = /turret_belly_base/i;
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
/** The key sequence the chat HUD prefixes a canned line with. */
const VOICE_BIND_KEYS = /^\[(V[A-Z]+)\]\s*$/;
const MIDAIR_MSG = /^(.+) hit a mid air shot\.(?: \[(\d+)m, ([^\]]+)\])?$/;
const HEADSHOT_MSG = /^(.+) hit a sniper rifle headshot\.$/;
/** A skill shot within this of a death by the same shooter is the
 *  killing blow (message and death sampling both jitter). */
const SKILL_SHOT_KILL_WINDOW_SEC = 2;
/** ShapeBase thread slot for the activate animation ($ActivateThread). */
const ACTIVATE_THREAD_SLOT = 2;

/** Inventory stations — where players suit up (verified from demos:
 *  station_inv_human.dts, plus deployable inventories). */
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

/**
 * Deployed/base structure shape → commentary name. Placement variants
 * collapse deliberately: the spider clamp's wall/floor/ceiling shapes
 * are all one turret, and "indoor"/"outdoor" in the filenames must
 * never reach the booth — whether a deployable actually sits indoors
 * is unknowable from here (style guide: call them by official name or
 * "deployable turret", never guess placement).
 */
const STRUCTURE_NAMES: Record<string, string> = {
  turret_base_large: "base turret",
  turret_sentry: "sentry turret",
  turret_indoor_deployw: "spider clamp turret",
  turret_indoor_deployf: "spider clamp turret",
  turret_indoor_deployc: "spider clamp turret",
  turret_outdoor_deploy: "land spike turret",
  station_inv_human: "inventory station",
  station_generator_large: "generator",
  station_generator: "generator",
  vehicle_pad_station: "vehicle station",
  sensor_pulse_large: "large pulse sensor",
  deploy_sensor_motion: "motion sensor",
  deploy_sensor_pulse: "pulse sensor",
  deploy_inventory: "deployable inventory",
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

function structureName(shapeName: string): string {
  const key = shapeName.replace(/\.dts$/i, "").toLowerCase();
  // Unknown shapes still read as words, never as a filename.
  return STRUCTURE_NAMES[key] ?? key.replace(/_/g, " ");
}

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

/** One client's stretch on a target id, with every name it wore. */
interface IdentityStretch {
  /** The target id's generation (times freed) during this stretch. */
  generation: number;
  clientId: number | null;
  fromSec: number;
  toSec: number | null;
  names: { timeSec: number; displayName: string; rawName: string | null }[];
  skin?: string;
}

/**
 * The official clan tag and base name inside a raw (color-coded) name.
 * Stock server.cs wraps names "\cp\c7" @ tag @ "\c6" @ name @ "\co"
 * (or with the tag appended) — the tag is exactly the color-7
 * segments, the base name the color-6 ones. Verified live (ski-club
 * server): TF_flyersfan → [c7]"TF_" [c6]"flyersfan". The tag-change
 * script on those servers builds names the same way.
 */
function officialNameParts(
  rawName: string | null,
): { clan: string; base: string } | null {
  if (!rawName) return null;
  const segments = parseColorSegments(rawName, { taggedColors: true });
  const text = (color: number) =>
    segments
      .filter((seg) => seg.colorCode === color)
      .map((seg) => seg.text)
      .join("")
      .trim();
  const clan = text(7);
  const base = text(6);
  return clan && base ? { clan, base } : null;
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

/** Playback-derived metadata a snapshot stamps onto the dataset. */
export interface TrackerSnapshotMeta {
  durationSec: number;
  gameClassName: string | null;
  missionName?: string | null;
  missionDisplayName?: string | null;
  gameType?: string | null;
  serverDisplayName?: string | null;
}

export class DirectorTrackers {
  // ── Accumulated dataset state (all strictly forward) ──
  private readonly flagSamples: DirectorFlagSample[] = [];
  private readonly playerSamples: DirectorPlayerSample[] = [];
  private readonly vehicleSamples: DirectorVehicleSample[] = [];
  private readonly structures: StructureTransition[] = [];
  private readonly flagStands = new Map<number, DirectorFlagStand>();
  private readonly nameToTarget = new Map<string, number>();
  /**
   * Who wore each target id, and as what. Target ids are recycled, so
   * a target's history is a list of stretches, one per generation of the
   * id (each free and reissue); a
   * stretch keeps every name the player had while wearing it, since
   * some servers let them change their tag — or their whole name —
   * mid-match.
   */
  private readonly identities = new Map<number, IdentityStretch[]>();
  /** Sparse team-score timeline: one row per change. */
  private readonly scoreSamples: {
    timeSec: number;
    teamId: number;
    score: number;
  }[] = [];
  private readonly lastScores = new Map<number, number>();
  // Match facts for the commentary layer, whose ONLY input is the
  // cast.json — already a causal time-series by design.
  private readonly factsTeams = new Map<number, string>();
  private readonly factsScores: MatchFacts["scores"] = [];
  private readonly structureSeen = new Set<string>();
  private readonly structureInventory: DirectorDataset["structureInventory"] =
    [];
  private readonly factsClock: { timeSec: number; clockMs: number }[] = [];
  private matchSeenRunningSec: number | null = null;
  private readonly factsRoster: MatchFacts["roster"] = [];
  private factsRosterCount = -1;
  private factsRosterPushedSec = Number.NEGATIVE_INFINITY;
  private readonly samplesByTarget = new Map<number, DirectorPlayerSample[]>();
  private readonly structureStates = new Map<string, number>();
  private readonly mortarShots: MortarShot[] = [];
  private readonly discShots: MortarShot[] = [];
  private readonly grenadeShots: MortarShot[] = [];
  private readonly skillShots: SkillShot[] = [];
  private readonly seenChatIds = new Set<number>();
  private readonly voiceBinds: VoiceBind[] = [];
  private readonly seenVoiceIds = new Set<number>();
  private readonly deaths: DirectorDeath[] = [];
  private readonly stations = new Map<string, DirectorStation>();
  // Last seen alive-state and position per player, to catch the moment
  // they die (entity state gives this for EVERY player, where chat kill
  // messages only ever cover the recorder).
  private readonly playerAlive = new Map<
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
  private readonly mortarsInFlight = new Map<string, MortarShot>();
  private readonly discsInFlight = new Map<string, MortarShot>();
  private readonly grenadesInFlight = new Map<string, MortarShot>();

  // ── Events parsed from the server-message feed, and cursors ──
  /** Director events in message order (the dataset's `events`). */
  private readonly events: DirectorEvent[] = [];
  /** Player-vs-player kills — the killer-attribution authority. */
  private readonly killEvents: TimelineEvent[] = [];
  /** EVERY death message (kills + self-inflicted), for questions like
   *  "did the carrier die right before this drop?". */
  private readonly deathMessages: DirectorEvent[] = [];
  private readonly seenServerEventIds = new Set<number>();
  private readonly usedKills = new Set<TimelineEvent>();
  private matchStartSec: number | null = null;
  private matchEndSec: number | null = null;
  /** Demo time the match began, once known, so a caller stepping the
   *  stream can tell which of its own observations were made DURING
   *  the match rather than after it — a recording that runs to the map
   *  change carries the next mission's info at its tail. */
  get matchStartedAtSec(): number | null {
    return this.matchStartSec;
  }
  private killCursor = 0;
  private skillCursor = 0;
  private eventPosCursor = 0;
  private dropCursor = 0;

  // ── Live scene facts refreshed each step ──
  private lastTeamScores: StreamSnapshot["teamScores"] = [];
  private visibility: DirectorDataset["visibility"];
  private stepCount = 0;

  /** Feed one stepped snapshot. `timeSec` must be non-decreasing. */
  /** When the server said the world was fully ghosted in. */
  worldCompleteSec: number | null = null;

  step(snapshot: StreamSnapshot, timeSec: number): void {
    if (snapshot.ghostAlwaysDoneSec != null && this.worldCompleteSec == null) {
      this.worldCompleteSec = snapshot.ghostAlwaysDoneSec;
    }
    this.ingestServerEvents(snapshot);
    this.sampleFlags(snapshot, timeSec);
    if (this.stepCount % PLAYER_EVERY_STEPS === 0) {
      this.samplePlayers(snapshot, timeSec);
      this.sampleVehicles(snapshot, timeSec);
      this.sampleFacts(snapshot, timeSec);
    }
    this.stepCount++;
    this.sampleStructures(snapshot, timeSec);
    this.sampleOrdnance(
      snapshot,
      timeSec,
      MORTAR_DATABLOCK,
      this.mortarsInFlight,
      this.mortarShots,
    );
    this.sampleOrdnance(
      snapshot,
      timeSec,
      DISC_DATABLOCK,
      this.discsInFlight,
      this.discShots,
    );
    this.sampleOrdnance(
      snapshot,
      timeSec,
      GRENADE_DATABLOCK,
      this.grenadesInFlight,
      this.grenadeShots,
    );
    this.sampleStations(snapshot, timeSec);
    this.sampleDeaths(snapshot, timeSec);
    this.sampleSkillShotMessages(snapshot);
    this.sampleVoiceBinds(snapshot);
    this.lastTeamScores = snapshot.teamScores;
    const sky = snapshot.entities.find(
      (e) => e.sceneData?.className === "Sky",
    )?.sceneData;
    if (sky?.className === "Sky") {
      this.visibility = {
        fogDistance: sky.fogDistance,
        visibleDistance: sky.visibleDistance,
      };
    }
    this.resolve(timeSec);
  }

  /** Parse this step's new server messages into director events.
   *  Public so a harness can drain the tail of a recording — messages
   *  landing between the last grid step and the very end (a
   *  buzzer-beater cap at the final tick) still belong to the match. */
  ingestServerEvents(snapshot: StreamSnapshot): void {
    for (const raw of snapshot.serverEvents ?? []) {
      if (this.seenServerEventIds.has(raw.id)) continue;
      this.seenServerEventIds.add(raw.id);
      for (const event of scanDirectorEvent(raw)) {
        if (event.type === "kill") {
          this.killEvents.push(event);
          this.deathMessages.push(event);
        } else if (event.type === "death") {
          this.deathMessages.push(event);
        } else if (event.type === "match-start") {
          if (this.matchStartSec == null) this.matchStartSec = event.timeSec;
        } else if (event.type === "match-end") {
          if (this.matchEndSec == null) this.matchEndSec = event.timeSec;
        }
        this.events.push(event);
      }
    }
  }

  /**
   * Advance every lagged-fact cursor to `now`. Called from step(); the
   * end-of-recording snapshot drains with now = Infinity, which
   * reproduces the old whole-demo batch passes exactly.
   */
  private resolve(now: number): void {
    // Kill attribution: victim name → target id → the entity-state
    // death nearest the message gets its killer and weapon. This is
    // the ONLY killer attribution — a death with no matching message
    // (suicide, turret, fall) keeps killerTargetId null. Each message
    // attributes AT MOST one death: a scope-flickered ghost can
    // produce two death transitions inside one window, and crediting
    // both would invent a kill.
    while (
      this.killCursor < this.deaths.length &&
      this.deaths[this.killCursor].timeSec <= now - RESOLVE_KILLS_LAG_SEC
    ) {
      const death = this.deaths[this.killCursor++];
      let best: TimelineEvent | null = null;
      for (const kill of this.killEvents) {
        if (this.usedKills.has(kill) || !kill.victim) continue;
        if (this.nameToTarget.get(kill.victim.toLowerCase()) !== death.targetId)
          continue;
        const dt = Math.abs(kill.timeSec - death.timeSec);
        if (dt > KILL_POS_WINDOW_SEC) continue;
        if (!best || dt < Math.abs(best.timeSec - death.timeSec)) best = kill;
      }
      if (!best) continue;
      this.usedKills.add(best);
      if (best.weapon) death.weapon = best.weapon.toLowerCase();
      const killerId = best.killer
        ? this.nameToTarget.get(best.killer.toLowerCase())
        : undefined;
      if (killerId != null) {
        death.killerTargetId = killerId;
        // The killer's position at the kill, from their own samples.
        let nearest: DirectorPlayerSample | null = null;
        for (const sample of this.samplesByTarget.get(killerId) ?? []) {
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
    // shot itself — correlate each announcement to the nearest death
    // by that shooter. No geometry, no inference; a shot with no
    // matching death was non-lethal (kept for the scenes to call
    // anyway). Runs behind kill attribution, which it reads.
    while (
      this.skillCursor < this.skillShots.length &&
      this.skillShots[this.skillCursor].timeSec <= now - RESOLVE_SKILL_LAG_SEC
    ) {
      const shot = this.skillShots[this.skillCursor++];
      if (shot.targetId == null) continue;
      let best: DirectorDeath | null = null;
      for (const death of this.deaths) {
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
    while (
      this.eventPosCursor < this.events.length &&
      this.events[this.eventPosCursor].timeSec <=
        now - RESOLVE_EVENT_POS_LAG_SEC
    ) {
      const event = this.events[this.eventPosCursor++];
      if (event.type !== "kill" && event.type !== "death") continue;
      const victim = event.victim?.toLowerCase();
      const targetId =
        victim != null ? this.nameToTarget.get(victim) : undefined;
      const track =
        targetId != null ? this.samplesByTarget.get(targetId) : undefined;
      if (!track) continue;
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
      if (best) event.pos = best.pos;
    }
    // Flag drops: died-holding vs thrown vs a pass — the intent
    // question the booth keeps getting wrong. The chat ORDER tells the
    // truth: the server prints the carrier's death message BEFORE the
    // drop message when they died holding it; a drop with no
    // immediately-preceding death is an intentional throw. A throw
    // with teammates in reach, or one a teammate picks up within
    // seconds, reads as a pass.
    while (
      this.dropCursor < this.events.length &&
      this.events[this.dropCursor].timeSec <= now - RESOLVE_DROPS_LAG_SEC
    ) {
      const event = this.events[this.dropCursor++];
      if (event.type !== "flag-drop") continue;
      this.classifyDrop(event);
    }
  }

  private classifyDrop(event: DirectorEvent): void {
    const actorKey = event.actor?.toLowerCase();
    const throwerId =
      actorKey != null ? this.nameToTarget.get(actorKey) : undefined;
    const died = this.deathMessages.some(
      (k) =>
        k.victim?.toLowerCase() === actorKey &&
        event.timeSec - k.timeSec >= 0 &&
        event.timeSec - k.timeSec <= DROP_DEATH_WINDOW_SEC,
    );
    if (died) {
      event.dropKind = "died";
      return;
    }
    event.dropKind = "thrown";
    // Thrower's team and position, from their nearest sample.
    let thrower: DirectorPlayerSample | null = null;
    for (const sample of this.samplesByTarget.get(throwerId ?? -1) ?? []) {
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
      for (const p of this.playerSamples) {
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
      const slot = this.lastTeamScores.find(
        (t) => t.name.toLowerCase() === event.flagTeamName?.toLowerCase(),
      )?.teamId;
      for (const f of this.flagSamples) {
        if (f.slot !== slot || f.timeSec <= event.timeSec) continue;
        if (f.timeSec > event.timeSec + PASS_PICKUP_WINDOW_SEC) break;
        if (f.status === "home") break;
        if (f.carrierTargetId != null && f.carrierTargetId !== throwerId) {
          let grabber: DirectorPlayerSample | null = null;
          for (const sample of this.samplesByTarget.get(f.carrierTargetId) ??
            []) {
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

  private sampleFlags(snapshot: StreamSnapshot, timeSec: number): void {
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
      this.flagSamples.push({ timeSec, slot, pos, carrierTargetId, status });
      if (!this.flagStands.has(slot) && status === "home") {
        const teams = snapshot.teamScores;
        this.flagStands.set(slot, {
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
  }

  private samplePlayers(snapshot: StreamSnapshot, timeSec: number): void {
    const byId = new Map(snapshot.entities.map((e) => [e.id, e]));
    const rosterByTarget = new Map<number, PlayerRosterEntry>();
    for (const entry of snapshot.playerRoster ?? []) {
      if (entry.targetId != null) rosterByTarget.set(entry.targetId, entry);
    }
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
      this.playerSamples.push(sample);
      let track = this.samplesByTarget.get(targetId);
      if (!track) this.samplesByTarget.set(targetId, (track = []));
      track.push(sample);
      if (entity.playerName) {
        this.nameToTarget.set(entity.playerName.toLowerCase(), targetId);
        this.noteIdentity(
          targetId,
          entity,
          rosterByTarget.get(targetId)?.clientId ?? null,
          timeSec,
        );
      }
    }
  }

  /**
   * Record who is wearing a target right now. The server frees a
   * target id when its client leaves (TargetFreeEvent) and reissues it
   * to the next join, so the id plus its generation bounds a stretch —
   * no name comparison anywhere. A new name within a generation is the
   * server's rename (setTargetName), appended. The roster's client id rides along when the join named
   * the target; it is information, not a key.
   */
  private noteIdentity(
    targetId: number,
    entity: StreamEntity,
    clientId: number | null,
    timeSec: number,
  ): void {
    const displayName = entity.playerName!;
    let stretches = this.identities.get(targetId);
    if (!stretches) this.identities.set(targetId, (stretches = []));
    let stretch = stretches[stretches.length - 1];
    const generation = entity.targetGeneration ?? 0;
    if (!stretch || stretch.generation !== generation) {
      if (stretch && stretch.toSec == null) stretch.toSec = timeSec;
      stretch = {
        generation,
        clientId,
        fromSec: timeSec,
        toSec: null,
        names: [],
        // The player's CHOSEN skin, which is what the renderer draws
        // (PlayerModel reads skinPrefName first); skinName is only the
        // team default. This used to be the other way round, and every
        // player read as "base" or "baseb".
        skin: entity.skinPrefName ?? entity.skinName ?? undefined,
      };
      stretches.push(stretch);
    }
    if (stretch.clientId == null && clientId != null)
      stretch.clientId = clientId;
    if (entity.skinPrefName && stretch.skin !== entity.skinPrefName)
      stretch.skin = entity.skinPrefName;
    const last = stretch.names[stretch.names.length - 1];
    if (!last || last.displayName !== displayName) {
      stretch.names.push({
        timeSec,
        displayName,
        rawName: entity.playerRawName ?? null,
      });
    } else if (last.rawName == null && entity.playerRawName) {
      last.rawName = entity.playerRawName;
    }
  }

  private sampleVehicles(snapshot: StreamSnapshot, timeSec: number): void {
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
      this.vehicleSamples.push({
        timeSec,
        key: entity.id,
        kind,
        teamId:
          entity.teamId != null && entity.teamId > 0 ? entity.teamId : null,
        pos: copyPos(entity.position),
        passengers: riders.get(entity.id) ?? 0,
      });
    }
  }

  private sampleFacts(snapshot: StreamSnapshot, timeSec: number): void {
    let anyScoreChanged = false;
    for (const team of snapshot.teamScores) {
      if (team.teamId <= 0) continue;
      this.factsTeams.set(team.teamId, team.name);
      if (this.lastScores.get(team.teamId) !== team.score) {
        this.lastScores.set(team.teamId, team.score);
        anyScoreChanged = true;
        this.scoreSamples.push({
          timeSec,
          teamId: team.teamId,
          score: team.score,
        });
      }
    }
    if (anyScoreChanged) {
      this.factsScores.push({
        timeSec,
        teams: snapshot.teamScores
          .filter((team) => team.teamId > 0)
          .map((team) => ({ teamId: team.teamId, score: team.score })),
      });
    }
    const rosterCount = snapshot.playerRoster?.length ?? 0;
    if (
      rosterCount !== this.factsRosterCount ||
      timeSec - this.factsRosterPushedSec >= 30
    ) {
      this.factsRosterCount = rosterCount;
      this.factsRosterPushedSec = timeSec;
      const assigned = (snapshot.playerRoster ?? []).filter(
        (p) => p.teamId > 0,
      ).length;
      this.factsRoster.push({
        timeSec,
        count: rosterCount,
        assigned,
        observers: rosterCount - assigned,
        scorers: (snapshot.playerRoster ?? [])
          .filter((p) => p.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 4)
          .map((p) => ({ name: p.name, teamId: p.teamId, score: p.score })),
      });
    }

    // The match clock. It advances a second per second, so recording
    // every step would be noise: sample when it DEVIATES from that
    // (a re-anchor, a pause, a seek) and otherwise every 30s, which is
    // enough for a consumer to interpolate any instant accurately.
    const clockMs = snapshot.matchClockMs;
    if (clockMs != null) {
      const last = this.factsClock[this.factsClock.length - 1];
      const predicted =
        last != null ? last.clockMs + (timeSec - last.timeSec) * 1000 : null;
      if (
        predicted == null ||
        Math.abs(clockMs - predicted) > 2000 ||
        timeSec - last.timeSec >= 30
      ) {
        this.factsClock.push({ timeSec, clockMs });
      }
    }
    if (this.matchSeenRunningSec == null && snapshot.matchStarted) {
      this.matchSeenRunningSec = timeSec;
    }
  }

  private sampleOrdnance(
    snapshot: StreamSnapshot,
    timeSec: number,
    match: RegExp,
    inFlight: Map<string, MortarShot>,
    landed: MortarShot[],
  ): void {
    const alive = new Set<string>();
    let byGhostIndex: Map<number, StreamEntity> | null = null;
    // The packet names the shooter: sourceObject is the firing ghost.
    const resolveShooter = (entity: {
      sourceGhostIndex?: number;
    }): number | null => {
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
    };
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
    // A round that vanished has landed — retire it to the shot list.
    for (const [id, shot] of inFlight) {
      if (!alive.has(id)) {
        landed.push(shot);
        inFlight.delete(id);
      }
    }
  }

  private sampleStations(snapshot: StreamSnapshot, timeSec: number): void {
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
      let station = this.stations.get(key);
      if (!station) {
        station = {
          pos: copyPos(entity.position),
          kind: isGenerator ? "generator" : "inventory",
          deployed: /deploy/i.test(entity.dataBlock),
          activations: [],
        };
        this.stations.set(key, station);
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
  }

  /** Catch alive → dead transitions; the killer is attributed by the
   *  lagged kill-message cursor, never inferred from proximity. */
  private sampleDeaths(snapshot: StreamSnapshot, timeSec: number): void {
    const byId = new Map(snapshot.entities.map((e) => [e.id, e]));
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
    }
    for (const [targetId, now] of seen) {
      const before = this.playerAlive.get(targetId);
      this.playerAlive.set(targetId, {
        ...now,
        timeSec,
        prevPos: before?.pos,
        prevTimeSec: before?.timeSec,
      });
      if (!before?.alive || now.alive) continue;
      // Died since the last sample: frame it from where they fell.
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
      this.deaths.push({
        timeSec,
        targetId,
        teamId: now.teamId,
        pos,
        killerTargetId: null,
        killerPos: undefined,
        weapon: near(this.mortarShots)
          ? "mortar"
          : near(this.discShots)
            ? "disc"
            : undefined,
        airborne: airborne || undefined,
        speed,
      });
    }
  }

  private sampleStructures(snapshot: StreamSnapshot, timeSec: number): void {
    for (const entity of snapshot.entities) {
      if (
        entity.type === "Player" ||
        !entity.dataBlock ||
        !STRUCTURE_DATABLOCK.test(entity.dataBlock) ||
        STRUCTURE_IGNORE.test(entity.dataBlock) ||
        entity.damageState == null ||
        !entity.position
      ) {
        continue;
      }
      if (!this.structureSeen.has(entity.id)) {
        this.structureSeen.add(entity.id);
        this.structureInventory.push({
          firstSeenSec: timeSec,
          name: structureName(entity.dataBlock),
          className: entity.className ?? entity.type,
          teamId: entity.teamId ?? null,
          pos: copyPos(entity.position),
        });
      }
      const previous = this.structureStates.get(entity.id);
      if (previous != null && previous !== entity.damageState) {
        this.structures.push({
          timeSec,
          name: structureName(entity.dataBlock),
          className: entity.className ?? entity.type,
          teamId: entity.teamId ?? null,
          pos: copyPos(entity.position),
          from: previous,
          to: entity.damageState,
        });
      }
      this.structureStates.set(entity.id, entity.damageState);
    }
  }

  private sampleSkillShotMessages(snapshot: StreamSnapshot): void {
    for (const msg of snapshot.chatMessages ?? []) {
      if (
        this.seenChatIds.has(msg.id) ||
        msg.kind !== "server" ||
        msg.colorCode !== SKILL_SHOT_COLOR
      ) {
        continue;
      }
      this.seenChatIds.add(msg.id);
      const ma = MIDAIR_MSG.exec(msg.text);
      const hs = ma ? null : HEADSHOT_MSG.exec(msg.text);
      const name = ma?.[1] ?? hs?.[1];
      if (!name) continue;
      this.skillShots.push({
        timeSec: msg.timeSec,
        targetId: this.nameToTarget.get(name.toLowerCase()) ?? null,
        name,
        kind: ma ? "midair" : "headshot",
        rangeM: ma?.[2] != null ? parseInt(ma[2], 10) : undefined,
        weapon: ma?.[3],
      });
    }
  }

  /**
   * Canned voice lines over global chat. The engine prints them with
   * the key sequence as the first segment ("[VGTA] "), which is the
   * only thing that tells a bind from typed chat.
   */
  private sampleVoiceBinds(snapshot: StreamSnapshot): void {
    for (const msg of snapshot.chatMessages ?? []) {
      if (this.seenVoiceIds.has(msg.id) || msg.kind !== "chat") continue;
      const keys = VOICE_BIND_KEYS.exec(msg.segments?.[0]?.text ?? "")?.[1];
      if (!keys) continue;
      this.seenVoiceIds.add(msg.id);
      const kind = keys.startsWith("VGT")
        ? "taunt"
        : keys === "VGW"
          ? "cheer"
          : keys.startsWith("VGC")
            ? "compliment"
            : null;
      if (!kind || !msg.sender || !msg.text) continue;
      this.voiceBinds.push({
        timeSec: msg.timeSec,
        targetId: this.nameToTarget.get(msg.sender.toLowerCase()) ?? null,
        name: msg.sender,
        kind,
        keys,
        text: msg.text,
      });
    }
  }

  /** Drain every cursor and assemble the dataset. */
  /**
   * The dataset as it stands, covering everything stepped so far.
   *
   * `nowSec` bounds the deferred resolution passes (kill attribution
   * waits for the message that names the victim, and so on). Streaming
   * callers pass the time they have scanned to, so the dataset never
   * contains a conclusion drawn from data the stream has not reached;
   * `finalize` passes Infinity because the walk is over.
   *
   * Cheap enough to call every tick: the resolution passes are
   * cursor-based, and everything below is assembling references to
   * arrays the trackers already own.
   */
  snapshot(meta: TrackerSnapshotMeta, nowSec: number): DirectorDataset {
    this.resolve(nowSec);
    const matchFacts: MatchFacts = {
      missionName: meta.missionName ?? null,
      missionDisplayName: meta.missionDisplayName ?? null,
      gameType: meta.gameType ?? null,
      serverDisplayName: meta.serverDisplayName ?? null,
      durationSec: meta.durationSec,
      matchStartSec: this.matchStartSec,
      matchEndSec: this.matchEndSec,
      teams: [...this.factsTeams].map(([teamId, name]) => ({ teamId, name })),
      scores: this.factsScores,
      roster: this.factsRoster,
      clock: this.factsClock,
      matchSeenRunningSec: this.matchSeenRunningSec,
      worldCompleteSec: this.worldCompleteSec,
    };
    const dataset: DirectorDataset = {
      durationSec: meta.durationSec,
      matchFacts,
      visibility: this.visibility,
      flagSampleStepSec: FLAG_STEP_SEC,
      playerSampleStepSec: FLAG_STEP_SEC * PLAYER_EVERY_STEPS,
      gameClassName: meta.gameClassName,
      teams: this.lastTeamScores.map((t) => ({
        teamId: t.teamId,
        name: t.name,
      })),
      flagStands: [...this.flagStands.values()].sort((a, b) => a.slot - b.slot),
      events: this.events,
      flagSamples: this.flagSamples,
      playerSamples: this.playerSamples,
      structures: this.structures,
      structureInventory: this.structureInventory,
      mortarShots: [...this.mortarShots, ...this.mortarsInFlight.values()].sort(
        (a, b) => a.timeSec - b.timeSec,
      ),
      discShots: [...this.discShots, ...this.discsInFlight.values()].sort(
        (a, b) => a.timeSec - b.timeSec,
      ),
      grenadeShots: [
        ...this.grenadeShots,
        ...this.grenadesInFlight.values(),
      ].sort((a, b) => a.timeSec - b.timeSec),
      skillShots: this.skillShots,
      voiceBinds: this.voiceBinds,
      deaths: this.deaths,
      stations: [...this.stations.values()],
      vehicles: this.vehicleSamples,
      // One entry per (target id, client) stretch, keyed by TARGET ID
      // because that is what the samples carry — with the client and
      // the time span, so a recycled id resolves to the right person
      // and a renamed one keeps every name it answered to.
      // One entry per name PERIOD: a rename inside a stretch starts a
      // new entry, so a moment resolves to the name in force then, and
      // every entry of the stretch lists all its names as aliases.
      playerNames: [...this.identities.entries()].flatMap(
        ([targetId, stretches]) =>
          stretches.flatMap((stretch) => {
            const aliases = [
              ...new Set(stretch.names.map((n) => n.displayName.toLowerCase())),
            ];
            return stretch.names.map((named, i) => {
              const parts = officialNameParts(named.rawName);
              const fromSec = i === 0 ? stretch.fromSec : named.timeSec;
              const toSec = stretch.names[i + 1]?.timeSec ?? stretch.toSec;
              return {
                targetId,
                ...(stretch.clientId != null
                  ? { clientId: stretch.clientId }
                  : {}),
                fromSec,
                ...(toSec != null ? { toSec } : {}),
                name: named.displayName.toLowerCase(),
                displayName: named.displayName,
                aliases,
                skin: stretch.skin,
                clan: parts?.clan,
                baseName: parts?.base,
              };
            });
          }),
      ),
      scoreSamples: this.scoreSamples,
    };
    return dataset;
  }
}
