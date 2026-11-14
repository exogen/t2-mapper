import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  linkT2Account,
  migrateAccountSchema,
  unlinkT2Account,
} from "./accountDatabase.js";
import type { DemoGuidSidecar } from "./demoGuids.js";
import { createPlayerDemosReader } from "./playerDemos.js";

const ALICE = "126767979894407168";
const BOB = "234567890123456789";
const databases: Database.Database[] = [];
const directories: string[] = [];
const sidecar = (...guids: string[]): DemoGuidSidecar => ({
  namesByGuid: Object.fromEntries(
    guids.map((guid) => [guid, ["Private alias"]]),
  ),
});

afterEach(() => {
  for (const database of databases.splice(0))
    if (database.open) database.close();
  for (const directory of directories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

function open(filename = ":memory:") {
  const database = new Database(filename);
  databases.push(database);
  database.pragma("foreign_keys = ON");
  return database;
}

function fixture(filename?: string) {
  const database = open(filename);
  const reader = createPlayerDemosReader({ database });
  database.exec(`
    CREATE TABLE "user" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "account" ("userId" TEXT, "providerId" TEXT, "accountId" TEXT);
  `);
  database.transaction(() => migrateAccountSchema(database))();
  const link = (discordId: string, guid: string) =>
    linkT2Account(database, discordId, guid);
  return { database, reader, link };
}

describe("durable player demo membership", () => {
  it("captures current GUIDs, coverage and per-player matches in a short immutable read snapshot", () => {
    const { reader, database } = fixture();
    reader.replace("current.rec", sidecar("123"), {
      sourceETag: "current-v1",
      observedAt: 10,
    });
    reader.replace("history.rec", sidecar("123"), { observedAt: 10 });
    reader.replace("empty.rec", sidecar(), { observedAt: 10 });
    const snapshot = reader.snapshotForDemo("current.rec", ["789"]);
    expect(database.inTransaction).toBe(false);
    expect(snapshot).toEqual({
      indexedFilenames: new Set(["current.rec", "empty.rec", "history.rec"]),
      deletedFilenames: new Set(),
      guids: ["123"],
      filenamesByGuid: new Map([
        ["123", new Set(["current.rec", "history.rec"])],
      ]),
      sourceETag: "current-v1",
    });
    reader.replace("current.rec", sidecar("456"), {
      sourceETag: "current-v2",
      observedAt: 20,
    });
    reader.remove("history.rec", 20);
    expect(reader.snapshotForDemo("current.rec").deletedFilenames).toEqual(
      new Set(["history.rec"]),
    );
    expect(
      reader.snapshotForDemo("history.rec", ["123"]).guids,
    ).toBeUndefined();
    expect(snapshot.guids).toEqual(["123"]);
    expect(snapshot.indexedFilenames.has("history.rec")).toBe(true);
    expect(snapshot.filenamesByGuid.get("123")).toEqual(
      new Set(["current.rec", "history.rec"]),
    );
    expect(reader.snapshotForDemo("empty.rec", ["456"]).guids).toEqual([]);
    const fallback = reader.snapshotForDemo(`users/${ALICE}/upload.rec`, [
      "456",
    ]);
    expect(fallback.guids).toEqual(["456"]);
    expect(fallback.filenamesByGuid.get("456")).toEqual(
      new Set(["current.rec"]),
    );
    expect(reader.snapshotForDemo("missing.rec").guids).toBeUndefined();
  });

  it("looks up demos and players without requiring account links, and distinguishes gaps from empty demos", () => {
    const { reader } = fixture();
    reader.replace("b.rec", sidecar("456", "123"), { observedAt: 10 });
    reader.replace("a.rec", sidecar("123"), { observedAt: 10 });
    reader.replace("empty.rec", sidecar(), { observedAt: 10 });
    expect(reader.guidsForDemo("b.rec")).toEqual(["123", "456"]);
    expect(reader.guidsForDemo("empty.rec")).toEqual([]);
    expect(reader.guidsForDemo("missing.rec")).toBeUndefined();
    expect(reader.guidsForDemo(`users/${ALICE}/upload.rec`)).toBeUndefined();
    expect(reader.filenamesForGuid("123")).toEqual(["a.rec", "b.rec"]);
    expect(reader.filenamesForGuid("999")).toEqual([]);

    reader.replace("b.rec", sidecar("789"), { observedAt: 20 });
    reader.remove("a.rec", 20);
    expect(reader.guidsForDemo("a.rec")).toBeUndefined();
    expect(reader.guidsForDemo("b.rec")).toEqual(["789"]);
    expect(reader.filenamesForGuid("123")).toEqual([]);
    expect(reader.filenamesForGuid("789")).toEqual(["b.rec"]);
  });

  it("unions every linked GUID and returns deduplicated filenames without private identities", async () => {
    const { reader, link } = fixture();
    reader.replace("b.rec", sidecar("456", "789"));
    reader.replace("a.rec", sidecar("123", "456"));
    reader.replace("other.rec", sidecar("999"));
    link(ALICE, "123");
    link(ALICE, "456");
    link(BOB, "789");
    expect(await reader.read(ALICE)).toEqual({
      linked: true,
      filenames: ["a.rec", "b.rec"],
    });
    expect(await reader.read(BOB)).toEqual({
      linked: true,
      filenames: ["b.rec"],
    });
    const response = await reader.read(ALICE);
    response.filenames.push("modified.rec");
    expect((await reader.read(ALICE)).filenames).toEqual(["a.rec", "b.rec"]);
  });

  it("distinguishes unlinked players from links with no indexed demos", async () => {
    const { reader, link } = fixture();
    expect(await reader.read(ALICE)).toEqual({ linked: false, filenames: [] });
    link(ALICE, "123");
    expect(await reader.read(ALICE)).toEqual({ linked: true, filenames: [] });
  });

  it("indexes unlinked GUIDs and resolves links and unlinks immediately before first login", async () => {
    const { reader, database, link } = fixture();
    reader.replace("match.rec", sidecar("123", "456"));
    expect(
      database.prepare('SELECT count(*) FROM "t2Account"').pluck().get(),
    ).toBe(0);
    link(ALICE, "123");
    link(ALICE, "456");
    link(BOB, "123");
    expect((await reader.read(ALICE)).filenames).toEqual(["match.rec"]);
    unlinkT2Account(database, ALICE, "123");
    expect((await reader.read(ALICE)).filenames).toEqual(["match.rec"]);
    unlinkT2Account(database, ALICE, "456");
    expect(await reader.read(ALICE)).toEqual({ linked: false, filenames: [] });
    expect((await reader.read(BOB)).filenames).toEqual(["match.rec"]);
    expect(database.prepare('SELECT count(*) FROM "user"').pluck().get()).toBe(
      0,
    );
    expect(database.pragma("foreign_key_check")).toEqual([]);
  });

  it("constructs before startup migrations without preparing missing-table queries", async () => {
    const database = open();
    const reader = createPlayerDemosReader({ database });
    database.exec(
      `CREATE TABLE "user" ("id" TEXT PRIMARY KEY); CREATE TABLE "account" ("userId" TEXT, "providerId" TEXT, "accountId" TEXT);`,
    );
    database.transaction(() => migrateAccountSchema(database))();
    expect(await reader.read(ALICE)).toEqual({ linked: false, filenames: [] });
    expect(reader.replace("match.rec", sidecar("123"))).toBe(true);
  });

  it("persists memberships, empty-demo fingerprints and deletion markers across restarts", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "player-demos-"));
    directories.push(directory);
    const filename = path.join(directory, "accounts.sqlite");
    const { database, reader, link } = fixture(filename);
    link(ALICE, "123");
    reader.replace("match.rec", sidecar("123"), {
      sourceETag: "match-v1",
      observedAt: 10,
    });
    reader.replace("empty.rec", sidecar(), {
      sourceETag: "empty-v1",
      observedAt: 10,
    });
    reader.remove("removed.rec", 20);
    database.close();
    const restarted = createPlayerDemosReader({ database: open(filename) });
    expect(await restarted.read(ALICE)).toEqual({
      linked: true,
      filenames: ["match.rec"],
    });
    expect(restarted.filenames()).toEqual(["empty.rec", "match.rec"]);
    expect(restarted.isCurrent("match.rec", "match-v1")).toBe(true);
    expect(restarted.isCurrent("empty.rec", "empty-v1")).toBe(true);
    expect(restarted.isCurrent("removed.rec")).toBe(false);
    expect(
      restarted.replace("removed.rec", sidecar("123"), { observedAt: 19 }),
    ).toBe(false);
  });

  it("replaces memberships instead of accumulating stale GUIDs", async () => {
    const { reader, link } = fixture();
    link(ALICE, "123");
    link(BOB, "456");
    reader.replace("match.rec", sidecar("123"), {
      sourceETag: "v1",
      observedAt: 10,
    });
    expect(
      reader.replace("match.rec", sidecar("456"), {
        sourceETag: "v2",
        observedAt: 20,
      }),
    ).toBe(true);
    expect(await reader.read(ALICE)).toEqual({ linked: true, filenames: [] });
    expect((await reader.read(BOB)).filenames).toEqual(["match.rec"]);
    expect(reader.isCurrent("match.rec", "v1")).toBe(false);
    expect(reader.isCurrent("match.rec", "v2")).toBe(true);
    expect(reader.isCurrent("match.rec")).toBe(true);
    expect(reader.isCurrent("unknown.rec")).toBe(false);
  });

  it("keeps empty demos current while removing their previous memberships", async () => {
    const { reader, link } = fixture();
    link(ALICE, "123");
    reader.replace("match.rec", sidecar("123"), { observedAt: 10 });
    reader.replace("match.rec", sidecar(), {
      sourceETag: "empty-v2",
      observedAt: 20,
    });
    expect(await reader.read(ALICE)).toEqual({ linked: true, filenames: [] });
    expect(reader.filenames()).toEqual(["match.rec"]);
    expect(reader.isCurrent("match.rec", "empty-v2")).toBe(true);
    expect(reader.isCurrent("match.rec", "wrong")).toBe(false);
  });

  it("ignores user uploads and invalid demo keys before touching their data", () => {
    const { reader, database } = fixture();
    const upload = `users/${ALICE}/upload.rec`;
    const rejected = [
      upload,
      "users/invalid/upload.rec",
      "nested/a.rec",
      "../a.rec",
      "a.rec/stuff",
      "a%2fhidden.rec",
      "C:\\demo.rec",
      "not-a-demo.json",
    ];
    for (const filename of rejected) {
      expect(reader.replace(filename, null as unknown as DemoGuidSidecar)).toBe(
        false,
      );
      expect(reader.remove(filename)).toBe(false);
      expect(reader.isCurrent(filename)).toBe(filename === upload);
    }
    expect(reader.filenames()).toEqual([]);
    expect(
      database.prepare('SELECT count(*) FROM "t2PlayerDemo"').pluck().get(),
    ).toBe(0);
  });

  it.each([
    null,
    {},
    { namesByGuid: [] },
    { namesByGuid: { "0": [] } },
    { namesByGuid: { "00123": [] } },
    { namesByGuid: { invalid: [] } },
    { namesByGuid: { "123": "invalid names" } },
    { namesByGuid: { "123": [42] } },
  ])(
    "validates complete GUID sidecars before replacing old membership (%j)",
    async (invalid) => {
      const { reader, link } = fixture();
      link(ALICE, "123");
      reader.replace("match.rec", sidecar("123"), {
        sourceETag: "v1",
        observedAt: 10,
      });
      expect(() =>
        reader.replace("match.rec", invalid as unknown as DemoGuidSidecar, {
          sourceETag: "v2",
          observedAt: 20,
        }),
      ).toThrow(/GUID sidecar/);
      expect((await reader.read(ALICE)).filenames).toEqual(["match.rec"]);
      expect(reader.isCurrent("match.rec", "v1")).toBe(true);
    },
  );

  it.each([NaN, Infinity, -1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid observation timestamps atomically (%s)",
    (observedAt) => {
      const { reader } = fixture();
      reader.replace("match.rec", sidecar("123"), {
        sourceETag: "v1",
        observedAt: 10,
      });
      expect(() =>
        reader.replace("match.rec", sidecar("456"), { observedAt }),
      ).toThrow(/timestamp/);
      expect(() => reader.remove("match.rec", observedAt)).toThrow(/timestamp/);
      expect(reader.isCurrent("match.rec", "v1")).toBe(true);
    },
  );

  it("rolls back both metadata and memberships if a write fails after validation", async () => {
    const { reader, database, link } = fixture();
    link(ALICE, "123");
    reader.replace("match.rec", sidecar("123"), {
      sourceETag: "v1",
      observedAt: 10,
    });
    database.exec(
      `CREATE TRIGGER reject_guid BEFORE INSERT ON "t2PlayerDemoGuid" WHEN NEW.guid = '456' BEGIN SELECT RAISE(ABORT, 'injected write failure'); END;`,
    );
    expect(() =>
      reader.replace("match.rec", sidecar("789", "456"), {
        sourceETag: "v2",
        observedAt: 20,
      }),
    ).toThrow(/injected/);
    expect(reader.isCurrent("match.rec", "v1")).toBe(true);
    expect((await reader.read(ALICE)).filenames).toEqual(["match.rec"]);
    expect(
      database.prepare('SELECT guid FROM "t2PlayerDemoGuid"').pluck().all(),
    ).toEqual(["123"]);
    expect(database.inTransaction).toBe(false);
  });

  it("keeps newer publication and deletion writes when an older backfill finishes later", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "player-demos-writers-"),
    );
    directories.push(directory);
    const filename = path.join(directory, "accounts.sqlite");
    const { reader, link } = fixture(filename);
    const slow = createPlayerDemosReader({ database: open(filename) });
    link(ALICE, "123");
    reader.replace("match.rec", sidecar("123"), {
      sourceETag: "published",
      observedAt: 200,
    });
    expect(
      slow.replace("match.rec", sidecar("456"), {
        sourceETag: "old-backfill",
        observedAt: 100,
      }),
    ).toBe(false);
    expect(slow.remove("match.rec", 199)).toBe(false);
    expect((await slow.read(ALICE)).filenames).toEqual(["match.rec"]);
    expect(slow.isCurrent("match.rec", "published")).toBe(true);
    expect(reader.remove("match.rec", 300)).toBe(true);
    expect(slow.replace("match.rec", sidecar("123"), { observedAt: 299 })).toBe(
      false,
    );
    expect(slow.replace("match.rec", sidecar("123"), { observedAt: 300 })).toBe(
      false,
    );
    expect(await reader.read(ALICE)).toEqual({ linked: true, filenames: [] });
    expect(reader.filenames()).toEqual([]);
    expect(
      slow.replace("match.rec", sidecar("123"), {
        sourceETag: "republished",
        observedAt: 301,
      }),
    ).toBe(true);
    expect((await reader.read(ALICE)).filenames).toEqual(["match.rec"]);
  });

  it("records deletion of an unindexed demo and lets equal-timestamp deletion win", () => {
    const { reader } = fixture();
    expect(reader.remove("unknown.rec", 100)).toBe(true);
    expect(
      reader.replace("unknown.rec", sidecar("123"), { observedAt: 99 }),
    ).toBe(false);
    expect(
      reader.replace("unknown.rec", sidecar("123"), { observedAt: 100 }),
    ).toBe(false);
    reader.replace("match.rec", sidecar("123"), { observedAt: 100 });
    expect(reader.remove("match.rec", 100)).toBe(true);
    expect(reader.filenames()).toEqual([]);
    expect(reader.isCurrent("unknown.rec")).toBe(false);
  });
});
