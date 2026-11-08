import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";

export interface DemoMetadataCacheConfig {
  bucket: string;
  prefix: string;
}

export interface DemoMetadataCacheResult {
  key: string;
  status: "current" | "needs-update" | "updated";
  previousCacheControl: string | null;
}

/** Only the published catalog and original metadata sidecars, never recordings. */
export function isPublishedDemoMetadataKey(
  key: string,
  prefix: string,
): boolean {
  if (!key.startsWith(prefix)) return false;
  const name = key.slice(prefix.length);
  return (
    !name.includes("/") && (name === "index.json" || name.endsWith(".rec.json"))
  );
}

/** Change only the cache header, conditionally preserving the exact current bytes. */
export async function normalizeDemoMetadataCache(
  client: S3Client,
  config: DemoMetadataCacheConfig,
  key: string,
  apply = false,
): Promise<DemoMetadataCacheResult> {
  if (!isPublishedDemoMetadataKey(key, config.prefix))
    throw new Error(`Not published demo metadata: ${key}`);
  const object = { Bucket: config.bucket, Key: key };
  const head = await client.send(new HeadObjectCommand(object));
  const previousCacheControl = head.CacheControl ?? null;
  if (head.CacheControl === "no-cache")
    return { key, status: "current", previousCacheControl };
  if (!apply) return { key, status: "needs-update", previousCacheControl };

  for (let attempt = 0; ; attempt++) {
    const current = await client.send(new GetObjectCommand(object));
    if (current.CacheControl === "no-cache") {
      await current.Body?.transformToByteArray();
      return { key, status: "current", previousCacheControl };
    }
    if (!current.ETag || !current.Body)
      throw new Error(`Missing ETag or body for demo metadata: ${key}`);
    const body = await current.Body.transformToByteArray();
    try {
      await client.send(
        new PutObjectCommand({
          ...object,
          Body: body,
          CacheControl: "no-cache",
          IfMatch: current.ETag,
          ...(current.ContentType !== undefined && {
            ContentType: current.ContentType,
          }),
          ...(current.ContentEncoding !== undefined && {
            ContentEncoding: current.ContentEncoding,
          }),
          ...(current.ContentLanguage !== undefined && {
            ContentLanguage: current.ContentLanguage,
          }),
          ...(current.ContentDisposition !== undefined && {
            ContentDisposition: current.ContentDisposition,
          }),
          ...(current.Expires !== undefined && { Expires: current.Expires }),
          ...(current.Metadata !== undefined && { Metadata: current.Metadata }),
        }),
      );
      return { key, status: "updated", previousCacheControl };
    } catch (error) {
      if (
        attempt >= 2 ||
        !(error instanceof Error) ||
        error.name !== "PreconditionFailed"
      )
        throw error;
    }
  }
}
