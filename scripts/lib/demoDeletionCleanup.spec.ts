import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  linkT2Account,
  migrateAccountSchema,
  saveT2PlayerBestMaps,
} from "../../relay/accountDatabase";
import { createPlayerDemosReader } from "../../relay/playerDemos";
import type { DemoUploadConfig } from "../../relay/demoUpload";
import type { DemoMetadata } from "../../relay/demoMetadata";
import { DEMO_STATS_VERSION } from "../../relay/demoPlayerStatsModel";
import {
  DEMO_DELETION_SUFFIX,
  DemoDeletionCleanup,
  openDemoDeletionCleanup,
} from "./demoDeletionCleanup";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("./r2", () => ({ listAllObjects: mocks.list }));

const config: DemoUploadConfig = {
  endpoint: "https://storage.invalid",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucket: "public",
  prefix: "recordings/",
};
const privateConfig = {
  ...config,
  bucket: "private",
  prefix: "private-demos/",
};
const clipId = "12345678-1234-4123-8123-123456789abc";
const otherClipId = "12345678-1234-4123-8123-123456789def";
const metadata = { filename: "a.rec", server: "Test", durationMs: 1000 };
let database: Database.Database;
let storage: Map<string, { body: string; etag: string }>;
let failDeletes: Set<string>;
let send: ReturnType<typeof vi.fn>;
let cleanup: DemoDeletionCleanup;
const directories: string[] = [];

function setupDatabase(database: Database.Database) {
  database.exec(`
    CREATE TABLE "user" (id TEXT PRIMARY KEY);
    CREATE TABLE "account" (userId TEXT, providerId TEXT, accountId TEXT);
  `);
  database.transaction(() => migrateAccountSchema(database))();
}

function put(bucket: string, key: string, value: unknown, etag = '"source"') {
  storage.set(`${bucket}:${key}`, { body: JSON.stringify(value), etag });
}

function insertClip(id = clipId, source = "a.rec") {
  database
    .prepare(
      `
    INSERT INTO clip(id, ownerDiscordId, requestId, payloadHash, sourceDemo,
      sourceETag, sourceSha256, title, createdAt, startSec, endSec, state)
    VALUES (?, '126767979894407168', ?, 'hash', ?, 'source', 'hash', 'Clip', 1, 0, 1, 'ready')
  `,
    )
    .run(id, id, source);
  for (const suffix of [
    "timeline.json",
    "checkpoint.json",
    "future-sidecar.json",
  ])
    put(config.bucket, `${config.prefix}clips/${id}/${suffix}`, {});
}

function createCleanup() {
  return new DemoDeletionCleanup({
    database,
    config,
    privateConfig,
    client: { send } as unknown as S3Client,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  database = new Database(":memory:");
  setupDatabase(database);
  storage = new Map();
  failDeletes = new Set();
  put(config.bucket, `${config.prefix}a.rec`, "recording");
  put(privateConfig.bucket, `${privateConfig.prefix}a.rec.guids.json`, {
    namesByGuid: { "200": ["Sidecar player"] },
  });
  put(privateConfig.bucket, `${privateConfig.prefix}a.rec.stats.json`, {
    statsByGuid: { "300": {} },
  });
  put(privateConfig.bucket, `${privateConfig.prefix}a.rec.profiles.json`, {
    version: 1,
  });
  createPlayerDemosReader({ database }).replace("a.rec", {
    namesByGuid: { "100": ["SQLite player"] },
  });
  mocks.list.mockImplementation(
    async (_client, options, prefix = options.prefix) =>
      [...storage.keys()]
        .filter((key) => key.startsWith(`${options.bucket}:${prefix}`))
        .map((key) => ({ key: key.slice(options.bucket.length + 1), size: 1 })),
  );
  send = vi.fn(async (command) => {
    const { Bucket, Key } = command.input;
    if (
      command instanceof HeadObjectCommand ||
      command instanceof GetObjectCommand
    ) {
      const value = storage.get(`${Bucket}:${Key}`);
      if (!value)
        throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
      return {
        ETag: value.etag,
        Body: { transformToString: async () => value.body },
      };
    }
    if (command instanceof PutObjectCommand) {
      storage.set(`${Bucket}:${Key}`, {
        body: command.input.Body as string,
        etag: '"saved"',
      });
      return {};
    }
    if (command instanceof DeleteObjectsCommand) {
      const Errors: { Key: string; Code: string }[] = [];
      for (const { Key } of command.input.Delete!.Objects!) {
        if (failDeletes.has(`${Bucket}:${Key}`))
          Errors.push({ Key: Key!, Code: "AccessDenied" });
        else storage.delete(`${Bucket}:${Key}`);
      }
      return { Errors };
    }
    if (command instanceof DeleteObjectCommand) {
      if (failDeletes.has(`${Bucket}:${Key}`)) throw new Error("Delete failed");
      storage.delete(`${Bucket}:${Key}`);
      return {};
    }
    throw new Error("Unexpected storage request");
  });
  cleanup = createCleanup();
});

afterEach(async () => {
  if (database.open) database.close();
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it("previews the union of SQLite, GUID, and stats inventories without writes", async () => {
  insertClip();
  put(privateConfig.bucket, `${privateConfig.prefix}a.rec.extra.json`, {});
  put(
    privateConfig.bucket,
    `${privateConfig.prefix}a.rec.copy.rec.stats.json`,
    {},
  );
  await cleanup.pending();
  const plan = await cleanup.plan("a.rec", metadata);
  expect(new Set(plan.guids)).toEqual(new Set(["100", "200", "300"]));
  expect(plan.clipIds).toEqual([clipId]);
  expect(plan.sourceETag).toBe('"source"');
  expect(plan.privateObjects).toContain(
    `${privateConfig.prefix}a.rec.extra.json`,
  );
  expect(plan.privateObjects).not.toContain(
    `${privateConfig.prefix}a.rec.copy.rec.stats.json`,
  );
  expect(
    send.mock.calls.every(
      ([command]) =>
        command instanceof HeadObjectCommand ||
        command instanceof GetObjectCommand,
    ),
  ).toBe(true);
  expect(
    database
      .prepare("SELECT deleted FROM t2PlayerDemo WHERE filename='a.rec'")
      .pluck()
      .get(),
  ).toBe(0);
  expect(
    database.prepare("SELECT state FROM clip WHERE id=?").pluck().get(clipId),
  ).toBe("ready");
});

it("cleans both storage namespaces, tombstones memberships, and removes dependent clips while preserving links", async () => {
  insertClip();
  insertClip(otherClipId, "b.rec");
  linkT2Account(database, "126767979894407168", "100", "Linked player");
  put(privateConfig.bucket, `${privateConfig.prefix}b.rec.stats.json`, {});
  await cleanup.pending();
  const plan = await cleanup.plan("a.rec", metadata);
  await cleanup.persist(plan);
  storage.delete(`${config.bucket}:${config.prefix}a.rec`);
  await cleanup.removeDependencies(plan);
  expect(
    createPlayerDemosReader({ database }).guidsForDemo("a.rec"),
  ).toBeUndefined();
  expect(
    database
      .prepare("SELECT deleted FROM t2PlayerDemo WHERE filename='a.rec'")
      .pluck()
      .get(),
  ).toBe(1);
  expect(
    database.prepare("SELECT id FROM clip ORDER BY id").pluck().all(),
  ).toEqual([otherClipId]);
  expect(
    database.prepare("SELECT guid FROM t2AccountLink").pluck().all(),
  ).toEqual(["100"]);
  expect(
    [...storage.keys()].some((key) =>
      key.startsWith(`public:recordings/clips/${clipId}/`),
    ),
  ).toBe(false);
  expect(
    storage.has(`public:recordings/clips/${otherClipId}/timeline.json`),
  ).toBe(true);
  expect(storage.has("private:private-demos/b.rec.stats.json")).toBe(true);
  expect(
    [...storage.keys()].filter((key) =>
      key.startsWith("private:private-demos/a.rec."),
    ),
  ).toEqual([`private:private-demos/a.rec${DEMO_DELETION_SUFFIX}`]);
  await cleanup.finish(plan);
  expect(
    storage.has(`private:private-demos/a.rec${DEMO_DELETION_SUFFIX}`),
  ).toBe(false);
});

it("retains affected GUIDs and clip IDs across a restart after dependencies are gone", async () => {
  insertClip();
  await cleanup.pending();
  const plan = await cleanup.plan("a.rec", metadata);
  await cleanup.persist(plan);
  storage.delete("public:recordings/a.rec");
  await cleanup.removeDependencies(plan);
  const restarted = createCleanup();
  expect(await restarted.pending()).toEqual(new Map([["a.rec", metadata]]));
  const retried = await restarted.plan("a.rec", { wrong: true });
  expect(retried.guids).toEqual(plan.guids);
  expect(retried.clipIds).toEqual([clipId]);
  expect(retried.metadata).toEqual(metadata);
  await restarted.removeDependencies(retried);
  await restarted.finish(retried);
  expect(await createCleanup().pending()).toEqual(new Map());
});

it("resumes deletion of a legacy uppercase .REC without touching differently cased recording keys", async () => {
  const demoKey = "MATCH.REC";
  const legacyMetadata = { ...metadata, filename: demoKey };
  put(config.bucket, `${config.prefix}${demoKey}`, "legacy recording");
  put(privateConfig.bucket, `${privateConfig.prefix}${demoKey}.guids.json`, {
    namesByGuid: { "500": ["Legacy player"] },
  });
  put(privateConfig.bucket, `${privateConfig.prefix}${demoKey}.extra.json`, {});
  put(config.bucket, `${config.prefix}match.rec`, "different recording");
  put(privateConfig.bucket, `${privateConfig.prefix}match.rec.stats.json`, {});
  insertClip(clipId, demoKey);
  await cleanup.pending();
  const plan = await cleanup.plan(demoKey, legacyMetadata);
  expect(plan.privateObjects).toContain(
    `${privateConfig.prefix}${demoKey}.extra.json`,
  );
  expect(plan.privateObjects).not.toContain(
    `${privateConfig.prefix}match.rec.stats.json`,
  );
  await cleanup.persist(plan);
  storage.delete(`${config.bucket}:${config.prefix}${demoKey}`);

  const restarted = createCleanup();
  expect(await restarted.pending()).toEqual(
    new Map([[demoKey, legacyMetadata]]),
  );
  const retry = await restarted.plan(demoKey, legacyMetadata);
  expect(retry.guids).toEqual(["500"]);
  await restarted.removeDependencies(retry);
  await restarted.finish(retry);
  expect(
    [...storage.keys()].some((key) =>
      key.startsWith(`private:private-demos/${demoKey}.`),
    ),
  ).toBe(false);
  expect(
    database
      .prepare("SELECT deleted FROM t2PlayerDemo WHERE filename=?")
      .pluck()
      .get(demoKey),
  ).toBe(1);
  expect(
    database.prepare("SELECT id FROM clip WHERE id=?").get(clipId),
  ).toBeUndefined();
  expect(storage.has("public:recordings/match.rec")).toBe(true);
  expect(storage.has("private:private-demos/match.rec.stats.json")).toBe(true);
});

it.each([
  "private:private-demos/a.rec.stats.json",
  `public:recordings/clips/${clipId}/checkpoint.json`,
])("retains durable retry state when deleting %s fails", async (failedKey) => {
  insertClip();
  await cleanup.pending();
  const plan = await cleanup.plan("a.rec", metadata);
  await cleanup.persist(plan);
  storage.delete("public:recordings/a.rec");
  failDeletes.add(failedKey);
  await expect(cleanup.removeDependencies(plan)).rejects.toThrow(
    "Object deletion failed",
  );
  expect(
    storage.has(`private:private-demos/a.rec${DEMO_DELETION_SUFFIX}`),
  ).toBe(true);
  expect(
    database.prepare("SELECT state FROM clip WHERE id=?").pluck().get(clipId),
  ).toBe("deleting");
  failDeletes.clear();
  const restarted = createCleanup();
  await restarted.pending();
  const retry = await restarted.plan("a.rec", metadata);
  await restarted.removeDependencies(retry);
  await restarted.finish(retry);
  expect(database.prepare("SELECT id FROM clip").all()).toEqual([]);
  expect(storage.has(failedKey)).toBe(false);
});

it("refuses dependent cleanup while the recording still exists", async () => {
  insertClip();
  await cleanup.pending();
  const plan = await cleanup.plan("a.rec", metadata);
  await expect(cleanup.removeDependencies(plan)).rejects.toThrow(
    "Recording still exists",
  );
  expect(database.prepare("SELECT state FROM clip").pluck().get()).toBe(
    "ready",
  );
  expect(
    send.mock.calls.some(
      ([command]) => command instanceof DeleteObjectsCommand,
    ),
  ).toBe(false);
});

it("rejects a replaced recording before resuming a saved deletion journal", async () => {
  await cleanup.pending();
  const plan = await cleanup.plan("a.rec", metadata);
  await cleanup.persist(plan);
  put(config.bucket, `${config.prefix}a.rec`, "replacement", '"replacement"');
  const restarted = createCleanup();
  await restarted.pending();
  await expect(restarted.plan("a.rec", metadata)).rejects.toThrow(
    "Recording replaced",
  );
  await expect(cleanup.persist(plan)).rejects.toThrow("Recording changed");
});

it.each(["journal", "nested-recording", "external-source", "user-upload"])(
  "rejects a deletion journal that targets %s",
  async (kind) => {
    await cleanup.pending();
    const plan = await cleanup.plan("a.rec", metadata);
    if (kind === "journal")
      plan.privateObjects.push(
        `${privateConfig.prefix}a.rec${DEMO_DELETION_SUFFIX}`,
      );
    if (kind === "nested-recording")
      plan.privateObjects.push(
        `${privateConfig.prefix}a.rec.copy.rec.stats.json`,
      );
    if (kind === "external-source") plan.demoKey = "sources/external/a.rec";
    if (kind === "user-upload") plan.demoKey = "users/126767979894407168/a.rec";
    if (kind === "external-source" || kind === "user-upload")
      plan.privateObjects = [
        `${privateConfig.prefix}${plan.demoKey}.stats.json`,
      ];
    put(
      privateConfig.bucket,
      `${privateConfig.prefix}${plan.demoKey}${DEMO_DELETION_SUFFIX}`,
      plan,
    );
    await expect(createCleanup().pending()).rejects.toThrow(
      "Invalid deletion journal",
    );
    expect(
      send.mock.calls.some(
        ([command]) =>
          command instanceof DeleteObjectsCommand ||
          command instanceof PutObjectCommand,
      ),
    ).toBe(false);
  },
);

it("unions current SQLite GUIDs with the original journal on retry", async () => {
  await cleanup.pending();
  const plan = await cleanup.plan("a.rec", metadata);
  await cleanup.persist(plan);
  createPlayerDemosReader({ database }).replace(
    "a.rec",
    { namesByGuid: { "400": ["Newly indexed player"] } },
    { observedAt: Date.now() + 1 },
  );
  storage.delete("private:private-demos/a.rec.guids.json");
  storage.delete("private:private-demos/a.rec.stats.json");
  const restarted = createCleanup();
  await restarted.pending();
  const retry = await restarted.plan("a.rec", metadata);
  expect(new Set(retry.guids)).toEqual(new Set(["100", "200", "300", "400"]));
});

it.each(["listing", "head"])(
  "prepares profiles using %s source fingerprints, rejects stale stats before writes, and commits only on request",
  async (fingerprintSource) => {
    await cleanup.pending();
    const plan = await cleanup.plan("a.rec", metadata);
    const retained: DemoMetadata = {
      filename: "kept.rec",
      bytes: 1,
      recordedAt: "2026-11-17T12:00:00Z",
      server: "Test",
      address: "localhost",
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
      players: ["Player"],
    };
    put(
      config.bucket,
      `${config.prefix}kept.rec`,
      "retained recording",
      '"new-source"',
    );
    const sidecar = {
      version: DEMO_STATS_VERSION,
      sourceETag: '"old-source"',
      statsByGuid: {
        "100": {
          skins: [{ raceGender: "Human Male", skin: "beagle" }],
          killsByWeapon: {},
          weaponsHeldSec: {},
          wornSec: {},
          invLoadouts: {},
          deployInvLoadouts: {},
          mapScores: [{ mission: "Katabatic", score: 3 }],
        },
      },
    };
    put(
      privateConfig.bucket,
      `${privateConfig.prefix}kept.rec.stats.json`,
      sidecar,
    );
    saveT2PlayerBestMaps(database, [
      { guid: "100", mission: "Deleted map", score: 10 },
    ]);
    const before = database.prepare("SELECT * FROM t2PlayerBestMap").all();
    if (fingerprintSource === "listing") {
      const list = mocks.list.getMockImplementation()!;
      mocks.list.mockImplementation(async (...args) =>
        (await list(...args)).map((entry: { key: string }) => ({
          ...entry,
          etag: storage.get(`${args[1].bucket}:${entry.key}`)?.etag,
        })),
      );
    }
    send.mockClear();
    await expect(cleanup.prepareProfiles([plan], [retained])).rejects.toThrow(
      "missing or outdated stats",
    );
    expect(database.prepare("SELECT * FROM t2PlayerBestMap").all()).toEqual(
      before,
    );
    expect(database.prepare("SELECT * FROM t2PlayerProfile").all()).toEqual([]);
    expect(
      send.mock.calls.some(
        ([command]) =>
          command instanceof PutObjectCommand ||
          command instanceof DeleteObjectsCommand,
      ),
    ).toBe(false);
    expect(
      send.mock.calls.some(
        ([command]) =>
          command instanceof HeadObjectCommand &&
          command.input.Key === "recordings/kept.rec",
      ),
    ).toBe(fingerprintSource === "head");

    put(privateConfig.bucket, `${privateConfig.prefix}kept.rec.stats.json`, {
      ...sidecar,
      sourceETag: '"new-source"',
    });
    const commit = await cleanup.prepareProfiles([plan], [retained]);
    expect(database.prepare("SELECT * FROM t2PlayerBestMap").all()).toEqual(
      before,
    );
    commit();
    expect(database.prepare("SELECT * FROM t2PlayerBestMap").all()).toEqual([
      { guid: "100", mission: "Katabatic", score: 3 },
    ]);
  },
);

it("rebuilds all known derived GUIDs when an old deletion lost its player inventories", async () => {
  storage.delete("private:private-demos/a.rec.guids.json");
  storage.delete("private:private-demos/a.rec.stats.json");
  saveT2PlayerBestMaps(database, [
    { guid: "400", mission: "Katabatic", score: 10 },
  ]);
  await cleanup.pending();
  const plan = await cleanup.plan("a.rec", metadata);
  expect(new Set(plan.guids)).toEqual(new Set(["100", "400"]));
});

it("requires an explicitly selected existing migrated database and configured private storage", async () => {
  const client = { send } as unknown as S3Client;
  expect(() =>
    openDemoDeletionCleanup({ config, client, write: false }),
  ).toThrow("--database");
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "demo-cleanup-test-"),
  );
  directories.push(directory);
  const filename = path.join(directory, "accounts.sqlite");
  for (const [name, value] of Object.entries({
    DEMO_R2_ENDPOINT: config.endpoint,
    DEMO_R2_ACCESS_KEY_ID: config.accessKeyId,
    DEMO_R2_SECRET_ACCESS_KEY: config.secretAccessKey,
    DEMO_R2_BUCKET: config.bucket,
    DEMO_PRIVATE_R2_BUCKET: privateConfig.bucket,
  }))
    vi.stubEnv(name, value);
  expect(() =>
    openDemoDeletionCleanup({
      config,
      client,
      write: true,
      databasePath: filename,
    }),
  ).toThrow();
  await expect(fs.stat(filename)).rejects.toThrow();
  const unmigrated = new Database(filename);
  unmigrated.exec("CREATE TABLE test (id INTEGER)");
  unmigrated.close();
  expect(() =>
    openDemoDeletionCleanup({
      config,
      client,
      write: true,
      databasePath: filename,
    }),
  ).toThrow("must be migrated");
  const migrated = new Database(filename);
  setupDatabase(migrated);
  migrated.close();
  vi.spyOn(console, "error").mockImplementation(() => {});
  const before = await fs.readFile(filename);
  const readonly = openDemoDeletionCleanup({
    config,
    client,
    write: false,
    databasePath: filename,
  });
  await readonly.pending();
  await readonly.plan("a.rec", metadata);
  readonly.close();
  expect(await fs.readFile(filename)).toEqual(before);
  vi.stubEnv("DEMO_PRIVATE_R2_BUCKET", "");
  expect(() =>
    openDemoDeletionCleanup({
      config,
      client,
      write: true,
      databasePath: filename,
    }),
  ).toThrow("DEMO_PRIVATE_R2_BUCKET");
});
