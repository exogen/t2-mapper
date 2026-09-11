import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createAssetSyncStore, parseAssetBucket } from "./assetSyncR2.js";
import { metadataFor, precompressedMetadataFor } from "./assetMetadata.js";
import type { AssetSyncState } from "./assetSync.js";

vi.mock("node:timers/promises", () => ({ setTimeout: vi.fn(async () => {}) }));

describe("R2 sync storage", () => {
  const client = new S3Client({
    region: "auto",
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
  const send = vi.fn<(command: unknown) => Promise<unknown>>();
  vi.spyOn(client, "send").mockImplementation(send as typeof client.send);
  const store = createAssetSyncStore("s3://assets/game/base/", client);
  const state: AssetSyncState = {
    version: 1,
    fingerprint: "A",
    policy: "policy",
    compression: "br:11",
    pending: [],
    report: [],
  };
  let directory: string;
  let file: string;
  const payload = Buffer.from("a shape ".repeat(16384));
  beforeEach(async () => {
    send.mockReset();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "asset-upload-test-"));
    file = path.join(directory, "shape.dts");
    await fs.writeFile(file, payload);
  });
  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("reopens streamed uploads from byte zero after a transient failure", async () => {
    const received: Buffer[] = [];
    send.mockImplementation(async (command) => {
      const input = (command as PutObjectCommand).input;
      const chunks: Buffer[] = [];
      for await (const chunk of input.Body as AsyncIterable<Buffer>)
        chunks.push(chunk);
      received.push(Buffer.concat(chunks));
      expect(input).toMatchObject({
        ContentType: "application/octet-stream",
        ContentLength: payload.length,
      });
      if (received.length === 1)
        throw Object.assign(new Error("unavailable"), {
          $metadata: { httpStatusCode: 503 },
        });
      return {};
    });
    await store.upload("shape.dts", file, metadataFor("shape.dts")!);
    expect(received).toEqual([payload, payload]);
  });

  it("retries connection resets, but stops after three failed attempts", async () => {
    send.mockRejectedValue(
      Object.assign(new Error("reset"), { code: "ECONNRESET" }),
    );
    await expect(
      store.upload("shape.dts", file, metadataFor("shape.dts")!),
    ).rejects.toThrow("reset");
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("does not retry invalid credentials or missing local files", async () => {
    send.mockRejectedValue(
      Object.assign(new Error("denied"), {
        $metadata: { httpStatusCode: 403 },
      }),
    );
    await expect(
      store.upload("shape.dts", file, metadataFor("shape.dts")!),
    ).rejects.toThrow("denied");
    expect(send).toHaveBeenCalledTimes(1);
    send.mockClear();
    await expect(
      store.upload("shape.dts", `${file}.missing`, metadataFor("shape.dts")!),
    ).rejects.toThrow("ENOENT");
    expect(send).not.toHaveBeenCalled();
  });

  it("uses one paginated traversal and preserves spaces and filename case", async () => {
    send.mockResolvedValueOnce({
      IsTruncated: true,
      NextContinuationToken: "next",
      Contents: [{ Key: "game/base/a file.PNG", Size: 5, ETag: '"a"' }],
    });
    send.mockResolvedValueOnce({
      IsTruncated: false,
      Contents: [{ Key: "game/base/tree.dts.br", Size: 10, ETag: '"b"' }],
    });
    expect(await store.list()).toEqual(
      new Map([
        ["a file.PNG", { size: 5, etag: '"a"' }],
        ["tree.dts.br", { size: 10, etag: '"b"' }],
      ]),
    );
    expect(send).toHaveBeenCalledTimes(2);
    const second = send.mock.calls[1][0] as ListObjectsV2Command;
    expect(second).toBeInstanceOf(ListObjectsV2Command);
    expect(second.input).toEqual({
      Bucket: "assets",
      Prefix: "game/base/",
      ContinuationToken: "next",
    });
  });

  it("rejects partial listings instead of treating them as an empty bucket", async () => {
    send.mockResolvedValueOnce({ IsTruncated: true });
    await expect(store.list()).rejects.toThrow("Truncated");
    send.mockResolvedValueOnce({ Contents: [{ Key: "game/base/a.dts" }] });
    await expect(store.list()).rejects.toThrow("Incomplete");
  });

  it("treats only NoSuchKey as missing state, preserving permission and network errors", async () => {
    send.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { name: "NoSuchKey" }),
    );
    expect(await store.readState()).toBeUndefined();
    send.mockRejectedValueOnce(new Error("AccessDenied"));
    await expect(store.readState()).rejects.toThrow("AccessDenied");
  });

  it("reads validated sync state and rejects incompatible data", async () => {
    send.mockResolvedValueOnce({
      ETag: '"state"',
      Body: { transformToString: async () => JSON.stringify(state) },
    });
    expect(await store.readState()).toEqual({ etag: '"state"', value: state });
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    send.mockResolvedValueOnce({
      ETag: '"state"',
      Body: { transformToString: async () => '{"version":2}' },
    });
    await expect(store.readState()).rejects.toThrow("Invalid");
  });

  it("keeps state outside the asset prefix and uses conditional writes", async () => {
    send.mockResolvedValue({ ETag: '"new"' });
    await store.writeState(state);
    const initial = send.mock.calls[0][0] as PutObjectCommand;
    expect(initial.input.Key).toMatch(/^\.asset-sync\/[a-f0-9]+\.json$/);
    expect(initial.input).toMatchObject({
      IfNoneMatch: "*",
      CacheControl: "no-store",
      ContentType: "application/json",
    });
    await store.writeState(state, '"old"');
    expect((send.mock.calls[1][0] as PutObjectCommand).input).toMatchObject({
      IfMatch: '"old"',
    });
    send.mockRejectedValueOnce(new Error("PreconditionFailed"));
    await expect(store.writeState(state, '"stale"')).rejects.toThrow(
      "PreconditionFailed",
    );
  });

  it("checks per-object deletion errors even in a successful HTTP response", async () => {
    send.mockResolvedValueOnce({
      Errors: [{ Key: "game/base/old.dts", Code: "AccessDenied" }],
    });
    await expect(store.delete(["old.dts"])).rejects.toThrow("AccessDenied");
    const command = send.mock.calls[0][0] as DeleteObjectsCommand;
    expect(command.input.Delete?.Objects).toEqual([
      { Key: "game/base/old.dts" },
    ]);
  });

  it("preserves br encoding during metadata updates and URL-encodes copy source keys", async () => {
    send.mockResolvedValueOnce({});
    await store.updateMetadata(
      "a file#.dts.br",
      precompressedMetadataFor("a file#.dts")!,
    );
    const command = send.mock.calls[0][0] as CopyObjectCommand;
    expect(command.input).toMatchObject({
      Key: "game/base/a file#.dts.br",
      CopySource: "assets/game/base/a%20file%23.dts.br",
      MetadataDirective: "REPLACE",
      ContentType: "application/octet-stream",
      ContentEncoding: "br",
    });
  });

  it("requires a bucket prefix", () => {
    expect(() => parseAssetBucket("s3://assets/")).toThrow("bucket root");
    expect(() => parseAssetBucket("https://assets/base/")).toThrow("Expected");
    expect(parseAssetBucket("s3://assets/game/base").url).toBe(
      "s3://assets/game/base/",
    );
  });
});
