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
    failUploads = false;
  });

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
