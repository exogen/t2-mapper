import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { DemoParser } from "t2-demo-parser";
import {
  clipCheckpointVersion,
  clipStartTick,
  MAX_CLIP_CHECKPOINT_BYTES,
  MAX_CLIP_SOURCE_BYTES,
  prepareClipCheckpoint,
  putClipCheckpoint,
} from "../../relay/clipCheckpoint.js";
import { MAX_CLIP_BODY_BYTES, readClipTake } from "../../relay/clipTypes.js";
import type { DemoUploadConfig } from "../../relay/demoUpload.js";
import { isMissingObject } from "../../relay/privateDemoStore.js";
import {
  isSupportedDemoCheckpointVersion,
  readDemoCheckpoints,
  type DemoCheckpointSidecar,
} from "../../src/stream/demoCheckpoints";
import { DemoStreamAdapter } from "../../src/stream/demoStreaming";

type Options = {
  client: S3Client;
  config: DemoUploadConfig;
  timelineKey: string;
  assetRoot: string;
  filter?: string;
  force: boolean;
  dryRun: boolean;
};

export async function backfillClipCheckpoint({
  client,
  config,
  timelineKey,
  assetRoot,
  filter,
  force,
  dryRun,
}: Options) {
  const checkpointKey = timelineKey.replace(
    /timeline\.json$/,
    "checkpoint.json",
  );
  const input = (Key: string) => ({ Bucket: config.bucket, Key });
  const get = (key: string, etag?: string) =>
    client.send(new GetObjectCommand({ ...input(key), IfMatch: etag }), {
      abortSignal: AbortSignal.timeout(60_000),
    });
  const timeline = await get(timelineKey);
  if (
    !timeline.Body ||
    !timeline.ETag ||
    (timeline.ContentLength ?? 0) > MAX_CLIP_BODY_BYTES
  )
    throw new Error("Cannot read the saved clip timeline");
  const take = readClipTake(
    JSON.parse(await timeline.Body.transformToString()),
  );
  const sourceKey = config.prefix + take.sourceDemo;
  if (
    filter &&
    !checkpointKey.includes(filter) &&
    !timelineKey.includes(filter) &&
    !sourceKey.includes(filter)
  )
    return "filtered";
  const source = await client.send(new HeadObjectCommand(input(sourceKey)), {
    abortSignal: AbortSignal.timeout(30_000),
  });
  if (
    !source.ETag ||
    source.ContentLength == null ||
    source.ContentLength > MAX_CLIP_SOURCE_BYTES
  )
    throw new Error("Cannot identify the clip's source recording");
  const originalETag = timeline.Metadata?.["demo-etag"];
  let originalSha = timeline.Metadata?.["demo-sha256"];
  if (originalETag && source.ETag !== originalETag)
    throw new Error("The clip source recording changed");
  const startSec = take.samples[0].demoTimeSec;
  const endSec = take.samples.at(-1)!.demoTimeSec;
  const cached = await get(checkpointKey).catch((error) => {
    if (!isMissingObject(error)) throw error;
    return null;
  });
  if (cached && (!cached.Body || !cached.ETag))
    throw new Error("Incomplete clip checkpoint response");
  const cachedSourceSha = cached?.Metadata?.["demo-sha256"];
  if (!originalSha && cachedSourceSha && /^[a-f0-9]{64}$/.test(cachedSourceSha))
    originalSha = cachedSourceSha;
  if (
    cached &&
    (!force || !originalSha) &&
    (cached.ContentLength ?? 0) <= MAX_CLIP_CHECKPOINT_BYTES
  ) {
    const text = await cached.Body!.transformToString();
    if (cached.Metadata?.["checkpoint-sha256"]) {
      if (
        !force &&
        clipCheckpointVersion(
          cached.Metadata,
          source.ETag,
          startSec,
          originalSha,
        ) !== undefined &&
        cached.Metadata["checkpoint-sha256"] ===
          createHash("sha256").update(text).digest("hex")
      )
        return "current";
    } else {
      // Legacy sidecars can identify the original source even when their saved
      // state is obsolete or corrupt.
      let sidecar: DemoCheckpointSidecar | undefined;
      try {
        sidecar = JSON.parse(text);
      } catch {
        /* Rebuild malformed JSON below. */
      }
      if (
        !originalSha &&
        sidecar?.format === "t2-mapper-seek-checkpoints" &&
        typeof sidecar.demoSha256 === "string" &&
        /^[a-f0-9]{64}$/.test(sidecar.demoSha256)
      )
        originalSha = sidecar.demoSha256;
      if (
        !force &&
        sidecar &&
        (!originalSha || originalSha === sidecar.demoSha256) &&
        isSupportedDemoCheckpointVersion(sidecar.version) &&
        sidecar.demoBytes === source.ContentLength &&
        sidecar.checkpoints?.length === 1 &&
        sidecar.checkpoints[0]?.tick === clipStartTick(startSec)
      ) {
        const demo = await get(sourceKey, source.ETag);
        if (!demo.Body) throw new Error("Cannot read the source recording");
        const bytes = await demo.Body.transformToByteArray();
        const buffer = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer;
        const parser = new DemoParser(new Uint8Array(buffer));
        await parser.load();
        try {
          DemoStreamAdapter.verifyCheckpointRestoration(
            parser,
            await readDemoCheckpoints(text, buffer),
          );
          return "current";
        } catch {
          /* The stored state cannot be used for playback. */
        }
      }
    }
  } else if (cached?.Body) {
    await cached.Body.transformToWebStream().cancel();
  }
  if (dryRun) return "planned";
  const prepared = await prepareClipCheckpoint({
    config,
    client,
    assetRoot,
    sourceDemo: take.sourceDemo,
    sourceETag: source.ETag,
    startSec,
    endSec,
  });
  if (originalSha && prepared.sourceSha256 !== originalSha)
    throw new Error("The clip source recording changed");
  const checkTimeline = () =>
    client.send(
      new HeadObjectCommand({ ...input(timelineKey), IfMatch: timeline.ETag }),
      { abortSignal: AbortSignal.timeout(30_000) },
    );
  await checkTimeline();
  const published = await putClipCheckpoint(
    client,
    config,
    checkpointKey,
    prepared,
    source.ETag,
    startSec,
    { replaceETag: cached?.ETag ?? null },
  );
  // A deletion can remove both objects between the last HEAD and a create-only PUT.
  if (!cached) {
    try {
      await checkTimeline();
    } catch (error) {
      if (isMissingObject(error) && published.ETag)
        await client.send(
          new DeleteObjectCommand({
            ...input(checkpointKey),
            IfMatch: published.ETag,
          }),
          { abortSignal: AbortSignal.timeout(30_000) },
        );
      throw error;
    }
  }
  return "published";
}
