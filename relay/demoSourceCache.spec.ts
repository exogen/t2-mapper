import type { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface PutInput {
  Key: string;
  Body: string | Readable;
  ContentLength?: number;
  [key: string]: unknown;
}
const mocks = vi.hoisted(() => ({
  stored: new Map<string, Buffer>(),
  send: vi.fn(),
  put: vi.fn(),
  upload: vi.fn<(input: PutInput) => Promise<void>>(),
  warn: vi.fn(),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = mocks.send;
  },
  GetObjectCommand: class {
    kind = "get";
    input: { Key: string };
    constructor(input: { Key: string }) {
      this.input = input;
    }
  },
  PutObjectCommand: class {
    kind = "put";
    input: PutInput;
    constructor(input: PutInput) {
      this.input = input;
    }
  },
  HeadObjectCommand: class {
    kind = "head";
    input: { Key: string };
    constructor(input: { Key: string }) {
      this.input = input;
    }
  },
}));
vi.mock("./logger", () => ({
  demoLog: { debug: vi.fn(), info: vi.fn(), warn: mocks.warn },
}));

import { DemoSourceCache, DemoSourceNotFound } from "./demoSourceCache";
import { resolveRemoteDemo } from "./demoSources";
import { buildHeader, DEMO_LENGTH_MS_OFFSET } from "./demoWriter";
import {
  DemoValidationError,
  DemoTooLargeError,
  MAX_SOURCE_DEMO_BYTES,
} from "./demoSourceValidation";
import {
  demoImportQueue,
  DemoImportQueueFull,
  MAX_QUEUED_DEMO_IMPORTS,
} from "./demoImportQueue";

const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  bucket: "demos",
  accessKeyId: "test-key",
  secretAccessKey: "test-secret",
  prefix: "demos/",
};
const publicBase = "https://demos.example/demos";
const demo = resolveRemoteDemo("tribesforever", "22945");
const key = "demos/sources/tribesforever/22945.rec";
const cachedUrl = `${publicBase}/sources/tribesforever/22945.rec`;
const header = Buffer.from(buildHeader(3));
header.writeUInt32LE(1259725, DEMO_LENGTH_MS_OFFSET);
const data = new Uint8Array(Buffer.concat([header, Buffer.from([0, 1, 255])]));
function demoResponse(bytes = data) {
  return new Response(bytes, {
    headers: { "Content-Length": String(bytes.length) },
  });
}
const filename =
  "auto-capture_2026-09-08_05-21_DemoBot-Mia_CTFGame_DiscordLT.rec";
const metadata = {
  format: "t2-source-demo",
  schemaVersion: 1,
  source: demo.source,
  id: demo.id,
  sourceUrl: demo.url,
  fetchedAt: "2026-09-28T12:00:00.000Z",
  recordedAt: "2026-09-08T04:44:19.000Z",
  originalFilename: filename,
  gameVersion: 25034,
  protocolVersion: 0x330004,
  durationMs: 1259725,
};
function seedCache(source = demo) {
  const cacheKey = `demos/${source.cachePath}`;
  mocks.stored.set(cacheKey, Buffer.from(data));
  mocks.stored.set(
    `${cacheKey}.json`,
    Buffer.from(
      JSON.stringify({
        ...metadata,
        source: source.source,
        id: source.id,
        sourceUrl: source.url,
      }),
    ),
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.stored.clear();
  mocks.put.mockImplementation(async (input: { Key: string; Body: string }) => {
    mocks.stored.set(input.Key, Buffer.from(input.Body));
    return {};
  });
  mocks.send.mockImplementation(
    async (command: { kind: string; input: PutInput }) => {
      if (command.kind === "put")
        return typeof command.input.Body === "string"
          ? mocks.put(command.input)
          : mocks.upload(command.input);
      const stored = mocks.stored.get(command.input.Key);
      if (!stored)
        throw Object.assign(new Error("missing"), { name: "NotFound" });
      return command.kind === "get"
        ? { Body: { transformToString: async () => stored.toString() } }
        : { ContentLength: stored.length };
    },
  );
  mocks.upload.mockImplementation(async (params) => {
    const chunks: Buffer[] = [];
    for await (const chunk of params.Body as Readable)
      chunks.push(Buffer.from(chunk));
    // Like R2, publish the object only after the entire upload succeeds.
    mocks.stored.set(params.Key, Buffer.concat(chunks));
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(data, {
          headers: {
            "Content-Length": String(data.length),
            "Last-Modified": "Tue, 08 Sep 2026 04:44:19 GMT",
            "Content-Disposition": `attachment; filename=${filename}`,
          },
        }),
    ),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function expireResult() {
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 30_001);
}

describe("external demo R2 cache", () => {
  it("saves cache readiness before replay so a restart reuses the completed transfer", async () => {
    const gate = deferred<void>();
    const publishCheckpoints = vi.fn(async () => {
      expect(mocks.stored.get(key)).toEqual(Buffer.from(data));
      expect(mocks.stored.has(`${key}.json`)).toBe(true);
      await gate.promise;
    });
    const pending = new DemoSourceCache(config, publicBase, {
      publishCheckpoints,
    }).ensure(demo);
    await vi.waitFor(() =>
      expect(publishCheckpoints).toHaveBeenCalledWith(key, true),
    );
    const retryCheckpoints = vi.fn().mockResolvedValue("published");
    expect(
      await new DemoSourceCache(config, publicBase, {
        publishCheckpoints: retryCheckpoints,
      }).ensure(demo),
    ).toBe(cachedUrl);
    expect(retryCheckpoints).toHaveBeenCalledWith(key, undefined);
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
    gate.resolve();
    expect(await pending).toBe(cachedUrl);
    expect(mocks.stored.has(`${key}.json`)).toBe(true);
  });

  it("fills missing/outdated checkpoints on cache hits without contacting the source", async () => {
    seedCache();
    const publishCheckpoints = vi.fn().mockResolvedValue("published");
    expect(
      await new DemoSourceCache(config, publicBase, {
        publishCheckpoints,
      }).ensure(demo),
    ).toBe(cachedUrl);
    expect(publishCheckpoints).toHaveBeenCalledExactlyOnceWith(key, undefined);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not run checkpoint generation on an incomplete download", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(data, {
        headers: { "Content-Length": String(data.length + 1) },
      }),
    );
    const publishCheckpoints = vi.fn();
    await expect(
      new DemoSourceCache(config, publicBase, { publishCheckpoints }).ensure(
        demo,
      ),
    ).rejects.toThrow("Content-Length");
    expect(publishCheckpoints).not.toHaveBeenCalled();
  });

  it("keeps the cached bytes playable when checkpoint replay is unavailable", async () => {
    const publishCheckpoints = vi.fn().mockResolvedValue("failed");
    expect(
      await new DemoSourceCache(config, publicBase, {
        publishCheckpoints,
      }).ensure(demo),
    ).toBe(cachedUrl);
    expect(mocks.stored.has(`${key}.json`)).toBe(true);
  });

  it("keeps a new import playable after a checkpoint upload error and retries without redownloading", async () => {
    const publishCheckpoints = vi
      .fn()
      .mockRejectedValueOnce(new Error("checkpoint upload failed"));
    const cache = new DemoSourceCache(config, publicBase, {
      publishCheckpoints,
    });
    expect(await cache.ensure(demo)).toBe(cachedUrl);
    expect(mocks.stored.has(key)).toBe(true);
    expect(mocks.stored.has(`${key}.json`)).toBe(true);
    expect(await cache.ensure(demo)).toBe(cachedUrl);
    expect(publishCheckpoints).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledOnce();
    expireResult();
    expect(await cache.ensure(demo)).toBe(cachedUrl);
    expect(publishCheckpoints).toHaveBeenLastCalledWith(key, undefined);
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
  });

  it("keeps an existing cache hit playable when checking or uploading checkpoints fails", async () => {
    seedCache();
    const publishCheckpoints = vi
      .fn()
      .mockRejectedValue(new Error("R2 unavailable"));
    expect(
      await new DemoSourceCache(config, publicBase, {
        publishCheckpoints,
      }).ensure(demo),
    ).toBe(cachedUrl);
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("reuses an existing object without contacting the source or uploading", async () => {
    seedCache();
    const cache = new DemoSourceCache(config, publicBase);
    expect(await cache.ensure(demo)).toBe(cachedUrl);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("stores source bytes at a stable per-source key and reuses them after a restart", async () => {
    const cache = new DemoSourceCache(config, publicBase);
    expect(await cache.ensure(demo)).toBe(cachedUrl);
    expect(mocks.stored.get(key)).toEqual(Buffer.from(data));
    const saved = JSON.parse(mocks.stored.get(`${key}.json`)!.toString());
    expect(saved).toEqual({ ...metadata, fetchedAt: expect.any(String) });
    expect(Math.abs(Date.now() - Date.parse(saved.fetchedAt))).toBeLessThan(
      5000,
    );
    expect(mocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: `${key}.json`,
        ContentType: "application/json; charset=utf-8",
      }),
    );
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "demos",
        Key: key,
        ContentLength: data.length,
        ContentType: "application/octet-stream",
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {
          source: "tribesforever",
          "source-id": "22945",
          "source-url": demo.url,
        },
      }),
    );
    expect(await new DemoSourceCache(config, publicBase).ensure(demo)).toBe(
      cachedUrl,
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent requests and waits for upload completion", async () => {
    const download = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(download.promise);
    const cache = new DemoSourceCache(config, publicBase);
    const first = cache.ensure(demo);
    const second = cache.ensure(demo);
    expect(second).toBe(first);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    expect(mocks.stored.has(key)).toBe(false);
    download.resolve(demoResponse());
    expect(await Promise.all([first, second])).toEqual([cachedUrl, cachedUrl]);
    expect(mocks.upload).toHaveBeenCalledOnce();
  });

  it("bounds imports to one at a time while cache hits bypass the queue", async () => {
    const firstDownload = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(firstDownload.promise);
    const cache = new DemoSourceCache(config, publicBase);
    const first = cache.ensure(demo);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const second = cache.ensure(resolveRemoteDemo("tribesforever", "22946"));
    const hit = resolveRemoteDemo("tribesforever", "22947");
    seedCache(hit);
    expect(await cache.ensure(hit)).toBe(`${publicBase}/${hit.cachePath}`);
    expect(fetch).toHaveBeenCalledOnce();
    firstDownload.resolve(demoResponse());
    await Promise.all([first, second]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds cache misses while full queues still allow hits and shared requests", async () => {
    const gate = deferred<void>();
    const blocked = demoImportQueue.run(() => gate.promise);
    const cache = new DemoSourceCache(config, publicBase);
    const demos = Array.from({ length: MAX_QUEUED_DEMO_IMPORTS }, (_, i) =>
      resolveRemoteDemo("tribesforever", String(i + 1)),
    );
    const waiting = demos.map((source) => cache.ensure(source));
    try {
      await expect(cache.ensure(demo)).rejects.toBeInstanceOf(
        DemoImportQueueFull,
      );
      expect(cache.ensure(demos[0])).toBe(waiting[0]);
      seedCache();
      expireResult();
      expect(await cache.ensure(demo)).toBe(cachedUrl);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      gate.resolve();
      await Promise.all([blocked, ...waiting]);
    }
    expect(fetch).toHaveBeenCalledTimes(MAX_QUEUED_DEMO_IMPORTS);
  });

  it("does not publish failed uploads and allows a later request to retry", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("upload failed"));
    const cache = new DemoSourceCache(config, publicBase);
    await expect(cache.ensure(demo)).rejects.toThrow("upload failed");
    expect(mocks.stored.has(key)).toBe(false);
    // Polling must receive the failure, not silently restart the transfer.
    await expect(cache.ensure(demo)).rejects.toThrow("upload failed");
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        source: demo.source,
        id: demo.id,
        err: expect.any(Error),
      }),
      "External demo cache failed",
    );
    expireResult();
    expect(await cache.ensure(demo)).toBe(cachedUrl);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not publish a stream that fails midway", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(c) {
            controller = c;
            c.enqueue(data);
          },
        }),
        { headers: { "Content-Length": String(data.length + 20) } },
      ),
    );
    const pending = new DemoSourceCache(config, publicBase).ensure(demo);
    const failed = expect(pending).rejects.toThrow("connection lost");
    await vi.waitFor(() => expect(mocks.upload).toHaveBeenCalledOnce());
    controller.error(new Error("connection lost"));
    await failed;
    expect(mocks.stored.has(key)).toBe(false);
  });

  it.each(["AccessDenied", "NoSuchBucket", "NetworkError"])(
    "does not treat %s as a cache miss",
    async (name) => {
      mocks.send.mockRejectedValueOnce(
        Object.assign(new Error(name), { name }),
      );
      await expect(
        new DemoSourceCache(config, publicBase).ensure(demo),
      ).rejects.toThrow(name);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("preserves source 404s and never caches their error bodies", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("not a demo", { status: 404 }),
    );
    await expect(
      new DemoSourceCache(config, publicBase).ensure(demo),
    ).rejects.toBeInstanceOf(DemoSourceNotFound);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.stored.has(key)).toBe(false);
  });

  it.each(["", "custom", "custom/"])(
    "honors the configured bucket prefix (%j)",
    async (prefix) => {
      await new DemoSourceCache(
        { ...config, prefix },
        "https://demos.example/custom/",
      ).ensure(demo);
      expect([...mocks.stored.keys()]).toEqual([
        `${prefix ? "custom/" : ""}${demo.cachePath}`,
        `${prefix ? "custom/" : ""}${demo.cachePath}.json`,
      ]);
    },
  );
  it("records missing headers as null", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(demoResponse());
    await new DemoSourceCache(config, publicBase).ensure(demo);
    expect(
      JSON.parse(mocks.stored.get(`${key}.json`)!.toString()),
    ).toMatchObject({ recordedAt: null, originalFilename: null });
  });

  it.each([
    null,
    "invalid JSON",
    JSON.stringify({ ...metadata, gameVersion: 25033 }),
  ])("reimports legacy or invalid metadata (%j)", async (sidecar) => {
    mocks.stored.set(key, Buffer.from(data));
    if (sidecar) mocks.stored.set(`${key}.json`, Buffer.from(sidecar));
    expect(await new DemoSourceCache(config, publicBase).ensure(demo)).toBe(
      cachedUrl,
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      JSON.parse(mocks.stored.get(`${key}.json`)!.toString()).gameVersion,
    ).toBe(25034);
  });

  it("rejects non-v25034 demos before uploading anything", async () => {
    const invalid = new Uint8Array(data);
    new DataView(invalid.buffer).setUint32(
      DEMO_LENGTH_MS_OFFSET - 4,
      0x330003,
      true,
    );
    vi.mocked(fetch).mockResolvedValueOnce(demoResponse(invalid));
    await expect(
      new DemoSourceCache(config, publicBase).ensure(demo),
    ).rejects.toBeInstanceOf(DemoValidationError);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.stored.size).toBe(0);
  });

  it("does not advertise the cache until its metadata is saved", async () => {
    mocks.put.mockRejectedValueOnce(new Error("metadata upload failed"));
    const cache = new DemoSourceCache(config, publicBase);
    await expect(cache.ensure(demo)).rejects.toThrow("metadata upload failed");
    expect(mocks.stored.has(key)).toBe(true);
    expect(mocks.stored.has(`${key}.json`)).toBe(false);
    expireResult();
    expect(await cache.ensure(demo)).toBe(cachedUrl);
    expect(mocks.stored.has(`${key}.json`)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it.each([String(MAX_SOURCE_DEMO_BYTES + 1), null, "invalid"])(
    "rejects unusable source sizes before reading/uploading (%s)",
    async (size) => {
      const cancel = vi.fn();
      const headers = size == null ? {} : { "Content-Length": size };
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(new ReadableStream({ cancel }), { headers }),
      );
      await expect(
        new DemoSourceCache(config, publicBase).ensure(demo),
      ).rejects.toBeInstanceOf(DemoValidationError);
      expect(cancel).toHaveBeenCalledOnce();
      expect(mocks.upload).not.toHaveBeenCalled();
      expect(mocks.put).not.toHaveBeenCalled();
    },
  );

  it("rejects oversized objects already in the cache", async () => {
    mocks.send.mockResolvedValueOnce({
      ContentLength: MAX_SOURCE_DEMO_BYTES + 1,
    });
    await expect(
      new DemoSourceCache(config, publicBase).ensure(demo),
    ).rejects.toBeInstanceOf(DemoTooLargeError);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("does not publish metadata for a truncated source stream", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(data, {
        headers: { "Content-Length": String(data.length + 1) },
      }),
    );
    await expect(
      new DemoSourceCache(config, publicBase).ensure(demo),
    ).rejects.toThrow("Content-Length");
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.stored.has(`${key}.json`)).toBe(false);
  });

  it("retains successful results for polling, then rechecks R2", async () => {
    seedCache();
    const cache = new DemoSourceCache(config, publicBase);
    const first = cache.ensure(demo);
    await first;
    const calls = mocks.send.mock.calls.length;
    expect(cache.ensure(demo)).toBe(first);
    expect(mocks.send).toHaveBeenCalledTimes(calls);
    expireResult();
    expect(await cache.ensure(demo)).toBe(cachedUrl);
    expect(mocks.send).toHaveBeenCalledTimes(calls + 2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("bounds simultaneous R2 checks even before imports reach the queue", async () => {
    const lookup = deferred<never>();
    mocks.send.mockReturnValue(lookup.promise);
    const cache = new DemoSourceCache(config, publicBase);
    for (let i = 1; i <= 128; i++)
      cache.ensure(resolveRemoteDemo("tribesforever", String(i)));
    await expect(cache.ensure(demo)).rejects.toBeInstanceOf(
      DemoImportQueueFull,
    );
    expect(mocks.send).toHaveBeenCalledTimes(128);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("evicts settled results instead of blocking new cached demos", async () => {
    const cache = new DemoSourceCache(config, publicBase);
    for (let i = 1; i <= 129; i++) {
      const source = resolveRemoteDemo("tribesforever", String(i));
      seedCache(source);
      expect(await cache.ensure(source)).toBe(
        `${publicBase}/${source.cachePath}`,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
