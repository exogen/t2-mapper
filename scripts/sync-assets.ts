/**
 * Sync docs/base to R2, skipping an unchanged successful asset fingerprint.
 * Changed runs list the prefix once, compare contents, then upload concurrently.
 * --force-sync bypasses the fingerprint to check for out-of-band R2 changes.
 *
 * tsx scripts/sync-assets.ts --bucket s3://t2-assets/game/base/
 *   [--source docs/base] [--report file] [--dry-run] [--plan] [--force-sync]
 *   [--no-precompress] [--allow-unknown] [--allow-large-prune] [--concurrency 8]
 *
 * After purging: same command with --acknowledge-report <report file>.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { arg, flag } from "./lib/args.js";
import { assetFingerprint, listAssets } from "./lib/assetFingerprint.js";
import {
  ASSET_CACHE_CONTROL,
  groupByContentType,
  metadataFor,
} from "./lib/assetMetadata.js";
import { acknowledgeSyncReport, syncAssets } from "./lib/assetSync.js";
import { createAssetSyncStore, parseAssetBucket } from "./lib/assetSyncR2.js";
import { shouldPrecompress, writeBrotli } from "./lib/precompress.js";

const bucketArg = arg("bucket");
if (!bucketArg) throw new Error("Expected --bucket s3://bucket/prefix/");
const bucket = parseAssetBucket(bucketArg);
const source = arg("source") ?? "docs/base";
const reportFile = arg("report");
const precompress = !flag("no-precompress");
const dryRun = flag("dry-run");
const acknowledgeReport = arg("acknowledge-report");
const client = new S3Client({
  region: "auto",
  endpoint: process.env.AWS_ENDPOINT_URL,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
});
const store = createAssetSyncStore(bucket.url, client);
let staging: string | undefined;
try {
  if (acknowledgeReport) {
    if (dryRun || flag("plan"))
      throw new Error(
        "Acknowledging a purge cannot be combined with --dry-run or --plan.",
      );
    await acknowledgeSyncReport(
      store,
      await fs.readFile(acknowledgeReport, "utf8"),
    );
    console.log("Asset purge acknowledged.");
  } else {
    // Clear an earlier report even when this attempt fails before uploading.
    if (reportFile) await fs.writeFile(reportFile, "");
    const all = await listAssets(source);
    const { groups, unknown } = groupByContentType(all);
    if (unknown.size) {
      for (const [extension, examples] of unknown)
        console.error(
          `Unknown content type ${extension}: ${examples.join(", ")}`,
        );
      if (!flag("allow-unknown"))
        throw new Error(
          "Add content types to assetMetadata.ts, exclude these assets, or use --allow-unknown.",
        );
    }
    const files = all.filter((file) => metadataFor(file) != null);
    console.log(`${files.length} eligible files under ${source}.`);
    if (flag("plan")) {
      for (const [contentType, extensions] of [...groups].sort())
        console.log(`  ${contentType}: ${[...extensions].sort().join(" ")}`);
      console.log(`  cache-control: ${ASSET_CACHE_CONTROL}`);
      console.log(
        `  brotli siblings: ${precompress ? files.filter(shouldPrecompress).length : "disabled"}`,
      );
    } else {
      const fingerprints = await assetFingerprint(source, files, precompress);
      staging = await fs.mkdtemp(path.join(os.tmpdir(), "t2-asset-sync-"));
      const result = await syncAssets({
        source,
        files,
        ...fingerprints,
        bucketUrl: bucket.url,
        precompress,
        forceSync: flag("force-sync"),
        dryRun,
        allowLargePrune: flag("allow-large-prune"),
        concurrency: Number(arg("concurrency") ?? 8),
        store,
        log: console.log,
        async compress(file) {
          const destination = path.join(staging!, `${file}.br`);
          await writeBrotli(path.join(source, file), destination);
          return destination;
        },
      });
      if (reportFile) {
        await fs.writeFile(reportFile, result.report);
        console.log(`Wrote the change list to ${reportFile}.`);
      }
      if (result.report && !dryRun)
        console.log(
          "The change list remains in R2 until --acknowledge-report confirms a successful cache purge.",
        );
    }
  }
} finally {
  if (staging) await fs.rm(staging, { recursive: true, force: true });
  client.destroy();
}
