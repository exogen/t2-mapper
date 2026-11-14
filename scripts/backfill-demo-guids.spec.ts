import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DEMO_GUIDS_SUFFIX } from "../relay/demoGuids.js";

const mocks = vi.hoisted(() => ({
  r2Client: vi.fn(),
  list: vi.fn(),
  loadPrivate: vi.fn(),
  existing: vi.fn(),
  put: vi.fn(),
  remove: vi.fn(),
  send: vi.fn(),
  analyze: vi.fn(),
}));
vi.mock("./lib/r2", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lib/r2")>()),
  r2Client: mocks.r2Client,
  listAllObjects: mocks.list,
}));
vi.mock("../relay/demoAnalysis", () => ({
  readDemoNamesByGuid: mocks.analyze,
}));
vi.mock("../relay/privateDemoStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../relay/privateDemoStore")>()),
  loadPrivateDemoStorageConfig: mocks.loadPrivate,
  PrivateDemoStore: class {
    listDemoKeys = mocks.existing;
    put = mocks.put;
    delete = mocks.remove;
  },
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const sourceETag = '"source-a"';

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.exitCode = undefined;
  mocks.r2Client.mockReturnValue({
    client: { send: mocks.send },
    config: { bucket: "public", prefix: "demos/" },
  });
  mocks.loadPrivate.mockReturnValue({ bucket: "private", prefix: "demos/" });
  mocks.list.mockResolvedValue([]);
  mocks.existing.mockResolvedValue([]);
  mocks.analyze.mockResolvedValue({ "123": ["Player"] });
  mocks.send.mockImplementation(async (command: unknown) => {
    if (command instanceof GetObjectCommand)
      return {
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
        ETag: sourceETag,
      };
    if (command instanceof HeadObjectCommand) return { ETag: sourceETag };
    throw new Error("Unexpected storage request");
  });
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

async function run(...args: string[]) {
  process.argv = ["node", "backfill-demo-guids.ts", ...args];
  await import("./backfill-demo-guids.js");
}

function summary() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);
}

it("preserves sidecars first published while the public listing is in flight", async () => {
  const privateKeys = new Set<string>();
  mocks.existing.mockImplementation(async () => [...privateKeys]);
  mocks.list.mockImplementation(async () => {
    privateKeys.add("new.rec");
    return [];
  });
  mocks.remove.mockImplementation(async (key: string) =>
    privateKeys.delete(key),
  );
  await run("--prune");
  expect(privateKeys.has("new.rec")).toBe(true);
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
  expect(summary()).toMatchObject({ pruned: 0, failed: 0 });
});

it("preserves a baseline sidecar whose recording was republished after the listing", async () => {
  mocks.existing.mockResolvedValue(["republished.rec"]);
  await run("--prune");
  expect(mocks.send).toHaveBeenCalledOnce();
  expect(mocks.send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
  expect(mocks.send.mock.calls[0][0].input).toEqual({
    Bucket: "public",
    Key: "demos/republished.rec",
  });
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(summary()).toMatchObject({ pruned: 0, failed: 0 });
});

it.each(["NoSuchKey", "NotFound"])(
  "prunes canonical sidecars only after a confirmed missing recording (%s)",
  async (name) => {
    mocks.existing.mockResolvedValue([
      "gone.rec",
      "../bad.rec",
      "sources/cache.rec",
    ]);
    mocks.send.mockRejectedValue(Object.assign(new Error("Missing"), { name }));
    await run("--prune");
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith(
      "gone.rec",
      DEMO_GUIDS_SUFFIX,
    );
    expect(summary()).toMatchObject({ pruned: 1, failed: 0 });
  },
);

it("fails closed on source-check errors before pruning", async () => {
  mocks.existing.mockResolvedValue(["uncertain.rec"]);
  mocks.send.mockRejectedValue(new Error("R2 unavailable"));
  await run("--prune");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(summary()).toMatchObject({ pruned: 0, failed: 1 });
  expect(process.exitCode).toBe(1);
});

it("checks the source during a dry-run without deleting its sidecar", async () => {
  mocks.existing.mockResolvedValue(["gone.rec"]);
  mocks.send.mockRejectedValue(
    Object.assign(new Error("Missing"), { name: "NotFound" }),
  );
  await run("--prune", "--dry-run");
  expect(mocks.remove).not.toHaveBeenCalled();
  expect(summary()).toMatchObject({ planned: 1, pruned: 0, failed: 0 });
});

it("never prunes after a failed or incomplete public listing", async () => {
  mocks.existing.mockResolvedValue(["kept.rec"]);
  mocks.list.mockRejectedValue(new Error("Incomplete demo listing"));
  await expect(run("--prune")).rejects.toThrow("Incomplete demo listing");
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("saves GUIDs with the downloaded recording's identity after a stable-source check", async () => {
  mocks.list.mockResolvedValue([{ key: "demos/a.rec" }]);
  await run();
  expect(mocks.put).toHaveBeenCalledExactlyOnceWith(
    "a.rec",
    DEMO_GUIDS_SUFFIX,
    {
      namesByGuid: { "123": ["Player"] },
      sourceETag,
    },
  );
  expect(
    mocks.send.mock.calls.map(([command]) => command.constructor.name),
  ).toEqual(["GetObjectCommand", "HeadObjectCommand"]);
  expect(summary()).toMatchObject({ written: 1, failed: 0 });
});

it.each(["replaced", "deleted", "error", "missing-etag"])(
  "does not publish GUIDs when the final source check is %s",
  async (change) => {
    mocks.list.mockResolvedValue([{ key: "demos/a.rec" }]);
    const send = mocks.send.getMockImplementation()!;
    mocks.send.mockImplementation(async (command: unknown) => {
      if (!(command instanceof HeadObjectCommand)) return send(command);
      if (change === "deleted")
        throw Object.assign(new Error("Missing"), { name: "NotFound" });
      if (change === "error") throw new Error("R2 unavailable");
      return { ETag: change === "replaced" ? '"source-b"' : undefined };
    });
    await run();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(summary()).toMatchObject({ written: 0, failed: 1 });
    expect(process.exitCode).toBe(1);
  },
);
