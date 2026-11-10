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
  DEFAULT_CHECKPOINT_INTERVAL_TICKS,
  DEMO_CHECKPOINT_SUFFIX,
  isSupportedDemoCheckpointVersion,
  type DemoCheckpointPlan,
} from "../src/stream/demoCheckpoints";
import type { DemoUploadConfig } from "./demoUpload.js";
import type { PreparedDemoCheckpoints } from "./demoCheckpointGenerator.js";
import { demoLog as log } from "./logger.js";
import {
  DemoCheckpointGenerationError,
  runDemoCheckpointProcess,
} from "./demoCheckpointProcess.js";
import {
  checkDemoCheckpointPlan,
  loadDemoCheckpointPlan,
} from "./demoCheckpointConfig.js";

export interface PublishDemoCheckpointsOptions {
  localFile?: string;
  force?: boolean;
  existingOnly?: boolean;
}

export type DemoCheckpointPublishResult = "published" | "current" | "failed";

/** Publish checkpoint artifacts, serializing replay jobs within this instance. */
export class DemoCheckpointPublisher {
  private readonly client: S3Client;
  private readonly config: DemoUploadConfig;
  private readonly assetRoot: string;
  private readonly plan: DemoCheckpointPlan;
  private readonly generateCheckpoints: typeof runDemoCheckpointProcess;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly pending = new Map<
    string,
    Promise<DemoCheckpointPublishResult>
  >();

  constructor(
    config: DemoUploadConfig,
    assetRoot: string,
    plan: DemoCheckpointPlan = loadDemoCheckpointPlan(),
    generateCheckpoints: typeof runDemoCheckpointProcess = runDemoCheckpointProcess,
  ) {
    this.config = config;
    this.assetRoot = assetRoot;
    this.plan = checkDemoCheckpointPlan(plan);
    this.generateCheckpoints = generateCheckpoints;
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
      // Sidecars from before the interval was recorded used the default.
      if (
        !isSupportedDemoCheckpointVersion(
          Number(sidecar.Metadata?.["checkpoint-version"]),
        ) ||
        sidecar.Metadata?.["checkpoint-count"] !== String(this.plan.maxCount) ||
        (sidecar.Metadata?.["checkpoint-interval"] ??
          String(DEFAULT_CHECKPOINT_INTERVAL_TICKS)) !==
          String(this.plan.intervalTicks)
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

  /** Upload the worker's completed artifact without another generation pass. */
  async publishPrepared(
    key: string,
    localFile: string,
    prepared: PreparedDemoCheckpoints,
  ): Promise<"published"> {
    const demo = await this.client.send(
      new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
    await this.uploadSidecar(
      key,
      `${localFile}${DEMO_CHECKPOINT_SUFFIX}`,
      prepared,
      demo.ETag,
    );
    return "published";
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
    {
      localFile,
      force = false,
      existingOnly = false,
    }: PublishDemoCheckpointsOptions,
  ): Promise<DemoCheckpointPublishResult> {
    let temporaryDir: string | undefined;
    try {
      let checkpointETag: string | undefined;
      if (existingOnly) {
        try {
          const current = await this.client.send(
            new HeadObjectCommand({
              Bucket: this.config.bucket,
              Key: `${key}${DEMO_CHECKPOINT_SUFFIX}`,
            }),
            { abortSignal: AbortSignal.timeout(30_000) },
          );
          checkpointETag = current.ETag;
        } catch (error) {
          if (
            error instanceof Error &&
            (error.name === "NoSuchKey" || error.name === "NotFound")
          )
            throw new Error(`Cannot update missing checkpoint sidecar: ${key}`);
          throw error;
        }
        if (!checkpointETag)
          throw new Error(`Missing checkpoint sidecar ETag: ${key}`);
      }
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
        result = await this.generateCheckpoints(
          localFile,
          output,
          this.assetRoot,
          force,
          this.plan,
        );
      } catch (error) {
        if (!(error instanceof DemoCheckpointGenerationError)) throw error;
        log.warn(
          { err: error, key },
          "Seek checkpoint generation failed; ordinary playback remains available",
        );
        return "failed";
      }
      await this.uploadSidecar(
        key,
        output,
        { ...result, ...this.plan },
        demoETag,
        checkpointETag,
      );
      return "published";
    } finally {
      if (temporaryDir)
        await fsp.rm(temporaryDir, { recursive: true, force: true });
    }
  }

  private async uploadSidecar(
    key: string,
    output: string,
    prepared: PreparedDemoCheckpoints,
    demoETag?: string,
    checkpointETag?: string,
  ): Promise<void> {
    const body = fs.createReadStream(output);
    body.on("error", () => {});
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: `${key}${DEMO_CHECKPOINT_SUFFIX}`,
          Body: body,
          ContentLength: prepared.bytes,
          ContentType: "application/json; charset=utf-8",
          CacheControl: "no-cache",
          ...(checkpointETag ? { IfMatch: checkpointETag } : {}),
          Metadata: {
            "checkpoint-version": String(prepared.version),
            "checkpoint-count": String(prepared.maxCount),
            "checkpoint-interval": String(prepared.intervalTicks),
            "demo-bytes": String(prepared.demoBytes),
            "demo-sha256": prepared.demoSha256,
            ...(demoETag ? { "demo-etag": demoETag } : {}),
          },
        }),
        { abortSignal: AbortSignal.timeout(60_000) },
      );
    } finally {
      body.destroy();
    }
    log.info({ key, ...prepared }, "Seek checkpoints published");
  }
}
