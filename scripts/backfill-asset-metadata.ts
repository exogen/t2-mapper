/**
 * Rewrites the HTTP metadata on objects already in the game assets
 * bucket, for when the policy in `scripts/lib/assetMetadata.ts` changes.
 *
 * Safe to run at any time: it reads the same table the deploy sync uses
 * and always writes the COMPLETE metadata set for each object. The
 * previous version of this job passed only --cache-control with
 * `--metadata-directive REPLACE`, which replaces every system header and
 * so silently dropped Content-Type from every object it touched — that is
 * why most of the bucket served no type at all.
 *
 * The default is a dry run: it reports the headers each group would get
 * and names any extension the table does not cover, so running it
 * without --apply answers "does the bucket agree with the table?".
 *
 * `--max-age` and `--stale-while-revalidate` override the Cache-Control the
 * table would produce, for trying a policy on the live bucket before
 * committing it. Left off, the table is the single source of truth.
 *
 *   tsx scripts/backfill-asset-metadata.ts --bucket s3://t2-assets/game/base/
 *   tsx scripts/backfill-asset-metadata.ts --bucket … --apply
 *   tsx scripts/backfill-asset-metadata.ts --bucket … --max-age 300 --apply
 */
import { spawnSync } from "node:child_process";
import {
  ASSET_MAX_AGE,
  ASSET_STALE_WHILE_REVALIDATE,
  cacheControl,
  contentTypeFor,
  groupByContentType,
  knownExtensions,
} from "./lib/assetMetadata.js";
import { arg, flag } from "./lib/args.js";

const bucket = arg("bucket");
const apply = flag("apply");

/**
 * A seconds value from argv. Rejects anything that is not a whole
 * non-negative number: a bad one would be written verbatim onto every object
 * in the bucket, and a malformed Cache-Control is ignored by caches rather
 * than erroring, so it would fail silently and look like a caching bug.
 */
function seconds(name: string, fallback: number): number {
  const raw = arg(name);
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) {
    console.error(`--${name} must be a whole number of seconds, got "${raw}".`);
    process.exit(1);
  }
  return Number(raw);
}

const maxAge = seconds("max-age", ASSET_MAX_AGE);
const staleWhileRevalidate = seconds(
  "stale-while-revalidate",
  ASSET_STALE_WHILE_REVALIDATE,
);
const assetCacheControl = cacheControl(maxAge, staleWhileRevalidate);
const overridden =
  maxAge !== ASSET_MAX_AGE ||
  staleWhileRevalidate !== ASSET_STALE_WHILE_REVALIDATE;

if (!bucket) {
  console.error(
    "Usage: tsx scripts/backfill-asset-metadata.ts --bucket s3://bucket/prefix/\n" +
      "  [--apply] [--max-age <seconds>] [--stale-while-revalidate <seconds>]",
  );
  process.exit(1);
}

function aws(args: string[]): { stdout: string; status: number } {
  const result = spawnSync("aws", args, {
    encoding: "utf8",
    maxBuffer: 1 << 28,
  });
  if (result.error) {
    console.error(`Could not run the aws CLI: ${result.error.message}`);
    process.exit(1);
  }
  if (result.stderr) process.stderr.write(result.stderr);
  return { stdout: result.stdout ?? "", status: result.status ?? 1 };
}

/** Every object under the prefix, as keys relative to it. */
function listKeys(): string[] {
  const { stdout, status } = aws(["s3", "ls", bucket!, "--recursive"]);
  if (status !== 0) {
    console.error("aws s3 ls failed.");
    process.exit(1);
  }
  // The prefix in `s3://bucket/prefix/` is stripped from listed keys so the
  // extension lookup sees the same relative paths the sync uses.
  const prefix = new URL(bucket!).pathname.replace(/^\/+/, "");
  const keys: string[] = [];
  for (const line of stdout.split("\n")) {
    // "2026-09-07 20:38:29     221661 game/base/shapes/x.dts"
    const match = line.match(/^\S+\s+\S+\s+\d+\s+(.+)$/);
    if (!match) continue;
    const key = match[1];
    if (key.endsWith("/")) continue;
    keys.push(
      prefix && key.startsWith(prefix) ? key.slice(prefix.length) : key,
    );
  }
  return keys;
}

const keys = listKeys();
const { groups, unknown } = groupByContentType(keys);

console.log(`${keys.length} objects under ${bucket}.`);
console.log(
  `Cache-Control: ${assetCacheControl}` +
    (overridden
      ? "  (OVERRIDDEN on the command line; the table says " +
        `${cacheControl()})`
      : "  (from scripts/lib/assetMetadata.ts)"),
);

if (unknown.size > 0) {
  console.error(
    `\n${unknown.size} extension(s) in the bucket have no Content-Type in the table:`,
  );
  for (const [ext, examples] of unknown) {
    console.error(`  ${ext}  e.g. ${examples.join(", ")}`);
  }
  console.error(
    `Known extensions: ${knownExtensions().join(" ")}\n` +
      "These objects are left untouched — add them to the table, or delete\n" +
      "them from the bucket if they should not be served.",
  );
}

for (const [contentType, extensions] of [...groups].sort()) {
  const list = [...extensions].sort();
  const count = keys.filter((k) => list.some((ext) => k.endsWith(ext))).length;
  console.log(`\n== ${contentType}  (${list.join(" ")})  ${count} objects`);
  if (!apply) continue;

  // REPLACE rewrites every system header, so both are always passed.
  const args = [
    "s3",
    "cp",
    bucket!,
    bucket!,
    "--recursive",
    "--metadata-directive",
    "REPLACE",
    "--content-type",
    contentType,
    "--cache-control",
    assetCacheControl,
    "--no-progress",
    "--exclude",
    "*",
  ];
  for (const ext of list) args.push("--include", `*${ext}`);
  const { status } = aws(args);
  if (status !== 0) {
    console.error(`aws s3 cp failed for ${contentType} (${status})`);
    process.exit(1);
  }
}

if (!apply) {
  console.log(
    "\nDry run: nothing was changed. Re-run with --apply to write them.",
  );
  console.log("What each group would be set to:");
  for (const [contentType] of [...groups].sort()) {
    console.log(`  ${contentType}   cache-control: ${assetCacheControl}`);
  }
}

// Extension-to-type spot check, not a group: these are the two formats the
// AWS CLI guesses wrongly on its own (DTS audio, DV video).
console.log("\nExtension check:");
for (const sample of ["shapes/x.dts", "interiors/x.dif"]) {
  console.log(`  ${sample} -> ${contentTypeFor(sample)}, ${assetCacheControl}`);
}
