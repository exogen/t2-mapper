import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { fromNodeHeaders } from "better-auth/node";
import { getRequest, setResponse } from "better-call/node";
import type { DiscordProfile } from "better-auth/social-providers";
import { createAccountDatabaseBackup } from "./accountDatabase.js";
import type { AccountUser } from "./accountTypes.js";
import { browserIdentity } from "./browserAudit.js";
import { discordPkce } from "./discordPkce.js";
import { relayLog } from "./logger.js";
import {
  GAME_PRESENTATION_PATH,
  GamePresentationError,
  isPublishedDemoFilename,
  readGamePresentationUpdate,
  type GamePresentationUpdate,
  type PublishedGame,
} from "./gamePresentation.js";
import type { DemoMetadata } from "./demoMetadata.js";

export interface AppAuthConfig {
  baseURL: string;
  trustedOrigins: string[];
  secret: string;
  discordClientId: string;
  discordClientSecret: string;
  trustFlyProxy?: boolean;
}

export class AppAuthError extends Error {
  readonly status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.name = "AppAuthError";
    this.status = status;
  }
}

const DISCORD_ID = /^\d{17,20}$/;
const AUTH_PATH = "/api/auth";
const MAX_AUTH_BODY_BYTES = 16 * 1024;
const AUTH_CLIENT_IP_HEADER = "x-mapgenius-account-client-ip";
// Keep counters well beyond the configured and built-in rate-limit windows.
const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60_000;
const ACCOUNT_ROUTES = new Map([
  [`${AUTH_PATH}/sign-in/social`, "POST"],
  [`${AUTH_PATH}/callback/discord`, "GET"],
  [`${AUTH_PATH}/sign-out`, "POST"],
  [GAME_PRESENTATION_PATH, "POST"],
]);

function configuredOrigin(
  value: string,
  name: string,
  production: boolean,
): string {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.hostname.includes("*") ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        !production &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  ) {
    throw new Error(
      `${name} must be an exact HTTPS origin (HTTP localhost is allowed in development)`,
    );
  }
  return url.origin;
}

/** Public deployment defaults can exist before Discord credentials are installed. */
export function loadAppAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): AppAuthConfig | null {
  const credentials = [
    env.DISCORD_CLIENT_ID,
    env.DISCORD_CLIENT_SECRET,
    env.AUTH_SECRET,
  ];
  if (credentials.every((value) => !value?.trim())) return null;
  if (credentials.some((value) => !value?.trim())) {
    throw new Error(
      "Discord login requires DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, and AUTH_SECRET together",
    );
  }
  if (!DISCORD_ID.test(env.DISCORD_CLIENT_ID!))
    throw new Error("DISCORD_CLIENT_ID must be a Discord application ID");
  if (Buffer.byteLength(env.AUTH_SECRET!, "utf8") < 32)
    throw new Error("AUTH_SECRET must contain at least 32 bytes");
  const production = env.NODE_ENV === "production";
  const baseURL = configuredOrigin(
    env.AUTH_BASE_URL ||
      (production ? "https://api.tribes2.online" : "http://localhost:8765"),
    "AUTH_BASE_URL",
    production,
  );
  const trustedOrigins = [
    ...new Set(
      (
        env.AUTH_TRUSTED_ORIGINS ||
        (production ? "https://tribes2.online" : "http://localhost:3000")
      )
        .split(",")
        .map((value) =>
          configuredOrigin(value.trim(), "AUTH_TRUSTED_ORIGINS", production),
        ),
    ),
  ];
  return {
    baseURL,
    trustedOrigins,
    secret: env.AUTH_SECRET!,
    discordClientId: env.DISCORD_CLIENT_ID!,
    discordClientSecret: env.DISCORD_CLIENT_SECRET!,
    trustFlyProxy: /^(1|true)$/i.test(env.RELAY_TRUST_FLY_PROXY || ""),
  };
}

/** Discord is the identity source; email is an internal library identifier only. */
export function mapDiscordProfile(profile: DiscordProfile) {
  if (
    !DISCORD_ID.test(profile.id) ||
    typeof profile.username !== "string" ||
    !profile.username
  ) {
    throw new Error("Discord returned an invalid account profile");
  }
  return {
    name: profile.global_name || profile.username,
    image: profile.image_url,
    email: `${profile.id}@discord.invalid`,
    emailVerified: false,
    discordUsername: profile.username,
  };
}

function json(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}

function isAccountPath(pathname: string): boolean {
  return (
    pathname === "/api/account" ||
    pathname === GAME_PRESENTATION_PATH ||
    pathname === AUTH_PATH ||
    pathname.startsWith(`${AUTH_PATH}/`)
  );
}

function requestPathname(
  req: IncomingMessage,
  res: ServerResponse,
): string | null {
  try {
    return new URL(req.url || "/", "http://localhost").pathname;
  } catch {
    json(res, 400, { error: "Invalid request URL" });
    return null;
  }
}

export function handleDisabledAppAuth(
  req: IncomingMessage,
  res: ServerResponse,
  trustedOrigins = (
    process.env.AUTH_TRUSTED_ORIGINS ||
    (process.env.NODE_ENV === "production"
      ? "https://tribes2.online"
      : "http://localhost:3000")
  )
    .split(",")
    .map((origin) => origin.trim()),
): boolean {
  const pathname = requestPathname(req, res);
  if (pathname === null) return true;
  if (!isAccountPath(pathname)) return false;
  res.setHeader("Vary", "Origin");
  if (req.headers.origin) {
    if (!trustedOrigins.includes(req.headers.origin)) {
      json(res, 403, { error: "Origin is not allowed" });
      return true;
    }
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.writeHead(204);
    res.end();
    return true;
  }
  json(
    res,
    pathname === "/api/account" ? 200 : 503,
    pathname === "/api/account"
      ? { enabled: false, user: null }
      : { error: "Discord sign-in is not configured" },
  );
  return true;
}

export interface AppAuthService {
  handle(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  getAccount(
    headers: IncomingHttpHeaders | Headers,
  ): Promise<AccountUser | null>;
  requireAdmin(headers: IncomingHttpHeaders | Headers): Promise<AccountUser>;
  close(): void;
}

/** Bound expired auth data and stale rate-limit counters without touching live state. */
export function purgeExpiredAccountData(
  database: Database.Database,
  now = Date.now(),
): void {
  database.transaction(() => {
    database.prepare('DELETE FROM "session" WHERE "expiresAt" <= ?').run(now);
    database
      .prepare('DELETE FROM "verification" WHERE "expiresAt" <= ?')
      .run(now);
    database
      .prepare('DELETE FROM "rateLimit" WHERE "lastRequest" < ?')
      .run(now - RATE_LIMIT_RETENTION_MS);
  })();
}

export async function createAppAuth({
  config,
  database,
  onUpdateGamePresentation,
  onReadDemoPresentation,
}: {
  config: AppAuthConfig;
  database: Database.Database;
  onUpdateGamePresentation?: (
    update: GamePresentationUpdate,
  ) => Promise<PublishedGame>;
  onReadDemoPresentation?: (filename: string) => Promise<DemoMetadata>;
}): Promise<AppAuthService> {
  const options = {
    appName: "MapGenius",
    baseURL: config.baseURL,
    basePath: AUTH_PATH,
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database,
    telemetry: { enabled: false },
    plugins: [discordPkce()],
    // Unexpected failures are handled by our HTTP boundary without dumping
    // raw provider responses or database errors to the router's console.
    onAPIError: {
      throw: true,
      errorURL: `${config.trustedOrigins[0]}/?accountError=discord`,
    },
    logger: {
      // Provider responses and token material must never be included in logs.
      log: (level) => {
        if (level === "warn" || level === "error")
          relayLog[level](
            { event: "account_library_error" },
            "Authentication library reported an error",
          );
      },
    },
    emailAndPassword: { enabled: false },
    socialProviders: {
      discord: {
        clientId: config.discordClientId,
        clientSecret: config.discordClientSecret,
        disableDefaultScope: true,
        scope: ["identify"],
        disableIdTokenSignIn: true,
        overrideUserInfoOnSignIn: true,
        mapProfileToUser: mapDiscordProfile,
      },
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: true,
          defaultValue: "user",
          input: false,
        },
        // Only the trusted provider mapper can reach this field: profile-update
        // endpoints are deliberately not mounted by the HTTP adapter below.
        discordUsername: { type: "string", required: true, defaultValue: "" },
      },
    },
    account: {
      accountLinking: { enabled: false },
      encryptOAuthTokens: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: config.baseURL.startsWith("https:"),
      disableOriginCheck: false,
      disableCSRFCheck: false,
      cookiePrefix: "mapgenius",
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
      ipAddress: { ipAddressHeaders: [AUTH_CLIENT_IP_HEADER] },
    },
    rateLimit: { enabled: true, window: 60, max: 60, storage: "database" },
  } satisfies BetterAuthOptions;
  const migrations = await getMigrations(options);
  if (migrations.schemaProblems.length)
    throw new Error(
      "The account database schema needs repair before starting authentication",
    );
  const hasChanges =
    migrations.toBeCreated.length ||
    migrations.toBeAdded.length ||
    migrations.toBeAddedIndexes.length;
  if (hasChanges) {
    if (
      database.name !== ":memory:" &&
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user'",
        )
        .get()
    ) {
      const temporary = `${database.name}.pre-migration-${randomUUID()}.sqlite`;
      try {
        await createAccountDatabaseBackup(database, temporary);
        fs.renameSync(temporary, `${database.name}.pre-migration.sqlite`);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
    database.exec("BEGIN IMMEDIATE");
    try {
      await migrations.runMigrations();
      database.exec("COMMIT");
    } catch (error) {
      if (database.inTransaction) database.exec("ROLLBACK");
      throw error;
    }
  }
  const auth = betterAuth(options);
  database.exec(`
    CREATE INDEX IF NOT EXISTS "mapgenius_session_expiry" ON "session" ("expiresAt");
    CREATE INDEX IF NOT EXISTS "mapgenius_verification_expiry" ON "verification" ("expiresAt");
    CREATE INDEX IF NOT EXISTS "mapgenius_rate_limit_last_request" ON "rateLimit" ("lastRequest");
  `);
  purgeExpiredAccountData(database);
  const cleanupTimer = setInterval(() => {
    try {
      purgeExpiredAccountData(database);
    } catch {
      relayLog.error(
        { event: "account_cleanup_failed" },
        "Expired account data cleanup failed",
      );
    }
  }, 60 * 60_000);
  cleanupTimer.unref();
  const readAccount = async (headers: IncomingHttpHeaders | Headers) => {
    const result = await auth.api.getSession({
      headers: headers instanceof Headers ? headers : fromNodeHeaders(headers),
      query: { disableCookieCache: true },
      returnHeaders: true,
    });
    const session = result.response;
    if (!session) return { user: null, headers: result.headers };
    const account = database
      .prepare(
        'SELECT "accountId" FROM "account" WHERE "userId" = ? AND "providerId" = ?',
      )
      .get(session.user.id, "discord") as { accountId: string } | undefined;
    if (!account) return { user: null, headers: result.headers };
    const user: AccountUser = {
      id: session.user.id,
      name: session.user.name,
      image: session.user.image ?? null,
      role: session.user.role === "admin" ? "admin" : "user",
      discordId: account.accountId,
      discordUsername: session.user.discordUsername,
    };
    return { user, headers: result.headers };
  };
  const getAccount: AppAuthService["getAccount"] = async (headers) =>
    (await readAccount(headers)).user;
  const checkAdmin = (user: AccountUser | null): AccountUser => {
    if (!user) throw new AppAuthError(401, "Sign in to continue");
    if (user.role !== "admin")
      throw new AppAuthError(403, "An administrator account is required");
    return user;
  };
  const requireAdmin: AppAuthService["requireAdmin"] = async (headers) =>
    checkAdmin(await getAccount(headers));
  return {
    close: () => clearInterval(cleanupTimer),
    getAccount,
    requireAdmin,
    async handle(req, res) {
      const pathname = requestPathname(req, res);
      if (pathname === null) return true;
      if (!isAccountPath(pathname)) return false;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Vary", "Origin");
      const origin = req.headers.origin;
      if (
        origin &&
        !config.trustedOrigins.includes(origin) &&
        origin !== config.baseURL
      ) {
        json(res, 403, { error: "Origin is not allowed" });
        return true;
      }
      if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
      if (req.method === "OPTIONS") {
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.writeHead(204);
        res.end();
        return true;
      }
      try {
        if (pathname === "/api/account") {
          if (req.method !== "GET") {
            json(res, 405, { error: "Method not allowed" });
            return true;
          }
          const { user, headers } = await readAccount(req.headers);
          const cookies = headers.getSetCookie();
          if (cookies.length) res.setHeader("Set-Cookie", cookies);
          json(res, 200, { enabled: true, user });
          return true;
        }
        const method =
          pathname === GAME_PRESENTATION_PATH && req.method === "GET"
            ? "GET"
            : ACCOUNT_ROUTES.get(pathname);
        if (!method) {
          json(res, 404, { error: "Not found" });
          return true;
        }
        if (req.method !== method) {
          json(res, 405, { error: "Method not allowed" });
          return true;
        }
        if (method === "POST" && !origin) {
          json(res, 403, { error: "An approved Origin header is required" });
          return true;
        }
        if (Number(req.headers["content-length"]) > MAX_AUTH_BODY_BYTES) {
          req.resume();
          json(res, 413, { error: "Account request is too large" });
          return true;
        }
        // Client-supplied forwarded headers must not control rate-limit identity.
        req.headers[AUTH_CLIENT_IP_HEADER] = browserIdentity(
          req,
          config.trustFlyProxy ?? false,
        ).clientIp;
        const request = getRequest({
          request: req,
          base: config.baseURL,
          bodySizeLimit: MAX_AUTH_BODY_BYTES,
        });
        if (pathname === GAME_PRESENTATION_PATH) {
          await requireAdmin(req.headers);
          if (method === "GET") {
            const params = new URL(req.url || "/", config.baseURL).searchParams;
            const filename = params.get("filename");
            if (
              !isPublishedDemoFilename(filename) ||
              params.getAll("filename").length !== 1 ||
              [...params.keys()].some((key) => key !== "filename")
            ) {
              json(res, 400, { error: "Choose a published demo filename" });
              return true;
            }
            if (!onReadDemoPresentation) {
              json(res, 503, { error: "Editing demo details is unavailable" });
              return true;
            }
            json(res, 200, await onReadDemoPresentation(filename));
            return true;
          }
          if (!onUpdateGamePresentation) {
            json(res, 503, { error: "Saving game details is unavailable" });
            return true;
          }
          if (
            req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !==
              "application/json" ||
            req.headers["content-encoding"]
          ) {
            req.resume();
            json(res, 415, { error: "Send uncompressed JSON" });
            return true;
          }
          const update = readGamePresentationUpdate(await request.json());
          if (!update) {
            json(res, 400, { error: "Invalid game details" });
            return true;
          }
          const game = await onUpdateGamePresentation(update);
          json(res, 200, game);
          return true;
        }
        const signingOut =
          pathname === `${AUTH_PATH}/sign-out`
            ? await auth.api.getSession({
                headers: fromNodeHeaders(req.headers),
                query: { disableCookieCache: true, disableRefresh: true },
              })
            : null;
        const response = await auth.handler(request);
        // Better Auth swallows session-deletion errors. Keep the browser cookie
        // for retry rather than claiming logout succeeded while it still works.
        if (
          signingOut &&
          response.ok &&
          database
            .prepare('SELECT 1 FROM "session" WHERE "id" = ?')
            .get(signingOut.session.id)
        ) {
          throw new Error("Account session could not be revoked");
        }
        await setResponse(res, response);
      } catch (error) {
        if (
          error instanceof AppAuthError ||
          error instanceof GamePresentationError
        ) {
          req.resume();
          json(res, error.status, { error: error.message });
        } else if (
          error instanceof Error &&
          error.message.startsWith("request body size exceeded")
        ) {
          req.resume();
          json(res, 413, { error: "Account request is too large" });
        } else if (error instanceof SyntaxError) {
          json(res, 400, { error: "Invalid account request" });
        } else {
          relayLog.error(
            { event: "account_request_failed", pathname },
            "Account request failed",
          );
          if (!res.headersSent)
            json(res, 500, { error: "Account request failed" });
          else res.destroy();
        }
      }
      return true;
    },
  };
}
