import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  run: vi.fn(),
  warn: vi.fn(),
}));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = mocks.send;
  },
  GetObjectCommand: class {
    kind = "get";
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  HeadObjectCommand: class {
    kind = "head";
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
  PutObjectCommand: class {
    kind = "put";
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  },
}));
vi.mock("./demoCheckpointProcess", () => ({
  runDemoCheckpointProcess: mocks.run,
  DemoCheckpointGenerationError: class extends Error {},
}));
vi.mock("./logger", () => ({
  demoLog: { info: vi.fn(), warn: mocks.warn },
}));

import { DemoCheckpointPublisher } from "./demoCheckpointPublisher";
import { DemoCheckpointGenerationError } from "./demoCheckpointProcess";
import { DEMO_CHECKPOINT_VERSION } from "../src/stream/demoCheckpoints";

const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  bucket: "demos",
  accessKeyId: "test-key",
  secretAccessKey: "test-secret",
  prefix: "demos/",
};
const key = "demos/example.rec";
const contents = '{"checkpoints":[]}';
const metadata = {
  "checkpoint-version": String(DEMO_CHECKPOINT_VERSION),
  "checkpoint-count": "1",
  "demo-bytes": "3",
  "demo-etag": '"demo-v1"',
};
let dir: string;
let localFile: string;
let publisher: DemoCheckpointPublisher;
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", undefined);
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "checkpoint-publisher-test-"));
  localFile = path.join(dir, "example.rec");
  await fs.writeFile(localFile, new Uint8Array([1, 2, 3]));
  publisher = new DemoCheckpointPublisher(config, "/assets");
  mocks.run.mockImplementation(async (_input: string, output: string) => {
    await fs.writeFile(output, contents);
    return {
      version: DEMO_CHECKPOINT_VERSION,
      demoBytes: 3,
      demoSha256: "abc",
      count: 0,
      bytes: contents.length,
      reused: false,
      elapsedMS: 1,
    };
  });
  mocks.send.mockImplementation(async (command) => {
    if (command.kind === "head" && command.input.Key.endsWith(".rec"))
      return { ContentLength: 3, ETag: '"demo-v1"' };
    if (command.kind === "head")
      throw Object.assign(new Error("missing"), { name: "NotFound" });
    if (command.kind === "get")
      return {
        ETag: '"demo-v1"',
        Body: {
          transformToWebStream: () =>
            Readable.toWeb(Readable.from([Buffer.from([1, 2, 3])])),
        },
      };
    for await (const _chunk of command.input.Body) {
      /* Consume the upload stream. */
    }
    return {};
  });
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("demo checkpoint publishing", () => {
  it.each([-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid numeric count %s at construction",
    (count) => {
      expect(
        () => new DemoCheckpointPublisher(config, "/assets", count),
      ).toThrow("Checkpoint count must be a non-negative integer");
      expect(mocks.send).not.toHaveBeenCalled();
    },
  );
  it("reuses a current immutable remote sidecar without downloading or replaying", async () => {
    mocks.send
      .mockResolvedValueOnce({ Metadata: metadata })
      .mockResolvedValueOnce({ ContentLength: 3, ETag: '"demo-v1"' });
    expect(await publisher.publish(key)).toBe("current");
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it.each([
    { ...metadata, "checkpoint-version": "0" },
    { ...metadata, "demo-bytes": "4" },
    { ...metadata, "demo-etag": '"old-demo-with-the-same-size"' },
    { ...metadata, "demo-etag": undefined },
    undefined,
  ])(
    "regenerates outdated or mismatched remote metadata (%j)",
    async (headers) => {
      mocks.send.mockResolvedValueOnce({ Metadata: headers });
      if (headers?.["checkpoint-version"] === String(DEMO_CHECKPOINT_VERSION))
        mocks.send.mockResolvedValueOnce({
          ContentLength: 3,
          ETag: '"demo-v1"',
        });
      expect(await publisher.publish(key)).toBe("published");
      const input = mocks.run.mock.calls[0][0];
      expect(mocks.run).toHaveBeenCalledWith(
        input,
        `${input}.checkpoints.json`,
        "/assets",
        false,
        1,
      );
      await expect(fs.access(path.dirname(input))).rejects.toThrow();
    },
  );

  it("uses finalized local bytes and sends versioned, revalidatable JSON", async () => {
    expect(await publisher.publish(key, { localFile })).toBe("published");
    expect(mocks.run).toHaveBeenCalledWith(
      localFile,
      `${localFile}.checkpoints.json`,
      "/assets",
      false,
      1,
    );
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "put",
        input: expect.objectContaining({
          Bucket: "demos",
          Key: `${key}.checkpoints.json`,
          ContentLength: contents.length,
          ContentType: "application/json; charset=utf-8",
          CacheControl: "no-cache",
          Metadata: { ...metadata, "demo-sha256": "abc" },
        }),
      }),
      { abortSignal: expect.any(AbortSignal) },
    );
    await expect(fs.readFile(localFile)).resolves.toEqual(
      Buffer.from([1, 2, 3]),
    );
  });

  it("forces regeneration after source bytes at a stable key are replaced", async () => {
    await publisher.publish(key, { force: true });
    expect(
      mocks.send.mock.calls.some(([command]) => command.kind === "head"),
    ).toBe(false);
    expect(mocks.run.mock.calls[0][3]).toBe(true);
  });

  it.each([undefined, "3"])(
    "regenerates when the requested count metadata is %s",
    async (count) => {
      mocks.send.mockResolvedValueOnce({
        Metadata: { ...metadata, "checkpoint-count": count },
      });
      expect(await publisher.publish(key)).toBe("published");
      expect(mocks.run.mock.calls[0][4]).toBe(1);
    },
  );

  it.each([undefined, 4])(
    "passes the env count or explicit override %s to the worker and metadata",
    async (override) => {
      vi.stubEnv("DEMO_CHECKPOINT_COUNT", "3");
      publisher = new DemoCheckpointPublisher(config, "/assets", override);
      expect(await publisher.publish(key, { localFile })).toBe("published");
      const count = override ?? 3;
      expect(mocks.run.mock.calls[0][4]).toBe(count);
      const upload = mocks.send.mock.calls.find(
        ([command]) => command.kind === "put",
      )![0];
      expect(upload.input.Metadata["checkpoint-count"]).toBe(String(count));
    },
  );

  it("reuses short-demo sidecars using the requested count even if none were generated", async () => {
    publisher = new DemoCheckpointPublisher(config, "/assets", 3);
    mocks.send
      .mockResolvedValueOnce({
        Metadata: { ...metadata, "checkpoint-count": "3" },
      })
      .mockResolvedValueOnce({ ContentLength: 3, ETag: '"demo-v1"' });
    expect(await publisher.publish(key)).toBe("current");
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("shares a job for concurrent polls and serializes replay across demos", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = mocks.run.getMockImplementation()!;
    mocks.run.mockImplementationOnce(async (...args) => {
      await gate;
      return run(...args);
    });
    const first = publisher.publish(key, { localFile });
    expect(publisher.publish(key, { localFile })).toBe(first);
    const second = publisher.publish("demos/second.rec", { localFile });
    await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledOnce());
    release();
    expect(await Promise.all([first, second])).toEqual([
      "published",
      "published",
    ]);
    expect(mocks.run).toHaveBeenCalledTimes(2);
  });

  it("lets current remote sidecars bypass the replay queue", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = mocks.run.getMockImplementation()!;
    mocks.run.mockImplementationOnce(async (...args) => {
      await gate;
      return run(...args);
    });
    const blocked = publisher.publish(key, { localFile });
    await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledOnce());
    mocks.send
      .mockResolvedValueOnce({ Metadata: metadata })
      .mockResolvedValueOnce({ ContentLength: 3, ETag: '"demo-v1"' });
    expect(await publisher.publish("demos/current.rec")).toBe("current");
    release();
    expect(await blocked).toBe("published");
  });

  it("allows ordinary playback if the replay worker fails", async () => {
    mocks.run.mockRejectedValueOnce(
      new DemoCheckpointGenerationError("missing collision assets"),
    );
    expect(await publisher.publish(key)).toBe("failed");
    expect(
      mocks.send.mock.calls.some(([command]) => command.kind === "put"),
    ).toBe(false);
    expect(mocks.warn).toHaveBeenCalledOnce();
    await expect(
      fs.access(path.dirname(mocks.run.mock.calls[0][0])),
    ).rejects.toThrow();
    expect(await publisher.publish(key, { localFile })).toBe("published");
  });

  it("keeps local outputs on an upload failure and does not poison later jobs", async () => {
    mocks.send
      .mockResolvedValueOnce({ ContentLength: 3, ETag: '"demo-v1"' })
      .mockRejectedValueOnce(new Error("upload failed"));
    await expect(publisher.publish(key, { localFile })).rejects.toThrow(
      "upload failed",
    );
    await expect(
      fs.readFile(`${localFile}.checkpoints.json`, "utf8"),
    ).resolves.toBe(contents);
    expect(await publisher.publish(key, { localFile })).toBe("published");
  });

  it("does not mistake permission errors for missing sidecars", async () => {
    mocks.send.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { name: "AccessDenied" }),
    );
    await expect(publisher.publish(key)).rejects.toThrow("denied");
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
