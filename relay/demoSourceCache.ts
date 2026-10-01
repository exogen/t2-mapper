import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { DemoUploadConfig } from "./demoUpload.js";
import type { RemoteDemo } from "./demoSources.js";
import { demoLog as log } from "./logger.js";
import {
  contentDispositionFilename,
  sourceDemoMetadata,
  type SourceDemoMetadata,
} from "./demoSourceMetadata.js";
import {
  validateSourceDemo,
  sourceDemoLength,
  DemoTooLargeError,
  MAX_SOURCE_DEMO_BYTES,
} from "./demoSourceValidation.js";
import { throttleDemoDownload } from "./demoBandwidth.js";
import {
  demoImportQueue,
  DemoImportQueueFull,
  DEMO_TRANSFER_TIMEOUT_MS,
} from "./demoImportQueue.js";

export class DemoSourceNotFound extends Error {
  constructor() {
    super("Demo not found at the source");
  }
}

export interface DemoSourceCacheOptions {
  publishCheckpoints?: (key: string, force?: boolean) => Promise<unknown>;
}

/** Persistent source cache. Only completed objects are advertised to browsers. */
export class DemoSourceCache {
  private readonly client: S3Client;
  private readonly config: DemoUploadConfig;
  private readonly publicBaseUrl: string;
  private readonly options: DemoSourceCacheOptions;
  // Retain completed results briefly so a poll sees failures as well as
  // successes, instead of silently starting another import after a failure.
  private readonly requests = new Map<
    string,
    { promise: Promise<string>; expiresAt: number }
  >();

  constructor(
    config: DemoUploadConfig,
    publicBaseUrl: string,
    options: DemoSourceCacheOptions = {},
  ) {
    const base = new URL(publicBaseUrl);
    if (
      !/^https?:$/.test(base.protocol) ||
      base.search ||
      base.hash ||
      base.username ||
      base.password
    ) {
      throw new Error("DEMOS_BASE_URL must be a public HTTP(S) directory URL");
    }
    this.config = config;
    this.options = options;
    this.publicBaseUrl = base.href.replace(/\/+$/, "");
    this.client = new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      forcePathStyle: true,
      // Preserve a plain, known-length streaming PUT instead of wrapping it
      // in the SDK's optional AWS chunked-checksum transfer format.
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  ensure(demo: RemoteDemo): Promise<string> {
    for (const [key, request] of this.requests) {
      if (request.expiresAt <= Date.now()) this.requests.delete(key);
    }
    const existing = this.requests.get(demo.cachePath);
    if (existing) return existing.promise;
    // Also bound cache lookups and retained results under many distinct IDs.
    if (this.requests.size >= 128) {
      const settled = [...this.requests].find(([, request]) =>
        Number.isFinite(request.expiresAt),
      );
      if (!settled) return Promise.reject(new DemoImportQueueFull());
      this.requests.delete(settled[0]);
    }
    const request = {
      promise: this.findOrImport(demo),
      expiresAt: Infinity,
    };
    const settled = () => {
      request.expiresAt = Date.now() + 30_000;
    };
    void request.promise.then(settled, (err: unknown) => {
      settled();
      // Imports outlive HTTP polls, so log failures even if nobody returns.
      log.warn(
        { err, source: demo.source, id: demo.id },
        "External demo cache failed",
      );
    });
    this.requests.set(demo.cachePath, request);
    return request.promise;
  }

  private async findOrImport(demo: RemoteDemo): Promise<string> {
    const prefix = this.config.prefix.replace(/\/+$/, "");
    const key = `${prefix ? `${prefix}/` : ""}${demo.cachePath}`;
    const url = `${this.publicBaseUrl}/${demo.cachePath}`;
    if (await this.ready(demo, key)) {
      await this.publishCheckpoints(key);
      log.debug({ key }, "External demo cache hit");
      return url;
    }
    await demoImportQueue.run(async () => {
      // A different relay may have filled it while we were queued.
      if (!(await this.ready(demo, key))) await this.importDemo(demo, key);
      else await this.publishCheckpoints(key);
    });
    return url;
  }

  private async publishCheckpoints(
    key: string,
    force?: boolean,
  ): Promise<void> {
    try {
      await this.options.publishCheckpoints?.(key, force);
    } catch (err) {
      log.warn(
        { err, key },
        "External demo checkpoints failed; ordinary playback remains available",
      );
    }
  }

  private async ready(demo: RemoteDemo, key: string): Promise<boolean> {
    if (!(await this.exists(key))) return false;
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.bucket,
          Key: `${key}.json`,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      const metadata = sourceDemoMetadata(
        JSON.parse(await response.Body!.transformToString()),
      );
      return (
        metadata?.source === demo.source &&
        metadata.id === demo.id &&
        metadata.sourceUrl === demo.url
      );
    } catch (err) {
      if (
        err instanceof SyntaxError ||
        (err instanceof Error &&
          (err.name === "NotFound" || err.name === "NoSuchKey"))
      )
        return false;
      throw err;
    }
  }

  private async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      if (
        result.ContentLength != null &&
        result.ContentLength > MAX_SOURCE_DEMO_BYTES
      )
        throw new DemoTooLargeError();
      return true;
    } catch (err) {
      // Permission/network errors are not misses: don't repeatedly download
      // from the source when R2 itself is unavailable or misconfigured.
      if (
        err instanceof Error &&
        (err.name === "NotFound" || err.name === "NoSuchKey")
      )
        return false;
      throw err;
    }
  }

  private async importDemo(demo: RemoteDemo, key: string): Promise<void> {
    log.info(
      { source: demo.source, id: demo.id, key },
      "Caching external demo in R2",
    );
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), DEMO_TRANSFER_TIMEOUT_MS);
    timer.unref();
    let body: Readable | undefined;
    try {
      const fetchedAt = new Date().toISOString();
      const response = await fetch(demo.url, {
        signal: abort.signal,
        headers: { "Accept-Encoding": "identity" },
        redirect: "error",
      });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        if (response.status === 404) throw new DemoSourceNotFound();
        throw new Error(`Demo source returned HTTP ${response.status}`);
      }
      let size: number;
      try {
        size = sourceDemoLength(response.headers);
      } catch (err) {
        await response.body.cancel();
        throw err;
      }
      body = throttleDemoDownload(
        Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
        abort.signal,
        size,
      );
      body.on("error", () => {});
      const header = await validateSourceDemo(body);
      const modified = Date.parse(response.headers.get("last-modified") ?? "");
      const metadata: SourceDemoMetadata = {
        format: "t2-source-demo",
        schemaVersion: 1,
        source: demo.source,
        id: demo.id,
        sourceUrl: demo.url,
        fetchedAt,
        recordedAt: Number.isFinite(modified)
          ? new Date(modified).toISOString()
          : null,
        originalFilename: contentDispositionFilename(
          response.headers.get("content-disposition"),
        ),
        gameVersion: 25034,
        protocolVersion: header.protocolVersion,
        durationMs: header.demoLengthMs,
      };
      await Promise.all([
        this.client.send(
          new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: key,
            Body: body,
            ContentLength: size,
            ContentType: "application/octet-stream",
            CacheControl: "public, max-age=31536000, immutable",
            Metadata: {
              source: demo.source,
              "source-id": demo.id,
              "source-url": demo.url,
            },
          }),
          { abortSignal: abort.signal },
        ),
        // Don't publish metadata if the source ends short or exceeds its size.
        finished(body, { cleanup: true }),
      ]);
      // Replay has its own worker deadline; the source-transfer timer must not
      // abort a completed download while a checkpoint job is queued.
      clearTimeout(timer);
      // Save readiness before optional replay so a restart can reuse the demo.
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: `${key}.json`,
          Body: JSON.stringify(metadata),
          ContentType: "application/json; charset=utf-8",
          CacheControl: "public, max-age=31536000, immutable",
        }),
        { abortSignal: AbortSignal.timeout(30_000) },
      );
      await this.publishCheckpoints(key, true);
      log.info(
        { source: demo.source, id: demo.id, key },
        "External demo cached in R2",
      );
    } finally {
      clearTimeout(timer);
      abort.abort();
      body?.destroy();
    }
  }
}
