/**
 * Private per-demo sidecars (player GUIDs, player stats). They live in a
 * separate bucket because the demo bucket's custom domain serves every key
 * in it publicly. Keys mirror the published layout: `<prefix><demo key><suffix>`.
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { loadUploadConfig, type DemoUploadConfig } from "./demoUpload.js";

/**
 * The demo bucket's endpoint and credentials with `DEMO_PRIVATE_R2_BUCKET`, or
 * null when that bucket is not configured. Keys mirror the published layout
 * under `DEMO_PRIVATE_R2_PREFIX` (default: the demo prefix).
 */
export function loadPrivateDemoStorageConfig(
  env: NodeJS.ProcessEnv = process.env,
): DemoUploadConfig | null {
  const demos = loadUploadConfig(env);
  const bucket = env.DEMO_PRIVATE_R2_BUCKET?.trim();
  if (!demos || !bucket) return null;
  if (bucket === demos.bucket)
    throw new Error(
      "DEMO_PRIVATE_R2_BUCKET must name a separate bucket without public access",
    );
  return {
    ...demos,
    bucket,
    prefix: env.DEMO_PRIVATE_R2_PREFIX ?? demos.prefix,
  };
}

/** S3's "no such object" from a get or head. */
export function isMissingObject(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "NoSuchKey" || error.name === "NotFound")
  );
}

function requestSignal(signal?: AbortSignal): AbortSignal {
  signal?.throwIfAborted();
  const timeout = AbortSignal.timeout(30_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** JSON sidecars by published demo key (`x.rec`, `users/…/x.rec`) and suffix. */
export class PrivateDemoStore {
  private readonly config: DemoUploadConfig;
  private readonly client: S3Client;

  constructor(config: DemoUploadConfig, client?: S3Client) {
    this.config = config;
    this.client =
      client ??
      new S3Client({
        region: "auto",
        endpoint: config.endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  private key(demoKey: string, suffix: string): string {
    return `${this.config.prefix}${demoKey}${suffix}`;
  }

  /** The parsed sidecar, or null when it does not exist. */
  async read(
    demoKey: string,
    suffix: string,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const abortSignal = requestSignal(signal);
    try {
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(demoKey, suffix),
        }),
        { abortSignal },
      );
      abortSignal.throwIfAborted();
      if (!object.Body) throw new Error(`Empty sidecar: ${demoKey}${suffix}`);
      const json = await object.Body.transformToString();
      abortSignal.throwIfAborted();
      return JSON.parse(json);
    } catch (error) {
      abortSignal.throwIfAborted();
      if (isMissingObject(error)) return null;
      throw error;
    }
  }

  async put(
    demoKey: string,
    suffix: string,
    value: unknown,
    signal?: AbortSignal,
  ): Promise<void> {
    const abortSignal = requestSignal(signal);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(demoKey, suffix),
        Body: JSON.stringify(value),
        ContentType: "application/json; charset=utf-8",
      }),
      { abortSignal },
    );
    abortSignal.throwIfAborted();
  }

  /** Succeeds when the sidecar is already absent. */
  async delete(
    demoKey: string,
    suffix: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const abortSignal = requestSignal(signal);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(demoKey, suffix),
      }),
      { abortSignal },
    );
    abortSignal.throwIfAborted();
  }

  /** Demo keys that have a sidecar with this suffix. */
  async listDemoKeys(suffix: string, signal?: AbortSignal): Promise<string[]> {
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const abortSignal = requestSignal(signal);
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: this.config.prefix,
          ContinuationToken: token,
        }),
        { abortSignal },
      );
      abortSignal.throwIfAborted();
      for (const { Key } of page.Contents ?? [])
        if (Key?.endsWith(suffix))
          keys.push(Key.slice(this.config.prefix.length, -suffix.length));
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
      if (page.IsTruncated && !token)
        throw new Error("Incomplete private sidecar listing");
    } while (token);
    return keys;
  }
}
