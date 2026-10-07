import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import type { DemoMetadata } from "../relay/demoRecorder";

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  list: vi.fn(),
  send: vi.fn(),
}));
vi.mock("./lib/r2", () => ({
  r2Client: mocks.client,
  listAllObjects: mocks.list,
}));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const indexKey = "demos/index.json";
const short: DemoMetadata = {
  filename: "short.rec",
  bytes: 3,
  recordedAt: "2026-10-01T00:00:00Z",
  server: "Server A",
  address: "localhost",
  games: [
    { mission: "Katabatic", gameType: "Arena", startMs: 0, tournament: false },
  ],
  mod: "classic",
  recorder: "MapGenius",
  durationMs: 30_000,
  players: ["Alice", "Alias"],
  playerCount: 1,
};
const kept = {
  ...short,
  filename: "kept.rec",
  server: "Server B",
  durationMs: 60_000,
  playerCount: 2,
};
let store: Map<string, string>;
let version: number;
let failDeletes: Set<string>;
let beforeIndexPut: (() => void) | undefined;

function index(): DemoMetadata[] {
  return JSON.parse(store.get(indexKey)!);
}
function setIndex(entries: unknown[]) {
  store.set(indexKey, JSON.stringify(entries));
  version++;
}
function addDemo(record: DemoMetadata, indexed = true) {
  const key = `demos/${record.filename}`;
  store.set(key, "rec-bytes");
  store.set(`${key}.json`, JSON.stringify(record));
  if (indexed) setIndex([...index(), record]);
}
function deletes(): string[][] {
  return mocks.send.mock.calls.flatMap(([command]) =>
    command instanceof DeleteObjectsCommand
      ? [command.input.Delete!.Objects!.map(({ Key }) => Key!)]
      : [],
  );
}
function summary() {
  return JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0]);
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.argv = ["node", "delete-demos.ts", "--min-length-seconds=60"];
  process.exitCode = undefined;
  version = 1;
  failDeletes = new Set();
  beforeIndexPut = undefined;
  store = new Map([[indexKey, "[]"]]);
  addDemo(short);
  addDemo(kept);
  for (const suffix of [
    "checkpoints.json",
    "cast.json",
    "commentary.json",
    "commentary.m4a",
    "fr.commentary.mp3",
  ])
    store.set(`demos/short.rec.${suffix}`, "sidecar");
  store.set("demos/short-extra.rec", "unindexed demo");
  store.set("other/short.rec", "outside prefix");
  mocks.client.mockReturnValue({
    client: { send: mocks.send },
    config: { bucket: "bucket", prefix: "demos/" },
  });
  mocks.list.mockImplementation(async () =>
    [...store.keys()].map((key) => ({ key, size: 3 })),
  );
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof GetObjectCommand) {
      const body = store.get(command.input.Key!);
      if (body === undefined)
        throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
      return {
        ETag: `"${version}"`,
        Body: { transformToString: async () => body },
      };
    }
    if (command instanceof DeleteObjectsCommand) {
      const Errors = [];
      for (const { Key } of command.input.Delete!.Objects!) {
        if (failDeletes.has(Key!))
          Errors.push({ Key, Code: "AccessDenied", Message: "denied" });
        else store.delete(Key!);
      }
      return { Errors };
    }
    if (command instanceof PutObjectCommand) {
      if (command.input.Key !== indexKey) {
        store.set(command.input.Key!, command.input.Body as string);
        return {};
      }
      beforeIndexPut?.();
      beforeIndexPut = undefined;
      if (command.input.IfMatch !== `"${version}"`)
        throw Object.assign(new Error("conflict"), {
          name: "PreconditionFailed",
        });
      store.set(command.input.Key!, command.input.Body as string);
      version++;
      return {};
    }
    throw new Error("Unexpected command");
  });
});
afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

it("defaults to a dry run and lists every associated object without any writes", async () => {
  await import("./delete-demos");
  expect(deletes()).toEqual([]);
  expect(
    mocks.send.mock.calls.some(
      ([command]) => command instanceof PutObjectCommand,
    ),
  ).toBe(false);
  expect(summary()).toMatchObject({
    mode: "dry-run",
    demos: 3,
    matched: 1,
    skipped: 1,
    failed: 0,
    deleted: 0,
    plannedObjects: 7,
    deletedObjects: 0,
  });
  const planned = vi
    .mocked(console.log)
    .mock.calls.map(([line]) => JSON.parse(line))
    .find((entry) => entry.action === "would-delete");
  expect(planned.objects).toContain("demos/short.rec.fr.commentary.mp3");
  expect(planned.objects).not.toContain("demos/short-extra.rec");
});

it("conditionally removes the index entry before deleting the recording or any sidecars", async () => {
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof DeleteObjectsCommand) {
      expect(index()).toEqual([kept]);
      expect(store.has("demos/short.rec.json")).toBe(true);
    }
    return send(command);
  });
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(deletes().at(-1)).toEqual(["demos/short.rec.json"]);
  expect(
    [...store.keys()].some(
      (key) => key === "demos/short.rec" || key.startsWith("demos/short.rec."),
    ),
  ).toBe(false);
  expect(store.has("demos/kept.rec")).toBe(true);
  expect(store.has("other/short.rec")).toBe(true);
  expect(index()).toEqual([kept]);
  expect(summary()).toMatchObject({ deleted: 1, deletedObjects: 7, failed: 0 });
});

it.each([
  ["--min-players=2", ["short.rec"]],
  ["--exclude-server=server a", ["short.rec"]],
  ["--exclude-game-type=ARENA", ["short.rec", "kept.rec"]],
])("uses metadata for %s", async (arg, filenames) => {
  process.argv = ["node", "delete-demos.ts", arg, "--delete"];
  await import("./delete-demos");
  expect(index().map((entry) => entry.filename)).toEqual(
    [short, kept]
      .map((entry) => entry.filename)
      .filter((filename) => !filenames.includes(filename)),
  );
  expect(summary().deleted).toBe(filenames.length);
});

it.each(
  [
    [],
    ["--min-players=2", "--min-length-seconds=60"],
    ["--exclude-server=A", "--exclude-game-type=Arena"],
    ["--min-players=2", "--min-players=3"],
    ["--exclude-server=A", "--exclude-server=B"],
    ["--min-players=-1"],
    ["--min-length-seconds=invalid"],
    ["--exclude-game-type="],
  ].map((args) => ({ args })),
)(
  "rejects missing, combined, repeated, or invalid filters before accessing R2 ($args)",
  async ({ args }) => {
    process.argv = ["node", "delete-demos.ts", ...args, "--delete"];
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    await expect(import("./delete-demos")).rejects.toThrow("exit");
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mocks.client).not.toHaveBeenCalled();
  },
);

it("shows help without requiring a filter or credentials", async () => {
  process.argv = ["node", "delete-demos.ts", "--help"];
  vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("exit");
  });
  await expect(import("./delete-demos")).rejects.toThrow("exit");
  expect(process.exit).toHaveBeenCalledWith(0);
  expect(mocks.client).not.toHaveBeenCalled();
});

it("uses unindexed .rec.json metadata, including imported source durations", async () => {
  store.set("demos/sources/tribesforever/1.rec", "demo");
  store.set(
    "demos/sources/tribesforever/1.rec.json",
    JSON.stringify({ format: "t2-source-demo", durationMs: 1000 }),
  );
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(store.has("demos/sources/tribesforever/1.rec")).toBe(false);
  expect(summary().deleted).toBe(2);
});

it("skips imported demos missing the selected metadata field", async () => {
  store.set("demos/source.rec", "demo");
  store.set("demos/source.rec.json", JSON.stringify({ durationMs: 1000 }));
  process.argv = ["node", "delete-demos.ts", "--min-players=2", "--delete"];
  await import("./delete-demos");
  expect(store.has("demos/source.rec")).toBe(true);
  expect(summary().skipped).toBe(2);
});

it.each([false, true])(
  "preserves uploads made during deletion (index conflict=%s)",
  async (conflict) => {
    const late = { ...kept, filename: "late.rec" };
    if (conflict) beforeIndexPut = () => addDemo(late);
    else {
      const send = mocks.send.getMockImplementation()!;
      mocks.send.mockImplementation(async (command) => {
        const response = await send(command);
        if (
          command instanceof DeleteObjectsCommand &&
          command.input.Delete!.Objects!.some(
            ({ Key }) => Key === "demos/short.rec.json",
          )
        )
          addDemo(late);
        return response;
      });
    }
    process.argv.push("--delete");
    await import("./delete-demos");
    expect(index()).toEqual([kept, late]);
    expect(store.has("demos/late.rec")).toBe(true);
  },
);

it.each([true, false])(
  "keeps metadata for retry after an object delete fails (indexed=%s)",
  async (indexed) => {
    if (!indexed) setIndex([kept]);
    failDeletes.add("demos/short.rec.checkpoints.json");
    process.argv.push("--delete");
    await import("./delete-demos");
    expect(store.has("demos/short.rec.json")).toBe(true);
    expect(index()).toEqual([kept]);
    expect(summary()).toMatchObject({ deleted: 0, failed: 1 });
    expect(process.exitCode).toBe(1);
    failDeletes.clear();
    vi.resetModules();
    process.exitCode = undefined;
    await import("./delete-demos");
    expect(store.has("demos/short.rec.checkpoints.json")).toBe(false);
    expect(store.has("demos/short.rec.json")).toBe(false);
    expect(index()).toEqual([kept]);
    expect(summary()).toMatchObject({ deleted: 1, failed: 0 });
  },
);

it("keeps the demo hidden if metadata deletion fails", async () => {
  failDeletes.add("demos/short.rec.json");
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(index()).toEqual([kept]);
  expect(store.has("demos/short.rec.json")).toBe(true);
  expect(summary().failed).toBe(1);
});

it("retains retry metadata while keeping the demo hidden when a deletion request fails", async () => {
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof DeleteObjectsCommand)
      throw new Error("connection lost");
    return send(command);
  });
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(deletes()).toHaveLength(1);
  expect(store.has("demos/short.rec.json")).toBe(true);
  expect(index()).toEqual([kept]);
  expect(summary()).toMatchObject({ deleted: 0, failed: 1, deletedObjects: 0 });
  expect(process.exitCode).toBe(1);
});

it("finishes other matched demos when one demo's object deletion fails", async () => {
  failDeletes.add("demos/short.rec.checkpoints.json");
  process.argv = [
    "node",
    "delete-demos.ts",
    "--exclude-game-type=Arena",
    "--delete",
  ];
  await import("./delete-demos");
  expect(store.has("demos/short.rec.json")).toBe(true);
  expect(store.has("demos/kept.rec.json")).toBe(false);
  expect(index()).toEqual([]);
  expect(summary()).toMatchObject({ matched: 2, deleted: 1, failed: 1 });
  expect(process.exitCode).toBe(1);
});

it("reports corrupt unindexed metadata and leaves that demo untouched", async () => {
  store.set("demos/broken.rec", "demo");
  store.set("demos/broken.rec.json", "invalid JSON");
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(store.has("demos/broken.rec")).toBe(true);
  expect(store.has("demos/broken.rec.json")).toBe(true);
  expect(summary()).toMatchObject({ deleted: 1, failed: 1 });
  expect(process.exitCode).toBe(1);
});

it("deletes no demo objects when the index update fails and can retry the whole operation", async () => {
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof PutObjectCommand)
      throw new Error("index write failed");
    return send(command);
  });
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(index()).toContainEqual(short);
  expect(deletes()).toEqual([]);
  expect(store.has("demos/short.rec")).toBe(true);
  expect(store.has("demos/short.rec.json")).toBe(true);
  expect(summary()).toMatchObject({ deleted: 0, deletedObjects: 0, failed: 1 });
  mocks.send.mockImplementation(send);
  vi.resetModules();
  process.exitCode = undefined;
  await import("./delete-demos");
  expect(index()).toEqual([kept]);
  expect(summary()).toMatchObject({ deleted: 1, deletedObjects: 7, failed: 0 });
});

it.each(["missing", "corrupt", "stale"])(
  "preserves index metadata for retry when the sidecar is %s",
  async (sidecar) => {
    if (sidecar === "missing") store.delete("demos/short.rec.json");
    else
      store.set(
        "demos/short.rec.json",
        sidecar === "corrupt" ? "invalid JSON" : JSON.stringify(kept),
      );
    failDeletes.add("demos/short.rec.checkpoints.json");
    const send = mocks.send.getMockImplementation()!;
    mocks.send.mockImplementation(async (command) => {
      if (command instanceof DeleteObjectsCommand) {
        expect(index()).toEqual([kept]);
        expect(JSON.parse(store.get("demos/short.rec.json")!)).toEqual(short);
      }
      return send(command);
    });
    process.argv.push("--delete");
    await import("./delete-demos");
    expect(index()).toEqual([kept]);
    expect(store.has("demos/short.rec.json")).toBe(true);
    expect(summary()).toMatchObject({ deleted: 0, failed: 1 });
    failDeletes.clear();
    vi.resetModules();
    process.exitCode = undefined;
    await import("./delete-demos");
    expect(store.has("demos/short.rec.json")).toBe(false);
    expect(store.has("demos/short.rec.checkpoints.json")).toBe(false);
    expect(summary()).toMatchObject({ deleted: 1, failed: 0 });
  },
);

it("leaves demos listed and deletes nothing if saving retry metadata fails", async () => {
  store.delete("demos/short.rec.json");
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    if (
      command instanceof PutObjectCommand &&
      command.input.Key === "demos/short.rec.json"
    )
      throw new Error("metadata write failed");
    return send(command);
  });
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(index()).toEqual([short, kept]);
  expect(deletes()).toEqual([]);
  expect(store.has("demos/short.rec")).toBe(true);
  expect(summary()).toMatchObject({ deleted: 0, failed: 1 });
  expect(process.exitCode).toBe(1);
});

it("removes a stale index entry without creating objects when all its objects are already gone", async () => {
  for (const key of store.keys())
    if (key === "demos/short.rec" || key.startsWith("demos/short.rec."))
      store.delete(key);
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(index()).toEqual([kept]);
  expect(deletes()).toEqual([]);
  expect(store.has("demos/short.rec.json")).toBe(false);
  expect(summary()).toMatchObject({ deleted: 1, plannedObjects: 0, failed: 0 });
});

it("deletes unindexed demos without creating a missing index", async () => {
  store.delete(indexKey);
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(store.has(indexKey)).toBe(false);
  expect(summary().deleted).toBe(1);
});

it.each(["broken", "{}", "[null]"])(
  "aborts before deletion for invalid index %s",
  async (body) => {
    store.set(indexKey, body);
    process.argv.push("--delete");
    await expect(import("./delete-demos")).rejects.toThrow();
    expect(deletes()).toEqual([]);
  },
);

it("aborts before deletion when the index has no ETag", async () => {
  mocks.send.mockResolvedValueOnce({
    Body: { transformToString: async () => JSON.stringify([short, kept]) },
  });
  process.argv.push("--delete");
  await expect(import("./delete-demos")).rejects.toThrow("Missing index ETag");
  expect(deletes()).toEqual([]);
});

it("batches deletions at the R2 limit of 1000 objects", async () => {
  for (let i = 0; i < 1001; i++)
    store.set(`demos/short.rec.${i}.commentary.json`, "sidecar");
  process.argv.push("--delete");
  await import("./delete-demos");
  expect(deletes().map((batch) => batch.length)).toEqual([1000, 7, 1]);
  expect(summary()).toMatchObject({
    deleted: 1,
    deletedObjects: 1008,
    failed: 0,
  });
});
