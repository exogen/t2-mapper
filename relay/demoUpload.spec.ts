import { beforeEach, describe, expect, it, vi } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const uploadCalls: Array<{ Bucket: string; Key: string }> = [];
let failUploads = false;

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    private params: { Bucket: string; Key: string };
    constructor(opts: { params: { Bucket: string; Key: string } }) {
      this.params = opts.params;
    }
    done(): Promise<void> {
      uploadCalls.push({ Bucket: this.params.Bucket, Key: this.params.Key });
      return failUploads
        ? Promise.reject(new Error("upload failed"))
        : Promise.resolve();
    }
  },
}));

interface FakeCommand {
  type: "GetObject" | "PutObject";
  input: { Key: string; Body?: string; CacheControl?: string };
}
const s3Commands: FakeCommand[] = [];
/** Simulated stored index.json object (null = NoSuchKey). */
let storedIndex: string | null = null;

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(cmd: FakeCommand) {
      s3Commands.push(cmd);
      if (cmd.type === "GetObject") {
        if (storedIndex === null) {
          const err = new Error("The specified key does not exist.");
          err.name = "NoSuchKey";
          throw err;
        }
        const body = storedIndex;
        return { Body: { transformToString: async () => body } };
      }
      if (cmd.input.Key.endsWith("index.json")) {
        storedIndex = cmd.input.Body ?? null;
      }
      return {};
    }
  },
  GetObjectCommand: class {
    readonly type = "GetObject";
    input: FakeCommand["input"];
    constructor(input: FakeCommand["input"]) {
      this.input = input;
    }
  },
  PutObjectCommand: class {
    readonly type = "PutObject";
    input: FakeCommand["input"];
    constructor(input: FakeCommand["input"]) {
      this.input = input;
    }
  },
}));

const { DemoUploader, loadUploadConfig } = await import("./demoUpload.js");

const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  bucket: "t2-demos",
  accessKeyId: "key",
  secretAccessKey: "secret",
  prefix: "demos/",
};

const settle = () => new Promise((r) => setTimeout(r, 25));

describe("loadUploadConfig", () => {
  it("requires all four R2 vars and defaults the prefix", () => {
    expect(loadUploadConfig({})).toBeNull();
    expect(
      loadUploadConfig({
        DEMO_R2_ENDPOINT: config.endpoint,
        DEMO_R2_BUCKET: config.bucket,
        DEMO_R2_ACCESS_KEY_ID: config.accessKeyId,
      }),
    ).toBeNull();
    expect(
      loadUploadConfig({
        DEMO_R2_ENDPOINT: config.endpoint,
        DEMO_R2_BUCKET: config.bucket,
        DEMO_R2_ACCESS_KEY_ID: config.accessKeyId,
        DEMO_R2_SECRET_ACCESS_KEY: config.secretAccessKey,
      }),
    ).toEqual(config);
  });
});

describe("DemoUploader", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "demo-upload-"));
    uploadCalls.length = 0;
    s3Commands.length = 0;
    storedIndex = null;
    failUploads = false;
  });

  function makeRecord(filename: string) {
    return {
      filename,
      bytes: 3,
      recordedAt: "2026-08-20T02:31:07.000Z",
      server: "| the cut |",
      address: "45.76.24.91:28000",
      games: [
        { mission: "Katabatic", gameType: "Capture the Flag", startMs: 0 },
      ],
      mod: "classic",
      recorder: "Observer",
      durationMs: 60_000,
      players: ["Alice", "Bob"],
    };
  }

  it("uploads with the prefixed key and unlinks on success", async () => {
    const filePath = path.join(dir, "auto-capture_test.rec");
    await fsp.writeFile(filePath, new Uint8Array([1, 2, 3]));
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(filePath);

    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toEqual([
      { Bucket: "t2-demos", Key: "demos/auto-capture_test.rec" },
    ]);
    expect(uploader.getStats()).toMatchObject({
      enabled: true,
      queued: 0,
      uploading: null,
      uploaded: 1,
      failed: 0,
      lastUploaded: { key: "demos/auto-capture_test.rec" },
      lastError: null,
    });
  });

  it("uploads the sidecar and appends its record to the index", async () => {
    const record = makeRecord("a.rec");
    await fsp.writeFile(path.join(dir, "a.rec"), new Uint8Array([1, 2, 3]));
    await fsp.writeFile(path.join(dir, "a.rec.json"), JSON.stringify(record));
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(path.join(dir, "a.rec"));

    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toEqual([{ Bucket: "t2-demos", Key: "demos/a.rec" }]);
    const puts = s3Commands.filter((c) => c.type === "PutObject");
    expect(puts.map((c) => c.input.Key)).toEqual([
      "demos/a.rec.json",
      "demos/index.json",
    ]);
    expect(puts[0].input.CacheControl).toContain("immutable");
    // The index mutates — it must never be cached as immutable.
    expect(puts[1].input.CacheControl).toBe("no-cache");
    expect(JSON.parse(storedIndex!)).toEqual([record]);
  });

  it("appends to an existing index and dedupes retries by filename", async () => {
    const existing = makeRecord("old.rec");
    storedIndex = JSON.stringify([existing]);
    const record = makeRecord("b.rec");
    const uploader = new DemoUploader(config, dir);

    await fsp.writeFile(path.join(dir, "b.rec"), new Uint8Array([1]));
    await fsp.writeFile(path.join(dir, "b.rec.json"), JSON.stringify(record));
    uploader.enqueue(path.join(dir, "b.rec"));
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(JSON.parse(storedIndex!)).toEqual([existing, record]);

    // Retry after a crash between index update and unlink: the record
    // is already present, so the re-upload must not duplicate it.
    await fsp.writeFile(path.join(dir, "b.rec"), new Uint8Array([1]));
    await fsp.writeFile(path.join(dir, "b.rec.json"), JSON.stringify(record));
    await uploader.sweep();
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(JSON.parse(storedIndex!)).toEqual([existing, record]);
  });

  it("uploads legacy demos without a sidecar and skips the index", async () => {
    await fsp.writeFile(path.join(dir, "legacy.rec"), new Uint8Array([1]));
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(path.join(dir, "legacy.rec"));
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toHaveLength(1);
    expect(s3Commands).toEqual([]);
    expect(storedIndex).toBeNull();
  });

  it("sweep removes stale orphan sidecars, keeps fresh ones", async () => {
    const staleOrphan = path.join(dir, "gone.rec.json");
    const freshOrphan = path.join(dir, "racing.rec.json");
    await fsp.writeFile(staleOrphan, "{}");
    await fsp.writeFile(freshOrphan, "{}");
    const past = new Date(Date.now() - 10 * 60_000);
    await fsp.utimes(staleOrphan, past, past);
    const uploader = new DemoUploader(config, dir);
    await uploader.sweep();
    await settle();
    expect(await fsp.readdir(dir)).toEqual(["racing.rec.json"]);
    expect(uploadCalls).toEqual([]);
  });

  it("keeps the file on failure; sweep re-enqueues and retries", async () => {
    const filePath = path.join(dir, "keepme.rec");
    await fsp.writeFile(filePath, new Uint8Array([1]));
    const uploader = new DemoUploader(config, dir);
    failUploads = true;
    uploader.enqueue(filePath);
    await vi.waitFor(() => expect(uploadCalls).toHaveLength(1));
    await settle();
    await expect(fsp.access(filePath)).resolves.toBeUndefined();
    expect(uploader.getStats()).toMatchObject({
      uploaded: 0,
      failed: 1,
      lastError: { file: "keepme.rec", message: "Error: upload failed" },
    });

    failUploads = false;
    await uploader.sweep();
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toHaveLength(2);
  });

  it("sweep removes stale .partial debris and enqueues completed demos", async () => {
    const partial = path.join(dir, "crashed.rec.partial");
    const complete = path.join(dir, "complete.rec");
    await fsp.writeFile(partial, new Uint8Array([1]));
    await fsp.writeFile(complete, new Uint8Array([1]));
    // Age the partial past the staleness threshold (crash debris).
    const past = new Date(Date.now() - 10 * 60_000);
    await fsp.utimes(partial, past, past);
    const uploader = new DemoUploader(config, dir);
    await uploader.sweep();

    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toEqual([
      { Bucket: "t2-demos", Key: "demos/complete.rec" },
    ]);
  });

  it("sweep leaves fresh .partial files alone (live spools)", async () => {
    const partial = path.join(dir, "recording.rec.partial");
    await fsp.writeFile(partial, new Uint8Array([1]));
    const uploader = new DemoUploader(config, dir);
    await uploader.sweep();
    await settle();
    expect(await fsp.readdir(dir)).toEqual(["recording.rec.partial"]);
    expect(uploadCalls).toEqual([]);
  });

  it("sweep never removes a live recorder's spool, however stale its mtime", async () => {
    // Deflate only emits once its symbol buffer fills: a quiet live spool
    // can sit unwritten past the staleness window. Ownership, not mtime,
    // is what protects it.
    const live = path.join(dir, "live.rec.partial");
    const debris = path.join(dir, "crashed.rec.partial");
    const past = new Date(Date.now() - 60 * 60_000);
    for (const file of [live, debris]) {
      await fsp.writeFile(file, new Uint8Array([1]));
      await fsp.utimes(file, past, past);
    }
    const uploader = new DemoUploader(config, dir, {
      isLive: (filePath) => filePath === live,
    });
    await uploader.sweep();
    await settle();
    expect(await fsp.readdir(dir)).toEqual(["live.rec.partial"]);
  });

  it("does nothing without config (demos stay local)", async () => {
    const filePath = path.join(dir, "local.rec");
    await fsp.writeFile(filePath, new Uint8Array([1]));
    const uploader = new DemoUploader(null, dir);
    expect(uploader.enabled).toBe(false);
    uploader.enqueue(filePath);
    await uploader.sweep();
    await settle();
    expect(uploadCalls).toEqual([]);
    await expect(fsp.access(filePath)).resolves.toBeUndefined();
  });
});
