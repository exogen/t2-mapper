import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { isDiscordId, type AccountRole } from "./accountTypes.js";

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
      const users = database
        .prepare(
          'SELECT u."id" FROM "user" u JOIN "account" a ON a."userId" = u."id" WHERE a."providerId" = ? AND a."accountId" = ? LIMIT 2',
        )
        .all("discord", discordId) as Array<{ id: string }>;
      if (users.length === 0) {
        throw new Error(
          "Discord account not found. Sign in with Discord once before assigning a role.",
        );
      }
      if (users.length !== 1) {
        throw new Error(
          "Multiple accounts match this Discord ID; repair the account linkage before assigning a role.",
        );
      }
      const { id } = users[0];
      database
        .prepare('UPDATE "user" SET "role" = ?, "updatedAt" = ? WHERE "id" = ?')
        .run(role, Date.now(), id);
      return { id, discordId, role };
    })
    .immediate();
}
