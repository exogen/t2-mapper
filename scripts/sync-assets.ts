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
import { assetIgnoreList } from "./lib/assetIgnore.js";
import {
  ASSET_CACHE_CONTROL,
  groupByContentType,
  knownExtensions,
} from "./lib/assetMetadata.js";
import { arg, flag } from "./lib/args.js";

const source = (arg("source") ?? "docs/base").replace(/\/*$/, "/");
const bucket = arg("bucket");
const reportFile = arg("report");
const dryRun = flag("dry-run");
/** Print the grouping and exit, without needing the aws CLI at all. */
const planOnly = flag("plan");
const allowUnknown = flag("allow-unknown");

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

const all = await listAssets(source);
const excluded = all.filter((p) => assetIgnoreList.ignores(p));
const uploadable = all.filter((p) => !assetIgnoreList.ignores(p));
const { groups, unknown } = groupByContentType(uploadable);

console.log(
  `${all.length} files under ${source}: ${uploadable.length} to sync, ${excluded.length} excluded.`,
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
    source,
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

if (reportFile && report.length > 0) {
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
