import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { expect, it, vi } from "vitest";
import {
  migrateAccountSchema,
  openAccountDatabase,
  saveT2PlayerBestMaps,
  saveT2PlayerProfile,
} from "./accountDatabase";
import type { T2PlayerProfile } from "./accountTypes";
import { DEMO_GUIDS_SUFFIX } from "./demoGuids";
import type { DemoMetadata } from "./demoMetadata";
import {
  DEMO_STATS_VERSION,
  loadoutKey,
  type PlayerDemoStats,
} from "./demoPlayerStatsModel";
import { createRelayDemoProcessing } from "./demoProcessing";
import { DEMO_PROFILES_SUFFIX, DEMO_STATS_SUFFIX } from "./demoStats";
import { DemoStatsScheduler } from "./demoStatsScheduler";
import { createDemoPlayerProfileUpdater } from "./playerProfileService";
import { PrivateDemoStore } from "./privateDemoStore";

it("stores affected players' profiles after stats, then recovers a profile retry without replaying", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "demo-profile-auto-"),
  );
  const database = openAccountDatabase(path.join(directory, "accounts.sqlite"));
  const config = {
    endpoint: "https://example.r2.cloudflarestorage.com",
    bucket: "public",
    prefix: "demos/",
    accessKeyId: "key",
    secretAccessKey: "secret",
  };
  const objects = new Map<string, string>();
  const record = (filename: string, day: string): DemoMetadata => ({
    filename,
    recordedAt: `2026-11-${day}T12:00:00Z`,
    bytes: 3,
    server: "Test",
    address: "127.0.0.1:28000",
    games: [
      {
        gameType: "Capture the Flag",
        mission: "Test",
        startMs: 0,
        tournament: false,
      },
    ],
    mod: "base",
    recorder: "Observer",
    durationMs: 60_000,
    players: [],
  });
  const old = record("old.rec", "01");
  const newest = record("new.rec", "12");
  const stats = (
    skin: string,
    armor: string,
    purchases: number,
  ): PlayerDemoStats => ({
    skins: [{ raceGender: "Human Female", skin }],
    killsByWeapon: {},
    weaponsHeldSec: { weapon_disc: 10 },
    wornSec: {},
    invLoadouts: {
      [loadoutKey({ armor, pack: "pack_upgrade_energy", weapons: [] })]:
        purchases,
    },
    deployInvLoadouts: {},
  });
  const currentStats = {
    version: DEMO_STATS_VERSION,
    statsByGuid: {
      "101": stats("New skin", "Light", 10),
      "202": stats("base", "Medium", 1),
    },
  };
  currentStats.statsByGuid["101"].mapScores = [
    { mission: "Katabatic", score: 80 },
  ];
  currentStats.statsByGuid["202"].mapScores = [{ mission: "DX", score: 40 }];
  const putJSON = (bucket: string, key: string, value: unknown) =>
    objects.set(`${bucket}/demos/${key}`, JSON.stringify(value));
  objects.set("public/demos/new.rec", "rec");
  putJSON("public", "index.json", [old, newest]);
  putJSON("private", `old.rec${DEMO_GUIDS_SUFFIX}`, {
    namesByGuid: { "101": ["Player"], "303": ["Other"] },
  });
  putJSON("private", `new.rec${DEMO_GUIDS_SUFFIX}`, {
    namesByGuid: { "101": ["Player"], "202": [] },
  });
  putJSON("private", `old.rec${DEMO_STATS_SUFFIX}`, {
    version: DEMO_STATS_VERSION,
    statsByGuid: { "101": stats("Old skin", "Heavy", 2) },
  });
  const client = {
    send: vi.fn(
      async (
        command:
          | DeleteObjectCommand
          | GetObjectCommand
          | HeadObjectCommand
          | ListObjectsV2Command
          | PutObjectCommand,
      ) => {
        const { Bucket, Key } = command.input as {
          Bucket: string;
          Key: string;
        };
        if (command instanceof ListObjectsV2Command)
          return {
            Contents: [...objects.keys()]
              .filter((key) => key.startsWith(`${Bucket}/demos/`))
              .map((key) => ({
                Key: key.slice(Bucket.length + 1),
                LastModified: new Date(newest.recordedAt),
              })),
          };
        if (command instanceof PutObjectCommand) {
          objects.set(`${Bucket}/${Key}`, String(command.input.Body));
          return {};
        }
        if (command instanceof DeleteObjectCommand) {
          objects.delete(`${Bucket}/${Key}`);
          return {};
        }
        const body = objects.get(`${Bucket}/${Key}`);
        if (body === undefined)
          throw Object.assign(new Error("Missing"), { name: "NoSuchKey" });
        if (command instanceof HeadObjectCommand) return {};
        return {
          Body: Object.assign(Readable.from([body]), {
            transformToString: async () => body,
          }),
        };
      },
    ),
  } as unknown as S3Client;
  const store = new PrivateDemoStore({ ...config, bucket: "private" }, client);
  const compute = vi.fn(async () => currentStats);
  const processing = createRelayDemoProcessing();
  const saved: T2PlayerProfile[] = [];
  let failBestMapWrites = false;
  const update = createDemoPlayerProfileUpdater({
    config,
    store,
    client,
    saveBestMaps: (entries) => {
      if (failBestMapWrites) throw new Error("SQLite busy");
      saveT2PlayerBestMaps(database, entries);
    },
    saveProfile: (profile) => {
      expect(objects.has(`private/demos/new.rec${DEMO_STATS_SUFFIX}`)).toBe(
        true,
      );
      saved.push(profile);
      saveT2PlayerProfile(database, profile);
    },
  });
  const makeScheduler = () =>
    new DemoStatsScheduler({
      config,
      store,
      client,
      compute,
      refreshProfiles: (demoKey, stats, signal) =>
        processing.updateProfiles(async () => {
          await update(demoKey, stats, signal);
        }, signal),
      now: () => Date.parse(newest.recordedAt),
    });
  try {
    database.exec('CREATE TABLE "user" ("id" TEXT PRIMARY KEY)');
    database.transaction(() => migrateAccountSchema(database))();
    const scheduler = makeScheduler();
    scheduler.enqueue("new.rec");
    await scheduler.idle();
    expect(compute).toHaveBeenCalledOnce();
    expect(saved.map(({ guid }) => guid)).toEqual(["101", "202"]);
    expect(saved[0]).toMatchObject({
      skin: "New skin",
      armor: "Light",
      demoCount: 2,
      lastSeenAt: Date.parse(newest.recordedAt),
    });
    expect(
      database.prepare('SELECT COUNT(*) AS n FROM "t2PlayerProfile"').get(),
    ).toEqual({ n: 2 });
    expect(
      database.prepare('SELECT COUNT(*) AS n FROM "t2AccountLink"').get(),
    ).toEqual({ n: 0 });
    expect(
      database.prepare('SELECT * FROM "t2PlayerBestMap" ORDER BY "guid"').all(),
    ).toEqual([
      { guid: "101", mission: "Katabatic", score: 80 },
      { guid: "202", mission: "DX", score: 40 },
    ]);
    expect(objects.has(`private/demos/new.rec${DEMO_PROFILES_SUFFIX}`)).toBe(
      true,
    );

    // A missing completion marker models a restart after the stats upload but
    // before the profile task committed its durable completion record.
    objects.delete(`private/demos/new.rec${DEMO_PROFILES_SUFFIX}`);
    failBestMapWrites = true;
    const restarted = makeScheduler();
    expect(await restarted.sweep()).toBe(1);
    await restarted.idle();
    expect(objects.has(`private/demos/new.rec${DEMO_PROFILES_SUFFIX}`)).toBe(
      false,
    );
    expect(saved).toHaveLength(2);
    failBestMapWrites = false;
    restarted.enqueue("new.rec");
    await restarted.idle();
    expect(compute).toHaveBeenCalledOnce();
    expect(saved.map(({ guid }) => guid)).toEqual(["101", "202", "101", "202"]);
    expect(objects.has(`private/demos/new.rec${DEMO_PROFILES_SUFFIX}`)).toBe(
      true,
    );
  } finally {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
