import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import type Database from "better-sqlite3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  linkT2Account,
  migrateAccountSchema,
  openAccountDatabase,
} from "../relay/accountDatabase.js";
import { DEMO_GUIDS_SUFFIX } from "../relay/demoGuids.js";
import { createPlayerDemosReader } from "../relay/playerDemos.js";

const mocks = vi.hoisted(() => ({
  r2Client: vi.fn(),
  list: vi.fn(),
  loadPrivate: vi.fn(),
  read: vi.fn(),
  send: vi.fn(),
}));
vi.mock("./lib/r2", () => ({
  r2Client: mocks.r2Client,
  listAllObjects: mocks.list,
}));
vi.mock("../relay/privateDemoStore", () => ({
  loadPrivateDemoStorageConfig: mocks.loadPrivate,
  PrivateDemoStore: class {
    read = mocks.read;
  },
}));

const ALICE = "126767979894407168";
const sourceETag = '"source-a"';
const originalArgv = process.argv;
const originalExitCode = process.exitCode;
let directory: string;
let filename: string;
let database: Database.Database;

beforeEach(async () => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "t2-demo-players-"));
  filename = path.join(directory, "accounts.sqlite");
  database = openAccountDatabase(filename);
  database.exec(`
    CREATE TABLE "user" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "account" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT REFERENCES "user" ("id"),
      "providerId" TEXT,
      "accountId" TEXT
    );
  `);
  database.transaction(() => migrateAccountSchema(database))();
  mocks.r2Client.mockReturnValue({
    client: { send: mocks.send },
    config: { bucket: "public", prefix: "recordings/" },
  });
  mocks.loadPrivate.mockReturnValue({ bucket: "private", prefix: "sidecars/" });
  mocks.list.mockResolvedValue([{ key: "recordings/a.rec", etag: sourceETag }]);
  mocks.read.mockResolvedValue({ namesByGuid: { "123": ["Alice"] } });
  mocks.send.mockResolvedValue({ ETag: sourceETag });
});

afterEach(async () => {
  database.close();
  await fs.rm(directory, { recursive: true, force: true });
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

async function run(...args: string[]) {
  vi.resetModules();
  process.argv = [
    "node",
    "backfill-demo-players.ts",
    "--database",
    filename,
    ...args,
  ];
  await import("./backfill-demo-players.js");
}

function summary() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);
}

function index() {
  return createPlayerDemosReader({ database });
}

function seed(
  demoKey: string,
  guids = ["123"],
  etag = '"old-source"',
  observedAt = 1,
) {
  index().replace(
    demoKey,
    { namesByGuid: Object.fromEntries(guids.map((guid) => [guid, []])) },
    { sourceETag: etag, observedAt },
  );
}

it("indexes only published non-user recordings from existing sidecars, before players link accounts", async () => {
  mocks.list.mockResolvedValue([
    { key: "recordings/a.rec", etag: sourceETag },
    { key: "recordings/b.rec", etag: sourceETag },
    { key: `recordings/users/${ALICE}/upload.rec`, etag: sourceETag },
    { key: "recordings/nested/cache.rec", etag: sourceETag },
    { key: "recordings/a.rec.guids.json", etag: sourceETag },
  ]);
  mocks.read.mockImplementation(async (key: string) => ({
    namesByGuid:
      key === "a.rec" ? { "123": ["Alice"], "456": [] } : { "456": ["Alias"] },
  }));
  await run();
  expect(mocks.read.mock.calls).toEqual([
    ["a.rec", DEMO_GUIDS_SUFFIX],
    ["b.rec", DEMO_GUIDS_SUFFIX],
  ]);
  expect(mocks.send).toHaveBeenCalledTimes(2);
  for (const [command] of mocks.send.mock.calls) {
    expect(command).toBeInstanceOf(HeadObjectCommand);
    expect(command.input.Bucket).toBe("public");
  }
  expect(await index().read(ALICE)).toEqual({ linked: false, filenames: [] });
  linkT2Account(database, ALICE, "123", "Alice");
  linkT2Account(database, ALICE, "456", "Alias");
  expect(await index().read(ALICE)).toEqual({
    linked: true,
    filenames: ["a.rec", "b.rec"],
  });
  expect(summary()).toMatchObject({ demos: 2, written: 2, failed: 0 });
});

it.each([false, true])(
  "refuses a missing database without creating it (dry run: %s)",
  async (dryRun) => {
    filename = path.join(directory, "missing", "accounts.sqlite");
    await run(...(dryRun ? ["--dry-run"] : []));
    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("not found"),
    );
    await expect(fs.stat(path.dirname(filename))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(mocks.list).not.toHaveBeenCalled();
  },
);

it("refuses a database whose membership migration has not run", async () => {
  database.pragma("user_version = 4");
  await run();
  expect(process.exitCode).toBe(1);
  expect(console.error).toHaveBeenCalledWith(
    expect.stringContaining("not been migrated"),
  );
  expect(mocks.list).not.toHaveBeenCalled();
});

it("skips a matching source without reading its sidecar or recording", async () => {
  seed("a.rec", ["123"], sourceETag);
  await run();
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(summary()).toMatchObject({ current: 1, written: 0, failed: 0 });
});

it("force replaces memberships when a sidecar changes without a raw recording change", async () => {
  seed("a.rec", ["123"], sourceETag);
  linkT2Account(database, ALICE, "123");
  mocks.read.mockResolvedValue({ namesByGuid: { "456": [] } });
  await run("--force");
  expect(await index().read(ALICE)).toEqual({ linked: true, filenames: [] });
  linkT2Account(database, ALICE, "456");
  expect((await index().read(ALICE)).filenames).toEqual(["a.rec"]);
  expect(summary()).toMatchObject({ written: 1, current: 0 });
});

it("retries unknown listing ETags and checks source identity both before and after reading", async () => {
  seed("a.rec", ["456"], sourceETag);
  mocks.list.mockResolvedValue([{ key: "recordings/a.rec" }]);
  const events: string[] = [];
  mocks.send.mockImplementation(async () => {
    events.push("head");
    return { ETag: sourceETag };
  });
  mocks.read.mockImplementation(async () => {
    events.push("sidecar");
    return { namesByGuid: { "123": [] } };
  });
  await run();
  expect(events).toEqual(["head", "sidecar", "head"]);
  expect(summary()).toMatchObject({ written: 1, current: 0 });
});

it("records a valid empty sidecar as current instead of refetching it every run", async () => {
  mocks.read.mockResolvedValue({ namesByGuid: {} });
  await run();
  expect(index().filenames()).toEqual(["a.rec"]);
  await run();
  expect(mocks.read).toHaveBeenCalledOnce();
  expect(summary()).toMatchObject({ current: 1, written: 0 });
});

it.each([
  null,
  { namesByGuid: { "0": ["Unknown"] } },
  { namesByGuid: { "123": "bad names" } },
  new Error("Sidecar unavailable"),
])(
  "retains existing membership and permits retry after an unreadable or invalid sidecar (%j)",
  async (failure) => {
    seed("a.rec");
    if (failure instanceof Error) mocks.read.mockRejectedValueOnce(failure);
    else mocks.read.mockResolvedValueOnce(failure);
    await run();
    expect(index().isCurrent("a.rec", '"old-source"')).toBe(true);
    expect(summary()).toMatchObject({ written: 0, failed: 1 });
    expect(process.exitCode).toBe(1);
    process.exitCode = undefined;
    await run();
    expect(summary()).toMatchObject({ written: 1, failed: 0 });
  },
);

it.each(["changed", "deleted", "missing-etag"])(
  "does not overwrite membership when the final source check is %s",
  async (change) => {
    seed("a.rec");
    mocks.send.mockImplementation(async () => {
      if (change === "deleted")
        throw Object.assign(new Error("Gone"), { name: "NotFound" });
      return { ETag: change === "changed" ? '"source-b"' : undefined };
    });
    await run();
    expect(index().isCurrent("a.rec", '"old-source"')).toBe(true);
    expect(summary()).toMatchObject({ written: 0, failed: 1 });
  },
);

it("protects a newer publication made while the backfill is reading sidecars", async () => {
  const startedAt = 1_000;
  vi.spyOn(Date, "now").mockReturnValue(startedAt);
  mocks.read.mockImplementation(async () => {
    seed("a.rec", ["456"], '"newer-source"', startedAt + 1);
    return { namesByGuid: { "123": [] } };
  });
  await run();
  expect(index().isCurrent("a.rec", '"newer-source"')).toBe(true);
  expect(summary()).toMatchObject({ written: 0, superseded: 1, failed: 0 });
});

it("rejects a sidecar fingerprint from a previous recording without replacing membership", async () => {
  seed("a.rec");
  mocks.read.mockResolvedValue({
    namesByGuid: { "456": [] },
    sourceETag: '"previous-recording"',
  });
  await run();
  expect(index().isCurrent("a.rec", '"old-source"')).toBe(true);
  expect(summary()).toMatchObject({ written: 0, failed: 1 });
  expect(console.error).toHaveBeenCalledWith(
    "recordings/a.rec",
    expect.objectContaining({
      message: expect.stringContaining("different recording"),
    }),
  );
});

it("prunes only baseline entries missing from the complete listing, regardless of the processing filter", async () => {
  seed("a.rec", ["123"], sourceETag);
  seed("b.rec", ["123"], sourceETag);
  seed("gone.rec");
  mocks.list.mockResolvedValue([
    { key: "recordings/a.rec", etag: sourceETag },
    { key: "recordings/b.rec", etag: sourceETag },
  ]);
  await run("--prune", "--filter=a.rec");
  expect(index().filenames()).toEqual(["a.rec", "b.rec"]);
  expect(summary()).toMatchObject({ demos: 1, current: 1, pruned: 1 });
  expect(
    database
      .prepare('SELECT "deleted" FROM "t2PlayerDemo" WHERE "filename" = ?')
      .pluck()
      .get("gone.rec"),
  ).toBe(1);
});

it("does not prune after a failed listing", async () => {
  seed("a.rec");
  mocks.list.mockRejectedValue(new Error("Incomplete listing"));
  await run("--prune");
  expect(index().filenames()).toEqual(["a.rec"]);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(process.exitCode).toBe(1);
});

it("does not prune baseline entries republished after listing began or entries first added during the run", async () => {
  const startedAt = 1_000;
  vi.spyOn(Date, "now").mockReturnValue(startedAt);
  seed("republished.rec");
  mocks.list.mockImplementation(async () => {
    seed("republished.rec", ["456"], '"newer-source"', startedAt + 1);
    seed("new.rec", ["456"], '"newer-source"', startedAt + 1);
    return [];
  });
  await run("--prune");
  expect(index().filenames()).toEqual(["new.rec", "republished.rec"]);
  expect(summary()).toMatchObject({ pruned: 0, superseded: 1 });
});

it("dry run plans writes and pruning without changing database rows or reading sidecars", async () => {
  seed("gone.rec");
  const before = database.prepare('SELECT * FROM "t2PlayerDemo"').all();
  await run("--dry-run", "--prune");
  expect(database.prepare('SELECT * FROM "t2PlayerDemo"').all()).toEqual(
    before,
  );
  expect(index().filenames()).toEqual(["gone.rec"]);
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(summary()).toMatchObject({ planned: 2, written: 0, pruned: 0 });
});
