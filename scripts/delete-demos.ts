/** Preview or delete bucket demos using exactly one metadata filter. */
import { parseArgs } from "node:util";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
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
    delete: { type: "boolean", default: false },
    help: { type: "boolean", default: false, short: "h" },
  },
});
if (values.help) {
  console.log(
    [
      "Usage: npm run demos:delete -- <one filter> [--delete]",
      "",
      "Filters (exactly one per invocation; repeated filters are rejected):",
      "  --min-length-seconds=N  Delete demos shorter than N seconds (non-negative; decimals allowed)",
      "  --exclude-game-type=NAME Delete demos containing any match of this full game-type name",
      "  --exclude-server=NAME   Delete demos recorded on this full server name",
      "  --min-players=N         Delete demos with fewer than N published players (non-negative integer)",
      "",
      "Names match exactly, case-insensitively; no substrings, wildcards, or comma-separated lists.",
      "Player counts include observers, exclude the recorder, and fall back to the names list for legacy demos.",
      "Default: dry run. --delete removes index entries first, then recordings and sidecars.",
      "If the index update fails, no demo objects are deleted. Metadata sidecars stay until other deletions succeed.",
      "Metadata comes from index.json, or .rec.json for unindexed demos. Missing fields are reported and skipped.",
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

const { client, config } = r2Client("npm run demos:delete");
const indexKey = `${config.prefix}index.json`;
const missing = (error: unknown) =>
  error instanceof Error &&
  (error.name === "NoSuchKey" || error.name === "NotFound");

async function readJson(key: string, requireETag = false): Promise<unknown> {
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
      !entry.filename.endsWith(".rec") ||
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
  if (key.endsWith(".rec")) demoKeys.add(key);
  else if (key.endsWith(".rec.json")) demoKeys.add(key.slice(0, -5));
}
const objects = demoDeletionObjects(demoKeys, objectKeys);
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
  try {
    let metadata = indexed.get(key);
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
        }),
      );
    }
  } catch (error) {
    counts.failed++;
    console.error(key, error);
  }
}

async function deleteSelectedDemos() {
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
  const candidates = [...selected].filter(([, keys]) =>
    keys.every((key) => !failedKeys.has(key)),
  );
  await deleteKeys(
    candidates.flatMap(([key, keys]) =>
      keys.filter((object) => object === `${key}.json`),
    ),
  );
  counts.deleted = candidates.filter(([, keys]) =>
    keys.every((key) => !failedKeys.has(key)),
  ).length;
  counts.failed += selected.size - counts.deleted;
}

if (values.delete && selected.size > 0) {
  try {
    await deleteSelectedDemos();
  } catch (error) {
    counts.failed += selected.size;
    console.error(
      "Could not prepare deletion metadata or update the index; no demo objects deleted:",
      error,
    );
  }
}
console.log(
  JSON.stringify({ mode: values.delete ? "delete" : "dry-run", ...counts }),
);
if (counts.failed) process.exitCode = 1;
