import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("node:child_process", () => ({ fork: mocks.fork }));
import { runDemoUploadProcess } from "./demoUploadProcess";
import { DEMO_CHECKPOINT_VERSION } from "../src/stream/demoCheckpoints";

const checkpoints = {
  version: DEMO_CHECKPOINT_VERSION,
  demoBytes: 3,
  demoSha256: "abc",
  count: 1,
  bytes: 42,
  elapsedMS: 1,
  reused: false,
  intervalTicks: 11_250,
  maxCount: 6,
};

let child: EventEmitter & {
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", "6");
  vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", "6");
  child = Object.assign(new EventEmitter(), {
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  mocks.fork.mockReturnValue(child);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("user demo processing child", () => {
  it("keeps credentials out of the child and waits for a clean exit", async () => {
    vi.stubEnv("AUTH_SECRET", "private-secret");
    vi.stubEnv("NODE_OPTIONS", "--inspect");
    const pending = runDemoUploadProcess("demo.rec", "/assets");
    const result = {
      metadata: { filename: "demo.rec" },
      startMission: "Katabatic",
      checkpoints,
    };
    child.emit("message", { result });
    let completed = false;
    void pending.then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);
    child.emit("close", 0);
    expect(await pending).toEqual(result);
    const [, args, options] = mocks.fork.mock.calls.at(-1)!;
    expect(args).toEqual(["demo.rec", "/assets", "11250", "6"]);
    expect(options.env).not.toHaveProperty("AUTH_SECRET");
    expect(options.env).not.toHaveProperty("NODE_OPTIONS");
    expect(options.execArgv).toContain("--max-old-space-size=256");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not accept a result followed by a crash or expose stderr", async () => {
    const pending = runDemoUploadProcess("demo.rec", "/assets");
    const failed = expect(pending).rejects.toThrow("could not be processed");
    child.stderr.write("private filesystem path and parser stack");
    child.emit("message", { result: { metadata: {} } });
    child.emit("close", 1);
    await failed;
  });

  it("returns a safe validation failure", async () => {
    const pending = runDemoUploadProcess("demo.rec", "/assets");
    const failed = expect(pending).rejects.toThrow("Only Tribes 2 build 25034");
    child.emit("message", {
      error: "Only Tribes 2 build 25034 recordings are supported.",
    });
    child.emit("close", 1);
    await failed;
  });

  it("reports timed out processing only after the child exits", async () => {
    const pending = runDemoUploadProcess("demo.rec", "/assets");
    const failed = expect(pending).rejects.toThrow("time limit");
    let settled = false;
    void pending.catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    expect(settled).toBe(false);
    child.emit("close", null);
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kills canceled active work and waits for exit before reporting it", async () => {
    const abort = new AbortController();
    const pending = runDemoUploadProcess("demo.rec", "/assets", abort.signal);
    const canceled = expect(pending).rejects.toThrow("canceled");
    abort.abort(new Error("canceled"));
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null);
    await canceled;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("handles spawn failure without a lingering deadline", async () => {
    const pending = runDemoUploadProcess("demo.rec", "/assets");
    const failed = expect(pending).rejects.toThrow("could not be started");
    child.emit("error", new Error("private executable path"));
    await failed;
    expect(vi.getTimerCount()).toBe(0);
  });
});
