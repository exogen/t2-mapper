import { afterEach, beforeEach, expect, it, vi } from "vitest";

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
    constructor() {
      mocks.construct(this);
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
