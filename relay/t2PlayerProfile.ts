/**
 * A Tribes 2 account's representative profile (look, loadout and weapon)
 * from the private stats of its recent demos. Players with lots of data get
 * a picture of their recent activity; players seen once still get one.
 */
import type { T2LoadoutSource, T2PlayerProfile } from "./accountTypes.js";
import {
  KILL_WEAPON_IMAGES,
  NON_LOADOUT_WEAPONS,
  type Outfit,
  type PlayerDemoStats,
  type RaceGender,
} from "./demoPlayerStats.js";

const DEFAULT_SKIN = "base";

const BODY_TYPES: Record<
  RaceGender,
  NonNullable<T2PlayerProfile["bodyType"]>
> = {
  "Human Male": "male",
  "Human Female": "female",
  Bioderm: "bioderm",
};

/** One demo's stats for the player, with when it was recorded. */
export interface PlayerDemo {
  recordedAt: string;
  stats: PlayerDemoStats;
}

export interface PlayerStatsSummary {
  /** Distinct chosen skins, newest first, `base` included. */
  looks: { raceGender: RaceGender | null; skin: string; recordedAt: string }[];
  /** The newest race/gender seen in play. */
  raceGender: RaceGender | null;
  kills: Map<string, number>;
  weaponsHeldSec: Map<string, number>;
  wornSec: Map<string, number>;
  invLoadouts: Map<string, number>;
  deployInvLoadouts: Map<string, number>;
  /** The first this many demos make up the suit-up sample. */
  sampledDemos: number;
  suitUps: number;
}

function add(totals: Map<string, number>, key: string, amount: number): void {
  totals.set(key, (totals.get(key) ?? 0) + amount);
}

/**
 * Skins come from every demo; everything else from the newest demos until
 * `suitUpSample` loadouts are in. `demos` are newest first.
 */
export function summarizePlayerStats(
  demos: readonly PlayerDemo[],
  suitUpSample: number,
): PlayerStatsSummary {
  const summary: PlayerStatsSummary = {
    looks: [],
    raceGender: null,
    kills: new Map(),
    weaponsHeldSec: new Map(),
    wornSec: new Map(),
    invLoadouts: new Map(),
    deployInvLoadouts: new Map(),
    sampledDemos: 0,
    suitUps: 0,
  };
  for (const { recordedAt, stats } of demos) {
    for (const { raceGender, skin } of stats.skins) {
      summary.raceGender ??= raceGender;
      const same = summary.looks.find(
        (look) =>
          look.skin === skin &&
          (look.raceGender === raceGender ||
            look.raceGender == null ||
            raceGender == null),
      );
      // A race/gender seen in play fills in a skin known only from client info.
      if (same) same.raceGender ??= raceGender;
      else summary.looks.push({ raceGender, skin, recordedAt });
    }
    if (summary.suitUps >= suitUpSample) continue;
    summary.sampledDemos++;
    for (const [weapon, n] of Object.entries(stats.killsByWeapon))
      add(summary.kills, weapon, n);
    for (const [shape, sec] of Object.entries(stats.weaponsHeldSec))
      add(summary.weaponsHeldSec, shape, sec);
    for (const [key, sec] of Object.entries(stats.wornSec))
      add(summary.wornSec, key, sec);
    for (const [key, n] of Object.entries(stats.invLoadouts)) {
      add(summary.invLoadouts, key, n);
      summary.suitUps += n;
    }
    for (const [key, n] of Object.entries(stats.deployInvLoadouts)) {
      add(summary.deployInvLoadouts, key, n);
      summary.suitUps += n;
    }
  }
  return summary;
}

/** The highest total; ties go to the lower key, for stable profiles. */
function top(totals: Map<string, number>): string | null {
  let best: [string, number] | null = null;
  for (const entry of totals)
    if (
      !best ||
      entry[1] > best[1] ||
      (entry[1] === best[1] && entry[0] < best[0])
    )
      best = entry;
  return best?.[0] ?? null;
}

/**
 * Armor and pack from the most common full-station loadout, else deployable
 * one, else the outfit worn longest; the weapon from the most kills with a
 * held weapon, else the weapon held longest.
 */
export function buildT2PlayerProfile(
  guid: string,
  summary: PlayerStatsSummary,
  { lastSeenAt, computedAt }: { lastSeenAt: number | null; computedAt: number },
): T2PlayerProfile {
  let outfit: Outfit | null = null;
  let loadoutSource: T2LoadoutSource | null = null;
  for (const [source, totals] of [
    ["inv", summary.invLoadouts],
    ["deployInv", summary.deployInvLoadouts],
    ["worn", summary.wornSec],
  ] as const) {
    const key = top(totals);
    if (!key) continue;
    outfit = JSON.parse(key) as Outfit;
    loadoutSource = source;
    break;
  }
  const killWeapons = new Map<string, number>();
  for (const [weapon, n] of summary.kills) {
    const image = KILL_WEAPON_IMAGES.get(weapon.toLowerCase());
    if (image) add(killWeapons, image, n);
  }
  const heldWeapons = new Map(
    [...summary.weaponsHeldSec].filter(
      ([shape]) => !NON_LOADOUT_WEAPONS.has(shape),
    ),
  );
  const custom = summary.looks.find(
    (look) => look.skin.toLowerCase() !== DEFAULT_SKIN,
  );
  return {
    guid,
    bodyType: summary.raceGender ? BODY_TYPES[summary.raceGender] : null,
    skin: (custom ?? summary.looks[0])?.skin ?? null,
    armor: outfit?.armor ?? null,
    pack: outfit?.pack ?? null,
    weapon: top(killWeapons) ?? top(heldWeapons),
    loadoutSource,
    suitUps: summary.suitUps,
    demoCount: summary.sampledDemos,
    lastSeenAt,
    computedAt,
  };
}
