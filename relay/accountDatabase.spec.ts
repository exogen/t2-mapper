import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import type { AccountRole, T2PlayerProfile } from "./accountTypes.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  createAccountDatabaseBackup,
  hasPendingAccountSchemaMigrations,
  linkT2Account,
  migrateAccountSchema,
  openAccountDatabase,
  saveT2PlayerProfile,
  setAccountRole,
  unlinkT2Account,
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

it("keeps a newer profile when an older snapshot finishes later on another connection", () => {
  const { filename, database } = setup();
  database.transaction(() => migrateAccountSchema(database))();
  const slowWriter = openAccountDatabase(filename);
  databases.push(slowWriter);
  const profile: T2PlayerProfile = {
    guid: "12345",
    bodyType: "female",
    skin: "Newest skin",
    armor: "Light",
    pack: null,
    weapon: "weapon_disc",
    loadoutSource: "worn",
    suitUps: 0,
    demoCount: 2,
    lastSeenAt: 200,
    computedAt: 200,
  };
  saveT2PlayerProfile(database, profile);
  saveT2PlayerProfile(slowWriter, {
    ...profile,
    skin: "Old backfill",
    demoCount: 1,
    lastSeenAt: 100,
    computedAt: 100,
  });
  const read = () => database.prepare('SELECT * FROM "t2PlayerProfile"').get();
  expect(read()).toEqual(profile);
  const refreshed = { ...profile, skin: "Fresh update", computedAt: 300 };
  saveT2PlayerProfile(slowWriter, refreshed);
  expect(read()).toEqual(refreshed);
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

describe("Tribes 2 accounts", () => {
  const DISCORD_ID = "126767979894407168";
  const OTHER_ID = "234567890123456789";

  function fixture() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "account-t2-"));
    directories.push(directory);
    const filename = path.join(directory, "app.sqlite");
    const database = openAccountDatabase(filename);
    databases.push(database);
    // Linking only uses these columns from Better Auth's user/account tables.
    database.exec(`
      CREATE TABLE "user" (id TEXT PRIMARY KEY);
      CREATE TABLE "account" (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL REFERENCES "user"(id),
        providerId TEXT NOT NULL,
        accountId TEXT NOT NULL
      );
      INSERT INTO "user" VALUES ('alice'), ('bob');
    `);
    const link = database.prepare('INSERT INTO "account" VALUES (?, ?, ?, ?)');
    link.run("alice-discord", "alice", "discord", DISCORD_ID);
    link.run("bob-discord", "bob", "discord", OTHER_ID);
    database.transaction(() => migrateAccountSchema(database))();
    return { directory, filename, database };
  }

  const guids = (database: Database.Database, userId: string) =>
    database
      .prepare(
        'SELECT guid FROM "t2AccountLink" WHERE userId = ? ORDER BY guid',
      )
      .pluck()
      .all(userId);

  it("migrates once, only inside a transaction", () => {
    const { database } = fixture();
    expect(hasPendingAccountSchemaMigrations(database)).toBe(false);
    const version = database.pragma("user_version", { simple: true });
    expect(version).toBeGreaterThan(0);
    database.transaction(() => migrateAccountSchema(database))();
    expect(database.pragma("user_version", { simple: true })).toBe(version);
    database.pragma("user_version = 0");
    expect(hasPendingAccountSchemaMigrations(database)).toBe(true);
    expect(() => migrateAccountSchema(database)).toThrow(/transaction/);
  });

  it("links GUIDs and Discord identities many-to-many", () => {
    const { database } = fixture();
    linkT2Account(database, DISCORD_ID, "0012345", "Smurfy");
    const result = linkT2Account(database, DISCORD_ID, "67890");
    expect(result.discordId).toBe(DISCORD_ID);
    expect(result.accounts.map(({ guid, name }) => ({ guid, name }))).toEqual([
      { guid: "12345", name: "Smurfy" },
      { guid: "67890", name: null },
    ]);
    const shared = linkT2Account(database, OTHER_ID, "12345");
    expect(shared.accounts.map(({ guid, name }) => ({ guid, name }))).toEqual([
      { guid: "12345", name: "Smurfy" },
    ]);
    expect(guids(database, "alice")).toEqual(["12345", "67890"]);
    expect(guids(database, "bob")).toEqual(["12345"]);
  });

  it("relinks idempotently, replacing the label only when one is given", () => {
    const { database } = fixture();
    const first = linkT2Account(database, DISCORD_ID, "12345", "Smurfy");
    const again = linkT2Account(database, DISCORD_ID, "12345");
    expect(again.accounts).toEqual(first.accounts);
    expect(
      linkT2Account(database, OTHER_ID, "12345", "Renamed").accounts[0].name,
    ).toBe("Renamed");
    expect(linkT2Account(database, DISCORD_ID, "12345").accounts[0].name).toBe(
      "Renamed",
    );
  });

  it("unlinks one identity without disturbing the account's other links", () => {
    const { database } = fixture();
    linkT2Account(database, DISCORD_ID, "12345", "Smurfy");
    linkT2Account(database, OTHER_ID, "12345");
    expect(unlinkT2Account(database, DISCORD_ID, "012345")).toBe(true);
    expect(unlinkT2Account(database, DISCORD_ID, "12345")).toBe(false);
    expect(guids(database, "alice")).toEqual([]);
    expect(guids(database, "bob")).toEqual(["12345"]);
    expect(unlinkT2Account(database, OTHER_ID, "12345")).toBe(true);
    expect(
      database.prepare('SELECT guid, name FROM "t2Account"').all(),
    ).toEqual([{ guid: "12345", name: "Smurfy" }]);
  });

  it("rejects GUIDs that cannot identify a player and unknown identities", () => {
    const { database } = fixture();
    for (const guid of ["0", "000", "", "12a", "-5"]) {
      expect(() => linkT2Account(database, DISCORD_ID, guid)).toThrow(/--guid/);
    }
    expect(() => linkT2Account(database, "alice", "12345")).toThrow(/numeric/);
    expect(() =>
      linkT2Account(database, "456789012345678901", "12345"),
    ).toThrow(/Sign in with Discord once/);
    expect(() =>
      unlinkT2Account(database, "456789012345678901", "12345"),
    ).toThrow(/Sign in with Discord once/);
    expect(
      database.prepare('SELECT COUNT(*) FROM "t2Account"').pluck().get(),
    ).toBe(0);
    const account = database.prepare(
      'INSERT INTO "t2Account" (guid, createdAt) VALUES (?, ?)',
    );
    for (const guid of ["0", "012345", "12a"]) {
      expect(() => account.run(guid, 1)).toThrow(/CHECK/);
    }
    account.run("12345", 1);
    const link = database.prepare(
      'INSERT INTO "t2AccountLink" (userId, guid, createdAt) VALUES (?, ?, ?)',
    );
    expect(() => link.run("nobody", "12345", 1)).toThrow(/FOREIGN KEY/);
    expect(() => link.run("alice", "67890", 1)).toThrow(/FOREIGN KEY/);
  });

  it("drops only a deleted identity's links", () => {
    const { database } = fixture();
    linkT2Account(database, DISCORD_ID, "12345");
    linkT2Account(database, OTHER_ID, "12345");
    database.exec(
      `DELETE FROM "account" WHERE userId = 'alice'; DELETE FROM "user" WHERE id = 'alice';`,
    );
    expect(
      database.prepare('SELECT userId FROM "t2AccountLink"').pluck().all(),
    ).toEqual(["bob"]);
  });

  it("runs the operator command to link and unlink", () => {
    const { filename, database } = fixture();
    const run = (...args: string[]) =>
      spawnSync(
        process.execPath,
        ["--import=tsx/esm", "scripts/link-t2-account.ts", ...args],
        {
          cwd: path.resolve(import.meta.dirname, ".."),
          env: { ...process.env, AUTH_DATABASE_PATH: filename },
          encoding: "utf8",
        },
      );
    const linked = run(
      "--discord-id",
      DISCORD_ID,
      "--guid",
      "12345",
      "--name",
      "Smurfy",
    );
    expect(linked.status, linked.stderr).toBe(0);
    expect(linked.stdout).toContain("Smurfy");
    const shared = run("--discord-id", OTHER_ID, "--guid", "12345");
    expect(shared.status, shared.stderr).toBe(0);
    expect(guids(database, "alice")).toEqual(["12345"]);
    expect(guids(database, "bob")).toEqual(["12345"]);
    const missingIdentity = run("--unlink", "--guid", "12345");
    expect(missingIdentity.status).toBe(1);
    expect(missingIdentity.stdout).toContain("Usage");
    const unlinked = run(
      "--unlink",
      "--discord-id",
      DISCORD_ID,
      "--guid",
      "12345",
    );
    expect(unlinked.status, unlinked.stderr).toBe(0);
    expect(unlinked.stdout).toContain("Unlinked");
    expect(guids(database, "alice")).toEqual([]);
    expect(guids(database, "bob")).toEqual(["12345"]);
  });
});
