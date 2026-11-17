/** Preview or delete MapGenius recordings and their derived data using one metadata filter. */
import { parseArgs } from "node:util";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { isPublishedDemoKey } from "../relay/demoKeys.js";
import type { DemoMetadata } from "../relay/demoMetadata.js";
import {
  openDemoDeletionCleanup,
  type DemoDeletionPlan,
} from "./lib/demoDeletionCleanup.js";
import { updateDemoIndex } from "../relay/demoIndexStorage.js";
import { listAllObjects, r2Client } from "./lib/r2.js";
import {
  DEMO_DELETION_FILTERS,
  demoDeletionFilter,
  demoDeletionObjects,
  matchesDemoDeletion,
  type DemoDeletionFilter,
} from "./lib/demoDeletion.js";

const { values, tokens } = parseArgs({
  tokens: true,
  options: {
    "min-length-seconds": { type: "string" },
    "exclude-game-type": { type: "string" },
    "exclude-server": { type: "string" },
    "min-players": { type: "string" },
    database: { type: "string" },
    delete: { type: "boolean", default: false },
    help: { type: "boolean", default: false, short: "h" },
  },
});
if (values.help) {
  console.log(
    [
      "Usage: npm run demos:delete -- <one filter> [--database=FILE] [--delete]",
      "",
      "Filters (exactly one per invocation; repeated filters are rejected):",
      "  --min-length-seconds=N  Delete demos shorter than N seconds (non-negative; decimals allowed)",
      "  --exclude-game-type=NAME Delete demos containing any match of this full game-type name",
      "  --exclude-server=NAME   Delete demos recorded on this full server name",
      "  --min-players=N         Delete demos with fewer than N published players (non-negative integer)",
      "",
      "Names match exactly, case-insensitively; no substrings, wildcards, or comma-separated lists.",
      "Player counts include observers, exclude the recorder, and fall back to the names list for legacy demos.",
      "Default: dry run; previews public/private objects, affected players, and dependent clips.",
      "--database=FILE or AUTH_DATABASE_PATH must identify the database for this bucket.",
      "Requires an existing migrated database and DEMO_PRIVATE_R2_BUCKET, even for previews.",
      "Stop the relay and all backfills before --delete; external workers cannot be canceled by this script.",
      "Deletion removes index entries, recordings, public/private sidecars, SQLite memberships, and dependent clips.",
      "Affected profiles and best maps are rebuilt from surviving demos; current stats are required.",
      "Private retry journals survive failures. Rerun the same filter to finish interrupted cleanup.",
      "Metadata comes from index.json, or .rec.json for unindexed demos. Missing fields are reported and skipped.",
      "User uploads under users/ are always skipped; delete them from the owner's demo library.",
      "Only published MapGenius recordings are selected; external-source caches are skipped.",
      "Uses DEMO_R2_* credentials from .env.development.local.",
    ].join("\n"),
  );
  process.exit(0);
}

let filter: DemoDeletionFilter;
try {
  const selected = tokens.filter(
    (token) =>
      token.kind === "option" &&
      DEMO_DELETION_FILTERS.some((name) => name === token.name),
  );
  if (selected.length !== 1)
    throw new Error(
      "Specify exactly one filter: --min-length-seconds, --exclude-game-type, --exclude-server, or --min-players (no repeats)",
    );
  const name = DEMO_DELETION_FILTERS.find(
    (name) => values[name] !== undefined,
  )!;
  filter = demoDeletionFilter(name, values[name]!);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

async function main() {
  const { client, config } = r2Client("npm run demos:delete");
  const cleanup = openDemoDeletionCleanup({
    databasePath: values.database || process.env.AUTH_DATABASE_PATH,
    write: values.delete,
    config,
    client,
  });
  try {
    const indexKey = `${config.prefix}index.json`;
    const missing = (error: unknown) =>
      error instanceof Error &&
      (error.name === "NoSuchKey" || error.name === "NotFound");

    async function readJson(
      key: string,
      requireETag = false,
    ): Promise<unknown> {
      const response = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (!response.Body) throw new Error(`Missing JSON body: ${key}`);
      if (requireETag && !response.ETag)
        throw new Error(`Missing index ETag: ${key}`);
      return JSON.parse(await response.Body.transformToString());
    }

    const indexed = new Map<string, unknown>();
    try {
      const index = await readJson(indexKey, values.delete);
      if (!Array.isArray(index)) throw new Error("Demo index is not an array");
      for (const entry of index) {
        if (
          !entry ||
          typeof entry.filename !== "string" ||
          !/\.rec$/i.test(entry.filename) ||
          indexed.has(`${config.prefix}${entry.filename}`)
        )
          throw new Error("Invalid or duplicate filename in demo index");
        indexed.set(`${config.prefix}${entry.filename}`, entry);
      }
    } catch (error) {
      if (!missing(error)) throw error;
    }
    const objectSet = new Set(
      (await listAllObjects(client, config))
        .map(({ key }) => key)
        .filter((key) => key.startsWith(config.prefix)),
    );
    const objectKeys = [...objectSet];
    const demoKeys = new Set(indexed.keys());
    for (const key of objectKeys) {
      if (/\.rec$/i.test(key)) demoKeys.add(key);
      else if (/\.rec\.json$/i.test(key)) demoKeys.add(key.slice(0, -5));
    }
    const pending = await cleanup.pending();
    for (const demoKey of pending.keys())
      demoKeys.add(`${config.prefix}${demoKey}`);
    const objects = demoDeletionObjects(demoKeys, objectKeys);
    const plans = new Map<string, DemoDeletionPlan>();
    const selected = new Map<string, string[]>();
    const counts = {
      demos: demoKeys.size,
      matched: 0,
      skipped: 0,
      failed: 0,
      deleted: 0,
      plannedObjects: 0,
      deletedObjects: 0,
    };

    for (const key of demoKeys) {
      if (key.slice(config.prefix.length).startsWith("users/")) {
        counts.skipped++;
        console.log(
          JSON.stringify({
            key,
            action: "skip",
            reason: "User uploads are managed by the owner's demo library",
          }),
        );
        continue;
      }
      try {
        const demoKey = key.slice(config.prefix.length);
        if (!isPublishedDemoKey(demoKey)) {
          counts.skipped++;
          console.log(
            JSON.stringify({
              key,
              action: "skip",
              reason: "Not a published MapGenius recording",
            }),
          );
          continue;
        }
        let metadata = pending.get(demoKey) ?? indexed.get(key);
        if (!metadata && objectSet.has(`${key}.json`)) {
          try {
            metadata = await readJson(`${key}.json`);
          } catch (error) {
            if (!missing(error)) throw error;
          }
        }
        const result = matchesDemoDeletion(metadata, filter);
        if ("skipped" in result) {
          counts.skipped++;
          console.log(
            JSON.stringify({ key, action: "skip", reason: result.skipped }),
          );
        } else if (result.matches) {
          const keys = objects.get(key)!;
          const plan = await cleanup.plan(demoKey, metadata);
          plans.set(key, plan);
          selected.set(key, keys);
          counts.matched++;
          counts.plannedObjects += keys.length;
          console.log(
            JSON.stringify({
              key,
              action: values.delete ? "delete" : "would-delete",
              filter: filter.name,
              value: result.value,
              objects: keys,
              privateObjects: plan.privateObjects,
              clips: plan.clipIds,
              affectedPlayers: plan.guids.length,
            }),
          );
        }
      } catch (error) {
        counts.failed++;
        console.error(key, error);
      }
    }

    async function deleteSelectedDemos() {
      const commitProfiles = await cleanup.prepareProfiles(
        [...plans.values()],
        [...indexed]
          .filter(([key]) => !selected.has(key))
          .map(([, metadata]) => metadata as DemoMetadata),
      );
      // Save private inventory before removing any source of GUIDs or clip ownership.
      for (const plan of plans.values()) await cleanup.persist(plan);
      // Once the index entry is gone, .rec.json must still identify failed deletions.
      for (const [key, keys] of selected) {
        const metadata = indexed.get(key);
        if (!metadata || keys.length === 0) continue;
        const metadataKey = `${key}.json`;
        let retryMetadata: unknown;
        if (keys.includes(metadataKey)) {
          try {
            retryMetadata = await readJson(metadataKey);
          } catch (error) {
            if (!missing(error) && !(error instanceof SyntaxError)) throw error;
          }
        }
        const result = matchesDemoDeletion(retryMetadata, filter);
        if ("matches" in result && result.matches) continue;
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: metadataKey,
            Body: JSON.stringify(metadata),
            ContentType: "application/json; charset=utf-8",
            CacheControl: "no-cache",
          }),
          { abortSignal: AbortSignal.timeout(30_000) },
        );
        if (!keys.includes(metadataKey)) {
          keys.push(metadataKey);
          counts.plannedObjects++;
        }
      }
      // Hide every selected demo before removing any recording or sidecar.
      await updateDemoIndex(client, config.bucket, indexKey, (entries) => {
        if (!entries) return undefined;
        const keep = entries.filter(
          (entry) => !selected.has(`${config.prefix}${entry.filename}`),
        );
        return keep.length === entries.length ? undefined : keep;
      });

      const failedKeys = new Set<string>();
      async function deleteKeys(keys: string[]) {
        for (let start = 0; start < keys.length; start += 1000) {
          const batch = keys.slice(start, start + 1000);
          try {
            const response = await client.send(
              new DeleteObjectsCommand({
                Bucket: config.bucket,
                Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
              }),
              { abortSignal: AbortSignal.timeout(60_000) },
            );
            for (const error of response.Errors ?? []) {
              if (error.Key) failedKeys.add(error.Key);
              else for (const key of batch) failedKeys.add(key);
              console.error(
                `Delete failed: ${error.Key ?? "batch"}: ${error.Code} ${error.Message}`,
              );
            }
            counts.deletedObjects += batch.filter(
              (key) => !failedKeys.has(key),
            ).length;
          } catch (error) {
            for (const key of batch) failedKeys.add(key);
            console.error("Delete batch failed:", error);
          }
        }
      }

      // Keep .rec.json until all other objects succeed, so failed demos can be retried.
      await deleteKeys(
        [...selected].flatMap(([key, keys]) =>
          keys.filter((object) => object !== `${key}.json`),
        ),
      );
      const candidates: Array<[string, string[]]> = [];
      for (const [key, keys] of selected) {
        if (keys.some((object) => failedKeys.has(object))) continue;
        try {
          await cleanup.removeDependencies(plans.get(key)!);
          candidates.push([key, keys]);
        } catch (error) {
          console.error(`Dependent cleanup failed: ${key}`, error);
        }
      }
      commitProfiles();
      await deleteKeys(
        candidates.flatMap(([key, keys]) =>
          keys.filter((object) => object === `${key}.json`),
        ),
      );
      for (const [key, keys] of candidates) {
        if (keys.some((object) => failedKeys.has(object))) continue;
        try {
          await cleanup.finish(plans.get(key)!);
          counts.deleted++;
        } catch (error) {
          console.error(`Could not finish deletion: ${key}`, error);
        }
      }
      counts.failed += selected.size - counts.deleted;
    }

    if (values.delete && selected.size > 0) {
      try {
        await deleteSelectedDemos();
      } catch (error) {
        counts.failed += selected.size - counts.deleted;
        console.error(
          "Deletion incomplete; retry with the same filter to finish cleanup:",
          error,
        );
      }
    }
    console.log(
      JSON.stringify({ mode: values.delete ? "delete" : "dry-run", ...counts }),
    );
    if (counts.failed) process.exitCode = 1;
  } finally {
    cleanup.close();
  }
}
await main();
