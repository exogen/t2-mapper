import fs from "node:fs/promises";
import { parseChangedUrls } from "./lib/assetSyncReport.js";
import { PURGE_BATCH_SIZE, purgeBatch } from "./lib/cloudflarePurge.js";

/**
 * Purges files changed by an asset sync from the Cloudflare edge
 * cache. Reads the sync report and purges the public
 * URL of every uploaded or deleted object, in the batches the purge API
 * requires.
 *
 * Usage: tsx scripts/purge-changed-assets.ts <sync-output-file> [--dry-run]
 */

const BUCKET_PREFIX = "s3://t2-assets/";
const PUBLIC_ORIGIN = "https://assets.tribes2.online/";

const [inputFile, flag] = process.argv.slice(2);
const dryRun = flag === "--dry-run";

if (!inputFile) {
  console.error(
    "Usage: tsx scripts/purge-changed-assets.ts <sync-output-file> [--dry-run]",
  );
  process.exit(1);
}

// A deploy that uploads nothing leaves an empty (or, from an older sync,
// absent) report. That is success with nothing to do, not a reason to fail
// the deploy.
const syncOutput = await fs.readFile(inputFile, "utf8").catch((error) => {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") {
    console.log(`No sync report at ${inputFile}; nothing to purge.`);
    return "";
  }
  throw error;
});
const urls = parseChangedUrls(syncOutput, BUCKET_PREFIX, PUBLIC_ORIGIN);

if (urls.length === 0) {
  console.log("No changed assets; nothing to purge.");
  process.exit(0);
}

console.log(`Purging ${urls.length} changed asset(s) from the edge cache:`);
for (const url of urls) {
  console.log(`  ${url}`);
}

if (dryRun) {
  console.log("Dry run; no purge requests sent.");
  process.exit(0);
}

const zoneId = process.env.CLOUDFLARE_ZONE_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!zoneId || !apiToken) {
  console.error("CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN must be set.");
  process.exit(1);
}

for (let i = 0; i < urls.length; i += PURGE_BATCH_SIZE) {
  const batch = urls.slice(i, i + PURGE_BATCH_SIZE);
  await purgeBatch(zoneId, apiToken, batch);
  console.log(
    `Purged ${Math.min(i + PURGE_BATCH_SIZE, urls.length)}/${urls.length}`,
  );
}
