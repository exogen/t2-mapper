import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  migrateAccountSchema,
  openAccountDatabase,
} from "../relay/accountDatabase.js";
import { DEMO_GUIDS_SUFFIX } from "../relay/demoGuids.js";
import type { DemoMetadata } from "../relay/demoMetadata.js";
import { DEMO_STATS_VERSION } from "../relay/demoPlayerStatsModel.js";
import { DEMO_STATS_SUFFIX } from "../relay/demoStats.js";
import { createPlayerDemosReader } from "../relay/playerDemos.js";

const mocks = vi.hoisted(() => ({
  r2Client: vi.fn(),
  loadConfig: vi.fn(),
  read: vi.fn(),
  send: vi.fn(),
}));
vi.mock("./lib/r2", () => ({ r2Client: mocks.r2Client }));
vi.mock("../relay/privateDemoStore", () => ({
  loadPrivateDemoStorageConfig: mocks.loadConfig,
  PrivateDemoStore: class {
    read = mocks.read;
  },
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
let directory: string;
let filename: string;
let records: DemoMetadata[];

function record(
  filename: string,
  day: string,
  gameType = "Capture the Flag",
): DemoMetadata {
  return {
    filename,
    bytes: 100,
    recordedAt: `2026-11-${day}T12:00:00.000Z`,
    server: "Test",
    address: "localhost:28000",
    games: [{ mission: "Test", gameType, startMs: 0, tournament: false }],
    mod: "base",
    recorder: "test",
    durationMs: 1000,
    players: [],
  };
}

function seed(demoKey: string, guids: string[]) {
  const database = openAccountDatabase(filename);
  try {
    createPlayerDemosReader({ database }).replace(demoKey, {
      namesByGuid: Object.fromEntries(guids.map((guid) => [guid, []])),
    });
  } finally {
    database.close();
  }
}

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "player-loadouts-"));
  filename = path.join(directory, "accounts.sqlite");
  const database = openAccountDatabase(filename);
  database.exec(
    'CREATE TABLE "user" ("id" TEXT PRIMARY KEY); CREATE TABLE "account" ("userId" TEXT, "providerId" TEXT, "accountId" TEXT)',
  );
  database.transaction(() => migrateAccountSchema(database))();
  database.close();
  vi.stubEnv("AUTH_DATABASE_PATH", filename);
  process.exitCode = undefined;
  records = [record("a.rec", "03")];
  mocks.r2Client.mockReturnValue({
    client: { send: mocks.send },
    config: { bucket: "public", prefix: "demos/" },
  });
  mocks.loadConfig.mockReturnValue({ bucket: "private", prefix: "demos/" });
  mocks.send.mockImplementation(async () => ({
    Body: { transformToString: async () => JSON.stringify(records) },
  }));
  mocks.read.mockImplementation(async (demoKey: string, suffix: string) =>
    suffix === DEMO_GUIDS_SUFFIX
      ? { namesByGuid: { "101": [demoKey] } }
      : {
          version: DEMO_STATS_VERSION,
          statsByGuid: {
            "101": {
              skins: [{ raceGender: "Human Male", skin: "base" }],
              killsByWeapon: {},
              weaponsHeldSec: {},
              wornSec: {},
              invLoadouts: {},
              deployInvLoadouts: {},
            },
          },
        },
  );
});

afterEach(async () => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await fs.rm(directory, { recursive: true, force: true });
});

async function run(...args: string[]) {
  process.argv = [
    "node",
    "player-loadouts.ts",
    "--guid=101",
    "--json",
    ...args,
  ];
  await import("./player-loadouts.js");
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);
}

function reads(suffix: string) {
  return mocks.read.mock.calls
    .filter(([, requested]) => requested === suffix)
    .map(([demoKey]) => demoKey);
}

it("skips unrelated indexed demos and still reads selected aliases", async () => {
  records = [
    record("unrelated.rec", "05"),
    record("empty.rec", "04"),
    record("a.rec", "03"),
  ];
  seed("unrelated.rec", ["202"]);
  seed("empty.rec", []);
  seed("a.rec", ["101"]);
  const result = await run();
  expect(reads(DEMO_GUIDS_SUFFIX)).toEqual(["a.rec"]);
  expect(reads(DEMO_STATS_SUFFIX)).toEqual(["a.rec"]);
  expect(result.names).toEqual(["a.rec"]);
  expect(result.demos.selected).toBe(1);
  expect(result.profile.lastSeenAt).toBe(Date.parse(records[2].recordedAt));
});

it("falls back for uploads and unindexed demos while retaining ordering", async () => {
  const upload = "users/126767979894407168/upload.rec";
  records = [
    record("unrelated.rec", "06"),
    record(upload, "05"),
    record("unindexed.rec", "04"),
    record("a.rec", "03"),
  ];
  seed("unrelated.rec", ["202"]);
  seed("a.rec", ["101"]);
  const result = await run("--demos=3");
  expect(reads(DEMO_GUIDS_SUFFIX)).toEqual([upload, "unindexed.rec", "a.rec"]);
  expect(reads(DEMO_STATS_SUFFIX)).toEqual([upload, "unindexed.rec", "a.rec"]);
  expect(result.names).toEqual(["a.rec", "unindexed.rec", upload]);
  expect(result.demos.selected).toBe(3);
  expect(result.demos.newest).toBe(records[1].recordedAt);
});

it("uses sidecars when SQLite is missing without creating a database", async () => {
  await fs.unlink(filename);
  const result = await run();
  expect(result.names).toEqual(["a.rec"]);
  expect(reads(DEMO_GUIDS_SUFFIX)).toEqual(["a.rec"]);
  await expect(fs.stat(filename)).rejects.toMatchObject({ code: "ENOENT" });
});

it("uses sidecars without migrating an older database", async () => {
  seed("a.rec", []);
  const database = new Database(filename);
  database.pragma("user_version = 4");
  database.close();
  const result = await run();
  expect(result.names).toEqual(["a.rec"]);
  expect(reads(DEMO_GUIDS_SUFFIX)).toEqual(["a.rec"]);
  const unchanged = new Database(filename, { readonly: true });
  try {
    expect(unchanged.pragma("user_version", { simple: true })).toBe(4);
  } finally {
    unchanged.close();
  }
});

it("preserves CTF preference while finding last seen in a newer other game", async () => {
  records = [record("new.rec", "05", "Deathmatch"), record("ctf.rec", "03")];
  seed("new.rec", ["101"]);
  seed("ctf.rec", ["101"]);
  const result = await run("--demos=1");
  expect(reads(DEMO_STATS_SUFFIX)).toEqual(["ctf.rec"]);
  expect(result.names).toEqual(["ctf.rec", "new.rec"]);
  expect(result.profile.lastSeenAt).toBe(Date.parse(records[0].recordedAt));
  expect(result.demos.newest).toBe(records[1].recordedAt);
});

it.each(["index", "stats"])(
  "rejects concurrent membership changes during %s reads without storing a partial profile",
  async (phase) => {
    records = [record("new.rec", "05"), record("a.rec", "03")];
    seed("new.rec", ["202"]);
    seed("a.rec", ["101"]);
    const pragma = vi.spyOn(Database.prototype, "pragma");
    if (phase === "index") {
      mocks.send.mockImplementationOnce(async () => {
        seed("new.rec", ["101"]);
        return {
          Body: { transformToString: async () => JSON.stringify(records) },
        };
      });
    } else {
      const read = mocks.read.getMockImplementation()!;
      mocks.read.mockImplementation(async (...args) => {
        const value = await read(...args);
        if (args[1] === DEMO_STATS_SUFFIX) seed("new.rec", ["101"]);
        return value;
      });
    }
    await expect(run("--store")).rejects.toThrow(
      "Player demo membership changed during the lookup; rerun this command.",
    );
    const lookup = (pragma.mock.contexts as Database.Database[]).find(
      (database) => database.readonly,
    );
    expect(lookup).toBeDefined();
    expect(lookup!.open).toBe(false);
    const database = new Database(filename, { readonly: true });
    try {
      expect(
        database
          .prepare('SELECT count(*) FROM "t2PlayerProfile"')
          .pluck()
          .get(),
      ).toBe(0);
    } finally {
      database.close();
    }
    expect(console.log).not.toHaveBeenCalled();
  },
);

it("closes the lookup connection if a remote read fails", async () => {
  seed("a.rec", ["101"]);
  const pragma = vi.spyOn(Database.prototype, "pragma");
  mocks.send.mockRejectedValueOnce(new Error("R2 unavailable"));
  await expect(run()).rejects.toThrow("R2 unavailable");
  const lookup = (pragma.mock.contexts as Database.Database[]).find(
    (database) => database.readonly,
  );
  expect(lookup).toBeDefined();
  expect(lookup!.open).toBe(false);
});

it("stores a profile when its SQLite membership snapshot is unchanged", async () => {
  seed("a.rec", ["101"]);
  const result = await run("--store");
  const database = new Database(filename, { readonly: true });
  try {
    expect(
      database.prepare('SELECT "guid" FROM "t2PlayerProfile"').pluck().all(),
    ).toEqual(["101"]);
  } finally {
    database.close();
  }
  expect(result.profile.guid).toBe("101");
});
