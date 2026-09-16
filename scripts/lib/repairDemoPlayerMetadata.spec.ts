import { describe, expect, it, vi } from "vitest";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { DemoMetadata } from "../../relay/demoRecorder.js";
import { repairDemoPlayerMetadata } from "./repairDemoPlayerMetadata";

const key = "demos/test.rec.json";
const original: DemoMetadata = {
  filename: "test.rec",
  bytes: 1000,
  recordedAt: "2026-09-15T00:00:00Z",
  server: "Test",
  address: "localhost",
  games: [],
  mod: "classic",
  recorder: "Observer",
  durationMs: 60_000,
  players: ["[OLD]Alice", "[NEW]Alice"],
  playerCount: 2,
};
const repair = { ...original, playerCount: 1 };
function errorNamed(name: string) {
  return Object.assign(new Error(name), { name });
}
function setup() {
  const client = new S3Client({ region: "auto" });
  // Give the stub its promise signature: S3Client.send's last overload
  // uses a callback, which would otherwise make Vitest infer a void return.
  const send = vi.fn<
    (command: unknown) => Promise<{
      ETag?: string;
      Body?: { transformToString: () => Promise<string> };
    }>
  >();
  vi.spyOn(client, "send").mockImplementation(send);
  const backup = vi.fn(async (_key: string, _body: string) => {});
  const current = (record: DemoMetadata, etag: string) => ({
    ETag: etag,
    Body: { transformToString: async () => JSON.stringify(record) },
  });
  const puts = () =>
    send.mock.calls.flatMap(([command]) =>
      command instanceof PutObjectCommand ? [command.input] : [],
    );
  return { client, send, backup, current, puts };
}

describe("player metadata sidecar repair", () => {
  it("merges onto edits made while the demo was being parsed", async () => {
    const { client, send, backup, current, puts } = setup();
    const latest = {
      ...original,
      hasCommentary: true,
      reason: "new description",
    };
    send
      .mockResolvedValueOnce(current(latest, '"v2"'))
      .mockResolvedValueOnce({});
    const result = await repairDemoPlayerMetadata(
      client,
      "bucket",
      key,
      repair,
      backup,
    );
    expect(result).toEqual({ ...latest, playerCount: 1 });
    expect(puts()[0]).toMatchObject({
      IfMatch: '"v2"',
      CacheControl: "no-cache",
    });
    expect(JSON.parse(puts()[0].Body as string)).toEqual(result);
    expect(backup).toHaveBeenCalledWith(key, JSON.stringify(latest));
  });

  it("re-reads and re-merges when another writer wins between GET and PUT", async () => {
    const { client, send, backup, current, puts } = setup();
    const latest = { ...original, hasCommentary: true };
    send
      .mockResolvedValueOnce(current(original, '"v1"'))
      .mockRejectedValueOnce(errorNamed("PreconditionFailed"))
      .mockResolvedValueOnce(current(latest, '"v2"'))
      .mockResolvedValueOnce({});
    const result = await repairDemoPlayerMetadata(
      client,
      "bucket",
      key,
      repair,
      backup,
    );
    expect(result).toEqual({ ...latest, playerCount: 1 });
    expect(puts().map((input) => input.IfMatch)).toEqual(['"v1"', '"v2"']);
  });

  it("does not overwrite a sidecar first created during the repair", async () => {
    const { client, send, backup, current, puts } = setup();
    const latest = { ...original, hasCommentary: true };
    send
      .mockRejectedValueOnce(errorNamed("NoSuchKey"))
      .mockRejectedValueOnce(errorNamed("PreconditionFailed"))
      .mockResolvedValueOnce(current(latest, '"created"'))
      .mockResolvedValueOnce({});
    const result = await repairDemoPlayerMetadata(
      client,
      "bucket",
      key,
      repair,
      backup,
    );
    expect(puts()[0].IfNoneMatch).toBe("*");
    expect(result).toEqual({ ...latest, playerCount: 1 });
  });

  it("creates a missing sidecar from the analyzed demo", async () => {
    const { client, send, backup, puts } = setup();
    send
      .mockRejectedValueOnce(errorNamed("NoSuchKey"))
      .mockResolvedValueOnce({});
    await expect(
      repairDemoPlayerMetadata(client, "bucket", key, repair, backup),
    ).resolves.toEqual(repair);
    expect(puts()[0].IfNoneMatch).toBe("*");
  });

  it("leaves unreadable sidecars untouched", async () => {
    const { client, send, backup, puts } = setup();
    send.mockRejectedValueOnce(errorNamed("AccessDenied"));
    await expect(
      repairDemoPlayerMetadata(client, "bucket", key, repair, backup),
    ).rejects.toThrow("AccessDenied");
    expect(puts()).toEqual([]);
  });

  it("requires an ETag rather than falling back to an unconditional write", async () => {
    const { client, send, backup, puts } = setup();
    send.mockResolvedValueOnce({
      Body: { transformToString: async () => JSON.stringify(original) },
    });
    await expect(
      repairDemoPlayerMetadata(client, "bucket", key, repair, backup),
    ).rejects.toThrow("Invalid demo sidecar");
    expect(puts()).toEqual([]);
  });

  it("stops after bounded conflicts without publishing a stale record", async () => {
    const { client, send, backup, current, puts } = setup();
    send.mockImplementation(async (command) => {
      if (command instanceof GetObjectCommand) return current(original, '"v1"');
      throw errorNamed("PreconditionFailed");
    });
    await expect(
      repairDemoPlayerMetadata(client, "bucket", key, repair, backup),
    ).rejects.toThrow("PreconditionFailed");
    expect(puts()).toHaveLength(5);
  });
});
