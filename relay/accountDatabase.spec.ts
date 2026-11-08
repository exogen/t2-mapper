import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import type { AccountRole } from "./accountTypes.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAccountDatabaseBackup,
  openAccountDatabase,
  setAccountRole,
} from "./accountDatabase.js";

const directories: string[] = [];
const databases: Database.Database[] = [];

function setup() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "account-database-test-"),
  );
  directories.push(directory);
  const filename = path.join(directory, "private", "accounts.sqlite");
  const database = openAccountDatabase(filename);
  databases.push(database);
  database.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id));
    INSERT INTO users VALUES ('alice');
  `);
  return { directory, filename, database };
}

afterEach(() => {
  for (const database of databases.splice(0)) {
    if (database.open) database.close();
  }
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it("keeps account data private, durable, and protected by foreign keys", () => {
  const { filename, database } = setup();
  expect(fs.statSync(path.dirname(filename)).mode & 0o777).toBe(0o700);
  expect(fs.statSync(filename).mode & 0o777).toBe(0o600);
  expect(database.pragma("journal_mode", { simple: true })).toBe("wal");
  expect(database.pragma("synchronous", { simple: true })).toBe(2);
  expect(database.pragma("busy_timeout", { simple: true })).toBe(5_000);
  expect(() =>
    database
      .prepare("INSERT INTO sessions VALUES (?, ?)")
      .run("session", "missing"),
  ).toThrow(/FOREIGN KEY/);
  database
    .prepare("INSERT INTO sessions VALUES (?, ?)")
    .run("session", "alice");
  database.close();
  const reopened = openAccountDatabase(filename);
  databases.push(reopened);
  expect(reopened.prepare("SELECT userId FROM sessions").pluck().get()).toBe(
    "alice",
  );
});

it("permits reads while another connection writes and serializes competing writers", () => {
  const { filename, database } = setup();
  const other = openAccountDatabase(filename);
  databases.push(other);
  other.pragma("busy_timeout = 10");
  database.exec("BEGIN IMMEDIATE; INSERT INTO users VALUES ('bob')");
  try {
    expect(
      other.prepare("SELECT id FROM users ORDER BY id").pluck().all(),
    ).toEqual(["alice"]);
    expect(() =>
      other.prepare("INSERT INTO users VALUES ('carol')").run(),
    ).toThrow(/locked/);
  } finally {
    database.exec("COMMIT");
  }
  other.prepare("INSERT INTO users VALUES ('carol')").run();
  expect(
    database.prepare("SELECT id FROM users ORDER BY id").pluck().all(),
  ).toEqual(["alice", "bob", "carol"]);
});

it("backs up committed WAL data into a verified standalone restorable file", async () => {
  const { directory, filename, database } = setup();
  database.pragma("wal_autocheckpoint = 0");
  database.prepare("INSERT INTO sessions VALUES (?, ?)").run("in-wal", "alice");
  expect(fs.statSync(`${filename}-wal`).size).toBeGreaterThan(0);
  const backup = path.join(directory, "backup", "snapshot.sqlite");
  await createAccountDatabaseBackup(database, backup);
  database.prepare("DELETE FROM sessions").run();
  const restored = openAccountDatabase(backup);
  databases.push(restored);
  expect(restored.prepare("SELECT id FROM sessions").pluck().get()).toBe(
    "in-wal",
  );
  expect(fs.statSync(backup).mode & 0o777).toBe(0o600);
  expect(restored.pragma("integrity_check", { simple: true })).toBe("ok");
  await expect(
    createAccountDatabaseBackup(database, backup),
  ).rejects.toMatchObject({ code: "EEXIST" });
  expect(restored.prepare("SELECT id FROM sessions").pluck().get()).toBe(
    "in-wal",
  );
});

it("refuses transient memory databases and symlink targets", () => {
  expect(() => openAccountDatabase(":memory:")).toThrow(/persistent/);
  const { directory, filename } = setup();
  const link = path.join(directory, "link.sqlite");
  fs.symlinkSync(filename, link);
  expect(() => openAccountDatabase(link)).toThrow();
});

describe("account roles", () => {
  const DISCORD_ID = "126767979894407168";
  const OTHER_ID = "234567890123456789";

  function fixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "account-roles-"));
    directories.push(directory);
    const filename = path.join(directory, "app.sqlite");
    const database = openAccountDatabase(filename);
    databases.push(database);
    // The role helper only uses these columns from Better Auth's user/account tables.
    database.exec(`
      CREATE TABLE "user" (id TEXT PRIMARY KEY, role TEXT NOT NULL, updatedAt INTEGER NOT NULL);
      CREATE TABLE "account" (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES "user"(id),
        providerId TEXT NOT NULL,
        accountId TEXT NOT NULL
      );
      INSERT INTO "user" VALUES ('alice', 'user', 1), ('bob', 'user', 1);
    `);
    const link = database.prepare('INSERT INTO "account" VALUES (?, ?, ?, ?)');
    link.run("alice-discord", "alice", "discord", DISCORD_ID);
    link.run("bob-discord", "bob", "discord", OTHER_ID);
    return { directory, filename, database };
  }

  it("promotes only the linked Discord account and persists the role across reopen", () => {
    const { filename, database } = fixture();
    expect(setAccountRole(database, DISCORD_ID, "admin")).toEqual({
      id: "alice",
      discordId: DISCORD_ID,
      role: "admin",
    });
    expect(
      database
        .prepare('SELECT role, updatedAt FROM "user" WHERE id = ?')
        .get("alice"),
    ).toMatchObject({ role: "admin", updatedAt: expect.any(Number) });
    expect(
      database
        .prepare('SELECT updatedAt FROM "user" WHERE id = ?')
        .pluck()
        .get("alice"),
    ).toBeGreaterThan(1);
    expect(
      database
        .prepare('SELECT role, updatedAt FROM "user" WHERE id = ?')
        .get("bob"),
    ).toEqual({ role: "user", updatedAt: 1 });
    database.close();
    const reopened = openAccountDatabase(filename);
    databases.push(reopened);
    expect(
      reopened
        .prepare('SELECT role FROM "user" WHERE id = ?')
        .pluck()
        .get("alice"),
    ).toBe("admin");
    expect(setAccountRole(reopened, DISCORD_ID, "admin").role).toBe("admin");
    expect(setAccountRole(reopened, DISCORD_ID, "user").role).toBe("user");
  });

  it("rejects invalid input, missing identities, and identities linked only to another provider", () => {
    const { database } = fixture();
    expect(() => setAccountRole(database, "alice", "admin")).toThrow(/numeric/);
    expect(() =>
      setAccountRole(database, DISCORD_ID, "owner" as AccountRole),
    ).toThrow(/admin or user/);
    expect(() =>
      setAccountRole(database, "456789012345678901", "admin"),
    ).toThrow(/Sign in with Discord once/);
    database
      .prepare('UPDATE "account" SET providerId = ? WHERE accountId = ?')
      .run("another-provider", OTHER_ID);
    expect(() => setAccountRole(database, OTHER_ID, "admin")).toThrow(
      /not found/,
    );
    expect(
      database.prepare('SELECT DISTINCT role FROM "user"').pluck().all(),
    ).toEqual(["user"]);
  });

  it("fails closed for ambiguous Discord account linkage without changing any roles", () => {
    const { database } = fixture();
    database
      .prepare('INSERT INTO "account" VALUES (?, ?, ?, ?)')
      .run("duplicate", "bob", "discord", DISCORD_ID);
    expect(() => setAccountRole(database, DISCORD_ID, "admin")).toThrow(
      /Multiple/,
    );
    expect(database.prepare('SELECT role FROM "user"').pluck().all()).toEqual([
      "user",
      "user",
    ]);
    expect(database.inTransaction).toBe(false);
  });

  it("runs the operator command against the selected database and refuses missing database paths", () => {
    const { directory, filename, database } = fixture();
    const run = (databasePath: string) =>
      spawnSync(
        process.execPath,
        [
          "--import=tsx/esm",
          "scripts/set-account-role.ts",
          "--discord-id",
          DISCORD_ID,
          "--role",
          "admin",
        ],
        {
          cwd: path.resolve(import.meta.dirname, ".."),
          env: { ...process.env, AUTH_DATABASE_PATH: databasePath },
          encoding: "utf8",
        },
      );
    const success = run(filename);
    expect(success.status, success.stderr).toBe(0);
    expect(success.stdout).toContain(
      `Discord account ${DISCORD_ID} now has role admin`,
    );
    expect(
      database
        .prepare('SELECT role FROM "user" WHERE id = ?')
        .pluck()
        .get("alice"),
    ).toBe("admin");
    const missing = path.join(directory, "typo", "missing.sqlite");
    const failure = run(missing);
    expect(failure.status).toBe(1);
    expect(failure.stderr).toContain("Account database not found");
    expect(fs.existsSync(missing)).toBe(false);
  });
});
