import { describe, expect, it, vi } from "vitest";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { DemoMetadata } from "./demoRecorder";
import { updateDemoIndex } from "./demoIndexStorage";

const key = "demos/index.json";
const record = { filename: "new.rec" } as DemoMetadata;
const other = { filename: "other.rec" } as DemoMetadata;
const errorNamed = (name: string) => Object.assign(new Error(name), { name });

function setup() {
  const client = new S3Client({ region: "auto" });
  const send = vi.fn<
    (command: unknown) => Promise<{
      ETag?: string;
      Body?: { transformToString: () => Promise<string> };
    }>
  >();
  vi.spyOn(client, "send").mockImplementation(send);
  const puts = () =>
    send.mock.calls.flatMap(([command]) =>
      command instanceof PutObjectCommand ? [command.input] : [],
    );
  const current = (entries: DemoMetadata[], etag?: string) => ({
    ETag: etag,
    Body: { transformToString: async () => JSON.stringify(entries) },
  });
  const update = (entries: DemoMetadata[] | null) => [
    ...(entries ?? []),
    record,
  ];
  return { client, send, puts, current, update };
}

describe("conditional demo index updates", () => {
  it("creates a missing index conditionally", async () => {
    const { client, send, puts, update } = setup();
    send
      .mockRejectedValueOnce(errorNamed("NoSuchKey"))
      .mockResolvedValueOnce({});
    expect(await updateDemoIndex(client, "bucket", key, update)).toBe(1);
    expect(puts()[0]).toMatchObject({
      IfNoneMatch: "*",
      CacheControl: "no-cache",
    });
  });

  it("merges with an index created by another writer during its first write", async () => {
    const { client, send, puts, current, update } = setup();
    const backup = vi.fn(async () => {});
    send
      .mockRejectedValueOnce(errorNamed("NoSuchKey"))
      .mockRejectedValueOnce(errorNamed("PreconditionFailed"))
      .mockResolvedValueOnce(current([other], '"new"'))
      .mockResolvedValueOnce({});
    expect(await updateDemoIndex(client, "bucket", key, update, backup)).toBe(
      2,
    );
    expect(puts()[0].IfNoneMatch).toBe("*");
    expect(puts()[1].IfMatch).toBe('"new"');
    expect(JSON.parse(puts()[1].Body as string)).toEqual([other, record]);
    expect(backup).toHaveBeenCalledWith(key, JSON.stringify([other]));
  });

  it.each(["invalid-json", "not-array", "missing-etag", "access-denied"])(
    "leaves the index untouched on %s",
    async (failure) => {
      const { client, send, puts, current, update } = setup();
      if (failure === "access-denied")
        send.mockRejectedValueOnce(errorNamed("AccessDenied"));
      else if (failure === "missing-etag")
        send.mockResolvedValueOnce(current([]));
      else
        send.mockResolvedValueOnce({
          ETag: '"v1"',
          Body: {
            transformToString: async () =>
              failure === "invalid-json" ? "broken" : "{}",
          },
        });
      await expect(
        updateDemoIndex(client, "bucket", key, update),
      ).rejects.toThrow();
      expect(puts()).toEqual([]);
    },
  );

  it("can skip an update already applied by another writer", async () => {
    const { client, send, puts, current } = setup();
    send.mockResolvedValueOnce(current([record], '"v1"'));
    expect(await updateDemoIndex(client, "bucket", key, () => undefined)).toBe(
      1,
    );
    expect(puts()).toEqual([]);
  });

  it("stops after five conflicting attempts without an unconditional fallback", async () => {
    const { client, send, puts, current, update } = setup();
    send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) return current([other], '"v1"');
      throw errorNamed("PreconditionFailed");
    });
    await expect(
      updateDemoIndex(client, "bucket", key, update),
    ).rejects.toThrow("PreconditionFailed");
    expect(puts()).toHaveLength(5);
    expect(puts().every((input) => input.IfMatch === '"v1"')).toBe(true);
  });
});
