import { afterEach, beforeEach, expect, it, vi } from "vitest";
import path from "node:path";
import { DEFAULT_CHECKPOINT_INTERVAL_TICKS } from "../src/stream/demoCheckpoints";

const mocks = vi.hoisted(() => ({
  r2Client: vi.fn(),
  list: vi.fn(),
  construct: vi.fn(),
  publish: vi.fn(),
  isCurrent: vi.fn(),
}));
vi.mock("./lib/r2", () => ({
  r2Client: mocks.r2Client,
  listAllObjects: mocks.list,
}));
vi.mock("../relay/demoCheckpointPublisher", () => ({
  DemoCheckpointPublisher: class {
    constructor(config: unknown, assetRoot: string, plan: unknown) {
      mocks.construct(this, config, assetRoot, plan);
    }
    publish(key: string, options: unknown) {
      return mocks.publish(this, key, options);
    }
    isCurrent(key: string) {
      return mocks.isCurrent(key);
    }
  },
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const keys = ["demos/a.rec", "demos/b.rec", "demos/c.rec", "demos/d.rec"];

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", undefined);
  vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", undefined);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
  process.argv = ["node", "backfill-demo-checkpoints.ts"];
  mocks.r2Client.mockReturnValue({ client: {}, config: {} });
  mocks.list.mockResolvedValue([
    ...keys.map((key) => ({ key })),
    { key: "demos/a.rec.json" },
  ]);
  mocks.publish.mockResolvedValue("published");
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

function summary() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);
}

it.each([1, 2, 8])(
  "limits work to %i independent publishers and processes each demo once",
  async (concurrency) => {
    if (concurrency !== 1) process.argv.push(`--concurrency=${concurrency}`);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.publish.mockImplementation(async () => {
      await gate;
      return "published";
    });
    const run = import("./backfill-demo-checkpoints");
    const workers = Math.min(concurrency, keys.length);
    try {
      await vi.waitFor(() => {
        expect(mocks.publish).toHaveBeenCalledTimes(workers);
      });
      expect(mocks.construct).toHaveBeenCalledTimes(workers);
      expect(
        new Set(mocks.publish.mock.calls.map(([worker]) => worker)).size,
      ).toBe(workers);
    } finally {
      release();
      await run;
    }
    expect(mocks.publish.mock.calls.map(([, key]) => key).sort()).toEqual(keys);
    expect(summary()).toEqual({
      demos: 4,
      published: 4,
      current: 0,
      failed: 0,
      planned: 0,
    });
  },
);

it("finishes other jobs and reports both worker and upload failures", async () => {
  process.argv.push("--concurrency=2");
  mocks.publish
    .mockRejectedValueOnce(new Error("upload failed"))
    .mockResolvedValueOnce("failed")
    .mockResolvedValueOnce("current");
  await import("./backfill-demo-checkpoints");
  expect(mocks.publish).toHaveBeenCalledTimes(4);
  expect(summary()).toEqual({
    demos: 4,
    published: 1,
    current: 1,
    failed: 2,
    planned: 0,
  });
  expect(process.exitCode).toBe(1);
});

it.each([
  [undefined, undefined, 1],
  ["3", undefined, 3],
  ["3", "4", 4],
  ["3", "0", 0],
  ["invalid", "2", 2],
])(
  "uses env=%s and --count=%s to request %i checkpoints",
  async (env, arg, count) => {
    vi.stubEnv("DEMO_CHECKPOINT_COUNT", env);
    if (arg !== undefined) process.argv.push(`--count=${arg}`);
    await import("./backfill-demo-checkpoints");
    expect(mocks.construct).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {},
      path.resolve("docs/base"),
      { intervalTicks: DEFAULT_CHECKPOINT_INTERVAL_TICKS, maxCount: count },
    );
  },
);

it.each([
  [undefined, undefined, DEFAULT_CHECKPOINT_INTERVAL_TICKS],
  ["6", undefined, 11_250],
  ["6", "0.5", 938],
  ["invalid", "3", 5_625],
])(
  "uses env=%s and --interval=%s for checkpoints %i ticks apart",
  async (env, arg, intervalTicks) => {
    vi.stubEnv("DEMO_CHECKPOINT_INTERVAL_MINUTES", env);
    if (arg !== undefined) process.argv.push(`--interval=${arg}`);
    await import("./backfill-demo-checkpoints");
    expect(mocks.construct).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {},
      path.resolve("docs/base"),
      { intervalTicks, maxCount: 1 },
    );
  },
);

it.each(["", "0", "-1", "invalid", "Infinity"])(
  "rejects invalid checkpoint interval %s before accessing R2",
  async (interval) => {
    process.argv.push(`--interval=${interval}`);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(import("./backfill-demo-checkpoints")).rejects.toThrow("exit");
    expect(console.error).toHaveBeenCalledWith(
      "--interval must be a positive number of minutes",
    );
    expect(mocks.r2Client).not.toHaveBeenCalled();
  },
);

it.each(["", "-1", "1.5", "invalid", "Infinity", "9007199254740992"])(
  "rejects invalid checkpoint count %s before accessing R2",
  async (count) => {
    process.argv.push(`--count=${count}`);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(import("./backfill-demo-checkpoints")).rejects.toThrow("exit");
    expect(console.error).toHaveBeenCalledWith(
      "--count must be a non-negative integer",
    );
    expect(mocks.r2Client).not.toHaveBeenCalled();
  },
);

it("rejects an invalid environment count before accessing R2", async () => {
  vi.stubEnv("DEMO_CHECKPOINT_COUNT", "-1");
  vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("exit");
  });
  await expect(import("./backfill-demo-checkpoints")).rejects.toThrow("exit");
  expect(console.error).toHaveBeenCalledWith(
    "DEMO_CHECKPOINT_COUNT must be a non-negative integer",
  );
  expect(mocks.r2Client).not.toHaveBeenCalled();
});

it("honors the demo filter in dry-run mode without publishing", async () => {
  process.argv.push("--concurrency=2", "--dry-run", "--filter=a.rec");
  mocks.isCurrent.mockResolvedValue(false);
  await import("./backfill-demo-checkpoints");
  expect(mocks.isCurrent).toHaveBeenCalledExactlyOnceWith("demos/a.rec");
  expect(mocks.publish).not.toHaveBeenCalled();
  expect(summary()).toEqual({
    demos: 1,
    published: 0,
    current: 0,
    failed: 0,
    planned: 1,
  });
});

it.each(["0", "-1", "1.5", "invalid", "Infinity"])(
  "rejects invalid concurrency %s before accessing R2",
  async (concurrency) => {
    process.argv.push(`--concurrency=${concurrency}`);
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(import("./backfill-demo-checkpoints")).rejects.toThrow("exit");
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mocks.r2Client).not.toHaveBeenCalled();
  },
);
