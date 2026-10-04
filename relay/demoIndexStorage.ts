import {
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import type { DemoMetadata } from "./demoRecorder.js";

/** Re-read and merge after conflicts with another relay, backfill, or editor.
 *  A missing index is null; returning undefined skips an unnecessary write. */
export async function updateDemoIndex(
  client: S3Client,
  bucket: string,
  key: string,
  update: (entries: DemoMetadata[] | null) => DemoMetadata[] | undefined,
  backup?: (key: string, body: string) => Promise<void>,
): Promise<number> {
  for (let attempt = 0; ; attempt++) {
    let entries: DemoMetadata[] | null = null;
    let etag: string | undefined;
    try {
      const current = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const body = await current.Body!.transformToString();
      const parsed: unknown = JSON.parse(body);
      if (!Array.isArray(parsed) || !current.ETag)
        throw new Error(`Invalid demo index or missing ETag: ${key}`);
      entries = parsed as DemoMetadata[];
      etag = current.ETag;
      await backup?.(key, body);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        (error.name !== "NoSuchKey" && error.name !== "NotFound")
      )
        throw error;
    }
    const merged = update(entries);
    if (!merged) return entries?.length ?? 0;
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: JSON.stringify(merged),
          ContentType: "application/json; charset=utf-8",
          CacheControl: "no-cache",
          ...(etag ? { IfMatch: etag } : { IfNoneMatch: "*" }),
        }),
      );
      return merged.length;
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
