export type AccountRole = "admin" | "user";

/** Public account data shared by the relay and browser. */
export interface AccountUser {
  id: string;
  name: string;
  image: string | null;
  role: AccountRole;
  discordId: string;
  discordUsername: string;
}
