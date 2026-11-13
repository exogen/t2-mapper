export type AccountRole = "admin" | "user";

/** Discord IDs stay strings: Snowflake values exceed JavaScript's safe integers. */
export function isDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

/** How a profile's loadout was learned: bought at a full or deployable
 *  inventory station, or only seen worn (game types without stations). */
export type T2LoadoutSource = "inv" | "deployInv" | "worn";

/**
 * A Tribes 2 account's representative look and loadout, from its recent
 * demos. Identifiers are the game's: shapes without `.dts` for images, and
 * `Light`/`Medium`/`Heavy` for armor.
 */
export interface T2PlayerProfile {
  guid: string;
  bodyType: "male" | "female" | "bioderm" | null;
  skin: string | null;
  armor: string | null;
  pack: string | null;
  weapon: string | null;
  loadoutSource: T2LoadoutSource | null;
  /** Suit-ups behind the loadout. */
  suitUps: number;
  /** Demos behind the loadout and weapon (skins come from every one read). */
  demoCount: number;
  /** The newest demo the account appears in, in epoch milliseconds. */
  lastSeenAt: number | null;
  /** Epoch milliseconds when this data snapshot began; newer snapshots win writes. */
  computedAt: number;
}

/** What a public profile shows of a linked account: enough to render it. */
export interface T2ProfileView extends Pick<
  T2PlayerProfile,
  "bodyType" | "skin" | "armor" | "pack" | "weapon" | "loadoutSource"
> {
  /** ISO time of the newest demo the account appears in. */
  lastSeenAt: string | null;
}

/** Discord profile fields safe to show to any visitor. */
export interface AccountPublicProfile {
  name: string;
  image: string | null;
  discordId: string;
  discordUsername: string;
  /** The most recently seen linked Tribes 2 account's profile. */
  t2Profile: T2ProfileView | null;
}

/** The signed-in account additionally carries authorization and session identity. */
export interface AccountUser extends AccountPublicProfile {
  id: string;
  role: AccountRole;
}
