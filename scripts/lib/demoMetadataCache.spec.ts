import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { beforeEach, expect, it, vi } from "vitest";
import {
  isPublishedDemoMetadataKey,
  normalizeDemoMetadataCache,
} from "./demoMetadataCache";

const config = { bucket: "bucket", prefix: "demos/" };
const key = "demos/game.rec.json";
const immutable = "public, max-age=31536000, immutable";
const send = vi.fn();
const client = { send } as unknown as S3Client;
const conflict = () =>
  Object.assign(new Error("Changed"), { name: "PreconditionFailed" });
const metadata = (body: Uint8Array, etag = '"one"') => ({
  CacheControl: immutable,
  ETag: etag,
  Body: { transformToByteArray: async () => body },
});

beforeEach(() => {
  send.mockReset();
});

it.each(["demos/index.json", key])("selects published metadata %s", (name) => {
  expect(isPublishedDemoMetadataKey(name, config.prefix)).toBe(true);
});

it.each([
  "demos/game.rec",
  "demos/game.rec.checkpoints.json",
  "demos/game.rec.cast.json",
  "demos/sources/tribesforever/42.rec.json",
  "demos/other/index.json",
  "other/game.rec.json",
])("excludes unrelated objects %s", async (name) => {
  expect(isPublishedDemoMetadataKey(name, config.prefix)).toBe(false);
  await expect(
    normalizeDemoMetadataCache(client, config, name, true),
  ).rejects.toThrow("Not published demo metadata");
  expect(send).not.toHaveBeenCalled();
});

it("uses HEAD only in the default dry run", async () => {
  send.mockResolvedValueOnce({ CacheControl: immutable });
  await expect(
    normalizeDemoMetadataCache(client, config, key),
  ).resolves.toEqual({
    key,
    status: "needs-update",
    previousCacheControl: immutable,
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
});

it("skips already correct metadata", async () => {
  send.mockResolvedValueOnce({ CacheControl: "no-cache" });
  await expect(
    normalizeDemoMetadataCache(client, config, key, true),
  ).resolves.toMatchObject({ status: "current" });
  expect(send).toHaveBeenCalledTimes(1);
});

it("preserves exact bytes and every supported content header with a conditional PUT", async () => {
  const body = Buffer.from('{\r\n  "title": "Å ☃", "unknown": 42\r\n}\n');
  const expires = new Date("2030-01-01T00:00:00Z");
  send
    .mockResolvedValueOnce({ CacheControl: immutable })
    .mockResolvedValueOnce({
      ...metadata(body),
      ContentType: "application/json; charset=utf-8",
      ContentEncoding: "identity",
      ContentLanguage: "en",
      ContentDisposition: "inline",
      Expires: expires,
      Metadata: { source: "recorder", extra: "retained" },
    })
    .mockResolvedValueOnce({});

  await expect(
    normalizeDemoMetadataCache(client, config, key, true),
  ).resolves.toMatchObject({ status: "updated" });
  expect(send.mock.calls[1][0]).toBeInstanceOf(GetObjectCommand);
  const put = send.mock.calls[2][0];
  expect(put).toBeInstanceOf(PutObjectCommand);
  expect(put.input).toEqual({
    Bucket: "bucket",
    Key: key,
    Body: body,
    CacheControl: "no-cache",
    IfMatch: '"one"',
    ContentType: "application/json; charset=utf-8",
    ContentEncoding: "identity",
    ContentLanguage: "en",
    ContentDisposition: "inline",
    Expires: expires,
    Metadata: { source: "recorder", extra: "retained" },
  });
});

it("re-reads changed bytes and ETag after a conflict", async () => {
  const before = Buffer.from('{"title":"Before"}');
  const after = Buffer.from('{ "title": "Admin edit" }\n');
  send
    .mockResolvedValueOnce({ CacheControl: immutable })
    .mockResolvedValueOnce(metadata(before))
    .mockRejectedValueOnce(conflict())
    .mockResolvedValueOnce(metadata(after, '"two"'))
    .mockResolvedValueOnce({});
  await normalizeDemoMetadataCache(client, config, key, true);

  expect(send.mock.calls[2][0].input).toMatchObject({
    Body: before,
    IfMatch: '"one"',
  });
  expect(send.mock.calls[4][0].input).toMatchObject({
    Body: after,
    IfMatch: '"two"',
  });
  expect(Object.values(send.mock.calls[4][0].input)).not.toContain(undefined);
});

it("does not write if another writer has already corrected the header", async () => {
  send
    .mockResolvedValueOnce({ CacheControl: immutable })
    .mockResolvedValueOnce({
      ...metadata(Buffer.from("{}")),
      CacheControl: "no-cache",
    });
  await expect(
    normalizeDemoMetadataCache(client, config, key, true),
  ).resolves.toMatchObject({ status: "current" });
  expect(send).toHaveBeenCalledTimes(2);
});

it("refuses a missing ETag instead of writing unconditionally", async () => {
  send
    .mockResolvedValueOnce({ CacheControl: immutable })
    .mockResolvedValueOnce({ ...metadata(Buffer.from("{}")), ETag: undefined });
  await expect(
    normalizeDemoMetadataCache(client, config, key, true),
  ).rejects.toThrow("Missing ETag or body");
  expect(send).toHaveBeenCalledTimes(2);
});

it("stops after three conflicts without an unconditional fallback", async () => {
  send.mockImplementation(async (command) => {
    if (command instanceof HeadObjectCommand)
      return { CacheControl: immutable };
    if (command instanceof GetObjectCommand) return metadata(Buffer.from("{}"));
    throw conflict();
  });
  await expect(
    normalizeDemoMetadataCache(client, config, key, true),
  ).rejects.toMatchObject({ name: "PreconditionFailed" });
  const puts = send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof PutObjectCommand);
  expect(puts).toHaveLength(3);
  expect(puts.every((command) => command.input.IfMatch === '"one"')).toBe(true);
});
