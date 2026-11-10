import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { DemoMetadata } from "../relay/demoMetadata";

const mocks = vi.hoisted(() => ({
  r2Client: vi.fn(),
  list: vi.fn(),
  analyze: vi.fn(),
  send: vi.fn(),
}));
vi.mock("./lib/r2", () => ({
  r2Client: mocks.r2Client,
  listAllObjects: mocks.list,
}));
vi.mock("./lib/analyzeDemo", () => ({ analyzeDemo: mocks.analyze }));

const originalArgv = process.argv;
const originalExitCode = process.exitCode;
const original: DemoMetadata = {
  filename: "old.rec",
  bytes: 1,
  recordedAt: "2026-09-01T00:00:00Z",
  server: "Server",
  address: "localhost",
  games: [],
  mod: "classic",
  recorder: "MapGenius",
  durationMs: 60_000,
  players: [],
};
const repaired = {
  ...original,
  games: [
    {
      mission: "Katabatic",
      missionSequence: 41,
      gameType: "CTF",
      startMs: 0,
      tournament: false,
    },
  ],
};
const added = { ...original, filename: "new.rec" };
const late = { ...original, filename: "late.rec" };
let index: DemoMetadata[];
let sidecar: DemoMetadata;
let sidecarKey: string;
let version: number;
let sidecarVersion: number;
let beforeIndexPut: (() => void) | undefined;
let beforeSidecarPut: (() => void) | undefined;

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.argv = ["node", "backfill-demo-index.ts", "--force"];
  process.exitCode = undefined;
  index = [original, added];
  sidecar = original;
  sidecarKey = "demos/old.rec.json";
  version = 1;
  sidecarVersion = 1;
  beforeIndexPut = undefined;
  beforeSidecarPut = undefined;
  mocks.r2Client.mockReturnValue({
    client: { send: mocks.send },
    config: { bucket: "bucket", prefix: "demos/" },
  });
  // The new upload wasn't present when the backfill listed the bucket.
  mocks.list.mockResolvedValue([
    { key: "demos/old.rec", size: 1 },
    { key: "demos/old.rec.json", size: 1 },
  ]);
  mocks.analyze.mockResolvedValue(repaired);
  mocks.send.mockImplementation(async (command) => {
    if (command instanceof GetObjectCommand) {
      const body = JSON.stringify(
        command.input.Key === "demos/index.json" ? index : sidecar,
      );
      return {
        ETag: `"${command.input.Key === "demos/index.json" ? version : sidecarVersion}"`,
        Body: {
          transformToString: async () => body,
          transformToByteArray: async () => Buffer.from(body),
        },
      };
    }
    if (
      command instanceof PutObjectCommand &&
      command.input.Key === "demos/index.json"
    ) {
      beforeIndexPut?.();
      beforeIndexPut = undefined;
      if (command.input.IfMatch && command.input.IfMatch !== `"${version}"`)
        throw Object.assign(new Error("conflict"), {
          name: "PreconditionFailed",
        });
      index = JSON.parse(command.input.Body as string);
      version++;
    }
    if (
      command instanceof PutObjectCommand &&
      command.input.Key === sidecarKey
    ) {
      beforeSidecarPut?.();
      beforeSidecarPut = undefined;
      if (
        command.input.IfMatch &&
        command.input.IfMatch !== `"${sidecarVersion}"`
      )
        throw Object.assign(new Error("conflict"), {
          name: "PreconditionFailed",
        });
      sidecar = JSON.parse(command.input.Body as string);
      sidecarVersion++;
    }
    return {};
  });
});

afterEach(() => {
  process.argv = originalArgv;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

it.each([undefined, 1, 2, 8])(
  "bounds concurrent metadata analyses (--concurrency=%s) and processes each demo once",
  async (concurrency) => {
    process.argv.push("--dry-run");
    if (concurrency !== undefined)
      process.argv.push(`--concurrency=${concurrency}`);
    const filenames = ["a.rec", "b.rec", "c.rec", "d.rec", "e.rec"];
    mocks.list.mockResolvedValue(
      filenames.map((filename) => ({ key: `demos/${filename}`, size: 1 })),
    );
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let peak = 0;
    mocks.analyze.mockImplementation(async (_bytes, filename) => {
      active++;
      peak = Math.max(peak, active);
      await gate;
      active--;
      return { ...repaired, filename };
    });
    const run = import("./backfill-demo-index");
    const workers = Math.min(concurrency ?? 4, filenames.length);
    try {
      await vi.waitFor(() => {
        expect(mocks.analyze).toHaveBeenCalledTimes(workers);
      });
      expect(active).toBe(workers);
    } finally {
      release();
      await run;
    }
    expect(peak).toBe(workers);
    expect(active).toBe(0);
    expect(
      mocks.analyze.mock.calls.map(([, filename]) => filename).sort(),
    ).toEqual(filenames);
    expect(process.exitCode).toBeUndefined();
    expect(
      mocks.send.mock.calls.some(
        ([command]) => command instanceof PutObjectCommand,
      ),
    ).toBe(false);
  },
);

it.each([
  "",
  "0",
  "-1",
  "1.5",
  "invalid",
  "2workers",
  "Infinity",
  "9007199254740992",
])(
  "rejects invalid metadata concurrency %s before accessing R2",
  async (concurrency) => {
    process.argv.push(`--concurrency=${concurrency}`);
    await expect(import("./backfill-demo-index")).rejects.toThrow(
      "--concurrency must be a positive integer",
    );
    expect(mocks.r2Client).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
  },
);

it.each([false, true])(
  "preserves uploads made during a full backfill (write conflict=%s)",
  async (conflict) => {
    if (conflict)
      beforeIndexPut = () => {
        index.push(late);
        version++;
      };
    await import("./backfill-demo-index");
    expect(index).toContainEqual(repaired);
    expect(index).toContainEqual(added);
    if (conflict) expect(index).toContainEqual(late);
    expect(index).toHaveLength(conflict ? 3 : 2);
    const puts = mocks.send.mock.calls.flatMap(([command]) =>
      command instanceof PutObjectCommand &&
      command.input.Key === "demos/index.json"
        ? [command.input]
        : [],
    );
    expect(puts.map((input) => input.IfMatch)).toEqual(
      conflict ? ['"1"', '"2"'] : ['"1"'],
    );
  },
);

it("writes nothing in dry-run mode", async () => {
  process.argv.push("--dry-run");
  await import("./backfill-demo-index");
  expect(
    mocks.send.mock.calls.some(
      ([command]) => command instanceof PutObjectCommand,
    ),
  ).toBe(false);
});

function sidecarDiffs(): string[] {
  return vi
    .mocked(console.log)
    .mock.calls.flatMap(([message]) =>
      typeof message === "string" && message.startsWith("--- old/")
        ? [message]
        : [],
    );
}

it.each([false, true])(
  "preserves the original recordedAt without a timestamp diff (dry run=%s)",
  async (dryRun) => {
    process.argv.push("--diff");
    if (dryRun) process.argv.push("--dry-run");
    const precise = "2026-10-13T05:20:01.237Z";
    const truncated = "2026-10-13T05:20:00.000Z";
    sidecar = { ...original, recordedAt: precise };
    index = [{ ...sidecar, recordedAt: truncated }, added];
    mocks.analyze.mockResolvedValue({ ...repaired, recordedAt: truncated });

    await import("./backfill-demo-index");

    expect(sidecar.recordedAt).toBe(precise);
    expect(sidecarDiffs()).toHaveLength(1);
    expect(sidecarDiffs()[0]).not.toContain('-  "recordedAt":');
    expect(sidecarDiffs()[0]).not.toContain('+  "recordedAt":');
    if (!dryRun)
      expect(
        index.find((record) => record.filename === original.filename)
          ?.recordedAt,
      ).toBe(precise);
    expect(process.exitCode).toBeUndefined();
  },
);

it("uses the recording timestamp when no previous sidecar exists", async () => {
  const truncated = "2026-10-13T05:20:00.000Z";
  mocks.list.mockResolvedValue([{ key: "demos/old.rec", size: 1 }]);
  mocks.analyze.mockResolvedValue({ ...repaired, recordedAt: truncated });
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    if (
      command instanceof GetObjectCommand &&
      command.input.Key === "demos/old.rec.json"
    )
      throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    return send(command);
  });

  await import("./backfill-demo-index");

  expect(sidecar.recordedAt).toBe(truncated);
  expect(
    index.find((record) => record.filename === original.filename)?.recordedAt,
  ).toBe(truncated);
  expect(process.exitCode).toBeUndefined();
});

it("preserves the latest precise sidecar timestamp after a conditional-write retry", async () => {
  const latest = "2026-10-13T05:20:01.237Z";
  sidecar = { ...original, recordedAt: "2026-10-13T05:20:01.000Z" };
  mocks.analyze.mockResolvedValue({
    ...repaired,
    recordedAt: "2026-10-13T05:20:00.000Z",
  });
  beforeSidecarPut = () => {
    sidecar = { ...sidecar, recordedAt: latest };
    sidecarVersion++;
  };

  await import("./backfill-demo-index");

  expect(sidecar.recordedAt).toBe(latest);
  expect(
    index.find((record) => record.filename === original.filename)?.recordedAt,
  ).toBe(latest);
  expect(process.exitCode).toBeUndefined();
});

it("shows proposed value changes without writing in --dry-run --diff mode", async () => {
  process.argv.push("--dry-run", "--diff");
  await import("./backfill-demo-index");
  expect(sidecarDiffs()).toHaveLength(1);
  expect(sidecarDiffs()[0]).toContain("+++ new/demos/old.rec.json");
  expect(sidecarDiffs()[0]).toContain('-  "games": [],');
  expect(sidecarDiffs()[0]).toContain('+      "mission": "Katabatic",');
  expect(
    mocks.send.mock.calls.some(
      ([command]) => command instanceof PutObjectCommand,
    ),
  ).toBe(false);
  expect(sidecar).toEqual(original);
});

it.each([false, true])(
  "omits unchanged sidecar output in diff mode (dry run=%s)",
  async (dryRun) => {
    process.argv.push("--diff");
    if (dryRun) process.argv.push("--dry-run");
    sidecar = repaired;
    index = [repaired, added];
    // Equal JSON values stay quiet while normal writes refresh cache headers.
    mocks.analyze.mockResolvedValue({
      ...repaired,
      games: [{ ...repaired.games[0] }],
    });
    await import("./backfill-demo-index");
    expect(sidecarDiffs()).toEqual([]);
    expect(
      vi
        .mocked(console.log)
        .mock.calls.some(([message]) => String(message).includes("old.rec")),
    ).toBe(false);
    const puts = mocks.send.mock.calls.flatMap(([command]) =>
      command instanceof PutObjectCommand ? [command.input] : [],
    );
    if (dryRun) expect(puts).toEqual([]);
    else
      expect(puts).toContainEqual(
        expect.objectContaining({
          Key: "demos/old.rec.json",
          CacheControl: "no-cache",
        }),
      );
  },
);

it("shows a newly created sidecar as additions", async () => {
  process.argv.push("--dry-run", "--diff");
  mocks.list.mockResolvedValue([{ key: "demos/old.rec", size: 1 }]);
  await import("./backfill-demo-index");
  expect(sidecarDiffs()).toHaveLength(1);
  expect(sidecarDiffs()[0]).toContain('+  "filename": "old.rec",');
  expect(sidecarDiffs()[0]).not.toContain('-  "filename"');
});

it.each([false, true])(
  "shows commentary reconciliation without mutating the old diff baseline (dry run=%s)",
  async (dryRun) => {
    process.argv = ["node", "backfill-demo-index.ts", "--diff"];
    if (dryRun) process.argv.push("--dry-run");
    sidecar = { ...original, hasCommentary: false };
    mocks.list.mockResolvedValue([
      { key: "demos/old.rec", size: 1 },
      { key: "demos/old.rec.json", size: 1 },
      { key: "demos/old.rec.commentary.m4a", size: 1 },
    ]);
    await import("./backfill-demo-index");
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(sidecarDiffs()).toHaveLength(1);
    expect(sidecarDiffs()[0]).toContain('-  "hasCommentary": false,');
    expect(sidecarDiffs()[0]).toContain('+  "hasCommentary": true,');
    expect(sidecar.hasCommentary).toBe(!dryRun);
  },
);

it("shows one committed diff against the latest sidecar after a conditional-write conflict", async () => {
  process.argv.push("--players-only", "--diff");
  sidecar = { ...original, playerCount: 0, reason: "Initial" };
  mocks.analyze.mockResolvedValue({
    ...repaired,
    players: ["Alice"],
    playerCount: 1,
  });
  beforeSidecarPut = () => {
    sidecar = { ...sidecar, reason: "Concurrent edit" };
    sidecarVersion++;
  };
  await import("./backfill-demo-index");
  expect(sidecarDiffs()).toHaveLength(1);
  const diff = sidecarDiffs()[0];
  expect(diff).toContain('-  "playerCount": 0,');
  expect(diff).toContain('+  "playerCount": 1,');
  expect(diff).not.toContain('-  "reason": "Initial"');
  expect(diff).not.toContain('+  "reason": "Concurrent edit"');
  expect(sidecar.reason).toBe("Concurrent edit");
});

it("does not report a committed diff when the sidecar write fails", async () => {
  process.argv.push("--diff");
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    if (
      command instanceof PutObjectCommand &&
      command.input.Key === "demos/old.rec.json"
    )
      throw new Error("Write failed");
    return send(command);
  });
  await import("./backfill-demo-index");
  expect(sidecarDiffs()).toEqual([]);
  expect(sidecar).toEqual(original);
  expect(process.exitCode).toBe(1);
});

it("leaves nested source recordings and their provenance sidecars out of the published catalog", async () => {
  const provenance = {
    format: "t2-mapper-source-demo",
    source: "example",
    id: "cached",
  };
  const nestedRecord = "demos/sources/example/cached.rec";
  const nestedSidecar = `${nestedRecord}.json`;
  mocks.list.mockResolvedValue([
    { key: "demos/old.rec", size: 1 },
    { key: "demos/old.rec.json", size: 1 },
    { key: nestedRecord, size: 1 },
    { key: nestedSidecar, size: JSON.stringify(provenance).length },
    { key: "other/outside.rec", size: 1 },
  ]);

  await import("./backfill-demo-index");

  expect(process.exitCode).toBeUndefined();
  expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(
    expect.any(Uint8Array),
    "old.rec",
    { strict: false },
  );
  const touchedKeys = mocks.send.mock.calls.map(
    ([command]) => command.input.Key,
  );
  expect(touchedKeys).not.toContain(nestedRecord);
  expect(touchedKeys).not.toContain(nestedSidecar);
  expect(touchedKeys).not.toContain("other/outside.rec");
  expect(index.map((record) => record.filename).sort()).toEqual([
    "new.rec",
    "old.rec",
  ]);
});

it("preserves non-player metadata in players-only mode", async () => {
  process.argv.push("--players-only");
  index = [{ ...original, hasCommentary: true }, added];
  mocks.analyze.mockResolvedValue({
    ...repaired,
    players: ["Alice"],
    playerCount: 1,
  });
  await import("./backfill-demo-index");
  expect(index).toEqual([
    { ...original, hasCommentary: true, players: ["Alice"], playerCount: 1 },
    added,
  ]);
});

it("leaves the index alone when a demo fails to analyze", async () => {
  mocks.analyze.mockRejectedValue(new Error("broken demo"));
  await import("./backfill-demo-index");
  expect(index).toEqual([original, added]);
  expect(
    mocks.send.mock.calls.some(
      ([command]) => command instanceof PutObjectCommand,
    ),
  ).toBe(false);
  expect(process.exitCode).toBe(1);
});

const savedGame = {
  ...repaired.games[0],
  gameId: "game",
  presentationRevision: 2,
  title: "Final",
  teamNames: { 1: "Storm", 2: "Dragons" },
};

it("preserves saved game details during a forced full analysis", async () => {
  sidecar = { ...original, games: [savedGame] };
  index = [sidecar, added];
  await import("./backfill-demo-index");
  expect(sidecar.games).toEqual([savedGame]);
  expect(
    index.find((entry) => entry.filename === original.filename)?.games,
  ).toEqual([savedGame]);
});

it("keeps a managed user's full key and saved details during a forced backfill", async () => {
  const filename = `users/126767979894407168/server_20260901T2000_katabatic_aaaaaa.rec`;
  sidecarKey = `demos/${filename}.json`;
  const recordedAtRaw = "Sep-1-2026 8:00PM";
  sidecar = {
    ...repaired,
    filename,
    recorder: "Player",
    recordedAt: "2026-09-01T20:00:12.345Z",
    recordedAtRaw,
    recordedAtTimezone: "unknown",
    games: [savedGame],
  };
  const saved = sidecar;
  index = [sidecar, added];
  mocks.list.mockResolvedValue([
    { key: `demos/${filename}`, size: 1 },
    { key: sidecarKey, size: 1 },
  ]);
  mocks.analyze.mockImplementation(
    async (_bytes, analyzedFilename, options) => ({
      ...repaired,
      filename: analyzedFilename,
      recorder: "Player",
      recordedAt: "2026-09-01T20:00:00.000Z",
      ...(options?.strict && {
        recordedAtRaw,
        recordedAtTimezone: "unknown",
      }),
    }),
  );

  await import("./backfill-demo-index");

  expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(
    expect.any(Uint8Array),
    filename,
    { strict: true },
  );
  expect(sidecar).toMatchObject({
    filename,
    recordedAt: saved.recordedAt,
    recordedAtRaw,
    recordedAtTimezone: "unknown",
    games: [savedGame],
  });
  expect(index.find((entry) => entry.filename === filename)).toEqual(sidecar);
  expect(index).toHaveLength(2);
  expect(
    index.some(
      (entry) => entry.filename === `server_20260901T2000_katabatic_aaaaaa.rec`,
    ),
  ).toBe(false);
  expect(process.exitCode).toBeUndefined();
});

it("skips a user recording without a sidecar and still writes other repairs", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const filename = `users/126767979894407168/server_20260901T2000_katabatic_bbbbbb.rec`;
  mocks.list.mockResolvedValue([
    { key: "demos/old.rec", size: 1 },
    { key: "demos/old.rec.json", size: 1 },
    { key: `demos/${filename}`, size: 1 },
  ]);

  await import("./backfill-demo-index");

  expect(mocks.analyze).toHaveBeenCalledExactlyOnceWith(
    expect.any(Uint8Array),
    "old.rec",
    { strict: false },
  );
  const touchedKeys = mocks.send.mock.calls.map(
    ([command]) => command.input.Key,
  );
  expect(touchedKeys).not.toContain(`demos/${filename}`);
  expect(touchedKeys).not.toContain(`demos/${filename}.json`);
  expect(warn).toHaveBeenCalledWith(
    expect.stringContaining(`SKIP ${filename}`),
  );
  expect(index).toContainEqual(repaired);
  expect(index).toContainEqual(added);
  expect(index).toHaveLength(2);
  expect(process.exitCode).toBeUndefined();
});

function managedUserDemo() {
  const filename = `users/126767979894407168/server_20260901T2000_katabatic_bbbbbb.rec`;
  sidecarKey = `demos/${filename}.json`;
  sidecar = { ...repaired, filename };
  index = [sidecar, added];
  mocks.list.mockResolvedValue([
    { key: `demos/${filename}`, size: 1 },
    { key: sidecarKey, size: 1 },
  ]);
  mocks.analyze.mockResolvedValue({ ...repaired, filename });
  return filename;
}

it("does not recreate a user sidecar deleted during analysis", async () => {
  managedUserDemo();
  let deleted = false;
  beforeSidecarPut = () => {
    deleted = true;
    sidecarVersion++;
    index = [added];
  };
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    if (
      deleted &&
      command instanceof GetObjectCommand &&
      command.input.Key === sidecarKey
    )
      throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    return send(command);
  });

  await import("./backfill-demo-index");

  const writes = mocks.send.mock.calls.flatMap(([command]) =>
    command instanceof PutObjectCommand ? [command.input] : [],
  );
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({ Key: sidecarKey, IfMatch: '"1"' });
  expect(index).toEqual([added]);
  expect(process.exitCode).toBe(1);
});

it.each([false, true])(
  "never re-adds a user index entry removed during the scan (CAS retry: %s)",
  async (retry) => {
    managedUserDemo();
    if (retry)
      beforeIndexPut = () => {
        index = [added];
        version++;
      };
    else index = [added];

    await import("./backfill-demo-index");

    expect(index).toEqual([added]);
    expect(process.exitCode).toBeUndefined();
  },
);

it("requires restoring a missing index before backfilling user records", async () => {
  managedUserDemo();
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    if (
      command instanceof GetObjectCommand &&
      command.input.Key === "demos/index.json"
    )
      throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
    return send(command);
  });

  await expect(import("./backfill-demo-index")).rejects.toThrow(
    "Cannot update user demos in a missing demo index; restore the index from backup first",
  );
  expect(
    mocks.send.mock.calls.some(
      ([command]) =>
        command instanceof PutObjectCommand &&
        command.input.Key === "demos/index.json",
    ),
  ).toBe(false);
});

it("backs up identical basenames separately for different owners", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "t2-backfill-user-backups-"),
  );
  process.argv.push("--backup-dir", directory);
  const filenames = ["126767979894407168", "123456789012345678"].map(
    (owner) => `users/${owner}/server_20260901T2000_katabatic_aaaaaa.rec`,
  );
  const originals = filenames.map((filename, i) => ({
    ...repaired,
    filename,
    games: [{ ...savedGame, title: `Owner ${i}'s title` }],
  }));
  index = [...originals];
  const records = new Map(originals.map((record) => [record.filename, record]));
  mocks.list.mockResolvedValue(
    filenames.flatMap((filename) => [
      { key: `demos/${filename}`, size: 1 },
      { key: `demos/${filename}.json`, size: 1 },
    ]),
  );
  mocks.analyze.mockImplementation(async (_bytes, filename) => ({
    ...repaired,
    filename,
  }));
  const send = mocks.send.getMockImplementation()!;
  mocks.send.mockImplementation(async (command) => {
    const key = command.input.Key as string;
    const filename = key.slice("demos/".length).replace(/\.json$/, "");
    const record = records.get(filename);
    if (record && command instanceof GetObjectCommand) {
      const body = JSON.stringify(record);
      return {
        ETag: '"1"',
        Body: {
          transformToString: async () => body,
          transformToByteArray: async () => Buffer.from(body),
        },
      };
    }
    if (record && command instanceof PutObjectCommand) {
      records.set(filename, JSON.parse(command.input.Body as string));
      return {};
    }
    return send(command);
  });

  try {
    await import("./backfill-demo-index");

    for (const original of originals)
      expect(
        JSON.parse(
          await fs.readFile(
            path.join(directory, `${original.filename}.json`),
            "utf8",
          ),
        ),
      ).toEqual(original);
    expect(index).toHaveLength(2);
    expect(process.exitCode).toBeUndefined();
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

it("leaves saved details untouched if analysis cannot identify their game", async () => {
  sidecar = { ...original, games: [savedGame] };
  index = [sidecar, added];
  mocks.analyze.mockResolvedValue({ ...repaired, games: [] });
  await import("./backfill-demo-index");
  expect(sidecar.games).toEqual([savedGame]);
  expect(index[0].games).toEqual([savedGame]);
  expect(
    mocks.send.mock.calls.some(
      ([command]) => command instanceof PutObjectCommand,
    ),
  ).toBe(false);
  expect(process.exitCode).toBe(1);
});

it.each(["rename", "clear"])(
  "preserves a concurrent saved-detail %s through sidecar write retries",
  async (change) => {
    sidecar = { ...original, games: [savedGame] };
    index = [sidecar, added];
    const updatedGame =
      change === "clear"
        ? { ...repaired.games[0], gameId: "game", presentationRevision: 3 }
        : { ...savedGame, presentationRevision: 3, title: "New final" };
    beforeSidecarPut = () => {
      sidecar = { ...sidecar, games: [updatedGame] };
      sidecarVersion++;
    };
    await import("./backfill-demo-index");
    expect(sidecar.games).toEqual([updatedGame]);
    expect(
      index.find((entry) => entry.filename === original.filename)?.games,
    ).toEqual([updatedGame]);
    const writes = mocks.send.mock.calls.flatMap(([command]) =>
      command instanceof PutObjectCommand &&
      command.input.Key === "demos/old.rec.json"
        ? [command.input]
        : [],
    );
    expect(writes.map((input) => input.IfMatch)).toEqual(['"1"', '"2"']);
  },
);

it("preserves a newer index presentation when its conditional update retries", async () => {
  sidecar = { ...original, games: [savedGame] };
  index = [sidecar, added];
  const newer = {
    ...savedGame,
    presentationRevision: 4,
    title: "Newest final",
  };
  beforeIndexPut = () => {
    index = [{ ...sidecar, games: [newer] }, added];
    version++;
  };
  await import("./backfill-demo-index");
  expect(
    index.find((entry) => entry.filename === original.filename)?.games,
  ).toEqual([newer]);
});

it("repairs equal-revision index labels from the canonical sidecar", async () => {
  sidecar = {
    ...original,
    reason: "pinned by operator",
    games: [savedGame],
  };
  index = [
    {
      ...sidecar,
      reason: "stale indexed reason",
      games: [
        {
          ...savedGame,
          title: "Stale indexed title",
          teamNames: { 1: "Old team" },
        },
      ],
    },
    added,
  ];

  await import("./backfill-demo-index");

  expect(sidecar).toMatchObject({
    reason: "pinned by operator",
    games: [savedGame],
  });
  expect(index.find((entry) => entry.filename === original.filename)).toEqual(
    sidecar,
  );
});

it("does not overwrite a concurrent saved edit while reconciling commentary", async () => {
  process.argv = ["node", "backfill-demo-index.ts"];
  sidecar = { ...original, games: [savedGame] };
  index = [sidecar, added];
  mocks.list.mockResolvedValue([
    { key: "demos/old.rec", size: 1 },
    { key: "demos/old.rec.json", size: 1 },
    { key: "demos/old.rec.commentary.m4a", size: 1 },
  ]);
  const newer = {
    ...savedGame,
    presentationRevision: 3,
    title: "Edited during reconciliation",
  };
  beforeSidecarPut = () => {
    sidecar = { ...sidecar, games: [newer] };
    sidecarVersion++;
  };
  await import("./backfill-demo-index");
  expect(mocks.analyze).not.toHaveBeenCalled();
  expect(sidecar).toMatchObject({ games: [newer], hasCommentary: true });
  expect(
    index.find((entry) => entry.filename === original.filename),
  ).toMatchObject({ games: [newer], hasCommentary: true });
});

const uploadIdentity = {
  discordHandleAtUploadTime: "original_handle",
  discordDisplayNameAtUploadTime: "Original Display Name",
};

it.each(["full", "players-only", "commentary"])(
  "preserves frozen upload attribution through a %s metadata backfill",
  async (mode) => {
    sidecar = { ...repaired, ...uploadIdentity };
    index = [sidecar, added];
    if (mode === "players-only") process.argv.push("--players-only");
    if (mode === "commentary") {
      process.argv = ["node", "backfill-demo-index.ts"];
      mocks.list.mockResolvedValue([
        { key: "demos/old.rec", size: 1 },
        { key: "demos/old.rec.json", size: 1 },
        { key: "demos/old.rec.commentary.m4a", size: 1 },
      ]);
    }
    mocks.analyze.mockResolvedValue({
      ...repaired,
      players: ["Alice"],
      playerCount: 1,
      discordHandleAtUploadTime: "changed_handle",
      discordDisplayNameAtUploadTime: "Changed Display Name",
    });

    await import("./backfill-demo-index");

    expect(sidecar).toMatchObject(uploadIdentity);
    expect(
      index.find((entry) => entry.filename === sidecar.filename),
    ).toMatchObject(uploadIdentity);
    if (mode === "commentary") expect(mocks.analyze).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  },
);

it("preserves snapshot provenance added concurrently before a sidecar retry", async () => {
  sidecar = { ...repaired };
  index = [sidecar, added];
  beforeSidecarPut = () => {
    sidecar = { ...sidecar, ...uploadIdentity };
    sidecarVersion++;
  };

  await import("./backfill-demo-index");

  expect(sidecar).toMatchObject(uploadIdentity);
  expect(
    index.find((entry) => entry.filename === sidecar.filename),
  ).toMatchObject(uploadIdentity);
  expect(process.exitCode).toBeUndefined();
});

it("keeps canonical upload snapshots when an index update retries against a conflicting copy", async () => {
  sidecar = { ...repaired, ...uploadIdentity };
  index = [sidecar, added];
  beforeIndexPut = () => {
    index = [
      {
        ...sidecar,
        discordHandleAtUploadTime: "stale_handle",
        discordDisplayNameAtUploadTime: "Stale Display Name",
      },
      added,
      late,
    ];
    version++;
  };

  await import("./backfill-demo-index");

  expect(sidecar).toMatchObject(uploadIdentity);
  expect(
    index.find((entry) => entry.filename === sidecar.filename),
  ).toMatchObject(uploadIdentity);
  expect(index).toContainEqual(late);
  expect(process.exitCode).toBeUndefined();
});

it("does not infer Discord upload snapshots for an older recording", async () => {
  await import("./backfill-demo-index");
  expect(sidecar).not.toHaveProperty("discordHandleAtUploadTime");
  expect(sidecar).not.toHaveProperty("discordDisplayNameAtUploadTime");
  expect(
    index.find((entry) => entry.filename === sidecar.filename),
  ).not.toHaveProperty("discordHandleAtUploadTime");
  expect(process.exitCode).toBeUndefined();
});

it("does not propagate malformed saved uploader snapshots through a forced backfill", async () => {
  sidecar = JSON.parse(
    JSON.stringify({
      ...repaired,
      discordHandleAtUploadTime: 123,
      discordDisplayNameAtUploadTime: { name: "invalid" },
    }),
  ) as DemoMetadata;
  index = [sidecar, added];

  await import("./backfill-demo-index");

  expect(sidecar).not.toHaveProperty("discordHandleAtUploadTime");
  expect(sidecar).not.toHaveProperty("discordDisplayNameAtUploadTime");
  expect(
    index.find((entry) => entry.filename === sidecar.filename),
  ).not.toHaveProperty("discordHandleAtUploadTime");
  expect(process.exitCode).toBeUndefined();
});
