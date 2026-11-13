/**
 * Per-player stats for one demo, keyed by authenticated GUID: chosen skins,
 * kills by damage type, time holding each weapon image, and the loadouts
 * bought at full and deployable inventory stations.
 *
 * The demo is replayed in full; its state is observed at a fixed step.
 * Server messages (kills) are exact. Everything but skins counts only while
 * the match is live, not during warmup or the end-of-match screen.
 *
 * A station visit is a player in its trigger with their weapon unmounted
 * (`stationTrigger::onEnterTrigger`) while its activate thread plays. The
 * purchase happens at `stationReady`, which starts the station's
 * `Activate1` animation and, at full stations, cloaks the buyer (station.cs).
 * Armor and pack are read as they step off. Other players' inventories are
 * never ghosted, so a loadout's weapons are those seen held before its
 * next purchase, death, or the end of the match.
 *
 * Identifiers are the game's own: armor sizes from armor datablock names,
 * shape names (without `.dts`) for images, and `$DamageTypeText` for kills.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { scanDirectorEvent } from "../src/director/directorEventScanner";
import { parseDTS } from "../src/dts/dts";
import {
  resolvePlayerBodyType,
  type PlayerBodyType,
} from "../src/player/playerBodyType";
import { stripTaggedStringMarkup } from "../src/stream/streamHelpers";
import type { StreamEntity, StreamSnapshot } from "../src/stream/types";
import {
  shapeResourcePath,
  winningSourcePath,
  type ResourceEntry,
} from "../src/resourcePaths";

export const DEMO_STATS_VERSION = 4;

/**
 * `raceGender` as clients choose it on connect (`GameConnection::onConnect`).
 * It is not sent to other clients; the armor datablock a player wears shows it.
 */
export type RaceGender = "Human Male" | "Human Female" | "Bioderm";

export interface PlayerDemoStats {
  /**
   * Chosen skins (`base` included), most recently used first; race/gender is
   * null for a connection never seen in play.
   */
  skins: { raceGender: RaceGender | null; skin: string }[];
  /**
   * By `$DamageTypeText`, except that `grenade` is split into
   * `grenade launcher` and `hand grenade`; teamkills and self-inflicted
   * deaths excluded.
   */
  killsByWeapon: Record<string, number>;
  /** Seconds seen holding each weapon-slot image. */
  weaponsHeldSec: Record<string, number>;
  /**
   * Outfit key (`outfitKey`) → seconds seen wearing it, in any game type,
   * inventory stations or not.
   */
  wornSec: Record<string, number>;
  /** Loadout key (`loadoutKey`) → purchases at full stations (base and MPB). */
  invLoadouts: Record<string, number>;
  /** Loadout key → purchases at deployable inventory stations. */
  deployInvLoadouts: Record<string, number>;
}

export interface DemoStatsSidecar {
  version: number;
  /** Identity of the published recording used to compute these stats. */
  sourceETag?: string;
  statsByGuid: Record<string, PlayerDemoStats>;
}

export interface Outfit {
  /** `Light`, `Medium` or `Heavy`; an unknown armor shape's name otherwise. */
  armor: string;
  /** Backpack image shape, or null without a pack. */
  pack: string | null;
}

export interface Loadout {
  /** `Light`, `Medium` or `Heavy`; an unknown armor shape's name otherwise. */
  armor: string;
  /** Backpack image shape, or null without a pack. */
  pack: string | null;
  /** Weapon images seen held, in inventory order. */
  weapons: string[];
}

type InventoryKind = "inventory" | "deployable";

/** Full stations can change armor (buyFavorites); deployables cannot. */
const STATION_KINDS: Record<string, InventoryKind> = {
  station_inv_human: "inventory",
  station_inv_mpb: "inventory",
  deploy_inventory: "deployable",
};
/**
 * Horizontal reach of a station's user. Measured: base stations snap their
 * user onto the origin; deployables leave them up to 2 m from it.
 */
const STATION_RANGE: Record<InventoryKind, number> = {
  inventory: 1,
  deployable: 2.5,
};
/** $ActivateThread, $WeaponSlot and $BackpackSlot. */
const ACTIVATE_THREAD = 2;
const WEAPON_SLOT = 0;
const BACKPACK_SLOT = 2;
const THREAD_PLAY = 0;
/** Longer gaps between observations are not counted as held or worn time. */
const MAX_HELD_STEP_SEC = 1;
/**
 * `$DamageType::Grenade` covers launched, hand, flash and concussion
 * grenades alike, in its kill messages too. A launched one is a projectile
 * naming its shooter, gone when it bursts; thrown ones are `grenade` items
 * naming nobody, marked Destroyed when they burst and deleted 500 ms later
 * (`detonateGrenade`). A kill arrives in the step of its grenade's burst, so
 * the burst nearest the victim decides: the killer's shell, or a thrown one.
 */
const LAUNCHER_PROJECTILE = "grenade_projectile";
const THROWN_GRENADE = "grenade";
/** The 15 m blast radius plus a step of grenade flight. */
const GRENADE_MATCH_RANGE = 25;
/**
 * Without a grenade seen vanishing near the victim: the killer's launcher
 * fire this recent, or the launcher in hand, means launched.
 */
const LAUNCHER_IMAGE = "weapon_grenade_launcher";
const LAUNCHER_KILL_WINDOW_SEC = 1;

/** Weapon images and their inventory names, in the inventory screen's order. */
export const WEAPON_NAMES = new Map([
  ["weapon_energy", "Blaster"],
  ["weapon_plasma", "Plasma Rifle"],
  ["weapon_chaingun", "Chaingun"],
  ["weapon_disc", "Spinfusor"],
  ["weapon_grenade_launcher", "Grenade Launcher"],
  ["weapon_sniper", "Laser Rifle"],
  ["weapon_elf", "ELF Projector"],
  ["weapon_mortar", "Fusion Mortar"],
  ["weapon_missile", "Missile Launcher"],
  ["weapon_shocklance", "Shocklance"],
  ["weapon_targeting", "Targeting Laser"],
  ["weapon_repair", "Repair Gun"],
]);
const WEAPON_ORDER = new Map(
  [...WEAPON_NAMES.keys()].map((shape, index) => [shape, index]),
);
/** Every loadout carries a targeting laser; the repair gun belongs to its pack. */
export const NON_LOADOUT_WEAPONS: ReadonlySet<string> = new Set([
  "weapon_targeting",
  "weapon_repair",
]);

export const PACK_NAMES = new Map([
  ["pack_upgrade_energy", "Energy Pack"],
  ["pack_upgrade_repair", "Repair Pack"],
  ["pack_upgrade_shield", "Shield Pack"],
  ["pack_upgrade_cloaking", "Cloak Pack"],
  ["pack_upgrade_sensorjammer", "Sensor Jammer Pack"],
  ["pack_upgrade_ammo", "Ammunition Pack"],
  ["pack_upgrade_satchel", "Satchel Charge"],
  ["pack_deploy_sensor_motion", "Motion Sensor Pack"],
  ["pack_deploy_sensor_pulse", "Pulse Sensor Pack"],
  ["pack_deploy_inventory", "Inventory Station"],
  ["pack_deploy_turreto", "Landspike Turret"],
  ["pack_deploy_turreti", "Spider Clamp Turret"],
  ["pack_barrel_elf", "ELF Turret Barrel"],
  ["pack_barrel_mortar", "Mortar Turret Barrel"],
  ["pack_barrel_fusion", "Plasma Turret Barrel"],
  ["pack_barrel_aa", "AA Turret Barrel"],
  ["pack_barrel_missile", "Missile Turret Barrel"],
]);

/**
 * Kill weapons (`killsByWeapon` keys) → the inventory name of what dealt
 * them; other damage types keep the server's wording.
 */
export const KILL_WEAPON_NAMES = new Map([
  ["blaster", "Blaster"],
  ["plasma", "Plasma Rifle"],
  ["chaingun", "Chaingun"],
  ["disc", "Spinfusor"],
  ["grenade launcher", "Grenade Launcher"],
  ["hand grenade", "Hand Grenade"],
  ["laser", "Laser Rifle"],
  ["elf", "ELF Projector"],
  ["mortar", "Fusion Mortar"],
  ["missile", "Missile Launcher"],
  ["shocklance", "Shocklance"],
  ["mine", "Mine"],
  ["satchel charge", "Satchel Charge"],
  ["spike turret", "Landspike Turret"],
  ["clamp turret", "Spider Clamp Turret"],
]);

/** Kill weapons that are held weapons → their weapon image. */
export const KILL_WEAPON_IMAGES = new Map([
  ["blaster", "weapon_energy"],
  ["plasma", "weapon_plasma"],
  ["chaingun", "weapon_chaingun"],
  ["disc", "weapon_disc"],
  ["grenade launcher", "weapon_grenade_launcher"],
  ["laser", "weapon_sniper"],
  ["elf", "weapon_elf"],
  ["mortar", "weapon_mortar"],
  ["missile", "weapon_missile"],
  ["shocklance", "weapon_shocklance"],
]);

const RACE_GENDERS: Record<PlayerBodyType, RaceGender> = {
  male: "Human Male",
  female: "Human Female",
  bioderm: "Bioderm",
};

/** What the tracker reads from the playback besides its snapshots. */
export interface PlayerStatsLookups {
  /** Armor datablocks tell heavy female from heavy male (same shape). */
  getDataBlockData?(id: number): Record<string, unknown> | undefined;
  /** Chosen skins from target info, for clients never seen in play. */
  getTargetSkinPref?(targetId: number): string | undefined;
}

/** A shape file name as an identifier: lowercase, without `.dts`. */
function shapeId(shape: string | undefined): string | null {
  return shape ? shape.toLowerCase().replace(/\.dts$/, "") : null;
}

function armorOf(shape: string | null): string {
  if (!shape) return "unknown";
  if (shape.includes("light")) return "Light";
  if (shape.includes("medium")) return "Medium";
  if (shape.includes("heavy")) return "Heavy";
  return shape;
}

/** Canonical JSON with a fixed key order. */
export function outfitKey({ armor, pack }: Outfit): string {
  return JSON.stringify({ armor, pack });
}

/** Canonical JSON: fixed key order, weapons in inventory order. */
export function loadoutKey({ armor, pack, weapons }: Loadout): string {
  const ordered = [...new Set(weapons)].sort(
    (a, b) =>
      (WEAPON_ORDER.get(a) ?? WEAPON_ORDER.size) -
        (WEAPON_ORDER.get(b) ?? WEAPON_ORDER.size) || a.localeCompare(b),
  );
  return JSON.stringify({ armor, pack, weapons: ordered });
}

function describePack(pack: string | null): string {
  return pack ? (PACK_NAMES.get(pack) ?? pack) : "No Pack";
}

/** `Light · Energy Pack` for an outfit key. */
export function describeOutfit(key: string): string {
  const { armor, pack } = JSON.parse(key) as Outfit;
  return `${armor} · ${describePack(pack)}`;
}

/** `Heavy · Shield Pack · Chaingun, Spinfusor` for a loadout key. */
export function describeLoadout(key: string): string {
  const { armor, pack, weapons } = JSON.parse(key) as Loadout;
  return [
    armor,
    describePack(pack),
    weapons.map((shape) => WEAPON_NAMES.get(shape) ?? shape).join(", ") ||
      "No Weapon Seen",
  ].join(" · ");
}

/**
 * Each station shape's `Activate1` sequence index, read from the shapes:
 * thread packets name sequences by index, which differs per shape.
 */
export async function loadStationPurchaseSequences(
  assetRoot: string,
  manifestPath: string,
): Promise<Map<string, number>> {
  const { resources } = JSON.parse(await fs.readFile(manifestPath, "utf8")) as {
    resources: Record<string, ResourceEntry>;
  };
  const sequences = new Map<string, number>();
  // Without these, purchases would silently go uncounted.
  for (const shape of Object.keys(STATION_KINDS)) {
    const entry = resources[shapeResourcePath(`${shape}.dts`)];
    if (!entry) throw new Error(`Station shape not in the manifest: ${shape}`);
    const bytes = await fs.readFile(
      path.join(assetRoot, winningSourcePath(entry)),
    );
    const data = parseDTS(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const index = data.sequences.findIndex(
      (sequence) =>
        data.names[sequence.nameIndex].toLowerCase() === "activate1",
    );
    if (index < 0) throw new Error(`Station shape lacks Activate1: ${shape}`);
    sequences.set(shape, index);
  }
  return sequences;
}

interface Station {
  id: string;
  kind: InventoryKind;
  position: [number, number, number];
  playing: boolean;
  /** Playing `Activate1`: `stationReady` ran, so the purchase landed. */
  purchased: boolean;
}

interface Segment {
  kind: InventoryKind;
  armor: string;
  pack: string | null;
  weapons: Set<string>;
}

interface Visit {
  stationId: string;
  kind: InventoryKind;
  purchased: boolean;
}

/** One client connection, and its current life. */
interface Connection {
  guid: string;
  /** The current player object, once seen. */
  entityId: string | null;
  raceGender: RaceGender | null;
  /** When one of this client's launcher grenades was last seen in flight. */
  launcherSec: number | null;
  /** Chosen skin → last stream time it was seen. */
  skins: Map<string, number>;
  visit: Visit | null;
  segment: Segment | null;
}

interface Grenade {
  launched: boolean;
  /** A launched grenade's shooter, when they are a tracked client. */
  client?: string;
  position: [number, number, number];
  /** A thrown grenade already in its Destroyed state. */
  detonated?: boolean;
}

interface PlayerTotals {
  kills: Map<string, number>;
  held: Map<string, number>;
  worn: Map<string, number>;
  loadouts: Record<InventoryKind, Map<string, number>>;
}

function onStation(entity: StreamEntity, station: Station): number | null {
  const position = entity.position;
  if (!position) return null;
  const dz = position[2] - station.position[2];
  if (dz < -1 || dz > 2.5) return null;
  const distance = Math.hypot(
    position[0] - station.position[0],
    position[1] - station.position[1],
  );
  return distance <= STATION_RANGE[station.kind] ? distance : null;
}

function isAlive(entity: StreamEntity): boolean {
  return (entity.damageState ?? 0) === 0;
}

function roundedSeconds(totals: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    [...totals].map(([key, sec]) => [key, Math.round(sec * 100) / 100]),
  );
}

function add(counts: Map<string, number>, key: string, amount = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + amount);
}

/** Feed one demo's snapshots in time order, then call `finish()`. */
export class DemoPlayerStatsTracker {
  private readonly purchaseSequences: ReadonlyMap<string, number>;
  private readonly lookups: PlayerStatsLookups;
  private readonly players = new Map<string, PlayerTotals>();
  /** By client (`clientId:clientGeneration`). */
  private readonly connections = new Map<string, Connection>();
  private readonly seenEvents = new Set<number>();
  /** Grenades in the previous snapshot, by entity id. */
  private grenades = new Map<string, Grenade>();
  private live = false;
  private lastTimeSec: number | null = null;

  constructor(
    purchaseSequences: ReadonlyMap<string, number>,
    lookups: PlayerStatsLookups = {},
  ) {
    this.purchaseSequences = purchaseSequences;
    this.lookups = lookups;
  }

  step(snapshot: StreamSnapshot): void {
    const live = snapshot.matchStarted && !snapshot.matchEnded;
    if (this.live && !live)
      // Lives still open when the match ends are complete.
      for (const connection of this.connections.values()) {
        this.endSegment(connection);
        connection.visit = null;
      }
    this.live = live;
    const dt =
      this.lastTimeSec == null
        ? 0
        : Math.min(snapshot.timeSec - this.lastTimeSec, MAX_HELD_STEP_SEC);
    this.lastTimeSec = snapshot.timeSec;

    const byTarget = new Map<number, string>();
    // Recording clients can omit the target id of players who joined
    // before them. Connected names are unique, and the roster and target
    // strip them alike.
    const byName = new Map<string, string>();
    const clientsByName = new Map<string, string>();
    for (const entry of snapshot.playerRoster) {
      if (!entry.guid) continue;
      const client = `${entry.clientId}:${entry.clientGeneration ?? 0}`;
      const connection = this.connection(client, entry.guid);
      clientsByName.set(entry.name, client);
      if (entry.targetId == null) {
        byName.set(entry.name, client);
        continue;
      }
      byTarget.set(entry.targetId, client);
      const skin = this.lookups.getTargetSkinPref?.(entry.targetId);
      if (skin) connection.skins.set(skin, snapshot.timeSec);
    }
    const clientOf = (entity: StreamEntity): string | undefined =>
      entity.targetId == null
        ? undefined
        : (byTarget.get(entity.targetId) ??
          (entity.playerName != null
            ? byName.get(entity.playerName)
            : undefined));

    // A corpse keeps its target beside the respawned player: one body each.
    const bodies = new Map<string, StreamEntity>();
    for (const entity of snapshot.entities) {
      if (entity.type !== "Player") continue;
      const client = clientOf(entity);
      if (!client) continue;
      const other = bodies.get(client);
      if (!other || (isAlive(entity) && !isAlive(other)))
        bodies.set(client, entity);
    }
    const grenades = this.grenadesOf(snapshot, clientOf);
    const bursts: Grenade[] = [];
    // Shells vanish as they burst. Thrown grenades always turn Destroyed
    // first; one that merely vanished was picked up or left view.
    for (const [id, before] of this.grenades)
      if (before.launched && !grenades.has(id)) bursts.push(before);
    for (const [id, grenade] of grenades)
      if (grenade.detonated && !this.grenades.get(id)?.detonated)
        bursts.push(grenade);
    this.grenades = grenades;
    this.countKills(snapshot, clientsByName, bodies, bursts);
    if (!bodies.size) return;
    const stations = this.stationsOf(snapshot);
    const users = this.stationUsers(snapshot, stations);
    for (const [client, entity] of bodies)
      this.stepPlayer(
        this.connections.get(client)!,
        entity,
        snapshot.timeSec,
        dt,
        stations,
        users,
      );
  }

  /** Every GUID seen in the roster, with this demo's stats. */
  finish(): DemoStatsSidecar {
    for (const connection of this.connections.values())
      this.endSegment(connection);
    const skins = new Map<
      string,
      Map<string, { raceGender: RaceGender | null; skin: string; at: number }>
    >();
    for (const connection of this.connections.values()) {
      let byLook = skins.get(connection.guid);
      if (!byLook) skins.set(connection.guid, (byLook = new Map()));
      for (const [skin, at] of connection.skins) {
        const look = JSON.stringify([connection.raceGender, skin]);
        const seen = byLook.get(look);
        if (!seen || seen.at < at)
          byLook.set(look, { raceGender: connection.raceGender, skin, at });
      }
    }
    const statsByGuid: Record<string, PlayerDemoStats> = {};
    for (const [guid, totals] of this.players)
      statsByGuid[guid] = {
        skins: [...(skins.get(guid)?.values() ?? [])]
          .sort((a, b) => b.at - a.at)
          .map(({ raceGender, skin }) => ({ raceGender, skin })),
        killsByWeapon: Object.fromEntries(totals.kills),
        weaponsHeldSec: roundedSeconds(totals.held),
        wornSec: roundedSeconds(totals.worn),
        invLoadouts: Object.fromEntries(totals.loadouts.inventory),
        deployInvLoadouts: Object.fromEntries(totals.loadouts.deployable),
      };
    return { version: DEMO_STATS_VERSION, statsByGuid };
  }

  private connection(client: string, guid: string): Connection {
    let connection = this.connections.get(client);
    if (!connection) {
      this.totals(guid);
      this.connections.set(
        client,
        (connection = {
          guid,
          entityId: null,
          raceGender: null,
          launcherSec: null,
          skins: new Map(),
          visit: null,
          segment: null,
        }),
      );
    }
    return connection;
  }

  private totals(guid: string): PlayerTotals {
    let totals = this.players.get(guid);
    if (!totals)
      this.players.set(
        guid,
        (totals = {
          kills: new Map(),
          held: new Map(),
          worn: new Map(),
          loadouts: { inventory: new Map(), deployable: new Map() },
        }),
      );
    return totals;
  }

  /** Grenades in the world; launched ones also date their shooter's fire. */
  private grenadesOf(
    snapshot: StreamSnapshot,
    clientOf: (entity: StreamEntity) => string | undefined,
  ): Map<string, Grenade> {
    const grenades = new Map<string, Grenade>();
    let byGhostIndex: Map<number, StreamEntity> | null = null;
    for (const entity of snapshot.entities) {
      if (!entity.position) continue;
      const shape = shapeId(entity.dataBlock);
      if (entity.type === "Item" && shape === THROWN_GRENADE) {
        grenades.set(entity.id, {
          launched: false,
          position: entity.position,
          detonated: !isAlive(entity),
        });
        continue;
      }
      if (entity.type !== "Projectile" || shape !== LAUNCHER_PROJECTILE)
        continue;
      let client: string | undefined;
      if (entity.sourceGhostIndex != null) {
        if (!byGhostIndex) {
          byGhostIndex = new Map();
          for (const candidate of snapshot.entities)
            if (candidate.ghostIndex != null)
              byGhostIndex.set(candidate.ghostIndex, candidate);
        }
        const shooter = byGhostIndex.get(entity.sourceGhostIndex);
        client = shooter?.type === "Player" ? clientOf(shooter) : undefined;
        const connection = client && this.connections.get(client);
        if (connection) connection.launcherSec = snapshot.timeSec;
      }
      grenades.set(entity.id, {
        launched: true,
        client,
        position: entity.position,
      });
    }
    return grenades;
  }

  private countKills(
    snapshot: StreamSnapshot,
    clientsByName: Map<string, string>,
    bodies: Map<string, StreamEntity>,
    bursts: Grenade[],
  ): void {
    // A kill can share a step with the mission end that follows it.
    const endedAt = snapshot.matchEndedAtSec;
    for (const raw of snapshot.serverEvents) {
      if (this.seenEvents.has(raw.id)) continue;
      this.seenEvents.add(raw.id);
      const live =
        snapshot.matchStarted &&
        (!snapshot.matchEnded || (endedAt != null && raw.timeSec < endedAt));
      if (
        !live ||
        stripTaggedStringMarkup(raw.msgType).trim().toLowerCase() ===
          "msgteamkill"
      )
        continue;
      for (const event of scanDirectorEvent(raw)) {
        const client =
          event.type === "kill" && event.killer
            ? clientsByName.get(event.killer)
            : undefined;
        const connection = client && this.connections.get(client);
        if (!connection) continue;
        let weapon = event.weapon ?? "unknown";
        if (weapon.toLowerCase() === "grenade")
          weapon = this.grenadeKind(
            client,
            connection,
            bodies.get(client),
            event.victim
              ? this.victimPosition(snapshot, event.victim, clientsByName)
              : undefined,
            bursts,
            raw.timeSec,
          );
        add(this.totals(connection.guid).kills, weapon);
      }
    }
  }

  /**
   * Where the victim died. Old corpses share their name, so a tracked
   * victim's position is their current body's, the one that just died.
   */
  private victimPosition(
    snapshot: StreamSnapshot,
    victim: string,
    clientsByName: Map<string, string>,
  ): [number, number, number] | undefined {
    const client = clientsByName.get(victim);
    const bodyId = client ? this.connections.get(client)?.entityId : null;
    let named: StreamEntity | undefined;
    for (const entity of snapshot.entities) {
      if (entity.type !== "Player" || !entity.position) continue;
      if (client) {
        if (entity.id === bodyId) return entity.position;
      } else if (
        entity.playerName === victim &&
        (!named || (!isAlive(entity) && isAlive(named)))
      )
        named = entity;
    }
    return named?.position;
  }

  private grenadeKind(
    killerClient: string,
    killer: Connection,
    killerBody: StreamEntity | undefined,
    victimPosition: [number, number, number] | undefined,
    bursts: Grenade[],
    timeSec: number,
  ): "grenade launcher" | "hand grenade" {
    if (victimPosition) {
      let nearest: Grenade | null = null;
      let nearestDistance = GRENADE_MATCH_RANGE;
      for (const grenade of bursts) {
        // Another player's shell cannot have earned this killer the kill.
        if (grenade.launched && grenade.client !== killerClient) continue;
        const distance = Math.hypot(
          grenade.position[0] - victimPosition[0],
          grenade.position[1] - victimPosition[1],
          grenade.position[2] - victimPosition[2],
        );
        if (distance <= nearestDistance) {
          nearest = grenade;
          nearestDistance = distance;
        }
      }
      if (nearest)
        return nearest.launched ? "grenade launcher" : "hand grenade";
    }
    return (killer.launcherSec != null &&
      timeSec - killer.launcherSec <= LAUNCHER_KILL_WINDOW_SEC) ||
      shapeId(killerBody?.imageSlots?.[WEAPON_SLOT]?.shapeName) ===
        LAUNCHER_IMAGE
      ? "grenade launcher"
      : "hand grenade";
  }

  private stationsOf(snapshot: StreamSnapshot): Map<string, Station> {
    const stations = new Map<string, Station>();
    for (const entity of snapshot.entities) {
      const shape = shapeId(entity.dataBlock);
      const kind = shape && STATION_KINDS[shape];
      if (!kind || !entity.position) continue;
      const thread = entity.threads?.find(
        (candidate) => candidate.index === ACTIVATE_THREAD,
      );
      const playing = thread?.state === THREAD_PLAY;
      stations.set(entity.id, {
        id: entity.id,
        kind,
        position: entity.position,
        playing,
        purchased:
          playing && thread.sequence === this.purchaseSequences.get(shape),
      });
    }
    return stations;
  }

  /**
   * Each playing station's user: the nearest living player in reach whose
   * weapon the trigger unmounted, which a bystander still holds.
   */
  private stationUsers(
    snapshot: StreamSnapshot,
    stations: Map<string, Station>,
  ): Map<string, Station> {
    const users = new Map<string, Station>();
    const players = snapshot.entities.filter(
      (entity) =>
        entity.type === "Player" &&
        isAlive(entity) &&
        !entity.imageSlots?.[WEAPON_SLOT],
    );
    for (const station of stations.values()) {
      if (!station.playing) continue;
      let nearest: StreamEntity | null = null;
      let nearestDistance = Infinity;
      for (const player of players) {
        const distance = onStation(player, station);
        if (distance != null && distance < nearestDistance) {
          nearest = player;
          nearestDistance = distance;
        }
      }
      if (nearest) users.set(nearest.id, station);
    }
    return users;
  }

  private stepPlayer(
    connection: Connection,
    entity: StreamEntity,
    timeSec: number,
    dt: number,
    stations: Map<string, Station>,
    users: Map<string, Station>,
  ): void {
    // An older corpse in view while the current body is not is no news.
    if (
      !isAlive(entity) &&
      connection.entityId != null &&
      connection.entityId !== entity.id
    )
      return;
    if (connection.entityId !== entity.id) {
      // A new player object is a respawn: its spawn loadout is not a choice.
      this.endSegment(connection);
      connection.visit = null;
      connection.entityId = entity.id;
    }
    // Race and gender are fixed per connection.
    connection.raceGender ??=
      RACE_GENDERS[
        resolvePlayerBodyType(entity, (id) =>
          this.lookups.getDataBlockData?.(id),
        )
      ];
    if (entity.skinPrefName) connection.skins.set(entity.skinPrefName, timeSec);

    if (!isAlive(entity)) {
      this.endSegment(connection);
      connection.visit = null;
      return;
    }
    const shape = shapeId(entity.dataBlock);
    const pack = shapeId(entity.imageSlots?.[BACKPACK_SLOT]?.shapeName);
    if (this.live && dt > 0)
      add(
        this.totals(connection.guid).worn,
        outfitKey({ armor: armorOf(shape), pack }),
        dt,
      );
    const cloaked = (entity.cloakLevel ?? 0) > 0;
    const visit = connection.visit;
    if (visit) {
      const station = stations.get(visit.stationId);
      if (station && onStation(entity, station) != null) {
        visit.purchased ||= this.live && (station.purchased || cloaked);
        return;
      }
      connection.visit = null;
      // Without a purchase the previous loadout carries on.
      if (visit.purchased) {
        this.endSegment(connection);
        connection.segment = {
          kind: visit.kind,
          armor: armorOf(shape),
          pack,
          weapons: new Set(),
        };
      }
    }
    const station = users.get(entity.id);
    if (station) {
      connection.visit = {
        stationId: station.id,
        kind: station.kind,
        purchased: this.live && (station.purchased || cloaked),
      };
      return;
    }
    const weapon = shapeId(entity.imageSlots?.[WEAPON_SLOT]?.shapeName);
    if (!weapon || !this.live) return;
    if (dt > 0) add(this.totals(connection.guid).held, weapon, dt);
    if (!NON_LOADOUT_WEAPONS.has(weapon))
      connection.segment?.weapons.add(weapon);
  }

  private endSegment(connection: Connection): void {
    const segment = connection.segment;
    if (!segment) return;
    connection.segment = null;
    add(
      this.totals(connection.guid).loadouts[segment.kind],
      loadoutKey({
        armor: segment.armor,
        pack: segment.pack,
        weapons: [...segment.weapons],
      }),
    );
  }
}

/** Replay a recording and observe it every `stepSec`. */
export async function computeDemoPlayerStats(
  bytes: Uint8Array,
  purchaseSequences: ReadonlyMap<string, number>,
  stepSec = 0.25,
): Promise<DemoStatsSidecar> {
  const { createDemoStreamingRecording } =
    await import("../src/stream/demoStreaming");
  const recording = await createDemoStreamingRecording(
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
    { checkpoints: false, groundEffects: false },
  );
  const playback = recording.streamingPlayback;
  const tracker = new DemoPlayerStatsTracker(purchaseSequences, playback);
  for (let t = 0; t <= recording.duration; t += stepSec) {
    const snapshot = playback.stepToTime(t);
    tracker.step(snapshot);
    if (snapshot.exhausted) break;
  }
  return tracker.finish();
}
