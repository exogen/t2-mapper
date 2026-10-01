import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock("node:child_process", () => ({ fork: mocks.fork }));
import {
  DemoCheckpointGenerationError,
  runDemoCheckpointProcess,
} from "./demoCheckpointProcess";

let child: EventEmitter & {
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};
beforeEach(() => {
  vi.useFakeTimers();
  child = Object.assign(new EventEmitter(), {
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  mocks.fork.mockReturnValue(child);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("checkpoint child process", () => {
  it("waits for successful process exit after receiving a result", async () => {
    const result = { count: 2, bytes: 12 };
    const pending = runDemoCheckpointProcess(
      "demo.rec",
      "output.json",
      "/assets",
    );
    child.emit("message", result);
    child.emit("close", 0, null);
    expect(await pending).toEqual(result);
    expect(mocks.fork).toHaveBeenCalledWith(
      expect.any(URL),
      ["demo.rec", "output.json", "/assets", "false"],
      expect.objectContaining({
        execArgv: expect.arrayContaining([
          "--import=tsx/esm",
          "--max-old-space-size=128",
        ]),
      }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not accept an output if the worker crashes after sending it", async () => {
    const pending = runDemoCheckpointProcess(
      "demo.rec",
      "output.json",
      "/assets",
    );
    const failure = expect(pending).rejects.toBeInstanceOf(
      DemoCheckpointGenerationError,
    );
    child.stderr.write("missing collision assets");
    child.emit("message", { count: 2 });
    child.emit("close", 1, null);
    await failure;
    await expect(pending).rejects.toThrow("missing collision assets");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kills a stalled worker and waits for exit before releasing the queue", async () => {
    const pending = runDemoCheckpointProcess(
      "demo.rec",
      "output.json",
      "/assets",
    );
    const failure = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    child.emit("close", null, "SIGKILL");
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects spawn errors without leaving a deadline timer running", async () => {
    const pending = runDemoCheckpointProcess(
      "demo.rec",
      "output.json",
      "/assets",
    );
    const failure = expect(pending).rejects.toThrow("spawn failed");
    child.emit("error", new Error("spawn failed"));
    await failure;
    expect(vi.getTimerCount()).toBe(0);
  });
});
