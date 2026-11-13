import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  isDiscordId,
  type AccountRole,
  type T2PlayerBestMapUpdate,
  type T2PlayerProfile,
  type T2ProfileView,
} from "./accountTypes.js";
import { normalizePlayerGuid } from "./shared.js";

// 3.51.3 fixes SQLite's WAL-reset corruption bug. Check the embedded engine,
// rather than the unrelated sqlite3 executable installed on the host.
const MIN_SQLITE_VERSION = 3_051_003;

function assertSupportedSQLite(database: Database.Database): void {
  const version = database
    .prepare("SELECT sqlite_version()")
    .pluck()
    .get() as string;
  const [major, minor, patch] = version.split(".").map(Number);
  if (major * 1_000_000 + minor * 1_000 + patch < MIN_SQLITE_VERSION) {
    throw new Error(
      `Account database requires SQLite 3.51.3 or newer; found ${version}`,
    );
  }
}

/**
 * App-owned schema changes, applied in order after Better Auth's tables exist.
 * `PRAGMA user_version` counts how many have run; only ever append here.
 */
const ACCOUNT_SCHEMA_MIGRATIONS: readonly string[] = [
  // Tribes 2 accounts by the GUID their auth server issued, and which Discord
  // identities claim them. A person may hold several of each, so links are
  // many-to-many; an account row outlives its links.
  `CREATE TABLE "t2Account" (
    "guid" TEXT NOT NULL PRIMARY KEY
      CHECK ("guid" GLOB '[1-9]*' AND "guid" NOT GLOB '*[^0-9]*'),
    "name" TEXT,
    "createdAt" INTEGER NOT NULL
  ) STRICT;
  CREATE TABLE "t2AccountLink" (
    "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
    "guid" TEXT NOT NULL REFERENCES "t2Account" ("guid") ON DELETE CASCADE,
    "createdAt" INTEGER NOT NULL,
    PRIMARY KEY ("userId", "guid")
  ) STRICT, WITHOUT ROWID;
  CREATE INDEX "t2AccountLink_guid" ON "t2AccountLink" ("guid");`,
  // Computed representative profiles, for any GUID: no foreign key, so a
  // profile can exist before or without a link.
  `CREATE TABLE "t2PlayerProfile" (
    "guid" TEXT NOT NULL PRIMARY KEY
      CHECK ("guid" GLOB '[1-9]*' AND "guid" NOT GLOB '*[^0-9]*'),
    "bodyType" TEXT CHECK ("bodyType" IN ('male', 'female', 'bioderm')),
    "skin" TEXT,
    "armor" TEXT,
    "pack" TEXT,
    "weapon" TEXT,
    "loadoutSource" TEXT
      CHECK ("loadoutSource" IN ('inv', 'deployInv', 'worn')),
    "suitUps" INTEGER NOT NULL,
    "demoCount" INTEGER NOT NULL,
    "lastSeenAt" INTEGER,
    "computedAt" INTEGER NOT NULL
  ) STRICT;`,
  // All-time scores are independent of recent appearance snapshots, allowing
  // each new demo to compare its scores without rereading historical demos.
  `CREATE TABLE "t2PlayerBestMap" (
    "guid" TEXT NOT NULL PRIMARY KEY
      CHECK ("guid" GLOB '[1-9]*' AND "guid" NOT GLOB '*[^0-9]*'),
    "mission" TEXT NOT NULL CHECK (length(trim("mission")) > 0),
    "score" REAL NOT NULL
  ) STRICT;`,
];

function accountSchemaVersion(database: Database.Database): number {
  return database.pragma("user_version", { simple: true }) as number;
}

export function hasPendingAccountSchemaMigrations(
  database: Database.Database,
): boolean {
  return accountSchemaVersion(database) < ACCOUNT_SCHEMA_MIGRATIONS.length;
}

/**
 * Apply pending app-owned migrations. The caller holds the write transaction,
 * so each statement and its `user_version` bump commit or roll back together.
 */
export function migrateAccountSchema(database: Database.Database): void {
  if (!database.inTransaction)
    throw new Error("Account schema migrations require a transaction");
  for (
    let version = accountSchemaVersion(database);
    version < ACCOUNT_SCHEMA_MIGRATIONS.length;
    version++
  ) {
    database.exec(ACCOUNT_SCHEMA_MIGRATIONS[version]);
    database.pragma(`user_version = ${version + 1}`);
  }
}

/** Open the account database on a local persistent volume, not network storage. */
export function openAccountDatabase(databasePath: string): Database.Database {
  if (!databasePath.trim() || databasePath === ":memory:") {
    throw new Error("Account database requires a persistent file path");
  }
  const filename = path.resolve(databasePath);
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  // Create the file privately before SQLite creates its WAL/SHM companions.
  // Refuse symlinks and non-files instead of opening an unexpected target.
  const fd = fs.openSync(
    filename,
    fs.constants.O_CREAT | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW,
    0o600,
  );
  try {
    if (!fs.fstatSync(fd).isFile())
      throw new Error("Account database must be a regular file");
    fs.fchmodSync(fd, 0o600);
  } finally {
    fs.closeSync(fd);
  }

  const database = new Database(filename, { timeout: 5_000 });
  try {
    assertSupportedSQLite(database);
    database.pragma("foreign_keys = ON");
    if (database.pragma("journal_mode = WAL", { simple: true }) !== "wal") {
      throw new Error("Could not enable WAL for the account database");
    }
    // FULL syncs each committed WAL transaction; losing an acknowledged role
    // change or session revocation on power failure is not an acceptable trade.
    database.pragma("synchronous = FULL");
    database.pragma("busy_timeout = 5000");
    database.pragma("wal_autocheckpoint = 1000");
    if (database.pragma("quick_check", { simple: true }) !== "ok") {
      throw new Error("Account database failed SQLite quick_check");
    }
    for (const suffix of ["-wal", "-shm"]) {
      try {
        fs.chmodSync(`${filename}${suffix}`, 0o600);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}

/**
 * Produce a standalone, verified snapshot while the database remains open.
 * Copying the live .sqlite file would omit committed data still in its WAL.
 * Destination creation is atomic and never overwrites an existing backup.
 */
export async function createAccountDatabaseBackup(
  database: Database.Database,
  destination: string,
): Promise<void> {
  const filename = path.resolve(destination);
  const directory = path.dirname(filename);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(
    directory,
    `.account-backup-${randomUUID()}.sqlite`,
  );
  const fd = fs.openSync(temporary, "wx", 0o600);
  fs.closeSync(fd);
  try {
    await database.backup(temporary);
    const snapshot = new Database(temporary, {
      readonly: true,
      fileMustExist: true,
    });
    try {
      if (snapshot.pragma("integrity_check", { simple: true }) !== "ok") {
        throw new Error("Account backup failed SQLite integrity_check");
      }
      if ((snapshot.pragma("foreign_key_check") as unknown[]).length > 0) {
        throw new Error("Account backup failed SQLite foreign_key_check");
      }
    } finally {
      snapshot.close();
    }
    const snapshotFd = fs.openSync(temporary, "r");
    try {
      fs.fsyncSync(snapshotFd);
    } finally {
      fs.closeSync(snapshotFd);
    }
    // link() fails with EEXIST rather than replacing a previous backup.
    fs.linkSync(temporary, filename);
    const directoryFd = fs.openSync(directory, "r");
    try {
      fs.fsyncSync(directoryFd);
    } finally {
      fs.closeSync(directoryFd);
    }
  } finally {
    for (const suffix of ["", "-wal", "-shm"]) {
      fs.rmSync(`${temporary}${suffix}`, { force: true });
    }
  }
}

function discordUserId(
  database: Database.Database,
  discordId: string,
  purpose: string,
): string {
  const users = database
    .prepare(
      'SELECT u."id" FROM "user" u JOIN "account" a ON a."userId" = u."id" WHERE a."providerId" = ? AND a."accountId" = ? LIMIT 2',
    )
    .all("discord", discordId) as Array<{ id: string }>;
  if (users.length === 0) {
    throw new Error(
      `Discord account not found. Sign in with Discord once before ${purpose}.`,
    );
  }
  if (users.length !== 1) {
    throw new Error(
      `Multiple accounts match this Discord ID; repair the account linkage before ${purpose}.`,
    );
  }
  return users[0].id;
}

/** Assign a role to an existing, OAuth-linked Discord identity from a trusted operator. */
export function setAccountRole(
  database: Database.Database,
  discordId: string,
  role: AccountRole,
): { id: string; discordId: string; role: AccountRole } {
  if (!isDiscordId(discordId)) {
    throw new Error("--discord-id must be a numeric Discord user ID");
  }
  if (role !== "admin" && role !== "user") {
    throw new Error("--role must be admin or user");
  }

  return database
    .transaction(() => {
      const id = discordUserId(database, discordId, "assigning a role");
      database
        .prepare('UPDATE "user" SET "role" = ?, "updatedAt" = ? WHERE "id" = ?')
        .run(role, Date.now(), id);
      return { id, discordId, role };
    })
    .immediate();
}

export interface LinkedT2Account {
  guid: string;
  name: string | null;
  linkedAt: number;
}

function requireT2Guid(guid: string): string {
  const normalized = normalizePlayerGuid(guid);
  if (!normalized) {
    throw new Error(
      "--guid must be a nonzero numeric Tribes 2 GUID (smurfs have none)",
    );
  }
  return normalized;
}

function linkedT2Accounts(
  database: Database.Database,
  userId: string,
): LinkedT2Account[] {
  return database
    .prepare(
      'SELECT t."guid", t."name", l."createdAt" AS "linkedAt" FROM "t2AccountLink" l JOIN "t2Account" t ON t."guid" = l."guid" WHERE l."userId" = ? ORDER BY l."createdAt", t."guid"',
    )
    .all(userId) as LinkedT2Account[];
}

/**
 * Link a Tribes 2 GUID to an OAuth-linked Discord identity from a trusted
 * operator. A given name replaces the account's label; linking again without
 * one keeps it.
 */
export function linkT2Account(
  database: Database.Database,
  discordId: string,
  guid: string,
  name: string | null = null,
): { discordId: string; accounts: LinkedT2Account[] } {
  if (!isDiscordId(discordId)) {
    throw new Error("--discord-id must be a numeric Discord user ID");
  }
  const normalized = requireT2Guid(guid);
  return database
    .transaction(() => {
      const userId = discordUserId(
        database,
        discordId,
        "linking a Tribes 2 account",
      );
      const now = Date.now();
      database
        .prepare(
          'INSERT INTO "t2Account" ("guid", "name", "createdAt") VALUES (?, ?, ?) ON CONFLICT ("guid") DO UPDATE SET "name" = coalesce(excluded."name", "name")',
        )
        .run(normalized, name, now);
      database
        .prepare(
          'INSERT INTO "t2AccountLink" ("userId", "guid", "createdAt") VALUES (?, ?, ?) ON CONFLICT DO NOTHING',
        )
        .run(userId, normalized, now);
      return { discordId, accounts: linkedT2Accounts(database, userId) };
    })
    .immediate();
}

/** Remove one Discord identity's link to a Tribes 2 GUID, reporting whether it existed. */
export function unlinkT2Account(
  database: Database.Database,
  discordId: string,
  guid: string,
): boolean {
  if (!isDiscordId(discordId)) {
    throw new Error("--discord-id must be a numeric Discord user ID");
  }
  const normalized = requireT2Guid(guid);
  return database
    .transaction(() => {
      const userId = discordUserId(
        database,
        discordId,
        "unlinking a Tribes 2 account",
      );
      return (
        database
          .prepare(
            'DELETE FROM "t2AccountLink" WHERE "userId" = ? AND "guid" = ?',
          )
          .run(userId, normalized).changes > 0
      );
    })
    .immediate();
}

/** Store a profile unless a newer data snapshot already won the write. */
export function saveT2PlayerProfile(
  database: Database.Database,
  profile: T2PlayerProfile,
): void {
  database
    .prepare(
      `INSERT INTO "t2PlayerProfile" (
        "guid", "bodyType", "skin", "armor", "pack", "weapon", "loadoutSource",
        "suitUps", "demoCount", "lastSeenAt", "computedAt"
      ) VALUES (
        @guid, @bodyType, @skin, @armor, @pack, @weapon, @loadoutSource,
        @suitUps, @demoCount, @lastSeenAt, @computedAt
      ) ON CONFLICT ("guid") DO UPDATE SET
        "bodyType" = excluded."bodyType", "skin" = excluded."skin",
        "armor" = excluded."armor", "pack" = excluded."pack",
        "weapon" = excluded."weapon", "loadoutSource" = excluded."loadoutSource",
        "suitUps" = excluded."suitUps", "demoCount" = excluded."demoCount",
        "lastSeenAt" = excluded."lastSeenAt", "computedAt" = excluded."computedAt"
      WHERE excluded."computedAt" >= "t2PlayerProfile"."computedAt"`,
    )
    .run(profile);
}

/** Compare positive final scores atomically; retries and older jobs cannot lower a best. */
export function saveT2PlayerBestMaps(
  database: Database.Database,
  entries: readonly T2PlayerBestMapUpdate[],
): void {
  if (!entries.length) return;
  const save = database.prepare(
    `INSERT INTO "t2PlayerBestMap" ("guid", "mission", "score") VALUES (?, ?, ?)
      ON CONFLICT ("guid") DO UPDATE SET
        "mission" = excluded."mission", "score" = excluded."score"
      WHERE excluded."score" > "t2PlayerBestMap"."score"`,
  );
  database
    .transaction(() => {
      for (const entry of entries) {
        const guid = requireT2Guid(entry.guid);
        const mission = entry.mission.trim();
        if (!mission || !Number.isFinite(entry.score))
          throw new Error("A best map requires a mission and finite score");
        if (entry.score <= 0) continue;
        save.run(guid, mission, entry.score);
      }
    })
    .immediate();
}

/**
 * Reads the public profile of a user's most recently seen linked Tribes 2
 * account, or null without one.
 */
export function t2ProfileReader(
  database: Database.Database,
): (userId: string) => T2ProfileView | null {
  const query = database.prepare(
    `SELECT p."bodyType", p."skin", p."armor", p."pack", p."weapon",
      p."loadoutSource", p."lastSeenAt",
      b."mission" AS "bestMapMission", b."score" AS "bestMapScore"
    FROM "t2AccountLink" l JOIN "t2PlayerProfile" p ON p."guid" = l."guid"
    LEFT JOIN "t2PlayerBestMap" b ON b."guid" = p."guid" AND b."score" > 0
    WHERE l."userId" = ?
    ORDER BY p."lastSeenAt" IS NULL, p."lastSeenAt" DESC, p."guid"
    LIMIT 1`,
  );
  return (userId) => {
    const row = query.get(userId) as
      | (Omit<T2ProfileView, "lastSeenAt" | "bestMap"> & {
          lastSeenAt: number | null;
          bestMapMission: string | null;
          bestMapScore: number | null;
        })
      | undefined;
    if (!row) return null;
    const { bestMapMission, bestMapScore, ...profile } = row;
    return {
      ...profile,
      lastSeenAt:
        row.lastSeenAt == null ? null : new Date(row.lastSeenAt).toISOString(),
      bestMap:
        bestMapMission != null && bestMapScore != null
          ? { mission: bestMapMission, score: bestMapScore }
          : null,
    };
  };
}
