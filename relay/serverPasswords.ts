import { normalizeAddress } from "./shared.js";
import { connLog } from "./logger.js";
import type { ServerInfo } from "./types.js";

type PasswordServer = Pick<ServerInfo, "address" | "name" | "passwordRequired">;
type PasswordMatch = { password: string; matchedBy: "address" | "name" };

const CONFIG_ERROR =
  "T2_SERVER_PASSWORDS must be a JSON object of string passwords";

/** Relay-only secrets. Never attach these to server metadata or status output. */
export class ServerPasswords {
  #passwords: Map<string, string>;

  constructor(raw: string | undefined) {
    let parsed: unknown;
    try {
      parsed = raw?.trim() ? JSON.parse(raw) : {};
    } catch {
      // JSON parser errors can include the input, which contains secrets.
      throw new Error(CONFIG_ERROR);
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.entries(parsed).some(
        ([key, value]) => !key || typeof value !== "string",
      )
    ) {
      throw new Error(CONFIG_ERROR);
    }
    this.#passwords = new Map(Object.entries(parsed));
    // Huffman strings have an 8-bit length and write only the low byte of
    // each character. Reject inputs that would change on the wire instead
    // of silently sending a different password (or a malformed packet).
    for (const password of this.#passwords.values()) {
      if (password.length > 255 || /[^\x01-\xff]/.test(password)) {
        throw new Error(
          "T2_SERVER_PASSWORDS passwords must be at most 255 single-byte characters without NUL",
        );
      }
    }
  }

  get enabled(): boolean {
    return this.#passwords.size > 0;
  }

  /** Log only lookup outcomes, once per join (never for patrol polling). */
  getPasswordForConnection(
    address: string,
    server: PasswordServer | undefined,
  ): string | undefined {
    const match = this.findMatch(server);
    let outcome: string;
    if (!this.enabled) outcome = "disabled";
    else if (!server) outcome = "unknown-server";
    else if (!server.passwordRequired) outcome = "not-required";
    else if (!match) outcome = "missing";
    else outcome = match.password === "" ? "empty" : "selected";
    const detail = {
      address,
      serverName: server?.name,
      passwordRequired: server?.passwordRequired,
      passwordConfigEnabled: this.enabled,
      outcome,
      matchedBy: match?.matchedBy,
    };
    if (outcome === "unknown-server") {
      connLog.warn(
        detail,
        "Server password lookup skipped: server metadata unavailable",
      );
    } else if (
      outcome === "missing" ||
      outcome === "empty" ||
      (outcome === "disabled" && server?.passwordRequired)
    ) {
      connLog.warn(
        detail,
        "Passworded server has no usable configured password; check T2_SERVER_PASSWORDS exact name or IP:port key",
      );
    } else {
      connLog.info(detail, "Server password lookup");
    }
    return match?.password;
  }

  /** Empty overrides intentionally disable credentials, including patrol. */
  hasPassword(server: PasswordServer): boolean {
    return !!this.getPassword(server);
  }

  /** Exact address wins over exact (case-sensitive) server name. */
  getPassword(server: PasswordServer | undefined): string | undefined {
    return this.findMatch(server)?.password;
  }

  private findMatch(
    server: PasswordServer | undefined,
  ): PasswordMatch | undefined {
    if (!server?.passwordRequired) return undefined;
    const addressPassword = this.#passwords.get(
      normalizeAddress(server.address),
    );
    if (addressPassword != null)
      return { password: addressPassword, matchedBy: "address" };
    const namePassword = this.#passwords.get(server.name);
    if (namePassword != null)
      return { password: namePassword, matchedBy: "name" };
    return undefined;
  }
}
