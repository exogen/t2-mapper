import { Readable } from "node:stream";
import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEMO_STATS_VERSION } from "../relay/demoPlayerStatsModel";
import { DEMO_STATS_SUFFIX } from "../relay/demoStats";

const mocks = vi.hoisted(() => ({
  r2Client: vi.fn(),
  list: vi.fn(),
  loadPrivate: vi.fn(),
  existing: vi.fn(),
  read: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  send: vi.fn(),
  compute: vi.fn(),
}));
vi.mock("./lib/r2", () => ({
  r2Client: mocks.r2Client,
  listAllObjects: mocks.list,
}));
vi.mock("../relay/privateDemoStore", () => ({
  loadPrivateDemoStorageConfig: mocks.loadPrivate,
  PrivateDemoStore: class {
    listDemoKeys = mocks.existing;
    read = mocks.read;
    put = mocks.put;
    delete = mocks.remove;
  },
}));
vi.mock("../relay/demoStats", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../relay/demoStats")>()),
  runDemoStatsProcess: mocks.compute,
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const sourceETag = '"source-a"';
const stats = { version: DEMO_STATS_VERSION, statsByGuid: { "123": {} } };

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.argv = ["node", "backfill-demo-stats.ts"];
  process.exitCode = undefined;
  mocks.r2Client.mockReturnValue({
    client: { send: mocks.send },
    config: { bucket: "public", prefix: "demos/" },
  });
  mocks.loadPrivate.mockReturnValue({ bucket: "private", prefix: "demos/" });
  mocks.list.mockResolvedValue([{ key: "demos/a.rec", etag: sourceETag }]);
  mocks.existing.mockResolvedValue([]);
  mocks.compute.mockResolvedValue(stats);
  mocks.send.mockImplementation(async (command: unknown) => {
    if (command instanceof GetObjectCommand)
      return { Body: Readable.from(["recording"]), ETag: sourceETag };
    if (command instanceof HeadObjectCommand) return { ETag: sourceETag };
    throw new Error("Unexpected storage request");
  });
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

function summary() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);
}

it("saves the downloaded source identity only after replay and a final source check", async () => {
  const events: string[] = [];
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    events.push(
      command instanceof GetObjectCommand ? "download" : "source-check",
    );
    return send(command);
  });
  mocks.compute.mockImplementation(async () => {
    events.push("replay");
    return stats;
  });
  mocks.put.mockImplementation(async () => {
    events.push("write");
  });
  await import("./backfill-demo-stats");
  expect(events).toEqual(["download", "replay", "source-check", "write"]);
  expect(mocks.put).toHaveBeenCalledExactlyOnceWith(
    "a.rec",
    DEMO_STATS_SUFFIX,
    {
      ...stats,
      sourceETag,
    },
  );
  expect(stats).not.toHaveProperty("sourceETag");
  expect(summary()).toMatchObject({ written: 1, current: 0, failed: 0 });
  expect(process.exitCode).toBeUndefined();
});

it.each(["overwritten", "deleted"] as const)(
  "does not write stale stats when the recording is %s during replay",
  async (change) => {
    const send = mocks.send.getMockImplementation()!;
    mocks.send.mockImplementation(async (command) => {
      if (command instanceof HeadObjectCommand) {
        if (change === "deleted")
          throw Object.assign(new Error("Missing"), { name: "NoSuchKey" });
        return { ETag: '"source-b"' };
      }
      return send(command);
    });
    await import("./backfill-demo-stats");
    expect(mocks.compute).toHaveBeenCalledOnce();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(summary()).toMatchObject({ written: 0, failed: 1 });
    expect(process.exitCode).toBe(1);
  },
);

it("recomputes version-current stats whose source identity no longer matches the listing", async () => {
  mocks.existing.mockResolvedValue(["a.rec"]);
  mocks.read.mockResolvedValue({ ...stats, sourceETag: '"old-source"' });
  await import("./backfill-demo-stats");
  expect(mocks.compute).toHaveBeenCalledOnce();
  expect(mocks.put).toHaveBeenCalledWith("a.rec", DEMO_STATS_SUFFIX, {
    ...stats,
    sourceETag,
  });
  expect(summary()).toMatchObject({ written: 1, current: 0, failed: 0 });
});

it.each([sourceETag, undefined])(
  "keeps matching and legacy version-current sidecars (source identity: %s)",
  async (etag) => {
    mocks.existing.mockResolvedValue(["a.rec"]);
    mocks.read.mockResolvedValue({
      ...stats,
      ...(etag && { sourceETag: etag }),
    });
    await import("./backfill-demo-stats");
    expect(mocks.compute).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(summary()).toMatchObject({ written: 0, current: 1, failed: 0 });
  },
);
