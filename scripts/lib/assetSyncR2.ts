import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { AssetMetadata } from "./assetMetadata.js";
import type {
  AssetSyncState,
  AssetSyncStore,
  RemoteAsset,
} from "./assetSync.js";

export function parseAssetBucket(value: string) {
  const url = new URL(value);
  if (url.protocol !== "s3:" || !url.hostname || url.search || url.hash) {
    throw new Error("Expected --bucket s3://bucket/prefix/");
  }
  const prefix = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, "");
  if (!prefix)
    throw new Error(
      "An asset prefix is required; refusing to synchronize a bucket root.",
    );
  return {
    bucket: url.hostname,
    prefix: `${prefix}/`,
    url: `s3://${url.hostname}/${prefix}/`,
  };
}

function headers(metadata: AssetMetadata) {
  return {
    ContentType: metadata.contentType,
    CacheControl: metadata.cacheControl,
    ContentEncoding: metadata.contentEncoding,
  };
}

export function createAssetSyncStore(
  bucketUrl: string,
  client: S3Client,
): AssetSyncStore {
  const { bucket: Bucket, prefix } = parseAssetBucket(bucketUrl);
  // Outside the public asset prefix, separately scoped for each destination.
  const stateKey = `.asset-sync/${createHash("sha256").update(prefix).digest("hex")}.json`;
  return {
    async readState() {
      try {
        const result = await client.send(
          new GetObjectCommand({ Bucket, Key: stateKey }),
        );
        const value: AssetSyncState = JSON.parse(
          await result.Body!.transformToString(),
        );
        if (
          value.version !== 1 ||
          typeof value.policy !== "string" ||
          typeof value.compression !== "string" ||
          (value.fingerprint != null &&
            typeof value.fingerprint !== "string") ||
          !Array.isArray(value.pending) ||
          !value.pending.every((key) => typeof key === "string") ||
          (value.pendingMetadata != null &&
            (!Array.isArray(value.pendingMetadata) ||
              !value.pendingMetadata.every(
                (key) => typeof key === "string",
              ))) ||
          !Array.isArray(value.report) ||
          !value.report.every((line) => typeof line === "string") ||
          !result.ETag
        ) {
          throw new Error(
            "Invalid asset sync state; inspect it before synchronizing.",
          );
        }
        return { value, etag: result.ETag };
      } catch (error) {
        if ((error as { name?: string }).name === "NoSuchKey") return undefined;
        throw error;
      }
    },
    async writeState(value, previousEtag) {
      const result = await client.send(
        new PutObjectCommand({
          Bucket,
          Key: stateKey,
          Body: JSON.stringify(value),
          ContentType: "application/json",
          CacheControl: "no-store",
          ...(previousEtag ? { IfMatch: previousEtag } : { IfNoneMatch: "*" }),
        }),
      );
      if (!result.ETag)
        throw new Error("R2 did not return an ETag for the sync state.");
      return result.ETag;
    },
    async list() {
      const objects = new Map<string, RemoteAsset>();
      let token: string | undefined;
      do {
        const result = await client.send(
          new ListObjectsV2Command({
            Bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const object of result.Contents ?? []) {
          if (
            object.Key == null ||
            object.Size == null ||
            object.ETag == null ||
            !object.Key.startsWith(prefix)
          ) {
            throw new Error("Incomplete R2 object listing.");
          }
          objects.set(object.Key.slice(prefix.length), {
            size: object.Size,
            etag: object.ETag,
          });
        }
        if (
          result.IsTruncated &&
          (!result.NextContinuationToken ||
            result.NextContinuationToken === token)
        ) {
          throw new Error(
            "Truncated R2 listing without a new continuation token.",
          );
        }
        token = result.IsTruncated ? result.NextContinuationToken : undefined;
      } while (token);
      return objects;
    },
    async upload(key, file, metadata) {
      // The SDK cannot retry a consumed Node stream. Reopen the file for
      // each attempt while keeping memory bounded for large assets.
      for (let attempt = 1; ; attempt++) {
        try {
          const handle = await fs.open(file);
          try {
            const { size } = await handle.stat();
            await client.send(
              new PutObjectCommand({
                Bucket,
                Key: `${prefix}${key}`,
                Body: handle.createReadStream(),
                ContentLength: size,
                ...headers(metadata),
              }),
            );
            return;
          } finally {
            await handle.close();
          }
        } catch (error) {
          const failure = error as {
            name?: string;
            code?: string;
            $metadata?: { httpStatusCode?: number };
          };
          const status = failure.$metadata?.httpStatusCode ?? 0;
          const retryable =
            status === 429 ||
            (status >= 500 && status <= 599) ||
            failure.name === "TimeoutError" ||
            failure.name === "RequestTimeout" ||
            [
              "ECONNRESET",
              "ETIMEDOUT",
              "EPIPE",
              "ECONNREFUSED",
              "EAI_AGAIN",
              "ENETUNREACH",
              "EHOSTUNREACH",
            ].includes(failure.code ?? "");
          if (attempt >= 3 || !retryable) throw error;
          await setTimeout(500 * 2 ** (attempt - 1));
        }
      }
    },
    async updateMetadata(key, metadata) {
      await client.send(
        new CopyObjectCommand({
          Bucket,
          Key: `${prefix}${key}`,
          CopySource: [Bucket, ...`${prefix}${key}`.split("/")]
            .map(encodeURIComponent)
            .join("/"),
          MetadataDirective: "REPLACE",
          ...headers(metadata),
        }),
      );
    },
    async delete(keys) {
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket,
          Delete: {
            Objects: keys.map((key) => ({ Key: `${prefix}${key}` })),
            Quiet: true,
          },
        }),
      );
      if (result.Errors?.length) {
        throw new Error(
          `R2 failed to delete objects: ${JSON.stringify(result.Errors)}`,
        );
      }
    },
  };
}
