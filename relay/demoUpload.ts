/**
 * Uploads finalized demo files to Cloudflare R2 (S3 API) along with
 * their metadata sidecars, and appends each record to the bucket's
 * `index.json` (the browse listing — one fetch, full metadata). Sweeps
 * the demo dir for leftovers: stale `.rec.partial` files are crash
 * debris (unfinished deflate, unpatched header) and are removed;
 * `.rec` files are complete and get (re-)enqueued for upload.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { demoLog as log } from "./logger.js";
import type { DemoMetadata } from "./demoRecorder.js";

/** A .partial with no writes for this long is crash debris, not a live
 *  spool (active recordings are written many times per second). */
const STALE_PARTIAL_MS = 60_000;

export interface DemoUploadConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  prefix: string;
}

/** Null when any required DEMO_R2_* var is missing (uploads disabled —
 *  demos stay on the volume). */
export function loadUploadConfig(
  env: NodeJS.ProcessEnv = process.env,
): DemoUploadConfig | null {
  const endpoint = env.DEMO_R2_ENDPOINT;
  const bucket = env.DEMO_R2_BUCKET;
  const accessKeyId = env.DEMO_R2_ACCESS_KEY_ID;
  const secretAccessKey = env.DEMO_R2_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    endpoint,
    bucket,
    accessKeyId,
    secretAccessKey,
    prefix: env.DEMO_R2_PREFIX ?? "demos/",
  };
}

export interface DemoUploadStats {
  enabled: boolean;
  /** Files waiting in the in-memory queue (excludes the one in flight). */
  queued: number;
  /** Basename currently uploading, or null. */
  uploading: string | null;
  /** Lifetime counters since relay start. */
  uploaded: number;
  failed: number;
  lastUploaded: { key: string; at: string } | null;
  lastError: { file: string; message: string; at: string } | null;
}

export class DemoUploader {
  private config: DemoUploadConfig | null;
  private client: S3Client | null;
  private dir: string;
  private queue: string[] = [];
  private queued = new Set<string>();
  private pumping = false;
  private current: string | null = null;
  private uploadedCount = 0;
  private failedCount = 0;
  private lastUploaded: { key: string; at: string } | null = null;
  private lastError: { file: string; message: string; at: string } | null =
    null;

  constructor(config: DemoUploadConfig | null, dir: string) {
    this.config = config;
    this.dir = dir;
    this.client = config
      ? new S3Client({
          region: "auto",
          endpoint: config.endpoint,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        })
      : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  getStats(): DemoUploadStats {
    return {
      enabled: this.enabled,
      queued: this.queue.length,
      uploading: this.current,
      uploaded: this.uploadedCount,
      failed: this.failedCount,
      lastUploaded: this.lastUploaded,
      lastError: this.lastError,
    };
  }

  enqueue(filePath: string): void {
    if (!this.client) return;
    if (this.queued.has(filePath)) return;
    this.queued.add(filePath);
    this.queue.push(filePath);
    void this.pump();
  }

  /** One upload at a time (1 GB shared-CPU VM). Failures keep the local
   *  file; the retry sweep re-enqueues it. */
  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length > 0) {
        const filePath = this.queue.shift()!;
        const basename = path.basename(filePath);
        this.current = basename;
        try {
          const key = await this.uploadOne(filePath);
          await fsp.unlink(filePath);
          // The sidecar is only unlinked after demo + sidecar + index
          // all landed; the sweep clears any crash-window orphan.
          await fsp.unlink(`${filePath}.json`).catch(() => {});
          this.uploadedCount++;
          this.lastUploaded = { key, at: new Date().toISOString() };
          log.info({ file: basename, key }, "Demo uploaded");
        } catch (err) {
          this.failedCount++;
          this.lastError = {
            file: basename,
            // AWS SDK error names (NoSuchBucket, SignatureDoesNotMatch,
            // InvalidAccessKeyId…) are the most diagnostic part.
            message:
              err instanceof Error
                ? `${err.name}: ${err.message}`
                : String(err),
            at: new Date().toISOString(),
          };
          log.error(
            { err, file: basename },
            "Demo upload failed — kept locally for retry",
          );
        } finally {
          this.current = null;
          this.queued.delete(filePath);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  /** Upload the demo, then its sidecar, then fold the record into the
   *  index — in that order, so every failure keeps the local files and
   *  the whole (idempotent) chain retries on the next sweep. */
  private async uploadOne(filePath: string): Promise<string> {
    const config = this.config!;
    const key = `${config.prefix}${path.basename(filePath)}`;
    const record = await this.readSidecar(`${filePath}.json`);
    await this.uploadDemoFile(filePath, key);
    if (record) {
      await this.client!.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: `${key}.json`,
          Body: JSON.stringify(record, null, 2),
          ContentType: "application/json; charset=utf-8",
          CacheControl: "public, max-age=31536000, immutable",
        }),
      );
      await this.updateIndex(record);
    }
    return key;
  }

  /** Null for pre-sidecar legacy files (demo still uploads, unindexed)
   *  or an unreadable record (logged; rebuildable later if ever fixed). */
  private async readSidecar(sidecarPath: string): Promise<DemoMetadata | null> {
    let raw: string;
    try {
      raw = await fsp.readFile(sidecarPath, "utf-8");
    } catch {
      return null;
    }
    try {
      return JSON.parse(raw) as DemoMetadata;
    } catch (err) {
      log.warn(
        { err, file: path.basename(sidecarPath) },
        "Unreadable demo sidecar — uploading demo without an index entry",
      );
      return null;
    }
  }

  /**
   * Read-modify-write of `<prefix>index.json` — safe because the pump
   * serializes uploads and this process is the only writer. Appends are
   * deduped by filename so retries after a partial failure stay clean.
   * Any unexpected read/parse error throws (kept + retried) rather than
   * risk clobbering the index with a truncated read.
   */
  private async updateIndex(record: DemoMetadata): Promise<void> {
    const config = this.config!;
    const key = `${config.prefix}index.json`;
    let entries: DemoMetadata[] = [];
    try {
      const res = await this.client!.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      );
      const parsed: unknown = JSON.parse(await res.Body!.transformToString());
      if (!Array.isArray(parsed)) {
        throw new Error("demo index is not an array");
      }
      entries = parsed as DemoMetadata[];
    } catch (err) {
      const missing =
        err instanceof Error &&
        (err.name === "NoSuchKey" || err.name === "NotFound");
      if (!missing) throw err;
    }
    if (entries.some((e) => e.filename === record.filename)) return;
    entries.push(record);
    await this.client!.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: JSON.stringify(entries),
        ContentType: "application/json; charset=utf-8",
        // Unlike the demos, the index mutates — revalidate every fetch.
        CacheControl: "no-cache",
      }),
    );
    log.debug({ entries: entries.length }, "Demo index updated");
  }

  private async uploadDemoFile(filePath: string, key: string): Promise<void> {
    const bytes = await fsp.stat(filePath).then(
      (s) => s.size,
      () => null,
    );
    log.debug({ key, bytes }, "Demo upload starting");
    const body = fs.createReadStream(filePath);
    // Read errors surface through upload.done(); a bare 'error' on the
    // stream (e.g. the upload aborts before consuming it) must not
    // crash the process.
    body.on("error", () => {});
    try {
      const upload = new Upload({
        client: this.client!,
        params: {
          Bucket: this.config!.bucket,
          Key: key,
          Body: body,
          ContentType: "application/octet-stream",
          // Demo filenames are unique (random suffix), so objects are
          // immutable — cache them as hard as anything will allow.
          CacheControl: "public, max-age=31536000, immutable",
        },
        partSize: 8 * 1024 * 1024,
        queueSize: 2,
      });
      await upload.done();
    } finally {
      body.destroy();
    }
  }

  /** Boot + retry sweep over the demo dir. */
  async sweep(): Promise<void> {
    let entries: string[];
    try {
      entries = await fsp.readdir(this.dir);
    } catch {
      return; // Dir doesn't exist yet — nothing recorded.
    }
    let requeued = 0;
    for (const name of entries) {
      const filePath = path.join(this.dir, name);
      if (name.endsWith(".partial")) {
        // Live spools are .partial too and are written continuously —
        // only a cold mtime marks crash debris. Never delete a fresh
        // one (an active recording, or a predecessor process draining
        // its finalize during a dev --watch restart).
        try {
          const stat = await fsp.stat(filePath);
          if (Date.now() - stat.mtimeMs < STALE_PARTIAL_MS) continue;
          log.warn({ file: name }, "Removing stale partial demo");
          await fsp.unlink(filePath);
        } catch {
          // Renamed/removed between readdir and stat — nothing to do.
        }
      } else if (name.endsWith(".rec.json")) {
        // A sidecar without its .rec is a crash-window orphan (the demo
        // uploaded and unlinked, then the process died before this
        // unlink). The mtime guard covers the finalize race where the
        // .rec appears moments after its sidecar.
        try {
          await fsp.access(filePath.slice(0, -".json".length));
        } catch {
          try {
            const stat = await fsp.stat(filePath);
            if (Date.now() - stat.mtimeMs < STALE_PARTIAL_MS) continue;
            log.warn({ file: name }, "Removing orphan demo sidecar");
            await fsp.unlink(filePath);
          } catch {
            // Removed between readdir and stat — nothing to do.
          }
        }
      } else if (name.endsWith(".rec")) {
        if (!this.queued.has(filePath)) requeued++;
        this.enqueue(filePath);
      }
    }
    if (requeued > 0 && this.enabled) {
      log.info({ count: requeued }, "Sweep queued demos awaiting upload");
    }
  }
}
