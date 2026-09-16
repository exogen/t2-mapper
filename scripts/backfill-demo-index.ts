/**
 * Backfill demo metadata sidecars and rebuild the index from the .rec
 * files already in R2. For each demo without a `.rec.json` sidecar, the
 * demo is downloaded and analyzed — header fields come from the initial
 * block's $DemoValue rows, and the player list is accumulated by
 * replaying every packet through the same parser + WatchStateAccumulator
 * the live relay uses, so backfilled sidecars match live-written ones.
 * Finally `index.json` is rebuilt from all sidecar records, which makes
 * this script double as the index disaster-recovery tool.
 *
 * R2 credentials come from the same DEMO_R2_* env vars as the relay.
 * Run with node --env-file-if-exists=.env.development.local --import=tsx/esm.
 * Existing sidecars are reused unless --force is given. --players-only
 * fills missing tag-less name counts without changing other metadata.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { listAllObjects, r2Client } from "./lib/r2";
import type { DemoMetadata } from "../relay/demoRecorder.js";
import { analyzeDemo } from "./lib/analyzeDemo";
import { repairDemoPlayerMetadata } from "./lib/repairDemoPlayerMetadata";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    "players-only": { type: "boolean", default: false },
    filter: { type: "string" },
    "backup-dir": { type: "string" },
    concurrency: { type: "string", default: "4" },
    help: { type: "boolean", default: false, short: "h" },
  },
});

if (values.help) {
  console.error(
    "Usage: node --env-file-if-exists=.env.development.local --import=tsx/esm scripts/backfill-demo-index.ts [options]",
  );
  console.error();
  console.error("Options:");
  console.error("  --dry-run          Analyze only; write nothing to R2");
  console.error(
    "  --force            Re-analyze demos that already have sidecars",
  );
  console.error("  --concurrency <n>  Parallel demo downloads (default: 4)");
  console.error(
    "  --players-only     Repair player counts/names, preserving other metadata",
  );
  console.error(
    "  --filter <text>    Limit --players-only to matching filenames",
  );
  console.error("  --backup-dir <dir> Save replaced JSON records locally");
  process.exit(0);
}

const dryRun = values["dry-run"];
const force = values.force;
const playersOnly = values["players-only"];
if (values.filter && !playersOnly)
  throw new Error("--filter requires --players-only");
if (values["backup-dir"])
  await fs.mkdir(values["backup-dir"], { recursive: true });
const concurrency = Math.max(1, parseInt(values.concurrency!, 10) || 4);

const { client, config } = r2Client();

async function backup(key: string, body: string) {
  if (values["backup-dir"]) {
    try {
      await fs.writeFile(
        path.join(values["backup-dir"], path.basename(key)),
        body,
        { flag: "wx" },
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

async function listBucket(): Promise<Map<string, number>> {
  const objects = await listAllObjects(client, config);
  return new Map(objects.map((o) => [o.key, o.size]));
}

async function getObjectBytes(key: string): Promise<Uint8Array> {
  const res = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  return res.Body!.transformToByteArray();
}

async function putJson(
  key: string,
  body: string,
  cacheControl: string,
): Promise<void> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: "application/json; charset=utf-8",
      CacheControl: cacheControl,
    }),
  );
}

async function runPool(
  items: string[],
  worker: (item: string) => Promise<void>,
): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        await worker(items[next++]);
      }
    }),
  );
}

console.log(`Listing s3://${config.bucket}/${config.prefix}...`);
const objects = await listBucket();
const recKeys = [...objects.keys()]
  .filter(
    (k) =>
      k.endsWith(".rec") &&
      (!values.filter || path.basename(k).includes(values.filter)),
  )
  .sort();
const sidecarKeys = new Set(
  [...objects.keys()].filter((k) => k.endsWith(".rec.json")),
);
console.log(
  `${recKeys.length} demos, ${sidecarKeys.size} existing sidecars` +
    `${dryRun ? " (dry run — nothing will be written)" : ""}`,
);

const records: DemoMetadata[] = [];
let analyzed = 0;
let reused = 0;
let failed = 0;

/**
 * Does the bucket hold commentary audio for a demo — the unlabelled
 * `<key>.commentary.m4a` or any labelled `<key>.<label>.commentary.m4a`
 * (or the mp3 either was before the Opus switch)?
 * (The track LIST lives in the cast sidecar, appended to by the
 * generators; the record only carries the flag the demo browser shows.)
 */
function commentaryInBucket(key: string): boolean {
  const re = new RegExp(
    `^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(?:[A-Za-z0-9_-]+\\.)?commentary\\.(?:m4a|mp3)$`,
  );
  for (const k of objects.keys()) if (re.test(k)) return true;
  return false;
}

/** Reconcile the record's commentary flag against the bucket. Returns
 *  whether it changed. */
function reconcileCommentary(record: DemoMetadata, key: string): boolean {
  const hasCommentary = commentaryInBucket(key);
  if ((record.hasCommentary === true) === hasCommentary) return false;
  record.hasCommentary = hasCommentary;
  return true;
}

/** The flag changes after the demo is written, so records are cached
 *  with revalidation, not as immutable. */
const RECORD_CACHE_CONTROL = "no-cache";

await runPool(recKeys, async (key) => {
  const filename = path.basename(key);
  const sidecarKey = `${key}.json`;
  try {
    let existing: DemoMetadata | undefined;
    if (sidecarKeys.has(sidecarKey)) {
      const body = Buffer.from(await getObjectBytes(sidecarKey)).toString(
        "utf-8",
      );
      const raw = JSON.parse(body) as DemoMetadata;
      existing = raw;
      await backup(sidecarKey, body);
      if (
        !force &&
        Array.isArray(raw.games) &&
        (!playersOnly || raw.playerCount != null)
      ) {
        // Reconcile the commentary fields against the bucket listing —
        // the sidecar fields that change after the demo is written.
        if (!playersOnly && reconcileCommentary(raw, key)) {
          if (!dryRun) {
            await putJson(
              sidecarKey,
              JSON.stringify(raw, null, 2),
              RECORD_CACHE_CONTROL,
            );
          }
          console.log(
            `${dryRun ? "[dry-run] " : ""}${filename}: ` +
              `hasCommentary → ${raw.hasCommentary}`,
          );
        }
        records.push(raw);
        reused++;
        return;
      }
      // A sidecar from an older relay version (pre-`games` shape):
      // fall through to a full re-analysis instead of reshaping it —
      // the replay also recovers stream-authoritative server/gameType
      // and per-game data the old writer didn't record.
      if (!Array.isArray(raw.games))
        console.log(`${filename}: old-format sidecar — re-analyzing`);
    }
    const bytes = await getObjectBytes(key);
    const analyzedRecord = await analyzeDemo(bytes, filename);
    let record =
      playersOnly && existing
        ? {
            ...existing,
            players: analyzedRecord.players,
            playerCount: analyzedRecord.playerCount,
          }
        : analyzedRecord;
    if (!playersOnly) reconcileCommentary(record, key);
    if (!dryRun) {
      if (playersOnly) {
        record = await repairDemoPlayerMetadata(
          client,
          config.bucket,
          sidecarKey,
          record,
          backup,
        );
      } else {
        await putJson(
          sidecarKey,
          JSON.stringify(record, null, 2),
          RECORD_CACHE_CONTROL,
        );
      }
    }
    records.push(record);
    analyzed++;
    const gameSummary =
      record.games?.map((g) => `${g.mission} (${g.gameType})`).join(", ") ||
      "no started games";
    console.log(
      `${dryRun ? "[dry-run] " : ""}${filename}: ` +
        `${gameSummary} on ${record.server}, ` +
        `${Math.round(record.durationMs / 1000)}s, ` +
        `${record.playerCount} players (${record.players.length} names` +
        `${existing ? `; previously displayed ${existing.playerCount ?? existing.players.length}` : ""})`,
    );
  } catch (err) {
    failed++;
    console.error(`FAILED ${filename}: ${String(err)}`);
  }
});

records.sort(
  (a, b) =>
    a.recordedAt.localeCompare(b.recordedAt) ||
    a.filename.localeCompare(b.filename),
);
const indexKey = `${config.prefix}index.json`;
if (failed > 0) {
  // A partial rebuild would silently drop the failed demos from the
  // index (their sidecars survive, but nothing re-adds them until a
  // run where every fetch succeeds). Keep the existing index instead.
  console.error(
    `NOT writing ${indexKey}: ${failed} demo(s) failed — fix and re-run`,
  );
} else if (recKeys.length === 0) {
  // An empty listing is more likely a wrong DEMO_R2_PREFIX than a
  // genuinely empty bucket — never clobber a good index with [].
  console.error(`NOT writing ${indexKey}: no demos found under prefix`);
} else if (dryRun) {
  console.log(
    playersOnly
      ? `[dry-run] Would update player metadata for ${records.length} entries in ${indexKey}`
      : `[dry-run] Would write ${indexKey} with ${records.length} entries`,
  );
} else {
  if (playersOnly) {
    // Merge onto the latest index, including recordings uploaded during the scan.
    // Conditional writes retry if another uploader publishes between GET and PUT.
    const repaired = new Map(
      records.map((record) => [record.filename, record]),
    );
    for (let attempt = 0; ; attempt++) {
      const current = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: indexKey }),
      );
      const body = await current.Body!.transformToString();
      const index: DemoMetadata[] = JSON.parse(body);
      if (!Array.isArray(index) || !current.ETag)
        throw new Error("Invalid current demo index");
      await backup(indexKey, body);
      const merged = index.map((entry) => {
        const repair = repaired.get(entry.filename);
        return repair
          ? {
              ...entry,
              players: repair.players,
              playerCount: repair.playerCount,
            }
          : entry;
      });
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: indexKey,
            Body: JSON.stringify(merged),
            ContentType: "application/json; charset=utf-8",
            CacheControl: "no-cache",
            IfMatch: current.ETag,
          }),
        );
        break;
      } catch (error) {
        if (
          attempt >= 4 ||
          !(error instanceof Error) ||
          error.name !== "PreconditionFailed"
        )
          throw error;
      }
    }
  } else {
    await putJson(indexKey, JSON.stringify(records), "no-cache");
  }
  console.log(
    playersOnly
      ? `Updated player metadata for ${records.length} entries in ${indexKey}`
      : `Wrote ${indexKey} with ${records.length} entries`,
  );
}
console.log(
  `Done: ${analyzed} analyzed, ${reused} sidecars reused, ${failed} failed`,
);
if (failed > 0) process.exitCode = 1;
