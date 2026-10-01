import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  DEMO_CHECKPOINT_SUFFIX,
  DEMO_CHECKPOINT_VERSION,
} from "../src/stream/demoCheckpoints";
import type { DemoUploadConfig } from "./demoUpload.js";
import { demoLog as log } from "./logger.js";
import {
  DemoCheckpointGenerationError,
  runDemoCheckpointProcess,
} from "./demoCheckpointProcess.js";

export interface PublishDemoCheckpointsOptions {
  localFile?: string;
  force?: boolean;
}

export type DemoCheckpointPublishResult = "published" | "current" | "failed";

/** One replay worker at a time, shared by recordings, imports, and backfills. */
export class DemoCheckpointPublisher {
  private readonly client: S3Client;
  private readonly config: DemoUploadConfig;
  private readonly assetRoot: string;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly pending = new Map<
    string,
    Promise<DemoCheckpointPublishResult>
  >();

  constructor(config: DemoUploadConfig, assetRoot: string) {
    this.config = config;
    this.assetRoot = assetRoot;
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      forcePathStyle: true,
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async isCurrent(key: string): Promise<boolean> {
    try {
      const sidecar = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: `${key}${DEMO_CHECKPOINT_SUFFIX}`,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (
        sidecar.Metadata?.["checkpoint-version"] !==
        String(DEMO_CHECKPOINT_VERSION)
      )
        return false;
      const demo = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      return (
        demo.ContentLength != null &&
        sidecar.Metadata["demo-bytes"] === String(demo.ContentLength) &&
        demo.ETag != null &&
        sidecar.Metadata["demo-etag"] === demo.ETag
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NoSuchKey" || error.name === "NotFound")
      )
        return false;
      throw error;
    }
  }

  publish(
    key: string,
    options: PublishDemoCheckpointsOptions = {},
  ): Promise<DemoCheckpointPublishResult> {
    const existing = this.pending.get(key);
    if (existing) return existing;
    const job = this.prepareJob(key, options);
    this.pending.set(key, job);
    void job.finally(() => this.pending.delete(key)).catch(() => {});
    return job;
  }

  private async prepareJob(
    key: string,
    options: PublishDemoCheckpointsOptions,
  ): Promise<DemoCheckpointPublishResult> {
    // Completed cache hits must bypass a long-running replay for another demo.
    if (!options.localFile && !options.force && (await this.isCurrent(key)))
      return "current";
    const job = this.tail.then(() => this.publishOne(key, options));
    this.tail = job.catch(() => {});
    return job;
  }

  private async publishOne(
    key: string,
    { localFile, force = false }: PublishDemoCheckpointsOptions,
  ): Promise<DemoCheckpointPublishResult> {
    let temporaryDir: string | undefined;
    try {
      let demoETag: string | undefined;
      if (!localFile) {
        temporaryDir = await fsp.mkdtemp(
          path.join(os.tmpdir(), "demo-checkpoints-"),
        );
        localFile = path.join(temporaryDir, "demo.rec");
        const signal = AbortSignal.timeout(5 * 60_000);
        const response = await this.client.send(
          new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
          { abortSignal: signal },
        );
        if (!response.Body) throw new Error("Cached demo has no body");
        demoETag = response.ETag;
        await pipeline(
          response.Body.transformToWebStream(),
          fs.createWriteStream(localFile),
          { signal },
        );
      } else {
        const demo = await this.client.send(
          new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
          { abortSignal: AbortSignal.timeout(30_000) },
        );
        demoETag = demo.ETag;
      }
      const output = `${localFile}${DEMO_CHECKPOINT_SUFFIX}`;
      let result;
      try {
        result = await runDemoCheckpointProcess(
          localFile,
          output,
          this.assetRoot,
          force,
        );
      } catch (error) {
        if (!(error instanceof DemoCheckpointGenerationError)) throw error;
        log.warn(
          { err: error, key },
          "Seek checkpoint generation failed; ordinary playback remains available",
        );
        return "failed";
      }
      const body = fs.createReadStream(output);
      body.on("error", () => {});
      try {
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: `${key}${DEMO_CHECKPOINT_SUFFIX}`,
            Body: body,
            ContentLength: result.bytes,
            ContentType: "application/json; charset=utf-8",
            CacheControl: "no-cache",
            Metadata: {
              "checkpoint-version": String(result.version),
              "demo-bytes": String(result.demoBytes),
              "demo-sha256": result.demoSha256,
              ...(demoETag ? { "demo-etag": demoETag } : {}),
            },
          }),
          { abortSignal: AbortSignal.timeout(60_000) },
        );
      } finally {
        body.destroy();
      }
      log.info({ key, ...result }, "Seek checkpoints published");
      return "published";
    } finally {
      if (temporaryDir)
        await fsp.rm(temporaryDir, { recursive: true, force: true });
    }
  }
}
