/**
 * Back up the demo bucket before rewriting it. Every object under the
 * demo prefix is copied server-side to `backups/<label>/` (outside the
 * prefix, so nothing lists it as a demo; the copy keeps its headers) and
 * downloaded to a local mirror, with a manifest of each object's size,
 * ETag, headers and hashes. Each copy is checked against its source.
 * Re-running resumes, skipping objects already backed up intact, and never
 * replaces a copy of another version: once the bucket has been rewritten,
 * a fresh backup needs a new label and mirror.
 *
 * To restore an object, copy `backups/<label>/<key>` back to `<key>`, or
 * upload the mirror's file with the headers its manifest entry records.
 */
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { parseArgs } from "node:util";
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  type S3Client,
} from "@aws-sdk/client-s3";
import { fileEtags, unquoteEtag, type FileEtags } from "../relay/objectEtag.js";
import { listAllObjects, r2Client } from "./lib/r2.js";

const { values } = parseArgs({
  options: {
    label: { type: "string" },
    out: { type: "string" },
    concurrency: { type: "string", default: "8" },
    help: { type: "boolean", default: false },
  },
});
if (values.help || !values.label || !values.out) {
  console.log(
    [
      "Usage: npm run demos:backup -- --label=<label> --out=<dir> [--concurrency=N]",
      "",
      "  --label=TEXT     Backup name: objects are copied to backups/<label>/<key>",
      "  --out=DIR        Local mirror, holding <key> files and manifest.json",
      "  --concurrency=N  Objects in flight (default: 8)",
    ].join("\n"),
  );
  process.exit(values.help ? 0 : 1);
}
const label = values.label;
const outDir = path.resolve(values.out);
const concurrency = Number(values.concurrency);
if (!/^[\w.-]+$/.test(label)) {
  console.error("--label may only hold letters, digits, '.', '_' and '-'");
  process.exit(1);
}
if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
  console.error("--concurrency must be a positive integer");
  process.exit(1);
}

interface ManifestEntry {
  key: string;
  backupKey: string;
  size: number;
  etag: string;
  lastModified?: string;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  md5: string;
  sha256: string;
  /**
   * How the mirror's bytes were matched to the bucket's: the ETag (an MD5,
   * or the multipart ETag of 8 MiB parts), or the size alone.
   */
  verified: "etag" | "size";
}

function sameMetadata(
  a: Record<string, string> | undefined,
  b: Record<string, string> | undefined,
): boolean {
  const entries = (m: Record<string, string> | undefined) =>
    JSON.stringify(
      Object.entries(m ?? {}).sort(([x], [y]) => x.localeCompare(y)),
    );
  return entries(a) === entries(b);
}

async function head(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<HeadObjectCommandOutput | null> {
  try {
    return await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NotFound" || error.name === "NoSuchKey")
    )
      return null;
    throw error;
  }
}

/**
 * Whether a local file holds the object's bytes: its size and, where the
 * ETag says how, its digest.
 */
async function matchLocal(
  file: string,
  size: number,
  etag: string,
): Promise<(FileEtags & { verified: "etag" | "size" }) | null> {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat || stat.size !== size) return null;
  const hashes = await fileEtags(file);
  if (!etag.includes("-"))
    return hashes.md5 === etag ? { ...hashes, verified: "etag" } : null;
  // Multipart uploads by anything but the relay may use other part sizes.
  return {
    ...hashes,
    verified: hashes.multipartEtag === etag ? "etag" : "size",
  };
}

async function backUp(
  client: S3Client,
  bucket: string,
  key: string,
): Promise<ManifestEntry> {
  const source = await head(client, bucket, key);
  if (!source) throw new Error("vanished before it was backed up");
  const size = source.ContentLength ?? 0;
  const etag = unquoteEtag(source.ETag);

  const file = path.join(outDir, key);
  let local = await matchLocal(file, size, etag);
  if (!local && (await fs.stat(file).catch(() => null)))
    throw new Error(
      `the mirror holds another version of it; back up to a new --out and --label`,
    );
  if (!local) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const partial = `${file}.download`;
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: source.ETag }),
    );
    await pipeline(
      response.Body as NodeJS.ReadableStream,
      createWriteStream(partial),
    );
    await fs.rename(partial, file);
    local = await matchLocal(file, size, etag);
    if (!local)
      throw new Error("download does not match the object's size or ETag");
  }

  const backupKey = `backups/${label}/${key}`;
  let copy = await head(client, bucket, backupKey);
  const copyMatches = (c: HeadObjectCommandOutput | null) =>
    !!c &&
    c.ContentLength === size &&
    (etag.includes("-") || unquoteEtag(c.ETag) === etag) &&
    c.ContentType === source.ContentType &&
    c.CacheControl === source.CacheControl &&
    sameMetadata(c.Metadata, source.Metadata);
  if (copy && !copyMatches(copy))
    throw new Error(
      `${backupKey} holds another version of it; back up to a new --label`,
    );
  if (!copy) {
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: backupKey,
        CopySource: `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`,
        CopySourceIfMatch: source.ETag,
        MetadataDirective: "COPY",
      }),
    );
    copy = await head(client, bucket, backupKey);
    if (!copyMatches(copy))
      throw new Error(`R2 copy ${backupKey} does not match its source`);
  }

  return {
    key,
    backupKey,
    size,
    etag,
    lastModified: source.LastModified?.toISOString(),
    contentType: source.ContentType,
    cacheControl: source.CacheControl,
    metadata: source.Metadata,
    md5: local.md5,
    sha256: local.sha256,
    verified: local.verified,
  };
}

const { client, config } = r2Client("npm run demos:backup");
const objects = await listAllObjects(client, config);
await fs.mkdir(outDir, { recursive: true });
console.log(
  `Backing up ${objects.length} objects under ${config.prefix} ` +
    `(${(objects.reduce((sum, o) => sum + o.size, 0) / 1e9).toFixed(2)} GB) ` +
    `to backups/${label}/ and ${outDir}`,
);

// A run resumed or repeated after new demos arrived keeps what the
// mirror already held.
const manifestPath = path.join(outDir, "manifest.json");
const previous = new Map<string, ManifestEntry>(
  (
    JSON.parse(
      await fs.readFile(manifestPath, "utf8").catch(() => '{"objects":[]}'),
    ) as { objects: ManifestEntry[] }
  ).objects.map((entry) => [entry.key, entry]),
);
const entries: ManifestEntry[] = [];
const failures: { key: string; error: string }[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < objects.length) {
      const { key } = objects[next++];
      try {
        entries.push(await backUp(client, config.bucket, key));
      } catch (error) {
        failures.push({ key, error: String(error) });
        console.error(`FAILED ${key}: ${String(error)}`);
      }
      const done = entries.length + failures.length;
      if (done % 100 === 0 || done === objects.length)
        console.log(`  ${done}/${objects.length}`);
    }
  }),
);

for (const entry of entries) previous.set(entry.key, entry);
const manifestEntries = [...previous.values()].sort((a, b) =>
  a.key.localeCompare(b.key),
);
await fs.writeFile(
  manifestPath,
  JSON.stringify(
    {
      label,
      bucketPrefix: config.prefix,
      backupPrefix: `backups/${label}/`,
      createdAt: new Date().toISOString(),
      objects: manifestEntries,
      failures,
    },
    null,
    1,
  ),
);
const sizeOnly = entries.filter((entry) => entry.verified === "size").length;
console.log(
  `Backed up ${entries.length}/${objects.length} objects` +
    (sizeOnly
      ? ` (${sizeOnly} matched by size: multipart ETags of unknown part size)`
      : "") +
    (failures.length ? `; ${failures.length} FAILED` : ""),
);
if (failures.length > 0) process.exitCode = 1;
