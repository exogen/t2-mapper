/**
 * Upgrade the relay recordings in the demo bucket to the files today's
 * relay writes (scripts/lib/upgradeRelayDemo.ts), in two steps:
 *
 * - `prepare` converts every demo into the work directory and checks each
 *   result (validateRelayDemoUpgrade.ts); a demo already current must play
 *   in Tribes2.exe as it is. It writes nothing to the bucket. Originals
 *   come from a backup mirror (backup-demo-bucket.ts) when it holds the
 *   version the bucket has, else from the bucket (and are kept in
 *   originals/).
 * - `apply` uploads each prepared demo that changed and passed its checks,
 *   only over the version it was made from, updates its sidecar and index
 *   entry to match, and purges both from the Cloudflare edge cache. By
 *   default it holds back demos whose cast or commentary sidecars would
 *   drift: the cut and the dropped ticks move the demo's clock.
 *
 * Both resume where they stopped; a result made by other converter code is
 * prepared again, and an applied demo is never prepared again. Seek
 * checkpoints of replaced demos are regenerated afterwards by
 * demos:backfill-checkpoints.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { DemoMetadata } from "../relay/demoRecorder.js";
import { updateDemoIndex } from "../relay/demoIndexStorage.js";
import { DEMO_TICK_MS } from "../relay/demoWriter.js";
import { unquoteEtag } from "../relay/objectEtag.js";
import { PURGE_BATCH_SIZE, purgeBatch } from "./lib/cloudflarePurge.js";
import { listAllObjects, r2Client } from "./lib/r2.js";
import { playLikeTribes2 } from "./lib/tribes2Playback.js";
import {
  formatDemoTime,
  upgradeRelayDemo,
  upgradedTimeMs,
  type RelayDemoUpgrade,
} from "./lib/upgradeRelayDemo.js";
import {
  playbackProblems,
  validateRelayDemoUpgrade,
} from "./lib/validateRelayDemoUpgrade.js";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    work: { type: "string" },
    mirror: { type: "string" },
    jobs: { type: "string", default: "1" },
    shard: { type: "string" },
    filter: { type: "string" },
    skip: { type: "string" },
    force: { type: "boolean", default: false },
    timed: { type: "string", default: "hold" },
    "no-purge": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});
const command = positionals[0];
if (
  values.help ||
  !values.work ||
  (command !== "prepare" && command !== "apply") ||
  (values.timed !== "hold" && values.timed !== "all")
) {
  console.log(
    [
      "Usage: npm run demos:migrate -- prepare --work=DIR [--mirror=DIR] [--jobs=N] [--filter=TEXT] [--skip=A,B] [--force]",
      "       npm run demos:migrate -- apply --work=DIR [--filter=TEXT] [--skip=A,B] [--timed=hold|all] [--no-purge]",
      "",
      "  --work=DIR      Upgraded demos and per-demo results (results/<name>.json)",
      "  --mirror=DIR    prepare: a demos:backup mirror to read originals from",
      "  --jobs=N        prepare: parallel worker processes (default: 1)",
      "  --filter=TEXT   Only demos whose key contains TEXT",
      "  --skip=A,B      Leave out demos whose key contains any of these",
      "  --force         prepare: redo demos already prepared (never applied ones)",
      "  --timed=MODE    apply: hold (default) skips demos whose cast/commentary",
      "                  would drift by over 250 ms; all applies them too",
      "  --no-purge      apply: skip the Cloudflare purge (needs CLOUDFLARE_ZONE_ID",
      "                  and CLOUDFLARE_API_TOKEN otherwise)",
    ].join("\n"),
  );
  process.exit(values.help ? 0 : 1);
}
const workDir = path.resolve(values.work);
const upgradedDir = path.join(workDir, "upgraded");
const resultsDir = path.join(workDir, "results");
const originalsDir = path.join(workDir, "originals");

/**
 * Public base URL of the bucket's demo prefix, for the edge purge.
 */
const DEMOS_BASE_URL = (
  process.env.DEMOS_BASE_URL || "https://demos.tribes2.online/demos"
).replace(/\/+$/, "");

/**
 * One demo's progress through the migration.
 */
interface MigrationResult {
  key: string;
  filename: string;
  /**
   * The bucket version it was prepared from.
   */
  etag: string;
  bytes: number;
  /**
   * The converter code that prepared it (converterVersion).
   */
  converter: string;
  status: "unchanged" | "ready" | "failed";
  /**
   * Cast or commentary sidecars, which are timed on the demo's clock.
   */
  timed: { cast: boolean; commentary: boolean };
  report?: RelayDemoUpgrade;
  problems?: string[];
  error?: string;
  upgraded?: { bytes: number; md5: string; sha256: string };
  applied?: { etag: string; at: string; sidecar: boolean; purged: boolean };
}

/**
 * Where the code an upgraded file and its verdict come from: these modules
 * and every module they import, followed through relative imports, plus
 * the demo parser. A result made by any other version of them is prepared
 * again.
 */
const CONVERTER_ENTRIES = [
  "scripts/lib/analyzeDemo.ts",
  "scripts/lib/tribes2Playback.ts",
  "scripts/lib/upgradeRelayDemo.ts",
  "scripts/lib/validateRelayDemoUpgrade.ts",
];

async function converterVersion(): Promise<string> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const isFile = (file: string) =>
    fs.stat(path.join(root, file)).then(
      (stat) => stat.isFile(),
      () => false,
    );
  const files = new Set<string>();
  const visit = async (file: string): Promise<void> => {
    if (files.has(file)) return;
    files.add(file);
    const source = await fs.readFile(path.join(root, file), "utf8");
    for (const [, spec] of source.matchAll(
      /(?:from|import\s*\()\s*["'](\.{1,2}\/[^"']+)["']/g,
    )) {
      const base = path.join(path.dirname(file), spec);
      const stem = base.replace(/\.js$/, "");
      for (const candidate of [
        base,
        `${stem}.ts`,
        `${stem}.tsx`,
        path.join(stem, "index.ts"),
      ]) {
        if (path.extname(candidate) && (await isFile(candidate))) {
          await visit(candidate);
          break;
        }
      }
    }
  };
  for (const entry of CONVERTER_ENTRIES) await visit(entry);
  const parserDist = "node_modules/t2-demo-parser/dist";
  for (const file of await fs.readdir(path.join(root, parserDist), {
    recursive: true,
  }))
    if (file.endsWith(".js")) files.add(path.join(parserDist, file));
  files.add("node_modules/t2-demo-parser/package.json");
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(file);
    hash.update(await fs.readFile(path.join(root, file)));
  }
  return hash.digest("hex").slice(0, 16);
}

const resultPath = (filename: string) =>
  path.join(resultsDir, `${filename}.json`);

async function readResult(filename: string): Promise<MigrationResult | null> {
  try {
    return JSON.parse(await fs.readFile(resultPath(filename), "utf8"));
  } catch {
    return null;
  }
}

async function writeResult(result: MigrationResult): Promise<void> {
  const file = resultPath(result.filename);
  await fs.writeFile(`${file}.tmp`, JSON.stringify(result, null, 1));
  await fs.rename(`${file}.tmp`, file);
}

/**
 * A stable shard for a key, whatever else the listing holds.
 */
function shardOf(key: string, shards: number): number {
  return (
    parseInt(createHash("md5").update(key).digest("hex").slice(0, 8), 16) %
    shards
  );
}

/**
 * How far a cast or commentary may fall behind its demo (the cut and the
 * dropped ticks move the demo's clock) before apply holds the demo back.
 */
const TIMED_DRIFT_TOLERANCE_MS = 250;

/**
 * Whether apply holds a demo back: its cast or commentary would drift.
 */
const drifts = (result: MigrationResult) =>
  (result.timed.cast || result.timed.commentary) &&
  !!result.report &&
  result.report.cutMs + result.report.droppedTicks * DEMO_TICK_MS >
    TIMED_DRIFT_TOLERANCE_MS;

const { client, config } = r2Client("npm run demos:migrate");
const listing = await listAllObjects(client, config);
const skip = (values.skip ?? "").split(",").filter(Boolean);
const demos = listing.filter(
  ({ key }) =>
    key.endsWith(".rec") &&
    !key.slice(config.prefix.length).includes("/") &&
    (!values.filter || key.includes(values.filter)) &&
    !skip.some((text) => key.includes(text)),
);
const timedKeys = new Map<string, { cast: boolean; commentary: boolean }>();
for (const { key } of listing) {
  const match = key.match(/^(.*\.rec)\.(cast\.json|(?:.+\.)?commentary\.\w+)$/);
  if (!match) continue;
  const timed = timedKeys.get(match[1]) ?? { cast: false, commentary: false };
  if (match[2] === "cast.json") timed.cast = true;
  else timed.commentary = true;
  timedKeys.set(match[1], timed);
}
await fs.mkdir(upgradedDir, { recursive: true });
await fs.mkdir(resultsDir, { recursive: true });

if (command === "prepare") await prepare();
else await apply();

async function prepare(): Promise<void> {
  const jobs = Number(values.jobs);
  if (!Number.isSafeInteger(jobs) || jobs < 1) {
    console.error("--jobs must be a positive integer");
    process.exit(1);
  }
  if (jobs > 1 && !values.shard) {
    // One worker process per shard: the conversion is CPU-bound.
    const args = [
      process.argv[1],
      "prepare",
      `--work=${workDir}`,
      ...(values.mirror ? [`--mirror=${path.resolve(values.mirror)}`] : []),
      ...(values.filter ? [`--filter=${values.filter}`] : []),
      ...(values.skip ? [`--skip=${values.skip}`] : []),
      ...(values.force ? ["--force"] : []),
    ];
    const exits = await Promise.all(
      Array.from(
        { length: jobs },
        (_, shard) =>
          new Promise<number | null>((resolve) =>
            spawn(
              process.execPath,
              [...process.execArgv, ...args, `--shard=${shard}/${jobs}`],
              { stdio: "inherit" },
            ).on("exit", resolve),
          ),
      ),
    );
    await summarize();
    if (exits.some((code) => code !== 0)) process.exitCode = 1;
    return;
  }

  const converter = await converterVersion();
  const [shard, shards] = (values.shard ?? "0/1").split("/").map(Number);
  const mirror = new Map<string, { etag: string; size: number }>();
  if (values.mirror) {
    const manifest = JSON.parse(
      await fs.readFile(path.join(values.mirror, "manifest.json"), "utf8"),
    ) as { objects: { key: string; etag: string; size: number }[] };
    for (const object of manifest.objects) mirror.set(object.key, object);
  }

  for (const { key, etag: listedEtag, size } of demos) {
    if (shardOf(key, shards) !== shard) continue;
    const filename = path.basename(key);
    const etag = unquoteEtag(listedEtag);
    const previous = await readResult(filename);
    // An applied demo's record is the migration's: apply checks it.
    if (previous?.applied) continue;
    if (
      previous &&
      previous.etag === etag &&
      previous.converter === converter &&
      !values.force
    )
      continue;
    const result: MigrationResult = {
      key,
      filename,
      etag,
      bytes: size,
      converter,
      status: "failed",
      timed: timedKeys.get(key) ?? { cast: false, commentary: false },
    };
    try {
      const backedUp = mirror.get(key);
      let original: Uint8Array;
      if (values.mirror && backedUp?.etag === etag && backedUp.size === size) {
        original = new Uint8Array(
          await fs.readFile(path.join(values.mirror, key)),
        );
      } else {
        // Newer than the backup: keep the original beside its upgrade.
        original = await download(key, etag);
        await fs.mkdir(originalsDir, { recursive: true });
        await fs
          .writeFile(path.join(originalsDir, filename), original, {
            flag: "wx",
          })
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code !== "EEXIST") throw error;
          });
      }
      const output = path.join(upgradedDir, filename);
      await fs.rm(output, { force: true });
      const report = await upgradeRelayDemo(original, output);
      result.report = report;
      if (report.generation === "current" && report.gameOversRewritten === 0) {
        result.problems = playbackProblems(await playLikeTribes2(original));
        result.status = result.problems.length === 0 ? "unchanged" : "failed";
      } else {
        const upgraded = new Uint8Array(await fs.readFile(output));
        result.upgraded = {
          bytes: upgraded.length,
          md5: createHash("md5").update(upgraded).digest("hex"),
          sha256: createHash("sha256").update(upgraded).digest("hex"),
        };
        const { problems } = await validateRelayDemoUpgrade(
          original,
          upgraded,
          report,
          filename,
        );
        result.problems = problems;
        result.status = problems.length === 0 ? "ready" : "failed";
      }
    } catch (error) {
      result.error = String(error);
    }
    await writeResult(result);
    console.log(
      `${filename}: ${result.status}` +
        (result.report ? ` (${result.report.generation})` : "") +
        (result.error ? ` — ${result.error}` : "") +
        (result.problems?.length ? ` — ${result.problems.join("; ")}` : ""),
    );
  }
  if (!values.shard) await summarize();
}

async function download(key: string, etag: string): Promise<Uint8Array> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      IfMatch: `"${etag}"`,
    }),
  );
  return response.Body!.transformToByteArray();
}

async function summarize(): Promise<void> {
  const converter = await converterVersion();
  const results = (
    await Promise.all(demos.map(({ key }) => readResult(path.basename(key))))
  ).filter((result): result is MigrationResult => result !== null);
  const count = (status: MigrationResult["status"]) =>
    results.filter((result) => result.status === status).length;
  const generations = new Map<string, number>();
  for (const { report } of results)
    if (report)
      generations.set(
        report.generation,
        (generations.get(report.generation) ?? 0) + 1,
      );
  const stale = results.filter(
    (result) => !result.applied && result.converter !== converter,
  ).length;
  console.log(
    `\n${results.length}/${demos.length} prepared: ${count("ready")} ready, ` +
      `${count("unchanged")} unchanged, ${count("failed")} failed` +
      (stale ? `; ${stale} by other converter code` : "") +
      `; ${results.filter((result) => result.applied).length} applied`,
  );
  console.log(
    `  generations: ${JSON.stringify(Object.fromEntries(generations))}`,
  );
  for (const result of results) {
    const { report } = result;
    if (result.status !== "failed" && !drifts(result)) continue;
    console.log(
      `  ${result.filename}: ${result.status}` +
        (report
          ? `, ${formatDemoTime(report.oldLengthMs)} → ${formatDemoTime(report.newLengthMs)}, cut ${report.cutMs} ms` +
            (report.droppedTicks
              ? `, ${formatDemoTime(report.droppedTicks * DEMO_TICK_MS)} dropped`
              : "")
          : "") +
        (result.timed.commentary
          ? ", has commentary"
          : result.timed.cast
            ? ", has cast"
            : "") +
        (result.error ? `, ERROR: ${result.error}` : "") +
        (result.problems?.length
          ? `, PROBLEMS: ${result.problems.join("; ")}`
          : ""),
    );
  }
}

async function apply(): Promise<void> {
  const purge = !values["no-purge"];
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (purge && (!zoneId || !apiToken)) {
    console.error(
      "CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN must be set to purge replaced demos (or pass --no-purge).",
    );
    process.exit(1);
  }
  const converter = await converterVersion();

  const failures: string[] = [];
  const held: string[] = [];
  let pendingIndex: MigrationResult[] = [];
  let pendingPurge: MigrationResult[] = [];
  let applied = 0;

  // A failed flush is reported as its own: every applied demo's record is
  // patched again, and an unpurged one purged, the next time apply runs.
  const flushIndex = async () => {
    if (pendingIndex.length === 0) return;
    const byName = new Map(pendingIndex.map((r) => [r.filename, r]));
    pendingIndex = [];
    try {
      await updateDemoIndex(
        client,
        config.bucket,
        `${config.prefix}index.json`,
        (entries) => {
          if (!entries) return undefined;
          let changed = false;
          const merged = entries.map((entry) => {
            const result = byName.get(entry.filename);
            const patched = result ? patchRecord(entry, result) : entry;
            if (patched !== entry) changed = true;
            return patched;
          });
          return changed ? merged : undefined;
        },
        (_key, body) =>
          fs.writeFile(
            path.join(workDir, `index-before-${Date.now()}.json`),
            body,
          ),
      );
    } catch (error) {
      failures.push(`index update for ${byName.size} demos: ${String(error)}`);
    }
  };
  const flushPurge = async () => {
    if (pendingPurge.length === 0) return;
    const batch = pendingPurge;
    pendingPurge = [];
    try {
      if (purge)
        await purgeBatch(
          zoneId!,
          apiToken!,
          batch.flatMap(({ filename }) => {
            const url = `${DEMOS_BASE_URL}/${encodeURIComponent(filename)}`;
            return [url, `${url}.json`];
          }),
        );
      for (const result of batch) {
        result.applied!.purged = purge;
        await writeResult(result);
      }
    } catch (error) {
      failures.push(`purge of ${batch.length} demos: ${String(error)}`);
    }
  };

  try {
    for (const { key } of demos) {
      const filename = path.basename(key);
      const result = await readResult(filename);
      if (!result || !result.upgraded || !result.report) continue;
      if (result.status !== "ready" && !result.applied) continue;
      try {
        if (!result.applied && result.converter !== converter) {
          failures.push(
            `${filename}: prepared by other converter code; prepare again`,
          );
          continue;
        }
        if (!result.applied && values.timed === "hold" && drifts(result)) {
          held.push(filename);
          continue;
        }
        const head = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        const current = unquoteEtag(head.ETag);
        if (result.applied && current !== result.applied.etag) {
          if (current !== result.etag) {
            failures.push(
              `${filename}: the bucket holds neither the original nor the upgrade`,
            );
            continue;
          }
          // Something put the original back: upload the upgrade again.
          console.log(`${filename}: reverted since apply; applying again`);
          result.applied = undefined;
        }
        if (!result.applied) {
          if (current !== result.etag && current !== result.upgraded.md5) {
            failures.push(
              `${filename}: the bucket's copy changed since prepare`,
            );
            continue;
          }
          const body = new Uint8Array(
            await fs.readFile(path.join(upgradedDir, filename)),
          );
          if (
            createHash("sha256").update(body).digest("hex") !==
            result.upgraded.sha256
          )
            throw new Error("the upgraded file differs from the one prepared");
          if (current === result.etag) {
            await client.send(
              new PutObjectCommand({
                Bucket: config.bucket,
                Key: key,
                Body: body,
                ContentType: head.ContentType,
                CacheControl: head.CacheControl,
                Metadata: head.Metadata,
                IfMatch: head.ETag,
              }),
            );
          }
          const uploaded = await client.send(
            new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
          );
          if (
            uploaded.ContentLength !== result.upgraded.bytes ||
            unquoteEtag(uploaded.ETag) !== result.upgraded.md5
          )
            throw new Error("the bucket's copy does not match after upload");
          result.applied = {
            etag: result.upgraded.md5,
            at: new Date().toISOString(),
            sidecar: false,
            purged: false,
          };
          await writeResult(result);
          applied++;
          console.log(
            `${filename}: applied, ${result.bytes} → ${result.upgraded.bytes} bytes`,
          );
        }
        if (!result.applied.sidecar) {
          result.applied.sidecar = await patchSidecar(`${key}.json`, result);
          await writeResult(result);
        }
        pendingIndex.push(result);
        if (!result.applied.purged) pendingPurge.push(result);
        if (pendingPurge.length * 2 >= PURGE_BATCH_SIZE) await flushPurge();
        if (pendingIndex.length >= 25) await flushIndex();
      } catch (error) {
        failures.push(`${filename}: ${String(error)}`);
      }
    }
  } finally {
    await flushIndex();
    await flushPurge();
  }

  console.log(`\nApplied ${applied} demos in this run`);
  if (held.length > 0)
    console.log(
      `Held back ${held.length} demos whose cast/commentary would drift (--timed=all applies them):\n  ${held.join("\n  ")}`,
    );
  if (failures.length > 0) {
    console.log(`FAILED ${failures.length}:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

/**
 * A demo's record with the upgraded file's size and length, and its games'
 * starts on the upgraded clock; the record itself once it has them.
 */
function patchRecord(
  record: DemoMetadata,
  result: MigrationResult,
): DemoMetadata {
  const { upgraded, report } = result;
  if (
    !upgraded ||
    !report ||
    (record.bytes === upgraded.bytes &&
      record.durationMs === report.newLengthMs)
  )
    return record;
  return {
    ...record,
    bytes: upgraded.bytes,
    durationMs: report.newLengthMs,
    games: record.games.map((game) => ({
      ...game,
      startMs: upgradedTimeMs(report, game.startMs),
    })),
  };
}

/**
 * Update a demo's sidecar like its index entry, keeping its headers;
 * false when the demo has none.
 */
async function patchSidecar(
  key: string,
  result: MigrationResult,
): Promise<boolean> {
  let response;
  try {
    response = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return false;
    throw error;
  }
  const body = await response.Body!.transformToString();
  const record = JSON.parse(body) as DemoMetadata;
  const patched = patchRecord(record, result);
  if (patched === record) return true;
  await fs.mkdir(path.join(workDir, "sidecars-before"), { recursive: true });
  await fs
    .writeFile(
      path.join(workDir, "sidecars-before", path.basename(key)),
      body,
      { flag: "wx" },
    )
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: JSON.stringify(patched, null, 2),
      ContentType: response.ContentType,
      CacheControl: response.CacheControl,
      Metadata: response.Metadata,
      IfMatch: response.ETag,
    }),
  );
  return true;
}
