/** Index published MapGenius demos using their existing private GUID sidecars. */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { HeadObjectCommand } from "@aws-sdk/client-s3";
import Database from "better-sqlite3";
import {
  hasPendingAccountSchemaMigrations,
  openAccountDatabase,
} from "../relay/accountDatabase.js";
import { DEMO_GUIDS_SUFFIX, readDemoGuidSidecar } from "../relay/demoGuids.js";
import { isPublishedDemoKey, isUserDemoKey } from "../relay/demoKeys.js";
import { createPlayerDemosReader } from "../relay/playerDemos.js";
import {
  loadPrivateDemoStorageConfig,
  PrivateDemoStore,
} from "../relay/privateDemoStore.js";
import { listAllObjects, r2Client } from "./lib/r2.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      database: { type: "string" },
      concurrency: { type: "string", default: "16" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      prune: { type: "boolean", default: false },
      filter: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.help) {
    console.log(
      [
        "Usage: npm run demos:backfill-players -- [options]",
        "",
        "Indexes existing private GUID sidecars for published non-user recordings in SQLite.",
        "Does not download recordings or recalculate stats. Requires a migrated account database.",
        "",
        "  --database=FILE       SQLite file (default: AUTH_DATABASE_PATH or .relay/accounts/app.sqlite)",
        "  --filter=TEXT         Case-sensitive substring of the full public R2 key",
        "  --force               Also refresh indexed sidecars changed outside the relay",
        "  --prune               Remove entries absent from the complete public listing, regardless of --filter",
        "  --dry-run             List proposed changes without writing to SQLite",
        "  --concurrency=N       Sidecars processed at once (default: 16)",
      ].join("\n"),
    );
    return;
  }
  const concurrency = Number(values.concurrency);
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error("--concurrency must be a positive integer");

  const filename = path.resolve(
    values.database ||
      process.env.AUTH_DATABASE_PATH ||
      ".relay/accounts/app.sqlite",
  );
  const stat = await fs
    .lstat(filename)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT")
        throw new Error(`Account database not found: ${filename}`);
      throw error;
    });
  if (!stat.isFile() || stat.size === 0)
    throw new Error(
      "Account database must be an existing nonempty SQLite file",
    );
  const database = values["dry-run"]
    ? new Database(filename, { readonly: true, fileMustExist: true })
    : openAccountDatabase(filename);
  try {
    if (hasPendingAccountSchemaMigrations(database))
      throw new Error(
        "Account database has not been migrated yet. Start the updated relay with Discord sign-in enabled first.",
      );
    const index = createPlayerDemosReader({ database });
    const observedAt = Date.now();
    const existing = values.prune ? index.filenames() : [];
    const { client, config } = r2Client("npm run demos:backfill-players");
    const privateConfig = loadPrivateDemoStorageConfig();
    if (!privateConfig)
      throw new Error("Missing DEMO_R2_* or DEMO_PRIVATE_R2_BUCKET.");
    const store = new PrivateDemoStore(privateConfig);
    const recordings = (await listAllObjects(client, config)).filter(
      ({ key }) => {
        const demoKey = key.slice(config.prefix.length);
        return isPublishedDemoKey(demoKey) && !isUserDemoKey(demoKey);
      },
    );
    const demos = recordings.filter(
      ({ key }) => !values.filter || key.includes(values.filter),
    );
    const counts = {
      written: 0,
      current: 0,
      planned: 0,
      pruned: 0,
      superseded: 0,
      failed: 0,
    };
    const readSourceETag = async (key: string): Promise<string> => {
      const object = await client.send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (!object.ETag) throw new Error("Recording has no source ETag");
      return object.ETag;
    };

    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(concurrency, demos.length) }, async () => {
        while (next < demos.length) {
          const { key, etag } = demos[next++];
          const demoKey = key.slice(config.prefix.length);
          if (!values.force && etag && index.isCurrent(demoKey, etag)) {
            counts.current++;
            continue;
          }
          if (values["dry-run"]) {
            counts.planned++;
            console.log(JSON.stringify({ key, action: "write" }));
            continue;
          }
          try {
            const sourceETag = etag || (await readSourceETag(key));
            const sidecar = readDemoGuidSidecar(
              await store.read(demoKey, DEMO_GUIDS_SUFFIX),
            );
            if ((await readSourceETag(key)) !== sourceETag)
              throw new Error(
                "Recording changed while reading its GUID sidecar",
              );
            if (
              sidecar.sourceETag !== undefined &&
              sidecar.sourceETag !== sourceETag
            )
              throw new Error(
                "GUID sidecar belongs to a different recording; refresh it with demos:backfill-guids --force",
              );
            if (!index.replace(demoKey, sidecar, { sourceETag, observedAt })) {
              counts.superseded++;
              continue;
            }
            counts.written++;
            console.log(
              JSON.stringify({
                key,
                result: "written",
                guids: Object.keys(sidecar.namesByGuid).length,
              }),
            );
          } catch (error) {
            counts.failed++;
            console.error(key, error);
          }
        }
      }),
    );

    if (values.prune) {
      const published = new Set(
        recordings.map(({ key }) => key.slice(config.prefix.length)),
      );
      for (const demoKey of existing) {
        if (published.has(demoKey)) continue;
        if (values["dry-run"]) {
          counts.planned++;
          console.log(JSON.stringify({ demoKey, action: "prune" }));
        } else if (index.remove(demoKey, observedAt)) {
          counts.pruned++;
          console.log(JSON.stringify({ demoKey, result: "pruned" }));
        } else {
          counts.superseded++;
        }
      }
    }
    console.log(JSON.stringify({ demos: demos.length, ...counts }));
    if (counts.failed) process.exitCode = 1;
  } finally {
    database.close();
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
