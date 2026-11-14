import type Database from "better-sqlite3";
import type { AccountMapGeniusDemos } from "./accountTypes.js";
import { readDemoGuidSidecar, type DemoGuidSidecar } from "./demoGuids.js";
import { isPublishedDemoKey, isUserDemoKey } from "./demoKeys.js";

export interface PlayerDemoSnapshot {
  indexedFilenames: ReadonlySet<string>;
  deletedFilenames: ReadonlySet<string>;
  guids: readonly string[] | undefined;
  filenamesByGuid: ReadonlyMap<string, ReadonlySet<string>>;
  sourceETag?: string;
}

export interface PlayerDemosReader {
  read(discordId: string): Promise<AccountMapGeniusDemos>;
  /** Undefined for unindexed/deleted demos, including uploads; empty for an indexed demo with no players. */
  guidsForDemo(filename: string): string[] | undefined;
  filenamesForGuid(guid: string): string[];
  /** Take one SQLite read snapshot; no transaction remains open across remote work. */
  snapshotForDemo(
    filename: string,
    fallbackGuids?: readonly string[],
  ): PlayerDemoSnapshot;
  replace(
    filename: string,
    sidecar: DemoGuidSidecar,
    options?: { sourceETag?: string; observedAt?: number },
  ): boolean;
  remove(filename: string, observedAt?: number): boolean;
  isCurrent(filename: string, sourceETag?: string): boolean;
  filenames(): string[];
}

function isIndexedDemo(filename: string): boolean {
  return isPublishedDemoKey(filename) && !isUserDemoKey(filename);
}

function requireObservedAt(observedAt: number): number {
  if (!Number.isSafeInteger(observedAt) || observedAt < 0)
    throw new Error("Demo membership requires a valid observation timestamp");
  return observedAt;
}

/** Shared SQLite membership queries for profile pages, computation, and scripts. */
export function createPlayerDemosReader({
  database,
}: {
  database: Database.Database;
}): PlayerDemosReader {
  // The service is constructed before startup migrations have created tables.
  const statements = () => ({
    state: database.prepare(
      'SELECT "sourceETag", "deleted" FROM "t2PlayerDemo" WHERE "filename" = ?',
    ),
    replace: database.prepare(`
      INSERT INTO "t2PlayerDemo" ("filename", "sourceETag", "observedAt", "deleted")
      VALUES (?, ?, ?, 0)
      ON CONFLICT ("filename") DO UPDATE SET
        "sourceETag" = excluded."sourceETag", "observedAt" = excluded."observedAt", "deleted" = 0
      WHERE excluded."observedAt" >= "t2PlayerDemo"."observedAt"
        AND ("t2PlayerDemo"."deleted" = 0 OR excluded."observedAt" > "t2PlayerDemo"."observedAt")
    `),
    remove: database.prepare(`
      INSERT INTO "t2PlayerDemo" ("filename", "sourceETag", "observedAt", "deleted")
      VALUES (?, NULL, ?, 1)
      ON CONFLICT ("filename") DO UPDATE SET
        "sourceETag" = NULL, "observedAt" = excluded."observedAt", "deleted" = 1
      WHERE excluded."observedAt" >= "t2PlayerDemo"."observedAt"
    `),
    clear: database.prepare(
      'DELETE FROM "t2PlayerDemoGuid" WHERE "filename" = ?',
    ),
    add: database.prepare(
      'INSERT INTO "t2PlayerDemoGuid" ("guid", "filename") VALUES (?, ?)',
    ),
    read: database.prepare(`
      SELECT DISTINCT m."filename" FROM "t2AccountLink" l
      LEFT JOIN "t2PlayerDemoGuid" m ON m."guid" = l."guid"
      WHERE l."discordId" = ? ORDER BY m."filename"
    `),
    guidsForDemo: database.prepare(`
      SELECT g."guid" FROM "t2PlayerDemo" d
      LEFT JOIN "t2PlayerDemoGuid" g ON g."filename" = d."filename"
      WHERE d."filename" = ? AND d."deleted" = 0 ORDER BY g."guid"
    `),
    filenamesForGuid: database.prepare(
      'SELECT "filename" FROM "t2PlayerDemoGuid" WHERE "guid" = ? ORDER BY "filename"',
    ),
    knownFilenames: database.prepare(
      'SELECT "filename", "deleted" FROM "t2PlayerDemo" ORDER BY "filename"',
    ),
    filenames: database.prepare(
      'SELECT "filename" FROM "t2PlayerDemo" WHERE "deleted" = 0 ORDER BY "filename"',
    ),
  });
  let prepared: ReturnType<typeof statements> | undefined;
  const sql = () => (prepared ??= statements());
  const guidsForDemo = (filename: string): string[] | undefined => {
    const rows = sql().guidsForDemo.all(filename) as { guid: string | null }[];
    return rows.length
      ? rows.flatMap(({ guid }) => (guid === null ? [] : [guid]))
      : undefined;
  };
  const filenamesForGuid = (guid: string) =>
    sql().filenamesForGuid.pluck().all(guid) as string[];
  const filenames = () => sql().filenames.pluck().all() as string[];

  return {
    async read(discordId) {
      const rows = sql().read.all(discordId) as { filename: string | null }[];
      return {
        linked: rows.length > 0,
        filenames: rows.flatMap(({ filename }) =>
          filename === null ? [] : [filename],
        ),
      };
    },
    guidsForDemo,
    filenamesForGuid,
    snapshotForDemo(filename, fallbackGuids) {
      return database.transaction(() => {
        const state = sql().state.get(filename) as
          { sourceETag: string | null; deleted: number } | undefined;
        const guids = state?.deleted
          ? undefined
          : (guidsForDemo(filename) ??
            (fallbackGuids === undefined ? undefined : [...fallbackGuids]));
        const known = sql().knownFilenames.all() as {
          filename: string;
          deleted: number;
        }[];
        return {
          indexedFilenames: new Set(
            known
              .filter(({ deleted }) => !deleted)
              .map(({ filename }) => filename),
          ),
          deletedFilenames: new Set(
            known
              .filter(({ deleted }) => deleted)
              .map(({ filename }) => filename),
          ),
          guids,
          filenamesByGuid: new Map(
            guids?.map((guid) => [guid, new Set(filenamesForGuid(guid))]) ?? [],
          ),
          ...(state?.deleted === 0 &&
            state.sourceETag !== null && { sourceETag: state.sourceETag }),
        };
      })();
    },
    replace(filename, sidecar, { sourceETag, observedAt = Date.now() } = {}) {
      if (!isIndexedDemo(filename)) return false;
      const guids = Object.keys(readDemoGuidSidecar(sidecar).namesByGuid);
      requireObservedAt(observedAt);
      if (sourceETag !== undefined && typeof sourceETag !== "string")
        throw new Error("Demo membership requires a valid source fingerprint");
      const queries = sql();
      return database
        .transaction(() => {
          if (
            !queries.replace.run(filename, sourceETag ?? null, observedAt)
              .changes
          )
            return false;
          queries.clear.run(filename);
          for (const guid of guids) queries.add.run(guid, filename);
          return true;
        })
        .immediate();
    },
    remove(filename, observedAt = Date.now()) {
      if (!isIndexedDemo(filename)) return false;
      requireObservedAt(observedAt);
      const queries = sql();
      return database
        .transaction(() => {
          if (!queries.remove.run(filename, observedAt).changes) return false;
          queries.clear.run(filename);
          return true;
        })
        .immediate();
    },
    isCurrent(filename, sourceETag) {
      if (isUserDemoKey(filename)) return true;
      if (!isIndexedDemo(filename)) return false;
      const state = sql().state.get(filename) as
        { sourceETag: string | null; deleted: number } | undefined;
      return (
        !!state &&
        state.deleted === 0 &&
        (sourceETag === undefined || state.sourceETag === sourceETag)
      );
    },
    filenames,
  };
}
