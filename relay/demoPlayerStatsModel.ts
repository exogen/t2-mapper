/** Pure per-demo stats schema and equipment vocabulary, shared by replay,
 * sidecar readers, profile aggregation, and operator scripts. */
export const DEMO_STATS_VERSION = 5;

export interface PlayerMapScore {
  /** Internal mission name, as used by map art and the demo index. */
  mission: string;
  /** Last observed score, including final debrief awards when recorded. */
  score: number;
}

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
  /** One final observed score per played mission, never the mid-match peak.
   * Older sidecars can omit this; newly computed stats always include it. */
  mapScores?: PlayerMapScore[];
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
