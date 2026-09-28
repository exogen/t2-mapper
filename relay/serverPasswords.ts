import { normalizeAddress } from "./shared.js";
import type { ServerInfo } from "./types.js";

/** Relay-only secrets. Never attach these to server metadata or status output. */
export class ServerPasswords {
  #passwords: Map<string, string>;

  constructor(raw: string | undefined) {
    let parsed: unknown;
    try {
      parsed = raw?.trim() ? JSON.parse(raw) : {};
    } catch {
      // JSON parser errors can include the input, which contains secrets.
      throw new Error(
        "T2_SERVER_PASSWORDS must be a JSON object of string passwords",
      );
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.entries(parsed).some(
        ([key, value]) => !key || typeof value !== "string",
      )
    ) {
      throw new Error(
        "T2_SERVER_PASSWORDS must be a JSON object of string passwords",
      );
    }
    this.#passwords = new Map(Object.entries(parsed));
  }

  get enabled(): boolean {
    return this.#passwords.size > 0;
  }

  /** Exact address wins over exact (case-sensitive) server name. */
  getPassword(
    server:
      Pick<ServerInfo, "address" | "name" | "passwordRequired"> | undefined,
  ): string | undefined {
    if (!server?.passwordRequired) return undefined;
    return (
      this.#passwords.get(normalizeAddress(server.address)) ??
      this.#passwords.get(server.name)
    );
  }
}
