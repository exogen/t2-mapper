import { EventEmitter, getEventListeners } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fork: vi.fn(), setPriority: vi.fn() }));
vi.mock("node:child_process", () => ({ fork: mocks.fork }));
vi.mock("node:os", () => ({
  default: {
    setPriority: mocks.setPriority,
    constants: { priority: { PRIORITY_BELOW_NORMAL: 10 } },
  },
}));

import { runDemoWorker } from "./demoWorkerProcess";

const script = new URL("./demoCheckpointWorker.ts", import.meta.url);
const timeoutMS = 10 * 60_000;

function worker(pid = 1234) {
  return Object.assign(new EventEmitter(), {
    pid,
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
}

let child: ReturnType<typeof worker>;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubEnv("DEMO_CHECKPOINT_HEAP_MB", undefined);
  child = worker();
  mocks.fork.mockReturnValue(child);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("demo worker lifecycle", () => {
  it("waits for process and stdio closure and returns the last IPC message plus bounded stderr", async () => {
    const abort = new AbortController();
    const env = { NODE_ENV: "production" };
    const pending = runDemoWorker(script, ["demo.rec"], {
      env,
      signal: abort.signal,
    });
    const settled = vi.fn();
    void pending.then(settled, settled);
    child.emit("message", { count: 1 });
    child.emit("message", { count: 2 });
    child.stderr.write("x".repeat(9000));
    child.emit("exit", 0, null);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    expect(getEventListeners(abort.signal, "abort")).toHaveLength(1);
    child.stderr.write("final stderr");
    child.emit("close", 0, null);

    expect(await pending).toEqual({
      message: { count: 2 },
      code: 0,
      signal: null,
      timedOut: false,
      stderr: `${"x".repeat(9000)}final stderr`.slice(-8192),
    });
    expect(mocks.fork).toHaveBeenCalledWith(script, ["demo.rec"], {
      env,
      execArgv: [
        "--import=tsx/esm",
        "--max-old-space-size=256",
        "--max-semi-space-size=8",
      ],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    expect(mocks.setPriority).toHaveBeenCalledWith(1234, 10);
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(abort.signal, "abort")).toHaveLength(0);
    expect(child.listenerCount("message")).toBe(0);
    expect(child.listenerCount("close")).toBe(0);
    expect(child.stderr.listenerCount("data")).toBe(0);

    abort.abort();
    child.emit("message", { count: 3 });
    child.emit("error", new Error("late IPC error"));
    child.emit("close", 1, null);
    await vi.advanceTimersByTimeAsync(timeoutMS);
    expect(child.kill).not.toHaveBeenCalled();
    expect(settled).toHaveBeenCalledOnce();
  });

  it("starts independent workers concurrently without an internal scheduler", async () => {
    const second = worker(5678);
    mocks.fork.mockReturnValueOnce(child).mockReturnValueOnce(second);
    const first = runDemoWorker(script, ["first.rec"]);
    const next = runDemoWorker(script, ["second.rec"]);

    expect(mocks.fork).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(2);
    second.emit("message", "second result");
    second.emit("close", 0, null);
    expect(await next).toMatchObject({ message: "second result", code: 0 });
    expect(vi.getTimerCount()).toBe(1);
    child.emit("message", "first result");
    child.emit("close", 0, null);
    expect(await first).toMatchObject({ message: "first result", code: 0 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a crash after IPC instead of accepting the message as successful completion", async () => {
    const pending = runDemoWorker(script, []);
    child.emit("message", { result: "prepared" });
    child.emit("close", 1, null);

    expect(await pending).toMatchObject({
      message: { result: "prepared" },
      code: 1,
      signal: null,
      timedOut: false,
    });
  });

  it("does not start a worker for an already canceled request", async () => {
    const abort = new AbortController();
    const reason = new Error("canceled");
    abort.abort(reason);

    await expect(
      runDemoWorker(script, [], { signal: abort.signal }),
    ).rejects.toBe(reason);

    expect(mocks.fork).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kills canceled work but rejects only after the child closes", async () => {
    const abort = new AbortController();
    const reason = new Error("canceled");
    const pending = runDemoWorker(script, [], { signal: abort.signal });
    const settled = vi.fn();
    void pending.then(settled, settled);
    abort.abort(reason);
    await Promise.resolve();

    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    expect(settled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    child.emit("exit", null, "SIGKILL");
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    child.emit("close", null, "SIGKILL");

    await expect(pending).rejects.toBe(reason);
    expect(settled).toHaveBeenCalledOnce();
  });

  it("handles cancellation occurring while fork is starting", async () => {
    const abort = new AbortController();
    const reason = new Error("canceled during spawn");
    mocks.fork.mockImplementationOnce(() => {
      abort.abort(reason);
      return child;
    });

    const pending = runDemoWorker(script, [], { signal: abort.signal });
    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
    await expect(pending).rejects.toBe(reason);
    expect(getEventListeners(abort.signal, "abort")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kills timed out work but returns its exit only after the child closes", async () => {
    const pending = runDemoWorker(script, []);
    const settled = vi.fn();
    void pending.then(settled, settled);
    await vi.advanceTimersByTimeAsync(timeoutMS);

    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    expect(settled).not.toHaveBeenCalled();
    child.emit("exit", null, "SIGKILL");
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    child.emit("close", null, "SIGKILL");

    expect(await pending).toMatchObject({
      code: null,
      signal: "SIGKILL",
      timedOut: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves timeout reporting when termination also emits an error, waiting until close", async () => {
    const pending = runDemoWorker(script, []);
    const settled = vi.fn();
    void pending.then(settled, settled);
    child.kill.mockImplementationOnce(() => {
      child.emit("error", new Error("kill failed"));
      return false;
    });

    await vi.advanceTimersByTimeAsync(timeoutMS);

    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    expect(settled).not.toHaveBeenCalled();
    child.emit("close", 1, null);
    expect(await pending).toMatchObject({
      code: 1,
      timedOut: true,
    });
    expect(settled).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects spawn failure without a pid or stdio immediately and cleans up the deadline", async () => {
    const failed = Object.assign(new EventEmitter(), {
      pid: undefined,
      stderr: undefined,
      kill: vi.fn(),
    });
    mocks.fork.mockReturnValueOnce(failed);
    const abort = new AbortController();
    const error = new Error("spawn failed");
    const pending = runDemoWorker(script, [], { signal: abort.signal });
    const rejected = expect(pending).rejects.toBe(error);
    failed.emit("error", error);

    await rejected;
    expect(failed.kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(abort.signal, "abort")).toHaveLength(0);
    expect(failed.listenerCount("close")).toBe(0);
    expect(failed.listenerCount("message")).toBe(0);
    failed.emit("close", -1, null);
    failed.emit("error", new Error("late spawn error"));
    await expect(pending).rejects.toBe(error);
  });

  it("rejects a synchronous spawn failure without leaving timers or abort listeners", async () => {
    const abort = new AbortController();
    const error = new Error("fork failed");
    mocks.fork.mockImplementationOnce(() => {
      throw error;
    });

    await expect(
      runDemoWorker(script, [], { signal: abort.signal }),
    ).rejects.toBe(error);

    expect(vi.getTimerCount()).toBe(0);
    expect(getEventListeners(abort.signal, "abort")).toHaveLength(0);
  });

  it("terminates a spawned child after an error and preserves the first failure until close", async () => {
    const pending = runDemoWorker(script, []);
    const settled = vi.fn();
    void pending.then(settled, settled);
    const error = new Error("IPC failed");
    child.kill.mockImplementationOnce(() => {
      child.emit("error", new Error("kill failed"));
      return false;
    });
    child.emit("error", error);
    child.emit("message", { result: "too late" });
    child.emit("exit", 1, null);
    await Promise.resolve();

    expect(child.kill).toHaveBeenCalledExactlyOnceWith("SIGKILL");
    expect(settled).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    child.emit("close", 1, null);
    await expect(pending).rejects.toBe(error);
    child.emit("error", new Error("late error"));
    child.emit("close", 0, null);
    expect(settled).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledOnce();
  });

  it("keeps process isolation when the host forbids changing its priority", async () => {
    mocks.setPriority.mockImplementationOnce(() => {
      throw new Error("not permitted");
    });
    const pending = runDemoWorker(script, []);
    child.emit("close", 0, null);
    expect(await pending).toMatchObject({ code: 0 });
  });

  it("applies the configured worker heap limit", async () => {
    vi.stubEnv("DEMO_CHECKPOINT_HEAP_MB", "512");
    const pending = runDemoWorker(script, []);
    child.emit("close", 0, null);
    await pending;
    expect(mocks.fork.mock.calls[0][2].execArgv).toContain(
      "--max-old-space-size=512",
    );
  });

  it("rejects an invalid heap limit before spawning", () => {
    vi.stubEnv("DEMO_CHECKPOINT_HEAP_MB", "0");
    expect(() => runDemoWorker(script, [])).toThrow(
      "DEMO_CHECKPOINT_HEAP_MB must be a positive integer",
    );
    expect(mocks.fork).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
