/**
 * Uploads the game assets to R2 with the right headers on every object.
 *
 * `aws s3 sync` takes one Content-Type per invocation, so this runs one
 * sync per content type, driven by `scripts/lib/assetMetadata.ts` — the
 * same table the backfill uses, so an object's headers do not depend on
 * which one wrote it. Files the map tool never uses (.DS_Store, Thumbs.db)
 * are excluded, matching what `add-vl2` refuses to extract.
 *
 * Every pass writes its output to the report file that
 * `purge-changed-assets.ts` reads, so the edge purge still sees the whole
 * change list.
 *
 *   tsx scripts/sync-assets.ts --bucket s3://t2-assets/game/base/ \
 *     [--source docs/base] [--report r2-sync-output.txt] [--dry-run]
 *     [--allow-unknown] [--plan]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { assetIgnoreList } from "./lib/assetIgnore.js";
import {
  ASSET_CACHE_CONTROL,
  groupByContentType,
  knownExtensions,
  PRECOMPRESSED_CONTENT_ENCODING,
  precompressedMetadataFor,
  strandedKeys,
} from "./lib/assetMetadata.js";
import {
  compressAll,
  orphanedSiblings,
  precompressionTargets,
  shouldPrecompress,
} from "./lib/precompress.js";
import { arg, flag } from "./lib/args.js";

const sourceDir = (arg("source") ?? "docs/base").replace(/\/*$/, "/");
const bucket = arg("bucket");
const reportFile = arg("report");
const dryRun = flag("dry-run");
/** Print the grouping and exit, without needing the aws CLI at all. */
const planOnly = flag("plan");
const allowUnknown = flag("allow-unknown");
/** Skip the brotli sibling pass (see lib/precompress.ts). */
const noPrecompress = flag("no-precompress");
/**
 * Allow a prune that removes an unusually large share of the bucket. The
 * guard exists so a truncated checkout cannot empty R2 in one run.
 */
const allowLargePrune = flag("allow-large-prune");

/**
 * Fraction of the bucket a prune may remove before it needs waving through.
 * Declared here, not beside the function: this module runs at top level, so
 * a const below the call site is still in its temporal dead zone when the
 * prune runs.
 */
const LARGE_PRUNE_FRACTION = 0.2;

if (!bucket) {
  console.error(
    "Usage: tsx scripts/sync-assets.ts --bucket s3://bucket/prefix/ [--source dir] [--report file] [--dry-run] [--allow-unknown]",
  );
  process.exit(1);
}

/** Every file under `source`, as paths relative to it. */
async function listAssets(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...(await listAssets(path.join(dir, entry.name), rel)));
    } else {
      out.push(rel);
    }
  }
  return out;
}

const all = await listAssets(sourceDir);
const excluded = all.filter((p) => assetIgnoreList.ignores(p));
const uploadable = all.filter((p) => !assetIgnoreList.ignores(p));
const { groups, unknown } = groupByContentType(uploadable);

console.log(
  `${all.length} files under ${sourceDir}: ${uploadable.length} eligible, ` +
    `${excluded.length} excluded. Each pass uploads only the eligible files ` +
    "whose size or timestamp differs from the bucket.",
);

if (unknown.size > 0) {
  console.error(
    `\n${unknown.size} extension(s) have no Content-Type in scripts/lib/assetMetadata.ts:`,
  );
  for (const [ext, examples] of unknown) {
    console.error(`  ${ext}  e.g. ${examples.join(", ")}`);
  }
  console.error(
    `\nAdd them to the table (known: ${knownExtensions().join(" ")}),\n` +
      "or add them to assetIgnoreList if they should not ship.\n" +
      "Re-run with --allow-unknown to sync everything else meanwhile.",
  );
  if (!allowUnknown) process.exit(1);
}

/**
 * `aws s3 sync` applies filters in order, so an exclude-all followed by
 * one include per extension selects exactly this group. `--delete` is
 * scoped by the same filters, so each pass prunes only its own
 * extensions' orphans; together the passes cover every typed object.
 */
function syncArgs(contentType: string, extensions: string[]): string[] {
  const args = [
    "s3",
    "sync",
    sourceDir,
    bucket!,
    "--follow-symlinks",
    "--delete",
    "--no-progress",
    "--content-type",
    contentType,
    "--cache-control",
    ASSET_CACHE_CONTROL,
    "--exclude",
    "*",
  ];
  for (const ext of extensions) args.push("--include", `*${ext}`);
  // The CLI walks the source tree itself, so the files assetIgnoreList
  // rejects have to be named here too — otherwise one with a typed
  // extension (README.md) would upload despite the plan excluding it.
  for (const rel of excluded) args.push("--exclude", rel);
  if (dryRun) args.push("--dryrun");
  return args;
}

if (planOnly) {
  console.log("\nPlan (one `aws s3 sync` pass per content type):");
  for (const [contentType, extensions] of [...groups].sort()) {
    const list = [...extensions].sort();
    const count = uploadable.filter((p) =>
      list.some((ext) => p.endsWith(ext)),
    ).length;
    console.log(
      `  ${contentType.padEnd(28)} ${String(count).padStart(6)} files  ${list.join(" ")}`,
    );
  }
  console.log(`  cache-control: ${ASSET_CACHE_CONTROL}`);
  const precompressable = uploadable.filter(shouldPrecompress).length;
  console.log(
    `  brotli siblings: ${precompressable} files would get a .br copy`,
  );
  process.exit(0);
}

const report: string[] = [];
let failed = false;

for (const [contentType, extensions] of [...groups].sort()) {
  const list = [...extensions].sort();
  console.log(`\n== ${contentType}  (${list.join(" ")})`);
  const result = spawnSync("aws", syncArgs(contentType, list), {
    encoding: "utf8",
  });
  if (result.error) {
    console.error(`Could not run the aws CLI: ${result.error.message}`);
    process.exit(1);
  }
  if (result.stdout) {
    process.stdout.write(result.stdout);
    report.push(result.stdout);
  }
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    console.error(`aws s3 sync failed for ${contentType} (${result.status})`);
    failed = true;
    break;
  }
}

// The brotli pass runs BEFORE the report is written and appends its own
// uploads to it. A changed shape and its .br sibling have to be purged
// together, or the edge keeps serving the old compressed copy to every
// client that accepts brotli.
if (!failed) await pruneStrandedObjects();
if (!failed && !noPrecompress) await syncBrotliSiblings();

// Written even when empty: a sync that uploads nothing is the normal case
// on a deploy that changed no assets, and the purge step reads this file
// unconditionally. Skipping the write is how that step once failed with
// ENOENT on a no-op deploy.
if (reportFile) {
  await fs.writeFile(reportFile, report.join(""), "utf8");
  console.log(`\nWrote the change list to ${reportFile}.`);
}

if (failed) process.exit(1);

if (excluded.length > 0) {
  console.log(`\nExcluded from the sync (${excluded.length}):`);
  for (const p of excluded.slice(0, 20)) console.log(`  ${p}`);
  if (excluded.length > 20) console.log(`  … and ${excluded.length - 20} more`);
  console.log(
    "These were never uploaded by this script. Objects already in the\n" +
      "bucket from an earlier sync stay until removed by hand.",
  );
}

/**
 * Every object already under the bucket prefix, as keys relative to it, or
 * null if the listing failed. Null has to stay distinct from empty: treating
 * a failed listing as "no keys" makes every sibling look missing and
 * recompresses the entire corpus, and makes every sibling look live so no
 * orphan is ever collected.
 */
function listBucketKeys(): Set<string> | null {
  const result = spawnSync("aws", ["s3", "ls", bucket!, "--recursive"], {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(`aws s3 ls: ${result.error.message}`);
    if (result.stderr) process.stderr.write(result.stderr);
    return null;
  }
  const prefix = new URL(bucket!).pathname.replace(/^\/+/, "");
  const keys = new Set<string>();
  for (const line of result.stdout.split("\n")) {
    // "2026-09-08 20:38:29     221661 game/base/shapes/x.dts"
    const match = line.match(/^\S+\s+\S+\s+\d+\s+(.+)$/);
    if (!match) continue;
    const key = match[1];
    keys.add(prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key);
  }
  return keys;
}

/** The source-relative paths this run uploaded, read back from the report. */
function uploadedThisRun(): Set<string> {
  const uploaded = new Set<string>();
  for (const line of report.join("").split("\n")) {
    const match = line.match(/^upload:.* to (s3:\/\/\S+)$/);
    if (!match) continue;
    const destination = match[1].trim();
    if (destination.startsWith(bucket!)) {
      uploaded.add(destination.slice(bucket!.length));
    }
  }
  return uploaded;
}

/**
 * Write a brotli copy of every changed shape next to it in the bucket, as
 * `<name>.dts.br`. Nothing reads these unless an edge rule serves them, so
 * adding them is safe on its own.
 *
 * Only changed files, plus any whose sibling is missing, are compressed:
 * quality 11 is slow, and a full pass over the corpus is minutes of CI.
 */
async function syncBrotliSiblings(): Promise<void> {
  const candidates = uploadable.filter(shouldPrecompress);
  if (candidates.length === 0) return;

  const existingKeys = listBucketKeys();
  if (!existingKeys) {
    console.error(
      "\nCould not list the bucket; skipping the brotli siblings this run.",
    );
    return;
  }
  const targets = precompressionTargets({
    sourcePaths: candidates,
    uploadedPaths: uploadedThisRun(),
    existingKeys,
  });
  const orphans = orphanedSiblings({
    sourcePaths: uploadable,
    existingKeys,
  });
  console.log(
    `\n== brotli siblings  (${candidates.length} candidates, ${targets.length} to build` +
      `${orphans.length > 0 ? `, ${orphans.length} orphaned` : ""})`,
  );

  await deleteOrphanedSiblings(orphans, candidates.length);
  if (targets.length === 0) return;

  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "t2-brotli-"));
  const started = Date.now();
  const { rawBytes, packedBytes } = await compressAll(targets, {
    sourceDir,
    stagingDir: staging,
  });
  const ratio = rawBytes > 0 ? (100 * packedBytes) / rawBytes : 0;
  console.log(
    `Compressed ${targets.length} files: ${(rawBytes / 1048576).toFixed(1)} MB -> ` +
      `${(packedBytes / 1048576).toFixed(1)} MB (${ratio.toFixed(1)}%) in ` +
      `${Math.round((Date.now() - started) / 1000)}s`,
  );

  // Headers come from the SOURCE file: a compressed shape is still a shape,
  // it just carries Content-Encoding as well. Grouped by content type rather
  // than taken from the first target, so adding a text format to
  // PRECOMPRESS_EXTENSIONS cannot silently label it octet-stream.
  const byContentType = new Map<string, Set<string>>();
  for (const target of targets) {
    const metadata = precompressedMetadataFor(target);
    if (!metadata) {
      console.error(`No metadata for ${target}; not uploading its sibling.`);
      process.exit(1);
    }
    const extensions = byContentType.get(metadata.contentType) ?? new Set();
    extensions.add(path.extname(target));
    byContentType.set(metadata.contentType, extensions);
  }

  let uploadFailed = 0;
  for (const [contentType, extensions] of [...byContentType].sort()) {
    const args = [
      "s3",
      "cp",
      staging,
      bucket!,
      "--recursive",
      "--no-progress",
      "--content-type",
      contentType,
      "--content-encoding",
      PRECOMPRESSED_CONTENT_ENCODING,
      "--cache-control",
      ASSET_CACHE_CONTROL,
      "--exclude",
      "*",
    ];
    for (const extension of [...extensions].sort()) {
      args.push("--include", `*${extension}.br`);
    }
    const result = spawnSync("aws", args, { encoding: "utf8" });
    if (result.stdout) {
      process.stdout.write(result.stdout);
      report.push(result.stdout);
    }
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
      uploadFailed = result.status ?? 1;
      break;
    }
  }
  await fs.rm(staging, { recursive: true, force: true });
  if (uploadFailed !== 0) {
    console.error(`Uploading the brotli siblings failed (${uploadFailed}).`);
    process.exit(1);
  }
}

/**
 * Remove siblings whose source shape is gone.
 *
 * Guarded on there being any shapes at all locally: an empty or wrong
 * --source would otherwise make every sibling look orphaned and delete the
 * lot. `listBucketKeys` returning empty on failure fails the safe way here,
 * since no keys means no orphans.
 */
async function deleteOrphanedSiblings(
  orphans: string[],
  liveCandidateCount: number,
): Promise<void> {
  if (orphans.length === 0) return;
  if (liveCandidateCount === 0) {
    console.error(
      `Refusing to delete ${orphans.length} sibling(s): no source files to compare against.`,
    );
    return;
  }
  for (const key of orphans.slice(0, 20)) console.log(`  orphan: ${key}`);
  if (orphans.length > 20) console.log(`  … and ${orphans.length - 20} more`);
  if (dryRun) {
    console.log("(dry run: not deleting)");
    return;
  }

  await deleteKeys(orphans);
  console.log(`Deleted ${orphans.length} orphaned sibling(s).`);
}

/**
 * Delete objects whose extension no longer exists on disk.
 *
 * `aws s3 sync --delete` handles the ordinary case, but only for extensions
 * a pass still names. Retiring a whole format — the .glb conversions, say —
 * removes the pass along with the files, so nothing prunes them.
 */
async function pruneStrandedObjects(): Promise<void> {
  const existingKeys = listBucketKeys();
  if (!existingKeys) {
    console.error("\nCould not list the bucket; skipping the prune this run.");
    return;
  }
  const stranded = strandedKeys({
    bucketKeys: existingKeys,
    localPaths: uploadable,
  });
  if (stranded.length === 0) return;

  const byExtension = new Map<string, number>();
  for (const key of stranded) {
    const extension = path.extname(key);
    byExtension.set(extension, (byExtension.get(extension) ?? 0) + 1);
  }
  const summary = [...byExtension]
    .sort()
    .map(([extension, count]) => `${count} ${extension}`)
    .join(", ");
  console.log(
    `\n== prune  (${stranded.length} objects with no source on disk: ${summary})`,
  );

  const fraction = stranded.length / existingKeys.size;
  if (fraction > LARGE_PRUNE_FRACTION && !allowLargePrune) {
    console.error(
      `Refusing to delete ${(100 * fraction).toFixed(1)}% of the bucket in one run.\n` +
        "That usually means an incomplete checkout rather than a deliberate\n" +
        "removal. Re-run with --allow-large-prune if it really is deliberate.",
    );
    process.exit(1);
  }
  if (dryRun) {
    for (const key of stranded.slice(0, 20)) console.log(`  ${key}`);
    console.log("(dry run: not deleting)");
    return;
  }
  await deleteKeys(stranded);
  console.log(`Deleted ${stranded.length} stranded object(s).`);
}

/**
 * Delete bucket keys, batched, and record each one in the change report so
 * the edge purge drops it too.
 *
 * `delete-objects` takes up to 1000 keys per call, which keeps a whole
 * format's removal to a couple of requests instead of one per object.
 */
async function deleteKeys(keys: readonly string[]): Promise<void> {
  const bucketUrl = new URL(bucket!);
  const bucketName = bucketUrl.hostname;
  const prefix = bucketUrl.pathname.replace(/^\/+/, "");
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const payloadDir = await fs.mkdtemp(path.join(os.tmpdir(), "t2-delete-"));
    const payloadFile = path.join(payloadDir, "delete.json");
    await fs.writeFile(
      payloadFile,
      JSON.stringify({
        Objects: batch.map((key) => ({ Key: `${prefix}${key}` })),
        Quiet: true,
      }),
      "utf8",
    );
    const result = spawnSync(
      "aws",
      [
        "s3api",
        "delete-objects",
        "--bucket",
        bucketName,
        "--delete",
        `file://${payloadFile}`,
      ],
      { encoding: "utf8" },
    );
    await fs.rm(payloadDir, { recursive: true, force: true });
    if (result.stderr) process.stderr.write(result.stderr);
    if (result.status !== 0) {
      console.error(`Deleting objects failed (${result.status}).`);
      process.exit(1);
    }
    for (const key of batch) report.push(`delete: ${bucket}${key}\n`);
  }
}
