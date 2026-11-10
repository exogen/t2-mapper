export type AccountRole = "admin" | "user";

/** Discord IDs stay strings: Snowflake values exceed JavaScript's safe integers. */
export function isDiscordId(value: unknown): value is string {
  return typeof value === "string" && /^\d{17,20}$/.test(value);
}

/** Discord profile fields safe to show to any visitor. */
export interface AccountPublicProfile {
  name: string;
  image: string | null;
  discordId: string;
  discordUsername: string;
}

/** The signed-in account additionally carries authorization and session identity. */
export interface AccountUser extends AccountPublicProfile {
  id: string;
  role: AccountRole;
}
