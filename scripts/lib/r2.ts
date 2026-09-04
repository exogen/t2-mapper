/**
 * The demo bucket from a script: the client the relay's uploader builds,
 * from the same DEMO_R2_* variables, and a full listing.
 */
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import {
  loadUploadConfig,
  type DemoUploadConfig,
} from "../../relay/demoUpload.js";

/**
 * The bucket client, or a clear exit when the environment lacks the
 * DEMO_R2_* variables. `runHint` names the npm script that loads
 * `.env.development.local`, when there is one.
 */
export function r2Client(runHint?: string): {
  client: S3Client;
  config: DemoUploadConfig;
} {
  const config = loadUploadConfig();
  if (!config) {
    console.error(
      "Missing DEMO_R2_* env vars (endpoint, bucket, access key, secret).",
    );
    if (runHint) {
      console.error(`Run via \`${runHint}\` to load .env.development.local.`);
    }
    process.exit(1);
  }
  const client = new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return { client, config };
}

/** Every object under the prefix (the bucket's demo folder by default). */
export async function listAllObjects(
  client: S3Client,
  config: DemoUploadConfig,
  prefix = config.prefix,
): Promise<{ key: string; size: number; lastModified?: Date }[]> {
  const out: { key: string; size: number; lastModified?: Date }[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) {
      if (o.Key) {
        out.push({
          key: o.Key,
          size: o.Size ?? 0,
          lastModified: o.LastModified,
        });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** Every key under the prefix. */
export async function listAllKeys(
  client: S3Client,
  config: DemoUploadConfig,
  prefix = config.prefix,
): Promise<string[]> {
  return (await listAllObjects(client, config, prefix)).map((o) => o.key);
}
