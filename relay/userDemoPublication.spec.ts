import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import type { DemoMetadata } from "./demoMetadata";
import type { PreparedDemoCheckpoints } from "./demoCheckpointGenerator";
import { DEMO_CHECKPOINT_VERSION } from "../src/stream/demoCheckpoints";

const bucket = vi.hoisted(() => ({
  objects: new Map<string, { body: Buffer; etag: string; cache?: string }>(),
  events: [] as string[],
  version: 0,
  failUpload: "",
  failDelete: "",
  failIndex: false,
  beforeIndexPut: undefined as (() => void) | undefined,
  beforeSidecarPut: undefined as (() => void) | undefined,
}));

interface CommandInput {
  Key?: string;
  Prefix?: string;
  Body?: string;
  CacheControl?: string;
  IfMatch?: string;
  IfNoneMatch?: string;
  Delete?: { Objects: { Key: string }[] };
}

vi.mock("@aws-sdk/client-s3", () => {
  const command = (type: string) =>
    class {
      readonly type = type;
      readonly input: CommandInput;
      constructor(input: CommandInput) {
        this.input = input;
      }
    };
  return {
    GetObjectCommand: command("get"),
    HeadObjectCommand: command("head"),
    PutObjectCommand: command("put"),
    ListObjectsV2Command: command("list"),
    DeleteObjectsCommand: command("delete"),
    S3Client: class {
      async send({ type, input }: { type: string; input: CommandInput }) {
        const key = input.Key ?? "";
        bucket.events.push(`${type}:${key}`);
        if (type === "get" || type === "head") {
          const object = bucket.objects.get(key);
          if (!object)
            throw Object.assign(new Error("Missing"), { name: "NoSuchKey" });
          return {
            ETag: object.etag,
            Body: { transformToString: async () => object.body.toString() },
          };
        }
        if (type === "list")
          return {
            Contents: [...bucket.objects.keys()]
              .filter((key) => key.startsWith(input.Prefix!))
              .map((Key) => ({ Key })),
          };
        if (type === "delete") {
          const Errors: { Key: string; Code: string }[] = [];
          for (const { Key } of input.Delete!.Objects) {
            bucket.events.push(`removed:${Key}`);
            if (Key === bucket.failDelete)
              Errors.push({ Key, Code: "Unavailable" });
            else bucket.objects.delete(Key);
          }
          return { Errors };
        }
        if (key.endsWith("index.json")) {
          if (bucket.failIndex) throw new Error("Index unavailable");
          const before = bucket.beforeIndexPut;
          bucket.beforeIndexPut = undefined;
          before?.();
        }
        if (key.endsWith(".rec.json")) {
          const before = bucket.beforeSidecarPut;
          bucket.beforeSidecarPut = undefined;
          before?.();
        }
        const current = bucket.objects.get(key);
        if (
          (input.IfMatch && input.IfMatch !== current?.etag) ||
          (input.IfNoneMatch === "*" && current)
        )
          throw Object.assign(new Error("Conflict"), {
            name: "PreconditionFailed",
          });
        bucket.objects.set(key, {
          body: Buffer.from(input.Body!),
          etag: `"${++bucket.version}"`,
          cache: input.CacheControl,
        });
        return {};
      }
    },
  };
});

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    private readonly options: {
      params: { Key: string; Body: Readable; CacheControl: string };
    };
    constructor(options: {
      params: { Key: string; Body: Readable; CacheControl: string };
    }) {
      this.options = options;
    }
    async done() {
      const { Key, Body, CacheControl } = this.options.params;
      bucket.events.push(`upload:${Key}`);
      if (Key === bucket.failUpload) throw new Error("Upload failed");
      const chunks: Buffer[] = [];
      for await (const chunk of Body) chunks.push(Buffer.from(chunk));
      bucket.objects.set(Key, {
        body: Buffer.concat(chunks),
        etag: `"${++bucket.version}"`,
        cache: CacheControl,
      });
    }
  },
}));

const { DemoUploader } = await import("./demoUpload");
const key = `users/126767979894407168/server_20260901T2000_katabatic_aaaaaa.rec`;
const otherKey = `users/126767979894407168/server_20260901T2000_katabatic_bbbbbb.rec`;
const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  bucket: "demos",
  accessKeyId: "test",
  secretAccessKey: "test",
  prefix: "demos/",
};
const checkpoints: PreparedDemoCheckpoints = {
  version: DEMO_CHECKPOINT_VERSION,
  demoBytes: 3,
  demoSha256: "a".repeat(64),
  count: 0,
  bytes: 2,
  elapsedMS: 1,
  reused: false,
  intervalTicks: 11_250,
  maxCount: 6,
};
let directory: string;
let input: string;
let metadata: DemoMetadata;

function seed(name: string, value: unknown) {
  bucket.objects.set(name, {
    body: Buffer.from(JSON.stringify(value)),
    etag: `"${++bucket.version}"`,
  });
}

beforeEach(async () => {
  bucket.objects.clear();
  bucket.events.length = 0;
  bucket.version = 0;
  bucket.failUpload = "";
  bucket.failDelete = "";
  bucket.failIndex = false;
  bucket.beforeIndexPut = undefined;
  bucket.beforeSidecarPut = undefined;
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "user-demo-publication-"),
  );
  input = path.join(directory, "input.rec");
  metadata = {
    filename: key,
    bytes: 3,
    recordedAt: "2002-04-05T00:00:00.000Z",
    server: "Server",
    address: "127.0.0.1:28000",
    games: [
      { mission: "Katabatic", gameType: "CTF", startMs: 0, tournament: false },
    ],
    mod: "classic",
    recorder: "Recorder",
    durationMs: 1000,
    players: [],
  };
  await fs.writeFile(input, new Uint8Array([1, 2, 3]));
});

/** Stands in for uploading a prepared checkpoint file. */
function checkpointPublisher() {
  return vi.fn(
    async (
      _file: string,
      objectKey: string,
      _checkpoints?: PreparedDemoCheckpoints,
    ) => {
      bucket.events.push(`checkpoints:${objectKey}`);
    },
  );
}

afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe("prepared user demo publication", () => {
  it("uploads original bytes and checkpoints before adding the indexed metadata", async () => {
    const publishCheckpoints = checkpointPublisher();
    const uploader = new DemoUploader(config, directory, {
      publishCheckpoints,
    });
    await uploader.publishPreparedDemo(key, input, metadata, checkpoints);
    expect(bucket.objects.get(`demos/${key}`)?.body).toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(bucket.objects.get(`demos/${key}`)?.cache).toBe("no-cache");
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([metadata]);
    expect(publishCheckpoints).toHaveBeenCalledExactlyOnceWith(
      input,
      `demos/${key}`,
      checkpoints,
    );
    expect(publishCheckpoints.mock.calls[0][2]).toBe(checkpoints);
    const writes = bucket.events.filter((event) =>
      /^(upload|checkpoints|put):/.test(event),
    );
    expect(writes).toEqual([
      `upload:demos/${key}`,
      `checkpoints:demos/${key}`,
      `put:demos/${key}.json`,
      "put:demos/index.json",
    ]);
    // A first publish learns it is new from the missing sidecar alone.
    expect(
      bucket.events.filter((event) => event === "get:demos/index.json"),
    ).toHaveLength(1);
    expect(await fs.readFile(input)).toEqual(Buffer.from([1, 2, 3]));
  });

  it("finishes a retried publish whose sidecar has no games", async () => {
    const gameless = { ...metadata, games: [] };
    seed(`demos/${key}.json`, gameless);
    await new DemoUploader(config, directory).publishPreparedDemo(
      key,
      input,
      gameless,
      checkpoints,
    );
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([gameless]);
  });

  it("keeps a failed checkpoint upload out of the index and safely retries", async () => {
    const publishCheckpoints = checkpointPublisher();
    publishCheckpoints.mockRejectedValueOnce(new Error("Upload failed"));
    const uploader = new DemoUploader(config, directory, {
      publishCheckpoints,
    });
    await expect(
      uploader.publishPreparedDemo(key, input, metadata, checkpoints),
    ).rejects.toThrow("Upload failed");
    expect(bucket.objects.has("demos/index.json")).toBe(false);
    expect(bucket.objects.has(`demos/${key}.json`)).toBe(false);
    await uploader.publishPreparedDemo(key, input, metadata, checkpoints);
    await uploader.publishPreparedDemo(key, input, metadata, checkpoints);
    expect(publishCheckpoints).toHaveBeenCalledTimes(3);
    for (const [, , prepared] of publishCheckpoints.mock.calls)
      expect(prepared).toBe(checkpoints);
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([metadata]);
  });

  it("preserves concurrent recorder additions during the index commit", async () => {
    const recorded = { ...metadata, filename: "recorded.rec" };
    seed("demos/index.json", []);
    bucket.beforeIndexPut = () => seed("demos/index.json", [recorded]);
    await new DemoUploader(config, directory).publishPreparedDemo(
      key,
      input,
      metadata,
      checkpoints,
    );
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([recorded, metadata]);
  });

  it("does not replace saved game labels when publication retries", async () => {
    const saved = {
      ...metadata,
      games: [
        {
          ...metadata.games[0],
          gameId: "game",
          presentationRevision: 1,
          title: "Saved final",
        },
      ],
    };
    seed(`demos/${key}.json`, saved);
    await new DemoUploader(config, directory).publishPreparedDemo(
      key,
      input,
      metadata,
      checkpoints,
    );
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([saved]);
  });

  it("fills missing canonical upload snapshots without replacing saved game labels", async () => {
    const captured = {
      ...metadata,
      discordHandleAtUploadTime: "captured_handle",
      discordDisplayNameAtUploadTime: "Captured name",
    };
    const saved = {
      ...metadata,
      games: [{ ...metadata.games[0], title: "Saved final" }],
    };
    seed(`demos/${key}.json`, saved);
    await new DemoUploader(config, directory).publishPreparedDemo(
      key,
      input,
      captured,
      checkpoints,
    );
    const expected = {
      ...saved,
      discordHandleAtUploadTime: "captured_handle",
      discordDisplayNameAtUploadTime: "Captured name",
    };
    expect(
      JSON.parse(bucket.objects.get(`demos/${key}.json`)!.body.toString()),
    ).toEqual(expected);
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([expected]);
  });

  it("keeps frozen canonical snapshots while filling only a missing field", async () => {
    const saved = {
      ...metadata,
      discordHandleAtUploadTime: "original_handle",
    };
    seed(`demos/${key}.json`, saved);
    await new DemoUploader(config, directory).publishPreparedDemo(
      key,
      input,
      {
        ...metadata,
        discordHandleAtUploadTime: "later_handle",
        discordDisplayNameAtUploadTime: "Captured name",
      },
      checkpoints,
    );
    expect(
      JSON.parse(bucket.objects.get(`demos/${key}.json`)!.body.toString()),
    ).toEqual({
      ...saved,
      discordDisplayNameAtUploadTime: "Captured name",
    });
  });

  it("propagates canonical snapshots over stale index values during a concurrent append", async () => {
    const canonical = {
      ...metadata,
      discordHandleAtUploadTime: "original_handle",
      discordDisplayNameAtUploadTime: "Original name",
    };
    const stale = {
      ...metadata,
      discordHandleAtUploadTime: "stale_handle",
      discordDisplayNameAtUploadTime: "Stale name",
      hasCommentary: true,
    };
    const recorded = { ...metadata, filename: "recorded.rec" };
    seed(`demos/${key}.json`, canonical);
    seed("demos/index.json", [stale]);
    bucket.beforeIndexPut = () => seed("demos/index.json", [stale, recorded]);
    await new DemoUploader(config, directory).publishPreparedDemo(
      key,
      input,
      {
        ...metadata,
        discordHandleAtUploadTime: "later_handle",
        discordDisplayNameAtUploadTime: "Later name",
      },
      checkpoints,
    );
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([{ ...canonical, hasCommentary: true }, recorded]);
    expect(
      JSON.parse(bucket.objects.get(`demos/${key}.json`)!.body.toString()),
    ).toEqual(canonical);
  });

  it("remerges frozen snapshots and game labels after a canonical sidecar CAS conflict", async () => {
    seed(`demos/${key}.json`, metadata);
    const concurrent = {
      ...metadata,
      discordHandleAtUploadTime: "original_handle",
      discordDisplayNameAtUploadTime: "Original name",
      games: [
        {
          ...metadata.games[0],
          gameId: "game",
          presentationRevision: 2,
          title: "Concurrent final",
        },
      ],
    };
    bucket.beforeSidecarPut = () => seed(`demos/${key}.json`, concurrent);
    await new DemoUploader(config, directory).publishPreparedDemo(
      key,
      input,
      {
        ...metadata,
        discordHandleAtUploadTime: "fallback_handle",
        discordDisplayNameAtUploadTime: "Fallback name",
      },
      checkpoints,
    );
    expect(
      JSON.parse(bucket.objects.get(`demos/${key}.json`)!.body.toString()),
    ).toEqual(concurrent);
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([concurrent]);
  });

  it("does not clear existing index snapshots when an older canonical record omits them", async () => {
    const indexed = {
      ...metadata,
      discordHandleAtUploadTime: "original_handle",
      discordDisplayNameAtUploadTime: "Original name",
    };
    seed(`demos/${key}.json`, metadata);
    seed("demos/index.json", [indexed]);
    await new DemoUploader(config, directory).publishPreparedDemo(
      key,
      input,
      metadata,
      checkpoints,
    );
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([indexed]);
    expect(
      JSON.parse(bucket.objects.get(`demos/${key}.json`)!.body.toString()),
    ).toEqual(metadata);
  });

  it("recovers an interrupted nested demo edit after restarting the uploader", async () => {
    const cache = path.join(directory, "cache");
    const uploader = new DemoUploader(config, cache);
    await uploader.publishPreparedDemo(key, input, metadata, checkpoints);
    const game = metadata.games[0];
    bucket.failIndex = true;
    await expect(
      uploader.savePublishedGamePresentation(
        {
          filename: key,
          gameIndex: 0,
          mission: game.mission,
          startMs: game.startMs,
        },
        0,
        { title: "Recovered final" },
      ),
    ).resolves.toMatchObject({ presentation: { title: "Recovered final" } });
    await vi.waitFor(() =>
      expect(
        bucket.events.filter((event) => event === "put:demos/index.json")
          .length,
      ).toBeGreaterThanOrEqual(3),
    );
    await expect(
      fs.access(path.join(cache, `${key}.json.edit`)),
    ).resolves.toBeUndefined();
    bucket.failIndex = false;
    await new DemoUploader(config, cache).sweep();
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString())[0]
        .games[0].title,
    ).toBe("Recovered final");
    await expect(
      fs.access(path.join(cache, `${key}.json.edit`)),
    ).rejects.toThrow();
    expect(bucket.objects.has("demos/input.rec")).toBe(false);
  });

  it("hides the index entry before removing only this recording and its sidecars", async () => {
    seed("demos/index.json", [metadata, { ...metadata, filename: otherKey }]);
    for (const object of [
      key,
      `${key}.json`,
      `${key}.checkpoints.json`,
      `${key}.cast.json`,
      otherKey,
      `${otherKey}.json`,
    ])
      seed(`demos/${object}`, {});
    await new DemoUploader(config, directory).deleteUserDemo(key);
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([{ ...metadata, filename: otherKey }]);
    expect([...bucket.objects.keys()].sort()).toEqual(
      [
        "demos/index.json",
        `demos/${otherKey}`,
        `demos/${otherKey}.json`,
      ].sort(),
    );
    expect(bucket.events.indexOf("put:demos/index.json")).toBeLessThan(
      bucket.events.indexOf(`removed:demos/${key}`),
    );
    expect(bucket.events.at(-1)).toBe(`removed:demos/${key}`);
  });

  it("retains the recording when sidecar deletion fails and supports an idempotent retry", async () => {
    seed("demos/index.json", [metadata]);
    seed(`demos/${key}.json`, metadata);
    seed(`demos/${key}`, {});
    bucket.failDelete = `demos/${key}.json`;
    const uploader = new DemoUploader(config, directory);
    await expect(uploader.deleteUserDemo(key)).rejects.toThrow(
      "Could not remove",
    );
    expect(bucket.objects.has(`demos/${key}.json`)).toBe(true);
    expect(bucket.objects.has(`demos/${key}`)).toBe(true);
    expect(
      JSON.parse(bucket.objects.get("demos/index.json")!.body.toString()),
    ).toEqual([]);
    bucket.failDelete = "";
    await uploader.deleteUserDemo(key);
    await uploader.deleteUserDemo(key);
    expect([...bucket.objects.keys()]).toEqual(["demos/index.json"]);
  });

  it("does not allow user operations to target live recordings or arbitrary paths", async () => {
    const uploader = new DemoUploader(config, directory);
    await expect(uploader.deleteUserDemo("recorded.rec")).rejects.toThrow(
      "Invalid",
    );
    await expect(
      uploader.publishPreparedDemo(
        "../recorded.rec",
        input,
        metadata,
        checkpoints,
      ),
    ).rejects.toThrow("Invalid");
    expect(bucket.events).toEqual([]);
  });
});
