import Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  linkT2Account,
  migrateAccountSchema,
  saveT2PlayerBestMaps,
  saveT2PlayerProfile,
} from "../../relay/accountDatabase";
import type { T2PlayerProfile } from "../../relay/accountTypes";
import type { DemoMetadata } from "../../relay/demoMetadata";
import {
  DEMO_STATS_VERSION,
  outfitKey,
  type DemoStatsSidecar,
  type PlayerDemoStats,
} from "../../relay/demoPlayerStatsModel";
import { DEMO_STATS_SUFFIX } from "../../relay/demoStats";
import { DEMO_GUIDS_SUFFIX } from "../../relay/demoGuids";
import { createPlayerDemosReader } from "../../relay/playerDemos";
import { prepareDemoDeletionProfiles } from "./demoDeletionProfiles";

let database: Database.Database;

beforeEach(() => {
  database = new Database(":memory:");
  database.exec(`
    CREATE TABLE "user" (id TEXT PRIMARY KEY);
    CREATE TABLE "account" (userId TEXT, providerId TEXT, accountId TEXT);
  `);
  database.transaction(() => migrateAccountSchema(database))();
});
afterEach(() => database.close());

function profile(guid: string): T2PlayerProfile {
  return {
    guid,
    bodyType: "male",
    skin: "Old",
    armor: "Heavy",
    pack: null,
    weapon: "weapon_mortar",
    loadoutSource: "worn",
    suitUps: 0,
    demoCount: 2,
    lastSeenAt: 1,
    computedAt: 100,
  };
}

function record(filename: string): DemoMetadata {
  return {
    filename,
    bytes: 1,
    recordedAt: "2026-11-17T12:00:00Z",
    server: "Test",
    address: "127.0.0.1:28000",
    games: [
      {
        mission: "Katabatic",
        gameType: "Capture the Flag",
        startMs: 0,
        tournament: false,
      },
    ],
    mod: "base",
    recorder: "MapGenius",
    durationMs: 1000,
    players: [],
  };
}

function player(score: number, skin = "Remaining"): PlayerDemoStats {
  return {
    skins: [{ raceGender: "Human Female", skin }],
    killsByWeapon: {},
    weaponsHeldSec: { weapon_disc: 10 },
    wornSec: { [outfitKey({ armor: "Light", pack: null })]: 10 },
    invLoadouts: {},
    deployInvLoadouts: {},
    mapScores: [{ mission: "Katabatic", score }],
  };
}

function sidecar(
  statsByGuid: DemoStatsSidecar["statsByGuid"],
): DemoStatsSidecar {
  return { version: DEMO_STATS_VERSION, statsByGuid };
}

function statsStore(
  read: (filename: string, suffix: string) => Promise<unknown>,
) {
  return {
    read: (filename: string, suffix: string) =>
      suffix === DEMO_STATS_SUFFIX
        ? read(filename, suffix)
        : Promise.resolve(null),
  };
}

function snapshots() {
  return {
    profiles: database
      .prepare('SELECT * FROM "t2PlayerProfile" ORDER BY "guid"')
      .all(),
    bestMaps: database
      .prepare('SELECT * FROM "t2PlayerBestMap" ORDER BY "guid"')
      .all(),
    links: database
      .prepare('SELECT * FROM "t2AccountLink" ORDER BY "guid"')
      .all(),
  };
}

it("prepares without writes, then lowers affected best scores and rebuilds appearances atomically", async () => {
  saveT2PlayerProfile(database, profile("101"));
  saveT2PlayerProfile(database, profile("999"));
  saveT2PlayerBestMaps(database, [
    { guid: "101", mission: "Deleted map", score: 100 },
    { guid: "999", mission: "Unrelated", score: 40 },
  ]);
  const before = snapshots();
  const read = vi.fn(async () =>
    sidecar({ "101": player(20), "999": player(1000) }),
  );
  const prepared = await prepareDemoDeletionProfiles({
    database,
    store: statsStore(read),
    index: [record("remaining.rec")],
    guids: ["101", "101"],
    computedAt: 200,
  });
  expect(snapshots()).toEqual(before);
  expect(prepared).toMatchObject({
    guids: 1,
    profiles: 1,
    bestMaps: 1,
    statsRead: 1,
  });
  expect(read).toHaveBeenCalledExactlyOnceWith(
    "remaining.rec",
    DEMO_STATS_SUFFIX,
  );
  prepared.commit();
  const after = snapshots();
  expect(after.profiles[0]).toMatchObject({
    guid: "101",
    bodyType: "female",
    skin: "Remaining",
    armor: "Light",
    weapon: "weapon_disc",
    demoCount: 1,
    computedAt: 200,
  });
  expect(after.bestMaps[0]).toEqual({
    guid: "101",
    mission: "Katabatic",
    score: 20,
  });
  expect(after.profiles[1]).toEqual(before.profiles[1]);
  expect(after.bestMaps[1]).toEqual(before.bestMaps[1]);
});

it("removes derived data when no surviving observations remain, preserving account links", async () => {
  saveT2PlayerProfile(database, profile("101"));
  saveT2PlayerBestMaps(database, [
    { guid: "101", mission: "Deleted map", score: 100 },
  ]);
  linkT2Account(database, "126767979894407168", "101", "Known player");
  const before = snapshots();
  const read = vi.fn();
  const prepared = await prepareDemoDeletionProfiles({
    database,
    store: statsStore(read),
    index: [],
    guids: ["101"],
    computedAt: 200,
  });
  expect(snapshots()).toEqual(before);
  prepared.commit();
  expect(snapshots()).toEqual({
    profiles: [],
    bestMaps: [],
    links: before.links,
  });
  expect(
    database
      .prepare('SELECT "name" FROM "t2Account" WHERE "guid" = ?')
      .pluck()
      .get("101"),
  ).toBe("Known player");
  expect(read).not.toHaveBeenCalled();
});

it("uses uploaded demos for appearance while excluding their scores from best maps", async () => {
  saveT2PlayerProfile(database, profile("101"));
  saveT2PlayerBestMaps(database, [
    { guid: "101", mission: "Deleted map", score: 100 },
  ]);
  const prepared = await prepareDemoDeletionProfiles({
    database,
    store: statsStore(async () =>
      sidecar({ "101": player(1000, "Upload skin") }),
    ),
    index: [record("users/126767979894407168/upload.rec")],
    guids: ["101"],
    computedAt: 200,
  });
  prepared.commit();
  expect(snapshots().profiles[0]).toMatchObject({ skin: "Upload skin" });
  expect(snapshots().bestMaps).toEqual([]);
});

it.each([0, -5])(
  "removes the old best map when remaining scores are not positive: %s",
  async (score) => {
    saveT2PlayerBestMaps(database, [
      { guid: "101", mission: "Deleted map", score: 100 },
    ]);
    const prepared = await prepareDemoDeletionProfiles({
      database,
      store: statsStore(async () => sidecar({ "101": player(score) })),
      index: [record("remaining.rec")],
      guids: ["101"],
    });
    prepared.commit();
    expect(snapshots().bestMaps).toEqual([]);
  },
);

it.each(["missing", "old", "mismatched", "unreadable", "malformed-player"])(
  "preserves all existing data if surviving stats are %s",
  async (kind) => {
    saveT2PlayerProfile(database, profile("101"));
    saveT2PlayerBestMaps(database, [
      { guid: "101", mission: "Deleted map", score: 100 },
    ]);
    const before = snapshots();
    const read = async () => {
      if (kind === "unreadable") throw new Error("Storage unavailable");
      if (kind === "missing") return null;
      if (kind === "old")
        return { ...sidecar({ "101": player(1) }), version: 0 };
      if (kind === "mismatched")
        return { ...sidecar({ "101": player(1) }), sourceETag: '"old"' };
      return sidecar({
        "101": { ...player(1), skins: null } as unknown as PlayerDemoStats,
      });
    };
    await expect(
      prepareDemoDeletionProfiles({
        database,
        store: statsStore(read),
        index: [record("remaining.rec")],
        guids: ["101"],
        sourceETags: new Map([["remaining.rec", '"current"']]),
        computedAt: 200,
      }),
    ).rejects.toThrow();
    expect(snapshots()).toEqual(before);
  },
);

it("rolls back every affected row if a profile write fails", async () => {
  for (const guid of ["101", "202"])
    saveT2PlayerProfile(database, profile(guid));
  saveT2PlayerBestMaps(database, [
    { guid: "101", mission: "Deleted map", score: 100 },
  ]);
  const prepared = await prepareDemoDeletionProfiles({
    database,
    store: statsStore(async () =>
      sidecar({ "101": player(10), "202": player(20) }),
    ),
    index: [record("remaining.rec")],
    guids: ["101", "202"],
    computedAt: 200,
  });
  database.exec(
    `CREATE TRIGGER reject_profile BEFORE INSERT ON "t2PlayerProfile" WHEN NEW.guid = '202' BEGIN SELECT RAISE(ABORT, 'test failure'); END;`,
  );
  const before = snapshots();
  expect(() => prepared.commit()).toThrow("test failure");
  expect(snapshots()).toEqual(before);
});

it("does not overwrite a newer concurrent profile or partially clear other players", async () => {
  for (const guid of ["101", "202"])
    saveT2PlayerProfile(database, profile(guid));
  const prepared = await prepareDemoDeletionProfiles({
    database,
    store: statsStore(vi.fn()),
    index: [],
    guids: ["101", "202"],
    computedAt: 200,
  });
  saveT2PlayerProfile(database, { ...profile("202"), computedAt: 300 });
  const before = snapshots();
  expect(() => prepared.commit()).toThrow(
    "Player profiles changed during cleanup",
  );
  expect(snapshots()).toEqual(before);
});

it("does no remote work when no GUIDs are affected", async () => {
  const read = vi.fn();
  const prepared = await prepareDemoDeletionProfiles({
    database,
    store: statsStore(read),
    index: [record("remaining.rec")],
    guids: [],
  });
  expect(prepared).toMatchObject({
    guids: 0,
    profiles: 0,
    bestMaps: 0,
    statsRead: 0,
  });
  prepared.commit();
  expect(read).not.toHaveBeenCalled();
});

it.each(["sqlite", "sidecar"])(
  "preserves observer-only last-seen sightings from %s membership",
  async (membershipSource) => {
    const older = {
      ...record("older.rec"),
      recordedAt: "2026-11-10T12:00:00Z",
    };
    const newer = record("newer.rec");
    if (membershipSource === "sqlite") {
      const memberships = createPlayerDemosReader({ database });
      for (const { filename } of [older, newer])
        memberships.replace(filename, { namesByGuid: { "101": ["Player"] } });
    }
    const read = vi.fn(async (filename: string, suffix: string) => {
      if (suffix === DEMO_GUIDS_SUFFIX)
        return { namesByGuid: { "101": ["Player"] } };
      return sidecar(filename === "older.rec" ? { "101": player(10) } : {});
    });
    const prepared = await prepareDemoDeletionProfiles({
      database,
      store: { read },
      index: [older, newer],
      guids: ["101"],
    });
    prepared.commit();
    expect(snapshots().profiles[0]).toMatchObject({
      lastSeenAt: Date.parse(newer.recordedAt),
      demoCount: 1,
    });
    expect(
      read.mock.calls.filter(([, suffix]) => suffix === DEMO_GUIDS_SUFFIX),
    ).toHaveLength(membershipSource === "sqlite" ? 0 : 2);
  },
);

it("does not use GUID membership from a different source revision", async () => {
  saveT2PlayerProfile(database, profile("101"));
  const before = snapshots();
  await expect(
    prepareDemoDeletionProfiles({
      database,
      store: {
        read: async (_filename, suffix) =>
          suffix === DEMO_STATS_SUFFIX
            ? { ...sidecar({ "101": player(10) }), sourceETag: '"current"' }
            : { namesByGuid: { "101": ["Player"] }, sourceETag: '"old"' },
      },
      index: [record("remaining.rec")],
      guids: ["101"],
    }),
  ).rejects.toThrow("outdated GUID sidecar");
  expect(snapshots()).toEqual(before);
});
