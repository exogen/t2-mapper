import {
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, expect, it, vi } from "vitest";
import type { DemoUploadConfig } from "../../relay/demoUpload.js";
import { listAllObjects, objectExists } from "./r2.js";

const config: DemoUploadConfig = {
  endpoint: "https://r2.invalid",
  bucket: "recordings",
  prefix: "demos/",
  accessKeyId: "test",
  secretAccessKey: "test",
};

afterEach(() => vi.restoreAllMocks());

function fixture() {
  const client = new S3Client({ region: "auto" });
  const send = vi.fn<(command: unknown) => Promise<unknown>>();
  vi.spyOn(client, "send").mockImplementation(send as typeof client.send);
  return { client, send };
}

it("checks object presence independently of a prior listing", async () => {
  const { client, send } = fixture();
  send.mockResolvedValue({});
  await expect(objectExists(client, config, "demos/new.rec")).resolves.toBe(
    true,
  );
  expect(send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  expect((send.mock.calls[0][0] as HeadObjectCommand).input).toEqual({
    Bucket: config.bucket,
    Key: "demos/new.rec",
  });
});

it.each(["NotFound", "NoSuchKey"])(
  "treats %s as a confirmed missing object",
  async (name) => {
    const { client, send } = fixture();
    send.mockRejectedValue(Object.assign(new Error("Missing"), { name }));
    await expect(objectExists(client, config, "demos/gone.rec")).resolves.toBe(
      false,
    );
  },
);

it("does not turn a failed presence check into permission to delete", async () => {
  const { client, send } = fixture();
  const error = new Error("Network request failed");
  send.mockRejectedValue(error);
  await expect(objectExists(client, config, "demos/unknown.rec")).rejects.toBe(
    error,
  );
});

it("collects every page and preserves recording fingerprints and metadata", async () => {
  const { client, send } = fixture();
  const lastModified = new Date("2026-11-14T12:00:00Z");
  send
    .mockResolvedValueOnce({
      Contents: [
        {
          Key: "demos/a.rec",
          Size: 123,
          LastModified: lastModified,
          ETag: '"a"',
        },
        { Size: 7 },
      ],
      IsTruncated: true,
      NextContinuationToken: "page-2",
    })
    .mockResolvedValueOnce({
      Contents: [{ Key: "demos/b.rec", ETag: '"b"' }],
      IsTruncated: false,
    });
  await expect(listAllObjects(client, config)).resolves.toEqual([
    { key: "demos/a.rec", size: 123, lastModified, etag: '"a"' },
    { key: "demos/b.rec", size: 0, lastModified: undefined, etag: '"b"' },
  ]);
  expect(send).toHaveBeenCalledTimes(2);
  for (const [index, [command]] of send.mock.calls.entries()) {
    expect(command).toBeInstanceOf(ListObjectsV2Command);
    expect((command as ListObjectsV2Command).input).toEqual({
      Bucket: "recordings",
      Prefix: "demos/",
      ContinuationToken: index === 0 ? undefined : "page-2",
    });
  }
});

it.each([undefined, ""])(
  "rejects an incomplete later page without a usable continuation token (%j)",
  async (token) => {
    const { client, send } = fixture();
    send
      .mockResolvedValueOnce({
        Contents: [{ Key: "demos/a.rec" }],
        IsTruncated: true,
        NextContinuationToken: "page-2",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "demos/b.rec" }],
        IsTruncated: true,
        NextContinuationToken: token,
      });
    await expect(listAllObjects(client, config)).rejects.toThrow(
      "Incomplete demo listing",
    );
    expect(send).toHaveBeenCalledTimes(2);
  },
);
