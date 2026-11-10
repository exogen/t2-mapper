import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { DemoMetadata } from "../../relay/demoMetadata.js";

/** Re-read and conditionally replace a sidecar so concurrent edits survive. */
export async function updateDemoMetadata(
  client: S3Client,
  bucket: string,
  key: string,
  update: (latest: DemoMetadata | undefined) => DemoMetadata,
  backup: (key: string, body: string) => Promise<void>,
  { existingOnly = false }: { existingOnly?: boolean } = {},
): Promise<DemoMetadata> {
  for (let attempt = 0; ; attempt++) {
    let latest: DemoMetadata | undefined;
    let etag: string | undefined;
    try {
      const current = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const body = await current.Body!.transformToString();
      latest = JSON.parse(body);
      etag = current.ETag;
      if (
        !latest ||
        typeof latest !== "object" ||
        Array.isArray(latest) ||
        !etag
      )
        throw new Error(`Invalid demo sidecar: ${key}`);
      await backup(key, body);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "NoSuchKey") throw error;
    }
    if (existingOnly && !latest)
      throw new Error(`Cannot update missing demo sidecar: ${key}`);
    const merged = update(latest);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(merged, null, 2),
          ContentType: "application/json; charset=utf-8",
          CacheControl: "no-cache",
          ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
        }),
      );
      return merged;
    } catch (error) {
      if (
        attempt >= 4 ||
        !(error instanceof Error) ||
        error.name !== "PreconditionFailed"
      )
        throw error;
    }
  }
}
