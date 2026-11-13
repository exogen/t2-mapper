/** Compute private player stats sidecars for demos already in R2. */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { isPublishedDemoKey } from "../relay/demoKeys.js";
import { DEMO_STATS_VERSION } from "../relay/demoPlayerStatsModel.js";
import {
  DEMO_STATS_SUFFIX,
  readCurrentDemoStats,
  runDemoStatsProcess,
} from "../relay/demoStats.js";
import type { DemoUploadConfig } from "../relay/demoUpload.js";
import {
  PrivateDemoStore,
  loadPrivateDemoStorageConfig,
} from "../relay/privateDemoStore.js";
import { ASSET_BASE_DIR } from "../src/resourcePaths";
import { listAllObjects, r2Client } from "./lib/r2.js";

const { values } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    prune: { type: "boolean", default: false },
    concurrency: { type: "string", default: "4" },
    filter: { type: "string" },
    "asset-root": { type: "string", default: ASSET_BASE_DIR },
    manifest: { type: "string", default: "src/manifest.json" },
    help: { type: "boolean", default: false },
  },
});
if (values.help) {
  console.log(
    [
      "Usage: npm run demos:backfill-stats -- [options]",
      "",
      `Writes <demo>${DEMO_STATS_SUFFIX} (player stats by GUID) to DEMO_PRIVATE_R2_BUCKET for`,
      `every published recording without current (version ${DEMO_STATS_VERSION}) stats, newest first.`,
      "Each demo is replayed in a worker process.",
      "",
      "  --filter=TEXT          Case-sensitive substring of the full R2 key, including the demo filename",
      "  --force                Recompute current stats too",
      "  --prune                Delete stats whose recording is no longer in the demo bucket",
      "  --dry-run              List the work without writing or deleting anything",
      "  --concurrency=N        Worker processes at once (default: 4)",
      `  --asset-root=PATH      Game files holding the station shapes (default: ${ASSET_BASE_DIR})`,
      "  --manifest=PATH        Resource manifest (default: src/manifest.json)",
      "",
      "DEMO_CHECKPOINT_HEAP_MB sets each worker's old-space heap cap in MiB (default: 256).",
    ].join("\n"),
  );
  process.exit(0);
}
const concurrency = Number(values.concurrency);
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  console.error("--concurrency must be a positive integer");
  process.exit(1);
}

const { client, config } = r2Client("npm run demos:backfill-stats");
let privateConfig: DemoUploadConfig | null;
try {
  privateConfig = loadPrivateDemoStorageConfig();
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
if (!privateConfig) {
  console.error("Missing DEMO_PRIVATE_R2_BUCKET.");
  process.exit(1);
}
const store = new PrivateDemoStore(privateConfig);
const assetRoot = path.resolve(values["asset-root"]);
const manifest = path.resolve(values.manifest);

// Published recordings only, newest first; external-source caches are not
// part of the gallery.
const recordings = (await listAllObjects(client, config))
  .map(({ key, lastModified, etag }) => ({
    key,
    demoKey: key.slice(config.prefix.length),
    at: lastModified?.getTime() ?? 0,
    etag,
  }))
  .filter(({ demoKey }) => isPublishedDemoKey(demoKey))
  .sort((a, b) => b.at - a.at);
const existing = await store.listDemoKeys(DEMO_STATS_SUFFIX);
const sourceETags = new Map(
  recordings.map(({ demoKey, etag }) => [demoKey, etag]),
);

const current = new Set<string>();
if (!values.force) {
  let next = 0;
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (next < existing.length) {
        const demoKey = existing[next++];
        // An unreadable sidecar is simply recomputed.
        const value = await store
          .read(demoKey, DEMO_STATS_SUFFIX)
          .catch(() => null);
        if (readCurrentDemoStats(value, sourceETags.get(demoKey)))
          current.add(demoKey);
      }
    }),
  );
}

const demos = recordings.filter(
  ({ key }) => !values.filter || key.includes(values.filter),
);
const todo = demos.filter(({ demoKey }) => !current.has(demoKey));
const counts = {
  written: 0,
  current: demos.length - todo.length,
  planned: 0,
  pruned: 0,
  failed: 0,
};

if (values["dry-run"]) {
  for (const { key } of todo)
    console.log(JSON.stringify({ key, action: "write" }));
  counts.planned += todo.length;
} else {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
      while (next < todo.length) {
        const { key, demoKey } = todo[next++];
        const started = performance.now();
        const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "demo-stats-"));
        try {
          const object = await client.send(
            new GetObjectCommand({ Bucket: config.bucket, Key: key }),
            { abortSignal: AbortSignal.timeout(5 * 60_000) },
          );
          if (!object.Body) throw new Error("Demo has no body");
          const file = path.join(dir, "demo.rec");
          await pipeline(object.Body as Readable, fs.createWriteStream(file));
          const stats = await runDemoStatsProcess(file, assetRoot, manifest);
          const source = await client.send(
            new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
            { abortSignal: AbortSignal.timeout(30_000) },
          );
          if (object.ETag && source.ETag && object.ETag !== source.ETag)
            throw new Error(
              "Demo changed during stats computation; stale stats were not written",
            );
          await store.put(demoKey, DEMO_STATS_SUFFIX, {
            ...stats,
            ...(object.ETag && { sourceETag: object.ETag }),
          });
          counts.written++;
          console.log(
            JSON.stringify({
              key,
              result: "written",
              players: Object.keys(stats.statsByGuid).length,
              sec: Math.round((performance.now() - started) / 100) / 10,
            }),
          );
        } catch (error) {
          counts.failed++;
          console.error(key, error);
        } finally {
          await fsp.rm(dir, { recursive: true, force: true });
        }
      }
    }),
  );
}

if (values.prune) {
  const published = new Set(recordings.map(({ demoKey }) => demoKey));
  for (const demoKey of existing) {
    if (published.has(demoKey)) continue;
    if (values["dry-run"]) {
      counts.planned++;
      console.log(JSON.stringify({ demoKey, action: "prune" }));
      continue;
    }
    try {
      await store.delete(demoKey, DEMO_STATS_SUFFIX);
      counts.pruned++;
      console.log(JSON.stringify({ demoKey, result: "pruned" }));
    } catch (error) {
      counts.failed++;
      console.error(demoKey, error);
    }
  }
}

console.log(JSON.stringify({ demos: demos.length, ...counts }));
if (counts.failed) process.exitCode = 1;
