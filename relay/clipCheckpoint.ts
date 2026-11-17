import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { isPublishedDemoKey } from "./demoKeys.js";
import type { DemoUploadConfig } from "./demoUpload.js";
import type { DemoCheckpointGenerationResult } from "./demoCheckpointGenerator.js";
import { runDemoWorker } from "./demoWorkerProcess.js";
import { TICK_DURATION_MS } from "../src/stream/streamHelpers";

export const MAX_CLIP_SOURCE_BYTES = 256 * 1024 * 1024;
export const MAX_CLIP_CHECKPOINT_BYTES = 32 * 1024 * 1024;

export interface PreparedClipCheckpoint {
  text: string;
  sourceSha256: string;
  sourceBytes: number;
}

export interface PrepareClipCheckpointOptions {
  config: DemoUploadConfig;
  sourceDemo: string;
  sourceETag: string;
  startSec: number;
  endSec?: number;
  assetRoot: string;
  signal?: AbortSignal;
  client?: S3Client;
}

/** Generate one exact-start checkpoint without replaying on the relay thread. */
export async function runClipCheckpointProcess(
  input: string,
  output: string,
  assetRoot: string,
  tick: number,
  signal?: AbortSignal,
  endTick?: number,
): Promise<DemoCheckpointGenerationResult> {
  if (!Number.isSafeInteger(tick) || tick < 0)
    throw new Error("Clip checkpoint requires a non-negative simulation tick");
  const result = await runDemoWorker<{
    result?: DemoCheckpointGenerationResult;
    error?: string;
  }>(
    new URL("./clipCheckpointWorker.ts", import.meta.url),
    [
      input,
      output,
      assetRoot,
      String(tick),
      String(MAX_CLIP_CHECKPOINT_BYTES),
      endTick === undefined ? "" : String(endTick),
    ],
    {
      signal,
      env: { PATH: process.env.PATH, NODE_ENV: "production", TZ: "UTC" },
    },
  );
  signal?.throwIfAborted();
  if (result.code !== 0 || !result.message?.result)
    throw new Error(
      result.timedOut
        ? "Clip preparation exceeded the time limit."
        : "The recording could not be prepared for this clip.",
    );
  return result.message.result;
}

/** Derive a checkpoint from the same immutable hosted recording the user watched. */
export async function prepareClipCheckpoint({
  config,
  sourceDemo,
  sourceETag,
  startSec,
  endSec,
  assetRoot,
  signal,
  client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  }),
}: PrepareClipCheckpointOptions): Promise<PreparedClipCheckpoint> {
  const tick = Math.floor((startSec * 1000) / TICK_DURATION_MS + 1e-7);
  const endTick =
    endSec === undefined
      ? undefined
      : Math.ceil((endSec * 1000) / TICK_DURATION_MS - 1e-7);
  if (
    !isPublishedDemoKey(sourceDemo) ||
    !sourceETag ||
    !Number.isFinite(startSec) ||
    startSec < 0 ||
    !Number.isSafeInteger(tick) ||
    (endSec !== undefined &&
      (!Number.isFinite(endSec) ||
        endSec < startSec ||
        !Number.isSafeInteger(endTick)))
  )
    throw new Error("Invalid clip checkpoint source or start time");
  signal?.throwIfAborted();
  const key = `${config.prefix}${sourceDemo}`;
  const checkSource = async () => {
    const source = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
      {
        abortSignal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
      },
    );
    signal?.throwIfAborted();
    if (source.ETag !== sourceETag)
      throw new Error("The recording changed while this clip was prepared.");
    if (
      source.ContentLength !== undefined &&
      source.ContentLength > MAX_CLIP_SOURCE_BYTES
    )
      throw new Error("The recording is too large to prepare a clip.");
  };
  await checkSource();
  const directory = await fsp.mkdtemp(
    path.join(os.tmpdir(), "clip-checkpoint-"),
  );
  try {
    const input = path.join(directory, "source.rec");
    const output = path.join(directory, "checkpoint.json");
    const object = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      {
        abortSignal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(5 * 60_000)])
          : AbortSignal.timeout(5 * 60_000),
      },
    );
    signal?.throwIfAborted();
    if (object.ETag !== sourceETag || !object.Body) {
      (object.Body as Readable | undefined)?.destroy?.();
      throw new Error("The recording changed while this clip was prepared.");
    }
    let received = 0;
    const limit = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        received += chunk.length;
        done(
          received > MAX_CLIP_SOURCE_BYTES
            ? new Error("The recording is too large to prepare a clip.")
            : null,
          chunk,
        );
      },
    });
    await pipeline(
      object.Body as Readable,
      limit,
      fs.createWriteStream(input),
      {
        signal,
      },
    );
    signal?.throwIfAborted();
    const result = await runClipCheckpointProcess(
      input,
      output,
      assetRoot,
      tick,
      signal,
      endTick,
    );
    signal?.throwIfAborted();
    await checkSource();
    const stat = await fsp.stat(output);
    if (stat.size > MAX_CLIP_CHECKPOINT_BYTES)
      throw new Error("The clip checkpoint is too large.");
    const text = await fsp.readFile(output, "utf8");
    signal?.throwIfAborted();
    return {
      text,
      sourceSha256: result.demoSha256,
      sourceBytes: result.demoBytes,
    };
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
}
