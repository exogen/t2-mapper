/**
 * Uploads finalized demo files to Cloudflare R2 (S3 API) and sweeps the
 * demo dir for leftovers: stale `.rec.partial` files are crash debris
 * (unfinished deflate, unpatched header) and are removed; `.rec` files
 * are complete and get (re-)enqueued for upload.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { demoLog as log } from "./logger.js";

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

  private async uploadOne(filePath: string): Promise<string> {
    const config = this.config!;
    const key = `${config.prefix}${path.basename(filePath)}`;
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
          Bucket: config.bucket,
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
    return key;
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
