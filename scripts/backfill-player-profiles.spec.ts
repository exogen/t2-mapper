import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  migrateAccountSchema,
  openAccountDatabase,
  saveT2PlayerProfile,
} from "../relay/accountDatabase";
import type { T2PlayerProfile } from "../relay/accountTypes";
import { DEMO_GUIDS_SUFFIX } from "../relay/demoGuids";
import type { DemoMetadata } from "../relay/demoMetadata";
import {
  DEMO_STATS_VERSION,
  outfitKey,
  type PlayerDemoStats,
} from "../relay/demoPlayerStats";
import { DEMO_STATS_SUFFIX } from "../relay/demoStats";

const mocks = vi.hoisted(() => ({
  r2Client: vi.fn(),
  loadConfig: vi.fn(),
  read: vi.fn(),
  list: vi.fn(),
  send: vi.fn(),
}));
vi.mock("./lib/r2", () => ({ r2Client: mocks.r2Client }));
vi.mock("../relay/privateDemoStore", () => ({
  loadPrivateDemoStorageConfig: mocks.loadConfig,
  PrivateDemoStore: class {
    read = mocks.read;
    listDemoKeys = mocks.list;
  },
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
let directory: string;
let filename: string;
let index: DemoMetadata[];
let sidecars: Map<string, unknown>;

function record(filename: string, day: string): DemoMetadata {
  return {
    filename,
    bytes: 100,
    recordedAt: `2026-11-${day}T12:00:00.000Z`,
    server: "Test",
    address: "localhost:28000",
    games: [
      {
        mission: "Test",
        gameType: "Capture the Flag",
        startMs: 0,
        tournament: false,
      },
    ],
    mod: "base",
    recorder: "test",
    durationMs: 1000,
    players: [],
  };
}

function stats(overrides: Partial<PlayerDemoStats> = {}): PlayerDemoStats {
  return {
    skins: [],
    killsByWeapon: {},
    weaponsHeldSec: {},
    wornSec: {},
    invLoadouts: {},
    deployInvLoadouts: {},
    ...overrides,
  };
}

function profile(guid: string): T2PlayerProfile {
  return {
    guid,
    bodyType: "male",
    skin: "Existing skin",
    armor: "Heavy",
    pack: null,
    weapon: "weapon_mortar",
    loadoutSource: "worn",
    suitUps: 1,
    demoCount: 1,
    lastSeenAt: 1,
    computedAt: 2,
  };
}

function readProfiles(): T2PlayerProfile[] {
  const database = new Database(filename, { readonly: true });
  try {
    return database
      .prepare('SELECT * FROM "t2PlayerProfile" ORDER BY "guid"')
      .all() as T2PlayerProfile[];
  } finally {
    database.close();
  }
}

function saveExisting(guid: string): void {
  const database = openAccountDatabase(filename);
  try {
    saveT2PlayerProfile(database, profile(guid));
  } finally {
    database.close();
  }
}

function summary() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);
}

function statsReads(): string[] {
  return mocks.read.mock.calls
    .filter(([, suffix]) => suffix === DEMO_STATS_SUFFIX)
    .map(([key]) => key);
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "profile-backfill-test-"));
  filename = path.join(directory, "accounts.sqlite");
  const database = openAccountDatabase(filename);
  database.exec('CREATE TABLE "user" ("id" TEXT PRIMARY KEY)');
  database.transaction(() => migrateAccountSchema(database))();
  database.close();
  vi.stubEnv("AUTH_DATABASE_PATH", filename);
  process.argv = ["node", "backfill-player-profiles.ts"];
  process.exitCode = undefined;
  index = [record("a.rec", "03"), record("b.rec", "02")];
  sidecars = new Map<string, unknown>([
    [
      `a.rec${DEMO_GUIDS_SUFFIX}`,
      { namesByGuid: { "101": ["Player", "Old Name"], "202": ["Watcher"] } },
    ],
    [
      `b.rec${DEMO_GUIDS_SUFFIX}`,
      { namesByGuid: { "101": ["Player"], "303": [] } },
    ],
    [`orphan.rec${DEMO_GUIDS_SUFFIX}`, { namesByGuid: { "404": ["Gone"] } }],
    [
      `a.rec${DEMO_STATS_SUFFIX}`,
      {
        version: DEMO_STATS_VERSION,
        statsByGuid: {
          "101": stats({
            skins: [{ raceGender: "Human Female", skin: "Recent skin" }],
            wornSec: {
              [outfitKey({ armor: "Light", pack: "pack_upgrade_energy" })]: 30,
            },
            weaponsHeldSec: { weapon_disc: 20 },
          }),
          "202": stats({ skins: [{ raceGender: null, skin: "Spectator" }] }),
        },
      },
    ],
    [
      `b.rec${DEMO_STATS_SUFFIX}`,
      {
        version: DEMO_STATS_VERSION,
        statsByGuid: {
          "101": stats({
            skins: [{ raceGender: "Bioderm", skin: "Older skin" }],
          }),
          "303": stats(),
        },
      },
    ],
  ]);
  mocks.r2Client.mockReturnValue({
    client: { send: mocks.send },
    config: { bucket: "public", prefix: "demos/" },
  });
  mocks.loadConfig.mockReturnValue({ bucket: "private", prefix: "demos/" });
  mocks.list.mockResolvedValue(["a.rec", "b.rec", "orphan.rec"]);
  mocks.send.mockImplementation(async () => ({
    Body: { transformToString: async () => JSON.stringify(index) },
  }));
  mocks.read.mockImplementation(async (key: string, suffix: string) => {
    const value = sidecars.get(`${key}${suffix}`);
    if (value instanceof Error) throw value;
    return value ?? null;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  fs.rmSync(directory, { recursive: true, force: true });
});

it("stores every known GUID with stats, including unnamed and unlinked players, reading each sidecar once", async () => {
  await import("./backfill-player-profiles");
  const profiles = readProfiles();
  expect(profiles.map(({ guid }) => guid)).toEqual(["101", "202", "303"]);
  expect(profiles[0]).toMatchObject({
    bodyType: "female",
    skin: "Recent skin",
    armor: "Light",
    pack: "pack_upgrade_energy",
    weapon: "weapon_disc",
    demoCount: 2,
    lastSeenAt: Date.parse(index[0].recordedAt),
  });
  expect(profiles[1]).toMatchObject({
    skin: "Spectator",
    bodyType: null,
    armor: null,
  });
  expect(profiles[2]).toMatchObject({ demoCount: 1, skin: null });
  expect(statsReads().sort()).toEqual(["a.rec", "b.rec"]);
  expect(mocks.read.mock.calls).toHaveLength(5);
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith(DEMO_GUIDS_SUFFIX);
  expect(summary()).toMatchObject({
    guids: 4,
    stored: 3,
    planned: 0,
    skipped: 1,
    failed: 0,
    statsRead: 2,
    missingStats: 0,
  });
  expect(process.exitCode).toBeUndefined();
});

it("keeps prior profiles when current selected stats are absent or outdated", async () => {
  saveExisting("101");
  saveExisting("202");
  sidecars.delete(`a.rec${DEMO_STATS_SUFFIX}`);
  sidecars.set(`b.rec${DEMO_STATS_SUFFIX}`, {
    version: DEMO_STATS_VERSION - 1,
    statsByGuid: { "101": stats() },
  });
  await import("./backfill-player-profiles");
  expect(readProfiles()).toEqual([profile("101"), profile("202")]);
  expect(summary()).toMatchObject({
    stored: 0,
    skipped: 4,
    failed: 0,
    missingStats: 2,
  });
  expect(process.exitCode).toBeUndefined();
});

it("uses available current stats without replacing missing selected demos with older ones", async () => {
  process.argv.push("--demos=1");
  sidecars.delete(`a.rec${DEMO_STATS_SUFFIX}`);
  await import("./backfill-player-profiles");
  expect(readProfiles().map(({ guid }) => guid)).toEqual(["303"]);
  expect(statsReads().sort()).toEqual(["a.rec", "b.rec"]);
  expect(summary()).toMatchObject({
    stored: 1,
    skipped: 3,
    failed: 0,
    missingStats: 1,
  });
});

it("preserves affected GUIDs after a stats request failure and still stores independent profiles", async () => {
  saveExisting("101");
  saveExisting("202");
  sidecars.set(`a.rec${DEMO_STATS_SUFFIX}`, new Error("R2 unavailable"));
  await import("./backfill-player-profiles");
  const profiles = readProfiles();
  expect(profiles.slice(0, 2)).toEqual([profile("101"), profile("202")]);
  expect(profiles[2]).toMatchObject({ guid: "303", demoCount: 1 });
  expect(summary()).toMatchObject({ stored: 1, skipped: 1, failed: 2 });
  expect(process.exitCode).toBe(1);
});

it("preserves selected demo order when equal-date stats finish in reverse order", async () => {
  index[1].recordedAt = index[0].recordedAt;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const completed: string[] = [];
  const read = mocks.read.getMockImplementation()!;
  mocks.read.mockImplementation(async (key: string, suffix: string) => {
    if (key === "a.rec" && suffix === DEMO_STATS_SUFFIX) await gate;
    const value = await read(key, suffix);
    if (suffix === DEMO_STATS_SUFFIX) completed.push(key);
    return value;
  });
  const run = import("./backfill-player-profiles");
  try {
    await vi.waitFor(() => expect(completed).toEqual(["b.rec"]));
  } finally {
    release();
    await run;
  }
  expect(completed).toEqual(["b.rec", "a.rec"]);
  expect(readProfiles()[0]).toMatchObject({
    guid: "101",
    bodyType: "female",
    skin: "Recent skin",
    demoCount: 2,
  });
});

it("aborts without storing when GUID collection is incomplete", async () => {
  saveExisting("101");
  sidecars.set(`b.rec${DEMO_GUIDS_SUFFIX}`, new Error("GUID read failed"));
  await import("./backfill-player-profiles");
  expect(readProfiles()).toEqual([profile("101")]);
  expect(statsReads()).toEqual([]);
  expect(process.exitCode).toBe(1);
  expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toMatch(
    /GUID|sidecar/i,
  );
});

it("computes a dry run without opening or creating the configured database", async () => {
  filename = path.join(directory, "does-not-exist.sqlite");
  vi.stubEnv("AUTH_DATABASE_PATH", filename);
  process.argv.push("--dry-run");
  await import("./backfill-player-profiles");
  expect(fs.existsSync(filename)).toBe(false);
  expect(summary()).toMatchObject({
    stored: 0,
    planned: 3,
    skipped: 1,
    failed: 0,
  });
  expect(process.exitCode).toBeUndefined();
});

it("limits concurrent stats reads and fetches shared selected demos only once", async () => {
  process.argv.push("--concurrency=2");
  index = ["01", "02", "03", "04"].map((day) => record(`${day}.rec`, day));
  mocks.list.mockResolvedValue(index.map(({ filename }) => filename));
  for (const [i, record] of index.entries()) {
    sidecars.set(`${record.filename}${DEMO_GUIDS_SUFFIX}`, {
      namesByGuid: { [String(100 + i)]: ["Player"] },
    });
    sidecars.set(`${record.filename}${DEMO_STATS_SUFFIX}`, {
      version: DEMO_STATS_VERSION,
      statsByGuid: { [String(100 + i)]: stats() },
    });
  }
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const read = mocks.read.getMockImplementation()!;
  mocks.read.mockImplementation(async (key: string, suffix: string) => {
    if (suffix === DEMO_STATS_SUFFIX) await gate;
    return read(key, suffix);
  });
  const run = import("./backfill-player-profiles");
  try {
    await vi.waitFor(() => expect(statsReads()).toHaveLength(2));
  } finally {
    release();
    await run;
  }
  expect(statsReads().sort()).toEqual(
    index.map(({ filename }) => filename).sort(),
  );
  expect(summary()).toMatchObject({ stored: 4, statsRead: 4, failed: 0 });
});

it.each(["--concurrency=0", "--demos=NaN", "--suit-ups=-1"])(
  "rejects %s before reading R2 or opening a missing database",
  async (flag) => {
    filename = path.join(directory, "does-not-exist.sqlite");
    vi.stubEnv("AUTH_DATABASE_PATH", filename);
    process.argv.push(flag);
    await import("./backfill-player-profiles");
    expect(mocks.r2Client).not.toHaveBeenCalled();
    expect(fs.existsSync(filename)).toBe(false);
    expect(process.exitCode).toBe(1);
  },
);

it("shows help without requiring a database or R2 configuration", async () => {
  vi.stubEnv("AUTH_DATABASE_PATH", path.join(directory, "missing.sqlite"));
  process.argv.push("--help");
  await import("./backfill-player-profiles");
  expect(mocks.r2Client).not.toHaveBeenCalled();
  expect(process.exitCode).toBeUndefined();
  expect(vi.mocked(console.log).mock.calls.flat().join(" ")).toContain(
    "demos:backfill-profiles",
  );
});

it("refuses to create a missing account database", async () => {
  filename = path.join(directory, "missing.sqlite");
  vi.stubEnv("AUTH_DATABASE_PATH", filename);
  await import("./backfill-player-profiles");
  expect(fs.existsSync(filename)).toBe(false);
  expect(mocks.r2Client).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});

it("rejects an unmigrated database and closes it before returning", async () => {
  filename = path.join(directory, "unmigrated.sqlite");
  const database = openAccountDatabase(filename);
  database.exec('CREATE TABLE "user" ("id" TEXT PRIMARY KEY)');
  database.close();
  vi.stubEnv("AUTH_DATABASE_PATH", filename);
  await import("./backfill-player-profiles");
  expect(mocks.r2Client).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
  expect(fs.existsSync(`${filename}-wal`)).toBe(false);
  expect(vi.mocked(console.error).mock.calls.flat().join(" ")).toMatch(
    /migrat/i,
  );
});
