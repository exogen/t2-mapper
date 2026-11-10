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
import {
  DemoCheckpointGenerationError,
  runDemoCheckpointProcess,
} from "./demoCheckpointProcess";
import type { PreparedDemoCheckpoints } from "./demoCheckpointGenerator";
import { DEMO_CHECKPOINT_VERSION } from "../src/stream/demoCheckpoints";

const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  bucket: "demos",
  accessKeyId: "test-key",
  secretAccessKey: "test-secret",
  prefix: "demos/",
};
const key = "demos/example.rec";
const defaultPlan = { intervalTicks: 22_500, maxCount: 1 };
const contents = '{"checkpoints":[]}';
const prepared: PreparedDemoCheckpoints = {
  version: DEMO_CHECKPOINT_VERSION,
  demoBytes: 3,
  demoSha256: "abc",
  count: 0,
  bytes: contents.length,
  reused: false,
  elapsedMS: 1,
  ...defaultPlan,
};
const metadata = {
  "checkpoint-version": String(DEMO_CHECKPOINT_VERSION),
  "checkpoint-count": "1",
  "checkpoint-interval": "22500",
  "demo-bytes": "3",
  "demo-etag": '"demo-v1"',
};
let dir: string;
let localFile: string;
let publisher: DemoCheckpointPublisher;
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", undefined);
  vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", undefined);
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
  it.each([
    { intervalTicks: 22_500, maxCount: -1 },
    { intervalTicks: 22_500, maxCount: 1.5 },
    { intervalTicks: 22_500, maxCount: NaN },
    { intervalTicks: 22_500, maxCount: Infinity },
    { intervalTicks: 22_500, maxCount: Number.MAX_SAFE_INTEGER + 1 },
    { intervalTicks: 0, maxCount: 1 },
    { intervalTicks: 1.5, maxCount: 1 },
  ])("rejects invalid plan %o at construction", (plan) => {
    expect(() => new DemoCheckpointPublisher(config, "/assets", plan)).toThrow(
      /^Checkpoint (count|interval) must be/,
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("reuses a current remote sidecar without downloading or replaying", async () => {
    mocks.send
      .mockResolvedValueOnce({ Metadata: metadata })
      .mockResolvedValueOnce({ ContentLength: 3, ETag: '"demo-v1"' });
    expect(await publisher.publish(key)).toBe("current");
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledTimes(2);
  });

  it.each([
    { ...metadata, "checkpoint-version": "0" },
    { ...metadata, "checkpoint-version": String(DEMO_CHECKPOINT_VERSION - 1) },
    { ...metadata, "checkpoint-version": String(DEMO_CHECKPOINT_VERSION + 1) },
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
        defaultPlan,
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
      defaultPlan,
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

  it("passes the recording, output, assets, force flag, and plan to an injected generator", async () => {
    const plan = { intervalTicks: 100, maxCount: 4 };
    const generate = vi.fn<typeof runDemoCheckpointProcess>(
      async (_input, output) => {
        await fs.writeFile(output, contents);
        return prepared;
      },
    );
    publisher = new DemoCheckpointPublisher(
      config,
      "/custom-assets",
      plan,
      generate,
    );

    expect(await publisher.publish(key, { localFile, force: true })).toBe(
      "published",
    );

    expect(generate).toHaveBeenCalledExactlyOnceWith(
      localFile,
      `${localFile}.checkpoints.json`,
      "/custom-assets",
      true,
      plan,
    );
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("uploads prepared checkpoint bytes without rereading or replaying the recording", async () => {
    const generate = vi
      .fn<typeof runDemoCheckpointProcess>()
      .mockRejectedValue(new Error("Unexpected generation"));
    publisher = new DemoCheckpointPublisher(
      config,
      "/assets",
      defaultPlan,
      generate,
    );
    await fs.writeFile(`${localFile}.checkpoints.json`, contents);
    await fs.rm(localFile);
    let uploaded = "";
    mocks.send.mockImplementation(async (command) => {
      if (command.kind === "head")
        return { ContentLength: 3, ETag: '"demo-v1"' };
      for await (const chunk of command.input.Body)
        uploaded += chunk.toString();
      return {};
    });

    expect(await publisher.publishPrepared(key, localFile, prepared)).toBe(
      "published",
    );

    expect(generate).not.toHaveBeenCalled();
    expect(mocks.run).not.toHaveBeenCalled();
    expect(uploaded).toBe(contents);
    expect(mocks.send.mock.calls.map(([command]) => command.kind)).toEqual([
      "head",
      "put",
    ]);
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "head",
        input: { Bucket: "demos", Key: key },
      }),
      { abortSignal: expect.any(AbortSignal) },
    );
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
  });

  it("publishes prepared checkpoints with their originating plan rather than the current publisher plan", async () => {
    await fs.writeFile(`${localFile}.checkpoints.json`, contents);
    publisher = new DemoCheckpointPublisher(config, "/assets", {
      intervalTicks: 100,
      maxCount: 4,
    });

    expect(await publisher.publishPrepared(key, localFile, prepared)).toBe(
      "published",
    );

    const upload = mocks.send.mock.calls.find(
      ([command]) => command.kind === "put",
    )![0];
    expect(upload.input.Metadata).toMatchObject({
      "checkpoint-count": "1",
      "checkpoint-interval": "22500",
    });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("propagates prepared upload failures and closes the stream without removing the artifact", async () => {
    await fs.writeFile(`${localFile}.checkpoints.json`, contents);
    let body!: Readable;
    mocks.send.mockImplementation(async (command) => {
      if (command.kind === "head")
        return { ContentLength: 3, ETag: '"demo-v1"' };
      body = command.input.Body;
      throw new Error("upload failed");
    });

    await expect(
      publisher.publishPrepared(key, localFile, prepared),
    ).rejects.toThrow("upload failed");

    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
    expect(body.destroyed).toBe(true);
    await vi.waitFor(() => expect(body.closed).toBe(true));
    await expect(
      fs.readFile(`${localFile}.checkpoints.json`, "utf8"),
    ).resolves.toBe(contents);
  });

  it("forces regeneration after source bytes at a stable key are replaced", async () => {
    await publisher.publish(key, { force: true });
    expect(
      mocks.send.mock.calls.some(([command]) => command.kind === "head"),
    ).toBe(false);
    expect(mocks.run.mock.calls[0][3]).toBe(true);
  });

  it("conditionally replaces an existing sidecar when requested", async () => {
    mocks.send.mockResolvedValueOnce({ ETag: '"checkpoint-v1"' });

    expect(
      await publisher.publish(key, { force: true, existingOnly: true }),
    ).toBe("published");

    const upload = mocks.send.mock.calls.find(
      ([command]) => command.kind === "put",
    )![0];
    expect(upload.input.IfMatch).toBe('"checkpoint-v1"');
    expect(upload.input.IfNoneMatch).toBeUndefined();
  });

  it.each(["NotFound", "NoSuchKey"])(
    "does not replay or recreate a missing existing-only sidecar (%s)",
    async (name) => {
      mocks.send.mockRejectedValueOnce(
        Object.assign(new Error("missing"), { name }),
      );

      await expect(
        publisher.publish(key, { force: true, existingOnly: true }),
      ).rejects.toThrow(`Cannot update missing checkpoint sidecar: ${key}`);

      expect(mocks.run).not.toHaveBeenCalled();
      expect(mocks.send).toHaveBeenCalledOnce();
    },
  );

  it("requires an ETag for an existing-only sidecar", async () => {
    mocks.send.mockResolvedValueOnce({});
    await expect(
      publisher.publish(key, { force: true, existingOnly: true }),
    ).rejects.toThrow("Missing checkpoint sidecar ETag");
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it.each(["ConditionalRequestConflict", "PreconditionFailed"])(
    "does not recreate a sidecar deleted while replaying (%s)",
    async (name) => {
      const send = mocks.send.getMockImplementation()!;
      let exists = true;
      mocks.send.mockImplementation(async (command, ...args) => {
        if (
          command.kind === "head" &&
          command.input.Key.endsWith(".checkpoints.json")
        )
          return { ETag: '"checkpoint-v1"' };
        if (command.kind === "put" && !exists) {
          expect(command.input.IfMatch).toBe('"checkpoint-v1"');
          throw Object.assign(new Error("deleted"), { name });
        }
        return send(command, ...args);
      });
      const run = mocks.run.getMockImplementation()!;
      mocks.run.mockImplementationOnce(async (...args) => {
        exists = false;
        return run(...args);
      });

      await expect(
        publisher.publish(key, { force: true, existingOnly: true }),
      ).rejects.toThrow("deleted");

      expect(exists).toBe(false);
      expect(
        mocks.send.mock.calls.filter(([command]) => command.kind === "put"),
      ).toHaveLength(1);
      await expect(
        fs.access(path.dirname(mocks.run.mock.calls[0][0])),
      ).rejects.toThrow();
    },
  );

  it.each([
    { "checkpoint-count": undefined },
    { "checkpoint-count": "3" },
    { "checkpoint-interval": "16875" },
  ])("regenerates when the plan metadata is %j", async (headers) => {
    mocks.send.mockResolvedValueOnce({
      Metadata: { ...metadata, ...headers },
    });
    expect(await publisher.publish(key)).toBe("published");
    expect(mocks.run.mock.calls[0][4]).toEqual(defaultPlan);
  });

  it("takes sidecars without interval metadata to use the default interval", async () => {
    const legacy = { ...metadata, "checkpoint-interval": undefined };
    mocks.send
      .mockResolvedValueOnce({ Metadata: legacy })
      .mockResolvedValueOnce({ ContentLength: 3, ETag: '"demo-v1"' });
    expect(await publisher.publish(key)).toBe("current");
    publisher = new DemoCheckpointPublisher(config, "/assets", {
      intervalTicks: 16_875,
      maxCount: 1,
    });
    mocks.send.mockResolvedValueOnce({ Metadata: legacy });
    expect(await publisher.publish(key)).toBe("published");
  });

  it.each([undefined, { intervalTicks: 100, maxCount: 4 }])(
    "passes the env plan or explicit override %o to the worker and metadata",
    async (override) => {
      vi.stubEnv("DEMO_CHECKPOINT_COUNT", "3");
      vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", "9");
      publisher = new DemoCheckpointPublisher(config, "/assets", override);
      expect(await publisher.publish(key, { localFile })).toBe("published");
      const plan = override ?? { intervalTicks: 16_875, maxCount: 3 };
      expect(mocks.run.mock.calls[0][4]).toEqual(plan);
      const upload = mocks.send.mock.calls.find(
        ([command]) => command.kind === "put",
      )![0];
      expect(upload.input.Metadata).toMatchObject({
        "checkpoint-count": String(plan.maxCount),
        "checkpoint-interval": String(plan.intervalTicks),
      });
    },
  );

  it("reuses short-demo sidecars using the requested count even if none were generated", async () => {
    publisher = new DemoCheckpointPublisher(config, "/assets", {
      intervalTicks: 22_500,
      maxCount: 3,
    });
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

  it("lets prepared artifacts bypass the generation queue", async () => {
    await fs.writeFile(`${localFile}.checkpoints.json`, contents);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const run = mocks.run.getMockImplementation()!;
    mocks.run.mockImplementationOnce(async (...args) => {
      await gate;
      return run(...args);
    });
    const blocked = publisher.publish("demos/generating.rec", { localFile });
    await vi.waitFor(() => expect(mocks.run).toHaveBeenCalledOnce());
    const upload = publisher.publishPrepared(key, localFile, prepared);
    try {
      await vi.waitFor(() =>
        expect(
          mocks.send.mock.calls.some(
            ([command]) =>
              command.kind === "put" &&
              command.input.Key === `${key}.checkpoints.json`,
          ),
        ).toBe(true),
      );
      expect(await upload).toBe("published");
      expect(mocks.run).toHaveBeenCalledOnce();
    } finally {
      release();
      await blocked;
    }
  });

  it("allows ordinary playback if the injected replay worker fails", async () => {
    const generate = vi.fn<typeof runDemoCheckpointProcess>(
      async (_input, output) => {
        await fs.writeFile(output, contents);
        return prepared;
      },
    );
    generate.mockRejectedValueOnce(
      new DemoCheckpointGenerationError("missing collision assets"),
    );
    publisher = new DemoCheckpointPublisher(
      config,
      "/assets",
      defaultPlan,
      generate,
    );
    expect(await publisher.publish(key)).toBe("failed");
    expect(
      mocks.send.mock.calls.some(([command]) => command.kind === "put"),
    ).toBe(false);
    expect(mocks.warn).toHaveBeenCalledOnce();
    await expect(
      fs.access(path.dirname(generate.mock.calls[0][0])),
    ).rejects.toThrow();
    expect(await publisher.publish(key, { localFile })).toBe("published");
    expect(generate).toHaveBeenCalledTimes(2);
    expect(mocks.run).not.toHaveBeenCalled();
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
