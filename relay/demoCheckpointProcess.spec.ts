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
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", undefined);
  vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", undefined);
  vi.stubEnv("DEMO_CHECKPOINT_HEAP_MB", undefined);
  vi.useFakeTimers();
  child = Object.assign(new EventEmitter(), {
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
  mocks.fork.mockReturnValue(child);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("checkpoint child process", () => {
  it.each([
    { intervalTicks: 22_500, maxCount: -1 },
    { intervalTicks: 22_500, maxCount: 1.5 },
    { intervalTicks: 22_500, maxCount: NaN },
    { intervalTicks: 22_500, maxCount: Infinity },
    { intervalTicks: 22_500, maxCount: Number.MAX_SAFE_INTEGER + 1 },
    { intervalTicks: 0, maxCount: 1 },
    { intervalTicks: Infinity, maxCount: 1 },
  ])("rejects invalid plan %o without spawning a child", (plan) => {
    const forks = mocks.fork.mock.calls.length;
    expect(() =>
      runDemoCheckpointProcess(
        "demo.rec",
        "output.json",
        "/assets",
        false,
        plan,
      ),
    ).toThrow(/^Checkpoint (count|interval) must be/);
    expect(mocks.fork).toHaveBeenCalledTimes(forks);
    expect(vi.getTimerCount()).toBe(0);
  });
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
      ["demo.rec", "output.json", "/assets", "false", "22500", "1"],
      expect.objectContaining({
        execArgv: expect.arrayContaining([
          "--import=tsx/esm",
          "--max-old-space-size=256",
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

  it("passes an explicit plan to the child instead of the environment default", async () => {
    vi.stubEnv("DEMO_CHECKPOINT_COUNT", "3");
    vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", "9");
    const pending = runDemoCheckpointProcess(
      "demo.rec",
      "output.json",
      "/assets",
      false,
      { intervalTicks: 100, maxCount: 4 },
    );
    child.emit("message", { count: 2 });
    child.emit("close", 0, null);
    await pending;
    expect(mocks.fork.mock.calls.at(-1)![1]).toEqual([
      "demo.rec",
      "output.json",
      "/assets",
      "false",
      "100",
      "4",
    ]);
  });

  it("applies the configured heap cap to the child process", async () => {
    vi.stubEnv("DEMO_CHECKPOINT_HEAP_MB", "512");
    const pending = runDemoCheckpointProcess(
      "demo.rec",
      "output.json",
      "/assets",
    );
    child.emit("message", { count: 3 });
    child.emit("close", 0, null);
    await pending;
    expect(mocks.fork.mock.calls.at(-1)![2].execArgv).toContain(
      "--max-old-space-size=512",
    );
  });

  it("rejects an invalid heap cap before spawning a child", () => {
    vi.stubEnv("DEMO_CHECKPOINT_HEAP_MB", "0");
    const forks = mocks.fork.mock.calls.length;
    expect(() =>
      runDemoCheckpointProcess("demo.rec", "output.json", "/assets"),
    ).toThrow("DEMO_CHECKPOINT_HEAP_MB must be a positive integer");
    expect(mocks.fork).toHaveBeenCalledTimes(forks);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("kills a stalled worker and waits for exit before reporting the timeout", async () => {
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
