import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  MAX_CLIP_SOURCE_BYTES,
  prepareClipCheckpoint,
} from "./clipCheckpoint.js";

const mocks = vi.hoisted(() => ({ worker: vi.fn() }));
vi.mock("./demoWorkerProcess.js", () => ({ runDemoWorker: mocks.worker }));

const config = {
  endpoint: "https://storage.invalid",
  bucket: "public",
  prefix: "demos/",
  accessKeyId: "key",
  secretAccessKey: "secret",
};
const etag = '"source"';
let send: ReturnType<typeof vi.fn>;
let inputFile: string | undefined;

beforeEach(() => {
  vi.resetAllMocks();
  inputFile = undefined;
  send = vi.fn(async (command: unknown) => {
    if (command instanceof HeadObjectCommand)
      return { ETag: etag, ContentLength: 3 };
    if (command instanceof GetObjectCommand)
      return { ETag: etag, Body: Readable.from([Buffer.from("rec")]) };
    throw new Error("Unexpected storage request");
  });
  mocks.worker.mockImplementation(async (_script: URL, args: string[]) => {
    inputFile = args[0];
    expect(await fs.readFile(args[0], "utf8")).toBe("rec");
    await fs.writeFile(args[1], "checkpoint");
    return {
      code: 0,
      message: { result: { demoBytes: 3, demoSha256: "sha256", count: 1 } },
      timedOut: false,
    };
  });
});

afterEach(() => vi.restoreAllMocks());

function prepare(
  overrides: Partial<Parameters<typeof prepareClipCheckpoint>[0]> = {},
) {
  return prepareClipCheckpoint({
    config,
    sourceDemo: "match.rec",
    sourceETag: etag,
    startSec: 12.345,
    endSec: 13.123,
    assetRoot: "/assets",
    client: { send } as unknown as S3Client,
    ...overrides,
  });
}

it("downloads the immutable hosted source and prepares the preceding simulation tick with a bounded worker", async () => {
  expect(await prepare()).toEqual({
    text: "checkpoint",
    sourceSha256: "sha256",
    sourceBytes: 3,
  });
  expect(mocks.worker).toHaveBeenCalledWith(
    expect.any(URL),
    [
      expect.any(String),
      expect.any(String),
      "/assets",
      "385",
      expect.any(String),
      "411",
    ],
    {
      signal: undefined,
      env: { PATH: process.env.PATH, NODE_ENV: "production", TZ: "UTC" },
    },
  );
  expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual([
    "HeadObjectCommand",
    "GetObjectCommand",
    "HeadObjectCommand",
  ]);
  await expect(fs.access(path.dirname(inputFile!))).rejects.toThrow();
});

it.each(["users/126767979894407168/upload.rec", "match.rec"])(
  "supports uploaded and MapGenius recordings (%s), including tick zero",
  async (sourceDemo) => {
    await prepare({ sourceDemo, startSec: 0, endSec: 0.1 });
    expect(mocks.worker.mock.calls[0][1][3]).toBe("0");
  },
);

it("prepares a freeze shot whose camera moves while source demo time stays paused", async () => {
  expect(await prepare({ startSec: 12.345, endSec: 12.345 })).toEqual({
    text: "checkpoint",
    sourceSha256: "sha256",
    sourceBytes: 3,
  });
  expect(mocks.worker.mock.calls[0][1][3]).toBe("385");
  expect(mocks.worker.mock.calls[0][1][5]).toBe("386");
});

it.each(["initial", "download", "after-worker"])(
  "rejects a source replacement at %s",
  async (phase) => {
    let heads = 0;
    send.mockImplementation(async (command: unknown) => {
      if (command instanceof HeadObjectCommand)
        return {
          ETag:
            phase === "initial" || (++heads === 2 && phase === "after-worker")
              ? '"changed"'
              : etag,
        };
      return {
        ETag: phase === "download" ? '"changed"' : etag,
        Body: Readable.from(["rec"]),
      };
    });
    await expect(prepare()).rejects.toThrow("recording changed");
    if (phase !== "after-worker") expect(mocks.worker).not.toHaveBeenCalled();
    if (inputFile)
      await expect(fs.access(path.dirname(inputFile))).rejects.toThrow();
  },
);

it("rejects oversized source metadata before a recording download", async () => {
  send.mockResolvedValue({
    ETag: etag,
    ContentLength: MAX_CLIP_SOURCE_BYTES + 1,
  });
  await expect(prepare()).rejects.toThrow("recording is too large");
  expect(send).toHaveBeenCalledOnce();
  expect(mocks.worker).not.toHaveBeenCalled();
});

it("cleans temporary source files after a worker failure", async () => {
  mocks.worker.mockImplementation(async (_script: URL, args: string[]) => {
    inputFile = args[0];
    return {
      code: 1,
      timedOut: false,
      message: { error: "untrusted diagnostics" },
    };
  });
  await expect(prepare()).rejects.toThrow("could not be prepared");
  await expect(fs.access(path.dirname(inputFile!))).rejects.toThrow();
});

it("passes cancellation to the worker and cleans the source before returning", async () => {
  const controller = new AbortController();
  mocks.worker.mockImplementation(
    async (_script: URL, args: string[], options: { signal: AbortSignal }) => {
      inputFile = args[0];
      expect(options.signal).toBe(controller.signal);
      controller.abort(new Error("Clip deleted"));
      throw controller.signal.reason;
    },
  );
  await expect(prepare({ signal: controller.signal })).rejects.toThrow(
    "Clip deleted",
  );
  await expect(fs.access(path.dirname(inputFile!))).rejects.toThrow();
});

it("rejects pre-cancellation before any storage request", async () => {
  const controller = new AbortController();
  controller.abort(new Error("Stopped"));
  await expect(prepare({ signal: controller.signal })).rejects.toThrow(
    "Stopped",
  );
  expect(send).not.toHaveBeenCalled();
});

it.each([
  { sourceDemo: "../private.rec" },
  { startSec: -1 },
  { startSec: NaN },
  { endSec: 1 },
  { endSec: Infinity },
  { sourceETag: "" },
])("rejects invalid source/range %j before IO", async (overrides) => {
  await expect(prepare(overrides)).rejects.toThrow("Invalid clip");
  expect(send).not.toHaveBeenCalled();
});
