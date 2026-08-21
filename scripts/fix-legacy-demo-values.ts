/**
 * One-off repair for legacy relay demos whose $DemoValue array is only
 * the PJEnhancedRecording tail (no standard saveDemoSettings sections
 * in front — positional readers misparse it and the last row shows up
 * as a bogus chat line). Rewrites each demo's initial block with the
 * corrected layout while carrying the packet stream over byte-for-byte.
 *
 * Safety: the initial block is regenerated from the demo's own values
 * and must round-trip byte-identical to the original before any change
 * is made; the patched file must fully reparse with an identical block
 * count. Verification always runs; nothing is uploaded without --write.
 * Originals are saved locally before overwriting.
 *
 * After a --write run, refresh sidecars/index: npm run backfill-demos
 * -- --force (the byte size changes).
 */
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { DemoParser } from "t2-demo-parser";
import { loadUploadConfig } from "../relay/demoUpload.js";
import {
  DEMO_LENGTH_MS_OFFSET,
  buildHeader,
  buildInitialBlock,
  buildStandardDemoSections,
} from "../relay/demoWriter.js";

const HEADER_SIZE = DEMO_LENGTH_MS_OFFSET + 8;

const { values } = parseArgs({
  options: {
    write: { type: "boolean", default: false },
    "backup-dir": {
      type: "string",
      default: path.join(os.tmpdir(), "t2-demo-legacy-backups"),
    },
    help: { type: "boolean", default: false, short: "h" },
  },
});

if (values.help) {
  console.error("Usage: npm run fix-legacy-demos [-- options]");
  console.error();
  console.error("Options:");
  console.error(
    "  --write             Upload repaired demos (default: verify only)",
  );
  console.error(
    "  --backup-dir <dir>  Where originals are saved before overwrite",
  );
  process.exit(1);
}

const write = values.write;
const backupDir = values["backup-dir"]!;

const config = loadUploadConfig();
if (!config) {
  console.error(
    "Missing DEMO_R2_* env vars — run via `npm run fix-legacy-demos`.",
  );
  process.exit(1);
}

const client = new S3Client({
  region: "auto",
  endpoint: config.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
  },
});

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

async function parseDemo(bytes: Uint8Array) {
  const parser = new DemoParser(bytes);
  const { initialBlock } = await parser.load();
  let blockCount = 0;
  for (let block = parser.nextBlock(); block; block = parser.nextBlock()) {
    blockCount++;
  }
  return { initialBlock, blockCount };
}

/**
 * Returns the repaired file, or a skip reason when untouched.
 */
async function repairDemo(
  bytes: Uint8Array,
): Promise<{ file: Uint8Array } | { skip: string }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const initialSize = view.getUint32(DEMO_LENGTH_MS_OFFSET + 4, true);
  const demoLengthMs = view.getUint32(DEMO_LENGTH_MS_OFFSET, true);
  const oldInitial = bytes.slice(HEADER_SIZE, HEADER_SIZE + initialSize);
  const blockStream = bytes.subarray(HEADER_SIZE + initialSize);

  const old = await parseDemo(bytes);
  const oldValues = old.initialBlock.demoValues;
  if (oldValues[0] !== "NewDemoData") {
    return { skip: "not a legacy tail-only layout" };
  }
  const connectSequence = old.initialBlock.connectionState
    .connectSequence as number;
  const missionName = old.initialBlock.missionName ?? "";

  // The whole repair rests on this: our writer must reproduce the
  // original initial block exactly from its own parsed values.
  const roundTrip = buildInitialBlock({
    connectSequence,
    missionName,
    demoValues: oldValues,
  });
  if (!equalBytes(roundTrip, oldInitial)) {
    return { skip: "initial block round-trip mismatch (writer drift?)" };
  }

  const newValues = [...buildStandardDemoSections(), ...oldValues];
  const newInitial = buildInitialBlock({
    connectSequence,
    missionName,
    demoValues: newValues,
  });
  const header = buildHeader(newInitial.length);
  new DataView(header.buffer).setUint32(
    DEMO_LENGTH_MS_OFFSET,
    demoLengthMs,
    true,
  );

  const file = new Uint8Array(
    header.length + newInitial.length + blockStream.length,
  );
  file.set(header, 0);
  file.set(newInitial, header.length);
  file.set(blockStream, header.length + newInitial.length);

  const patched = await parseDemo(file);
  if (
    patched.blockCount !== old.blockCount ||
    patched.initialBlock.missionName !== old.initialBlock.missionName ||
    JSON.stringify(patched.initialBlock.demoValues) !==
      JSON.stringify(newValues)
  ) {
    return { skip: "patched file failed verification" };
  }
  return { file };
}

console.log(`Listing s3://${config.bucket}/${config.prefix}...`);
const keys: string[] = [];
let continuationToken: string | undefined;
do {
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: config.bucket,
      Prefix: config.prefix,
      ContinuationToken: continuationToken,
    }),
  );
  for (const obj of res.Contents ?? []) {
    if (obj.Key?.endsWith(".rec")) keys.push(obj.Key);
  }
  continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined;
} while (continuationToken);
console.log(
  `${keys.length} demos${write ? ` (originals → ${backupDir})` : " (verify only — use --write to upload)"}`,
);

let repaired = 0;
let skipped = 0;
let failed = 0;
for (const key of keys.sort()) {
  const filename = path.basename(key);
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    const bytes = await res.Body!.transformToByteArray();
    const result = await repairDemo(bytes);
    if ("skip" in result) {
      skipped++;
      console.log(`skip ${filename}: ${result.skip}`);
      continue;
    }
    console.log(
      `${write ? "fixed" : "would fix"} ${filename} ` +
        `(${bytes.length} → ${result.file.length} bytes)`,
    );
    if (write) {
      await fsp.mkdir(backupDir, { recursive: true });
      await fsp.writeFile(path.join(backupDir, filename), bytes);
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key,
          Body: result.file,
          ContentType: "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
    }
    repaired++;
  } catch (err) {
    failed++;
    console.error(`FAILED ${filename}: ${String(err)}`);
  }
}
console.log(
  `Done: ${repaired} ${write ? "repaired" : "repairable"}, ${skipped} skipped, ${failed} failed`,
);
if (write && repaired > 0) {
  console.log("Now refresh metadata: npm run backfill-demos -- --force");
}
if (failed > 0) process.exitCode = 1;
