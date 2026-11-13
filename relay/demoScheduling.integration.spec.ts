import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough, type Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fork: vi.fn(), send: vi.fn() }));
vi.mock("node:child_process", () => ({ fork: mocks.fork }));
vi.mock("@aws-sdk/client-s3", () => {
  const command = (kind: string) =>
    class {
      readonly kind = kind;
      readonly input: { Key: string; Body?: Readable };
      constructor(input: { Key: string; Body?: Readable }) {
        this.input = input;
      }
    };
  return {
    S3Client: class {
      send = mocks.send;
    },
    GetObjectCommand: command("get"),
    HeadObjectCommand: command("head"),
    PutObjectCommand: command("put"),
  };
});

import { DEMO_CHECKPOINT_VERSION } from "../src/stream/demoCheckpoints";
import { DemoCheckpointPublisher } from "./demoCheckpointPublisher";
import { createRelayDemoProcessing } from "./demoProcessing";

const plan = { intervalTicks: 22_500, maxCount: 1 };
const checkpoint = {
  version: DEMO_CHECKPOINT_VERSION,
  demoBytes: 3,
  demoSha256: "a".repeat(64),
  count: 0,
  bytes: 18,
  elapsedMS: 1,
  reused: false,
};
const upload = {
  metadata: {
    filename: "upload.rec",
    bytes: 3,
    recordedAt: "2026-11-01T00:00:00.000Z",
    server: "Server",
    address: "127.0.0.1:28000",
    games: [],
    mod: "classic",
    recorder: "Recorder",
    durationMs: 1000,
    players: [],
  },
  startMission: "Katabatic",
  checkpoints: { ...checkpoint, ...plan },
};
interface Child extends EventEmitter {
  pid: number;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
  script: URL;
  args: string[];
}
let children: Child[];
let live: number;
let peakLive: number;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(os, "setPriority").mockImplementation(() => {});
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", "1");
  vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", "12");
  vi.stubEnv("DEMO_CHECKPOINT_HEAP_MB", "256");
  children = [];
  live = peakLive = 0;
  mocks.fork.mockImplementation((script: URL, args: string[]) => {
    const child = Object.assign(new EventEmitter(), {
      pid: 1234 + children.length,
      stderr: new PassThrough(),
      kill: vi.fn(),
      script,
      args,
    });
    children.push(child);
    peakLive = Math.max(peakLive, ++live);
    child.once("close", () => live--);
    return child;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function finish(child: Child) {
  child.emit(
    "message",
    child.script.pathname.endsWith("demoUploadWorker.ts")
      ? { result: upload }
      : checkpoint,
  );
  child.emit("close", 0, null);
}
async function forks(count: number) {
  await vi.waitFor(() => expect(mocks.fork).toHaveBeenCalledTimes(count));
}

describe("relay demo scheduling", () => {
  it("shares one process slot and starts waiting recordings before uploads", async () => {
    const processing = createRelayDemoProcessing();
    const first = processing.processUpload("first.rec", "/assets");
    const waiting = processing.processUpload("waiting.rec", "/assets");
    const recording = processing.generateCheckpoints(
      "recorded.rec",
      "recorded.rec.checkpoints.json",
      "/assets",
      false,
      plan,
    );
    expect(children.map((child) => child.args[0])).toEqual(["first.rec"]);

    finish(children[0]);
    await forks(2);
    expect(children[1].args[0]).toBe("recorded.rec");
    finish(children[1]);
    await forks(3);
    expect(children[2].args[0]).toBe("waiting.rec");
    finish(children[2]);

    await Promise.all([first, waiting, recording]);
    expect(peakLive).toBe(1);
    expect(live).toBe(0);
  });

  it("cancels queued uploads without creating their child process", async () => {
    const processing = createRelayDemoProcessing();
    const first = processing.generateCheckpoints(
      "recorded.rec",
      "output.json",
      "/assets",
    );
    const abort = new AbortController();
    const waiting = processing.processUpload(
      "canceled.rec",
      "/assets",
      abort.signal,
    );
    const canceled = expect(waiting).rejects.toThrow("canceled");
    abort.abort(new Error("canceled"));
    await canceled;
    expect(mocks.fork).toHaveBeenCalledOnce();

    finish(children[0]);
    await first;
    const next = processing.processUpload("next.rec", "/assets");
    finish(children[1]);
    await next;
    expect(children.map((child) => child.args[0])).toEqual([
      "recorded.rec",
      "next.rec",
    ]);
    expect(peakLive).toBe(1);
  });

  it("cancels queued stats and stops an active GUID repair before releasing its worker slot", async () => {
    const processing = createRelayDemoProcessing();
    const first = processing.generateCheckpoints(
      "recorded.rec",
      "output.json",
      "/assets",
    );
    const repairAbort = new AbortController();
    const statsAbort = new AbortController();
    const repair = processing.repairNamesByGuid(
      "repair.rec",
      repairAbort.signal,
    );
    const stats = processing.computeStats(
      "stats.rec",
      "/assets",
      "manifest.json",
      statsAbort.signal,
    );
    const statsCanceled = expect(stats).rejects.toThrow("cancel stats");
    statsAbort.abort(new Error("cancel stats"));
    await statsCanceled;
    finish(children[0]);
    await first;
    await forks(2);
    expect(children[1].script.pathname).toContain("demoGuidWorker.ts");

    const upload = processing.processUpload("waiting.rec", "/assets");
    const repairCanceled = expect(repair).rejects.toThrow("cancel repair");
    repairAbort.abort(new Error("cancel repair"));
    expect(children[1].kill).toHaveBeenCalledWith("SIGKILL");
    expect(mocks.fork).toHaveBeenCalledTimes(2);
    children[1].emit("close", null, "SIGKILL");
    await repairCanceled;
    await forks(3);
    expect(children[2].args[0]).toBe("waiting.rec");
    finish(children[2]);
    await upload;
    expect(peakLive).toBe(1);
    expect(live).toBe(0);
  });

  it.each(["cancellation", "timeout"] as const)(
    "holds the process slot until the child closes after %s",
    async (cause) => {
      if (cause === "timeout") vi.useFakeTimers();
      const processing = createRelayDemoProcessing();
      const abort = new AbortController();
      const active = processing.processUpload(
        "active.rec",
        "/assets",
        abort.signal,
      );
      const failure = expect(active).rejects.toThrow(
        cause === "timeout" ? "time limit" : "canceled",
      );
      const next = processing.generateCheckpoints(
        "next.rec",
        "next.json",
        "/assets",
      );

      if (cause === "timeout") await vi.advanceTimersByTimeAsync(10 * 60_000);
      else abort.abort(new Error("canceled"));
      expect(children[0].kill).toHaveBeenCalledWith("SIGKILL");
      await Promise.resolve();
      expect(mocks.fork).toHaveBeenCalledOnce();

      children[0].emit("close", null, "SIGKILL");
      await failure;
      await forks(2);
      finish(children[1]);
      await next;
      expect(peakLive).toBe(1);
      if (cause === "timeout") expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(["crash", "spawn failure"] as const)(
    "releases the slot exactly once after a %s",
    async (cause) => {
      if (cause === "spawn failure")
        mocks.fork.mockImplementationOnce(() => {
          throw new Error("spawn failed");
        });
      const processing = createRelayDemoProcessing();
      const failed = processing.processUpload("failed.rec", "/assets");
      const failure = expect(failed).rejects.toThrow(
        cause === "crash" ? "could not be processed" : "could not be started",
      );
      const recording = processing.generateCheckpoints(
        "recorded.rec",
        "output.json",
        "/assets",
      );
      const waiting = processing.processUpload("waiting.rec", "/assets");
      const crashed = cause === "crash" ? children[0] : undefined;
      crashed?.emit("close", 1, null);
      await failure;
      await forks(2);
      expect(children.at(-1)!.args[0]).toBe("recorded.rec");

      // A later duplicate exit notification must not start a second queued job.
      crashed?.emit("close", 1, null);
      await Promise.resolve();
      expect(mocks.fork).toHaveBeenCalledTimes(2);
      finish(children.at(-1)!);
      await forks(3);
      finish(children.at(-1)!);
      await Promise.all([recording, waiting]);
      expect(peakLive).toBe(1);
      expect(live).toBe(0);
    },
  );

  it("keeps an errored live child in the slot until its close event", async () => {
    const processing = createRelayDemoProcessing();
    const active = processing.processUpload("active.rec", "/assets");
    const failure = expect(active).rejects.toThrow();
    const next = processing.generateCheckpoints(
      "next.rec",
      "next.json",
      "/assets",
    );
    let settled = false;
    void active.catch(() => {
      settled = true;
    });

    children[0].emit("error", new Error("failed to signal live worker"));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(mocks.fork).toHaveBeenCalledOnce();

    children[0].emit("close", 1, null);
    await failure;
    await forks(2);
    finish(children[1]);
    await next;
    expect(peakLive).toBe(1);
    expect(live).toBe(0);
  });
});

it.each(["backfill", "relay"] as const)(
  "runs separate publishers with %s-owned scheduling and independent outputs",
  async (owner) => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "demo-scheduling-"),
    );
    const config = {
      endpoint: "https://example.r2.cloudflarestorage.com",
      bucket: "demos",
      accessKeyId: "test",
      secretAccessKey: "test",
      prefix: "demos/",
    };
    const stored = new Map<string, Buffer>();
    mocks.send.mockImplementation(async ({ kind, input }) => {
      if (kind === "head") return { ETag: `"${input.Key}"` };
      if (kind !== "put") throw new Error(`Unexpected storage call: ${kind}`);
      const chunks: Buffer[] = [];
      for await (const chunk of input.Body) chunks.push(Buffer.from(chunk));
      stored.set(input.Key, Buffer.concat(chunks));
      return {};
    });
    try {
      const firstFile = path.join(directory, "first.rec");
      const secondFile = path.join(directory, "second.rec");
      await Promise.all([
        fs.writeFile(firstFile, new Uint8Array([1, 2, 3])),
        fs.writeFile(secondFile, new Uint8Array([4, 5, 6])),
      ]);
      const generate =
        owner === "relay"
          ? vi.fn(createRelayDemoProcessing().generateCheckpoints)
          : undefined;
      const firstPublisher = new DemoCheckpointPublisher(
        config,
        "/assets",
        plan,
        generate,
      );
      const secondPublisher = new DemoCheckpointPublisher(
        config,
        "/assets",
        plan,
        generate,
      );
      const first = firstPublisher.publish("demos/first.rec", {
        localFile: firstFile,
      });
      const second = secondPublisher.publish("demos/second.rec", {
        localFile: secondFile,
      });

      const contents = '{"checkpoints":[]}';
      const complete = async (child: Child) => {
        await fs.writeFile(child.args[1], contents);
        child.emit("message", { ...checkpoint, bytes: contents.length });
        child.emit("close", 0, null);
      };
      if (generate) {
        await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
        expect(mocks.fork).toHaveBeenCalledOnce();
        expect(live).toBe(1);
        await complete(children[0]);
        await forks(2);
        expect(live).toBe(1);
        await complete(children[1]);
      } else {
        await forks(2);
        expect(live).toBe(2);
        await Promise.all(children.map(complete));
      }
      const outputs = children.map((child) => child.args[1]);
      expect(outputs).toEqual([
        `${firstFile}.checkpoints.json`,
        `${secondFile}.checkpoints.json`,
      ]);
      await expect(Promise.all([first, second])).resolves.toEqual([
        "published",
        "published",
      ]);
      expect(stored).toEqual(
        new Map([
          ["demos/first.rec.checkpoints.json", Buffer.from(contents)],
          ["demos/second.rec.checkpoints.json", Buffer.from(contents)],
        ]),
      );
      expect(peakLive).toBe(owner === "relay" ? 1 : 2);
      expect(live).toBe(0);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  },
);
