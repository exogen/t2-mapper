import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { demoLog } from "./logger";
import type { DemoGameTarget, PublishedGame } from "./gamePresentation";

afterEach(() => vi.restoreAllMocks());

const uploadCalls: Array<{ Bucket: string; Key: string }> = [];
let failUploads = false;
let uploadGate: Promise<void> | undefined;

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    private params: { Bucket: string; Key: string };
    constructor(opts: { params: { Bucket: string; Key: string } }) {
      this.params = opts.params;
    }
    done(): Promise<void> {
      uploadCalls.push({ Bucket: this.params.Bucket, Key: this.params.Key });
      return failUploads
        ? Promise.reject(new Error("upload failed"))
        : (uploadGate ?? Promise.resolve());
    }
  },
}));

interface FakeCommand {
  type: "GetObject" | "HeadObject" | "PutObject";
  input: {
    Key: string;
    Body?: string;
    CacheControl?: string;
    IfMatch?: string;
    IfNoneMatch?: string;
  };
}
const s3Commands: FakeCommand[] = [];
/** ETags of objects the fake bucket holds, by key (HeadObject only). */
const bucketEtags = new Map<string, string>();
/** Simulated stored index.json object (null = NoSuchKey). */
let storedIndex: string | null = null;
let indexVersion = 0;
let beforeIndexPut: (() => void) | undefined;
const storedSidecars = new Map<string, { body: string; version: number }>();
let beforeSidecarPut: (() => void | Promise<void>) | undefined;
let failSidecarWrites = false;
let failIndexWrites = false;

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    async send(cmd: FakeCommand) {
      s3Commands.push(cmd);
      if (cmd.type === "HeadObject") {
        const etag = bucketEtags.get(cmd.input.Key);
        if (etag === undefined)
          throw Object.assign(new Error("Not Found"), { name: "NotFound" });
        return { ETag: `"${etag}"` };
      }
      if (cmd.type === "GetObject") {
        const sidecar = storedSidecars.get(cmd.input.Key);
        const body = cmd.input.Key.endsWith("index.json")
          ? storedIndex
          : sidecar?.body;
        if (body == null) {
          const err = new Error("The specified key does not exist.");
          err.name = "NoSuchKey";
          throw err;
        }
        return {
          ETag: `"${cmd.input.Key.endsWith("index.json") ? indexVersion : sidecar!.version}"`,
          Body: { transformToString: async () => body },
        };
      }
      if (cmd.input.Key.endsWith("index.json")) {
        if (failIndexWrites) throw new Error("index upload failed");
        beforeIndexPut?.();
        beforeIndexPut = undefined;
        if (
          (cmd.input.IfMatch && cmd.input.IfMatch !== `"${indexVersion}"`) ||
          (cmd.input.IfNoneMatch === "*" && storedIndex !== null)
        )
          throw Object.assign(new Error("conflict"), {
            name: "PreconditionFailed",
          });
        storedIndex = cmd.input.Body ?? null;
        indexVersion++;
      } else {
        const before = beforeSidecarPut;
        beforeSidecarPut = undefined;
        await before?.();
        if (failSidecarWrites) throw new Error("sidecar upload failed");
        const existing = storedSidecars.get(cmd.input.Key);
        if (
          (cmd.input.IfMatch &&
            cmd.input.IfMatch !== `"${existing?.version}"`) ||
          (cmd.input.IfNoneMatch === "*" && existing)
        )
          throw Object.assign(new Error("conflict"), {
            name: "PreconditionFailed",
          });
        storedSidecars.set(cmd.input.Key, {
          body: cmd.input.Body!,
          version: (existing?.version ?? -1) + 1,
        });
      }
      return {};
    }
  },
  GetObjectCommand: class {
    readonly type = "GetObject";
    input: FakeCommand["input"];
    constructor(input: FakeCommand["input"]) {
      this.input = input;
    }
  },
  HeadObjectCommand: class {
    readonly type = "HeadObject";
    input: FakeCommand["input"];
    constructor(input: FakeCommand["input"]) {
      this.input = input;
    }
  },
  PutObjectCommand: class {
    readonly type = "PutObject";
    input: FakeCommand["input"];
    constructor(input: FakeCommand["input"]) {
      this.input = input;
    }
  },
}));

const { DemoUploader, loadUploadConfig, PUBLISHED_DEMO_SIDECAR_CACHE_MS } =
  await import("./demoUpload.js");
const { DemoFileWriter, buildDemoValues, buildInitialBlock } =
  await import("./demoWriter.js");

const config = {
  endpoint: "https://example.r2.cloudflarestorage.com",
  bucket: "t2-demos",
  accessKeyId: "key",
  secretAccessKey: "secret",
  prefix: "demos/",
};

const settle = () => new Promise((r) => setTimeout(r, 25));

describe("loadUploadConfig", () => {
  it("requires all four R2 vars and defaults the prefix", () => {
    expect(loadUploadConfig({})).toBeNull();
    expect(
      loadUploadConfig({
        DEMO_R2_ENDPOINT: config.endpoint,
        DEMO_R2_BUCKET: config.bucket,
        DEMO_R2_ACCESS_KEY_ID: config.accessKeyId,
      }),
    ).toBeNull();
    expect(
      loadUploadConfig({
        DEMO_R2_ENDPOINT: config.endpoint,
        DEMO_R2_BUCKET: config.bucket,
        DEMO_R2_ACCESS_KEY_ID: config.accessKeyId,
        DEMO_R2_SECRET_ACCESS_KEY: config.secretAccessKey,
      }),
    ).toEqual(config);
  });
});

describe("DemoUploader", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), "demo-upload-"));
    uploadCalls.length = 0;
    s3Commands.length = 0;
    storedIndex = null;
    indexVersion = 0;
    beforeIndexPut = undefined;
    beforeSidecarPut = undefined;
    storedSidecars.clear();
    failSidecarWrites = false;
    failIndexWrites = false;
    failUploads = false;
    uploadGate = undefined;
    bucketEtags.clear();
  });

  function makeRecord(filename: string) {
    return {
      filename,
      bytes: 3,
      recordedAt: "2026-08-20T02:31:07.000Z",
      server: "| the cut |",
      address: "45.76.24.91:28000",
      games: [
        {
          mission: "Katabatic",
          missionSequence: 41,
          gameType: "Capture the Flag",
          startMs: 0,
        },
      ],
      mod: "classic",
      recorder: "Observer",
      durationMs: 60_000,
      players: ["Alice", "Bob"],
    };
  }

  function makeGameRecord(filename = "labels.rec") {
    const record = makeRecord(filename);
    return {
      ...record,
      games: [{ ...record.games[0], gameId: "game", presentationRevision: 0 }],
    };
  }

  const savedGame = (revision: number) => ({
    id: "game",
    revision,
    presentation: {
      title: `Final ${revision}`,
      teamNames: { 1: "Storm", 2: "Knights" },
    },
  });

  function seedRemote(record = makeGameRecord()) {
    return seedRecord(record);
  }

  function seedRecord<T extends { filename: string }>(record: T): T {
    storedIndex = JSON.stringify([record]);
    storedSidecars.set(`demos/${record.filename}.json`, {
      body: JSON.stringify(record),
      version: 0,
    });
    return record;
  }

  function target(
    record: {
      filename: string;
      games: readonly {
        mission: string;
        startMs: number;
        missionSequence?: number;
        gameId?: string;
      }[];
    },
    gameIndex = 0,
  ): DemoGameTarget {
    const game = record.games[gameIndex];
    return {
      filename: record.filename,
      gameIndex,
      mission: game.mission,
      startMs: game.startMs,
      ...(game.gameId !== undefined && { gameId: game.gameId }),
      ...(game.missionSequence !== undefined && {
        missionSequence: game.missionSequence,
      }),
    };
  }

  function intent(
    record: ReturnType<typeof makeGameRecord>,
    game: PublishedGame = savedGame(1),
  ) {
    return {
      version: 1,
      expectedETag: '"0"',
      target: target(record),
      game,
      record: {
        ...record,
        games: [
          {
            ...record.games[0],
            gameId: game.id,
            presentationRevision: game.revision,
            ...game.presentation,
          },
        ],
      },
    };
  }

  it("edits a decades-old demo directly from R2 without a live session or local file", async () => {
    const record = seedRecord({
      ...makeRecord("old.rec"),
      recordedAt: "2001-01-01T00:00:00.000Z",
    });
    const uploader = new DemoUploader(config, dir);
    const loaded = await uploader.readPublishedDemo(record.filename);
    expect(loaded.recordedAt).toBe(record.recordedAt);
    const saved = await uploader.savePublishedGamePresentation(
      target(loaded),
      0,
      { title: "Old final", teamNames: { 1: "Storm", 2: "Inferno" } },
    );
    expect(saved.id).toBeTruthy();
    expect(saved.revision).toBe(1);
    const remote = JSON.parse(storedSidecars.get("demos/old.rec.json")!.body);
    expect(remote.games[0]).toMatchObject({
      gameId: saved.id,
      presentationRevision: 1,
      ...saved.presentation,
    });
    expect(JSON.parse(storedIndex!)[0].games[0]).toEqual(remote.games[0]);
    expect(await fsp.readdir(dir)).toEqual([]);
    expect(uploadCalls).toEqual([]);

    const restarted = new DemoUploader(config, dir);
    const fresh = await restarted.readPublishedDemo(record.filename);
    await restarted.savePublishedGamePresentation(target(fresh), 1, {});
    const cleared = JSON.parse(storedSidecars.get("demos/old.rec.json")!.body)
      .games[0];
    expect(cleared).toMatchObject({
      gameId: saved.id,
      presentationRevision: 2,
    });
    expect(cleared).not.toHaveProperty("title");
    expect(cleared).not.toHaveProperty("teamNames");
  });

  it("creates the first sidecar for a legacy indexed demo only when its recording exists", async () => {
    const { games: _games, ...fields } = makeRecord("legacy-old.rec");
    const legacy = {
      ...fields,
      mission: "Katabatic",
      gameType: "Capture the Flag",
    };
    storedIndex = JSON.stringify([legacy]);
    bucketEtags.set("demos/legacy-old.rec", "original");
    const uploader = new DemoUploader(config, dir);
    const loaded = await uploader.readPublishedDemo(legacy.filename);
    expect(loaded.games).toMatchObject([{ mission: "Katabatic", startMs: 0 }]);
    const saved = await uploader.savePublishedGamePresentation(
      target(loaded),
      0,
      { title: "Historic final" },
    );
    const remote = JSON.parse(
      storedSidecars.get("demos/legacy-old.rec.json")!.body,
    );
    expect(remote.mission).toBe("Katabatic");
    expect(remote.games[0]).toMatchObject({
      gameId: saved.id,
      title: "Historic final",
    });
    expect(JSON.parse(storedIndex!)[0]).toEqual(remote);
    expect(
      s3Commands.find(
        (cmd) =>
          cmd.type === "PutObject" &&
          cmd.input.Key === "demos/legacy-old.rec.json",
      )?.input.IfNoneMatch,
    ).toBe("*");
    expect(uploadCalls).toEqual([]);
  });

  it("does not invent sidecars for unindexed or deleted legacy recordings", async () => {
    const uploader = new DemoUploader(config, dir);
    bucketEtags.set("demos/missing.rec", "original");
    await expect(
      uploader.readPublishedDemo("missing.rec"),
    ).rejects.toMatchObject({ status: 404 });
    storedIndex = JSON.stringify([makeRecord("deleted.rec")]);
    await expect(
      uploader.readPublishedDemo("deleted.rec"),
    ).rejects.toMatchObject({ status: 404 });
    expect(s3Commands.filter((cmd) => cmd.type === "PutObject")).toEqual([]);
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("preserves untouched games and fields separately in the sidecar and index", async () => {
    const first = makeGameRecord("many.rec");
    const other = {
      ...first.games[0],
      mission: "Raindance",
      gameId: "other",
      startMs: 1000,
      title: 42,
      teamNames: { 1: false },
      extra: { source: "sidecar" },
    };
    const remote = seedRecord({
      ...first,
      extra: "retained",
      games: [first.games[0], other],
    });
    const indexedOther = {
      ...other,
      title: "Index title",
      teamNames: { 1: "Index name" },
      extra: { source: "index" },
    };
    storedIndex = JSON.stringify([
      { ...first, games: [first.games[0], indexedOther] },
    ]);
    const uploader = new DemoUploader(config, dir);
    await uploader.savePublishedGamePresentation(target(remote), 0, {
      title: "Only first game",
    });
    expect(
      JSON.parse(storedSidecars.get("demos/many.rec.json")!.body),
    ).toMatchObject({
      extra: "retained",
      games: [{ title: "Only first game" }, other],
    });
    expect(JSON.parse(storedIndex!)[0].games[1]).toEqual(indexedOther);
    await new DemoUploader(config, dir).sweep();
    expect(JSON.parse(storedIndex!)[0].games[1]).toEqual(indexedOther);
  });

  it("preserves a concurrently added demo and index repairs when editing a published game", async () => {
    const record = seedRemote(makeGameRecord("old.rec"));
    const repaired = {
      ...record,
      players: ["Repaired player"],
      extra: { source: "index" },
      games: [{ ...record.games[0], extra: "retained" }],
    };
    const added = makeRecord("new.rec");
    beforeIndexPut = () => {
      storedIndex = JSON.stringify([repaired, added]);
      indexVersion++;
    };

    const uploader = new DemoUploader(config, dir);
    const game = savedGame(1);
    await uploader.savePublishedGamePresentation(
      target(record),
      0,
      game.presentation,
    );

    expect(JSON.parse(storedIndex!)).toEqual([
      {
        ...repaired,
        games: [
          {
            ...repaired.games[0],
            presentationRevision: game.revision,
            ...game.presentation,
          },
        ],
      },
      added,
    ]);
    expect(
      s3Commands
        .filter(
          (cmd) =>
            cmd.type === "PutObject" && cmd.input.Key.endsWith("index.json"),
        )
        .map((cmd) => cmd.input.IfMatch),
    ).toEqual(['"0"', '"1"']);
  });

  it("uses canonical R2 metadata rather than an old local cache", async () => {
    const record = seedRemote();
    const canonical = {
      ...record,
      games: [
        { ...record.games[0], presentationRevision: 5, title: "Canonical" },
      ],
    };
    storedSidecars.get("demos/labels.rec.json")!.body =
      JSON.stringify(canonical);
    storedIndex = JSON.stringify([canonical]);
    await fsp.writeFile(
      path.join(dir, "labels.rec.json"),
      JSON.stringify({
        ...record,
        games: [{ ...record.games[0], title: "Stale" }],
      }),
    );
    const uploader = new DemoUploader(config, dir);
    const fresh = await uploader.readPublishedDemo(record.filename);
    expect(fresh.games[0].title).toBe("Canonical");
    await uploader.savePublishedGamePresentation(target(fresh), 5, {
      title: "Newest",
    });
    expect(
      JSON.parse(storedSidecars.get("demos/labels.rec.json")!.body).games[0],
    ).toMatchObject({ title: "Newest", presentationRevision: 6 });
  });

  it.each([
    "../old.rec",
    "folder/old.rec",
    "https://example.com/old.rec",
    "tribesforever:123",
    "old.rec\u0000",
  ])(
    "refuses an unsafe published filename (%s) before contacting storage",
    async (filename) => {
      const uploader = new DemoUploader(config, dir);
      await expect(uploader.readPublishedDemo(filename)).rejects.toMatchObject({
        status: 404,
      });
      await expect(
        uploader.savePublishedGamePresentation(
          { filename, gameIndex: 0, mission: "Katabatic", startMs: 0 },
          0,
          {},
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(s3Commands).toEqual([]);
    },
  );

  it("returns unavailable when published storage is not configured", async () => {
    const uploader = new DemoUploader(null, dir);
    await expect(uploader.readPublishedDemo("old.rec")).rejects.toMatchObject({
      status: 503,
    });
    await expect(
      uploader.savePublishedGamePresentation(target(makeGameRecord()), 0, {}),
    ).rejects.toMatchObject({ status: 503 });
    expect(s3Commands).toEqual([]);
  });

  it("rejects a competing write without rebasing it onto the winner", async () => {
    const record = seedRemote();
    const winner = {
      ...record,
      games: [{ ...record.games[0], presentationRevision: 1, title: "Winner" }],
    };
    beforeSidecarPut = () => {
      storedSidecars.set("demos/labels.rec.json", {
        body: JSON.stringify(winner),
        version: 1,
      });
      storedIndex = JSON.stringify([winner]);
    };
    const uploader = new DemoUploader(config, dir);
    await expect(
      uploader.savePublishedGamePresentation(target(record), 0, {
        title: "Rejected",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await new DemoUploader(config, dir).sweep();
    expect(
      JSON.parse(storedSidecars.get("demos/labels.rec.json")!.body),
    ).toEqual(winner);
    expect(JSON.parse(storedIndex!)).toEqual([winner]);
    expect(await fsp.readdir(dir)).toEqual([]);
    expect(
      s3Commands
        .filter(
          (cmd) =>
            cmd.type === "PutObject" && cmd.input.Key.endsWith(".rec.json"),
        )
        .map((cmd) => cmd.input.IfMatch),
    ).toEqual(['"0"']);
  });

  it("rejects stale revisions without staging or writing anything", async () => {
    const record = seedRemote();
    const uploader = new DemoUploader(config, dir);
    await expect(
      uploader.savePublishedGamePresentation(target(record), 9, {
        title: "Stale",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await fsp.readdir(dir)).toEqual([]);
    expect(s3Commands.filter((cmd) => cmd.type === "PutObject")).toEqual([]);
  });

  it("does not publish a pre-CAS intent after a crash and a competing write", async () => {
    const record = seedRemote();
    await fsp.writeFile(
      path.join(dir, "labels.rec.json.edit"),
      JSON.stringify(intent(record)),
    );
    const winner = {
      ...record,
      games: [{ ...record.games[0], presentationRevision: 1, title: "Winner" }],
    };
    storedSidecars.set("demos/labels.rec.json", {
      body: JSON.stringify(winner),
      version: 1,
    });
    storedIndex = JSON.stringify([winner]);
    await new DemoUploader(config, dir).sweep();
    expect(
      JSON.parse(storedSidecars.get("demos/labels.rec.json")!.body),
    ).toEqual(winner);
    expect(await fsp.readdir(dir)).toEqual([]);
    expect(
      s3Commands
        .filter(
          (cmd) =>
            cmd.type === "PutObject" && cmd.input.Key.endsWith(".rec.json"),
        )
        .map((cmd) => cmd.input.IfMatch),
    ).toEqual(['"0"']);
  });

  it("recovers a committed CAS after a crash before writing the canonical cache", async () => {
    const record = seedRemote();
    const edit = intent(record);
    await fsp.writeFile(
      path.join(dir, "labels.rec.json.edit"),
      JSON.stringify(edit),
    );
    storedSidecars.set("demos/labels.rec.json", {
      body: JSON.stringify(edit.record),
      version: 1,
    });
    await new DemoUploader(config, dir).sweep();
    expect(JSON.parse(storedIndex!)[0].games[0]).toMatchObject(
      savedGame(1).presentation,
    );
    expect(storedSidecars.get("demos/labels.rec.json")!.version).toBe(1);
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("keeps a failed comparison conditional even when its intent cannot be removed", async () => {
    const record = seedRemote();
    const winner = {
      ...record,
      games: [{ ...record.games[0], presentationRevision: 1, title: "Winner" }],
    };
    beforeSidecarPut = () => {
      storedSidecars.set("demos/labels.rec.json", {
        body: JSON.stringify(winner),
        version: 1,
      });
      storedIndex = JSON.stringify([winner]);
    };
    const unlink = fsp.unlink.bind(fsp);
    const cleanup = vi.spyOn(fsp, "unlink").mockImplementation(async (file) => {
      if (String(file).endsWith(".json.edit"))
        throw Object.assign(new Error("cleanup blocked"), { code: "EACCES" });
      return unlink(file);
    });
    const uploader = new DemoUploader(config, dir);
    await expect(
      uploader.savePublishedGamePresentation(target(record), 0, {
        title: "Rejected",
      }),
    ).rejects.toThrow("cleanup blocked");
    await expect(uploader.publishGamePresentations()).rejects.toThrow(
      "cleanup blocked",
    );
    expect(await fsp.readdir(dir)).toEqual(["labels.rec.json.edit"]);
    cleanup.mockRestore();
    await new DemoUploader(config, dir).sweep();
    expect(
      JSON.parse(storedSidecars.get("demos/labels.rec.json")!.body),
    ).toEqual(winner);
    expect(await fsp.readdir(dir)).toEqual([]);
    expect(
      s3Commands
        .filter(
          (cmd) =>
            cmd.type === "PutObject" && cmd.input.Key.endsWith(".rec.json"),
        )
        .every((cmd) => cmd.input.IfMatch === '"0"'),
    ).toBe(true);
  });

  it("retries a network-uncertain CAS using its original comparison after restart", async () => {
    const record = seedRemote();
    failSidecarWrites = true;
    const uploader = new DemoUploader(config, dir);
    await expect(
      uploader.savePublishedGamePresentation(target(record), 0, {
        title: "Retry me",
      }),
    ).rejects.toThrow("sidecar upload failed");
    await expect(uploader.publishGamePresentations()).rejects.toThrow(
      "sidecar upload failed",
    );
    expect(await fsp.readdir(dir)).toEqual(["labels.rec.json.edit"]);
    failSidecarWrites = false;
    await new DemoUploader(config, dir).sweep();
    expect(JSON.parse(storedIndex!)[0].games[0].title).toBe("Retry me");
    expect(await fsp.readdir(dir)).toEqual([]);
    expect(
      s3Commands
        .filter(
          (cmd) =>
            cmd.type === "PutObject" && cmd.input.Key.endsWith(".rec.json"),
        )
        .every((cmd) => cmd.input.IfMatch === '"0"'),
    ).toBe(true);
  });

  it("recognizes its own committed CAS when the network loses the response", async () => {
    const record = seedRemote();
    const accepted = intent(record).record;
    beforeSidecarPut = () => {
      storedSidecars.set("demos/labels.rec.json", {
        body: JSON.stringify(accepted),
        version: 1,
      });
      throw new Error("response lost");
    };
    const uploader = new DemoUploader(config, dir);
    await expect(
      uploader.savePublishedGamePresentation(
        target(record),
        0,
        savedGame(1).presentation,
      ),
    ).rejects.toThrow("response lost");
    await uploader.publishGamePresentations();
    expect(JSON.parse(storedIndex!)[0].games[0].title).toBe("Final 1");
    expect(storedSidecars.get("demos/labels.rec.json")!.version).toBe(1);
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("does not lose a later live edit while a historical index update is pending", async () => {
    const record = seedRemote();
    failIndexWrites = true;
    const uploader = new DemoUploader(config, dir);
    await expect(
      uploader.savePublishedGamePresentation(
        target(record),
        0,
        savedGame(1).presentation,
      ),
    ).resolves.toMatchObject({ revision: 1 });
    await expect(
      uploader.saveGamePresentation(
        path.join(dir, record.filename),
        savedGame(2),
      ),
    ).rejects.toThrow("index upload failed");
    expect(
      JSON.parse(await fsp.readFile(path.join(dir, "labels.rec.json"), "utf8"))
        .games[0].title,
    ).toBe("Final 1");
    failIndexWrites = false;
    await uploader.publishGamePresentations();
    await uploader.saveGamePresentation(
      path.join(dir, record.filename),
      savedGame(2),
    );
    await uploader.publishGamePresentations();
    expect(
      JSON.parse(storedSidecars.get("demos/labels.rec.json")!.body).games[0]
        .title,
    ).toBe("Final 2");
    expect(JSON.parse(storedIndex!)[0].games[0].title).toBe("Final 2");
  });

  it("finishes initial publication after an unindexed sidecar was edited and the relay restarted", async () => {
    const record = makeGameRecord("unlisted.rec");
    const file = path.join(dir, record.filename);
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(`${file}.json`, JSON.stringify(record));
    failIndexWrites = true;
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(file);
    await vi.waitFor(() => expect(uploader.getStats().failed).toBe(1));
    expect(storedSidecars.has("demos/unlisted.rec.json")).toBe(true);
    expect(storedIndex).toBeNull();

    failIndexWrites = false;
    await uploader.savePublishedGamePresentation(
      target(record),
      0,
      savedGame(1).presentation,
    );
    await expect(uploader.publishGamePresentations()).rejects.toMatchObject({
      status: 404,
    });
    expect(await fsp.readdir(dir)).toEqual(
      expect.arrayContaining([
        record.filename,
        `${record.filename}.json`,
        `${record.filename}.json.edit`,
      ]),
    );

    const restarted = new DemoUploader(config, dir);
    await restarted.sweep();
    await vi.waitFor(() => expect(restarted.getStats().uploaded).toBe(1));

    expect(JSON.parse(storedIndex!)[0].games[0]).toMatchObject({
      gameId: "game",
      presentationRevision: 1,
      title: "Final 1",
    });
    await vi.waitFor(async () => expect(await fsp.readdir(dir)).toEqual([]));
  });

  it("can edit an old demo while a different recording upload is blocked", async () => {
    const old = seedRemote();
    const newRecord = makeGameRecord("new.rec");
    await fsp.writeFile(
      path.join(dir, newRecord.filename),
      new Uint8Array([1, 2, 3]),
    );
    await fsp.writeFile(
      path.join(dir, `${newRecord.filename}.json`),
      JSON.stringify(newRecord),
    );
    let release!: () => void;
    uploadGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(path.join(dir, newRecord.filename));
    await vi.waitFor(() => expect(uploadCalls).toHaveLength(1));
    try {
      await uploader.savePublishedGamePresentation(target(old), 0, {
        title: "Independent edit",
      });
      expect(JSON.parse(storedIndex!)[0].games[0].title).toBe(
        "Independent edit",
      );
      expect(uploader.getStats().uploaded).toBe(0);
    } finally {
      release();
    }
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
  });

  it("expires a synced cache after 24 hours while leaving R2 editable", async () => {
    const record = seedRemote();
    const file = path.join(dir, `${record.filename}.json`);
    await fsp.writeFile(file, JSON.stringify(record));
    const old = new Date(Date.now() - PUBLISHED_DEMO_SIDECAR_CACHE_MS - 1000);
    await fsp.utimes(file, old, old);
    const uploader = new DemoUploader(config, dir);
    await uploader.sweep();
    expect(await fsp.readdir(dir)).toEqual([]);
    const loaded = await uploader.readPublishedDemo(record.filename);
    await uploader.savePublishedGamePresentation(target(loaded), 0, {
      title: "Still editable",
    });
    expect(JSON.parse(storedIndex!)[0].games[0].title).toBe("Still editable");
  });

  it.each(["sidecar", "index"])(
    "never expires an old cache with a pending %s update",
    async (failure) => {
      const record = seedRemote();
      const file = path.join(dir, `${record.filename}.json`);
      await fsp.writeFile(file, JSON.stringify(intent(record).record));
      const old = new Date(Date.now() - PUBLISHED_DEMO_SIDECAR_CACHE_MS - 1000);
      await fsp.utimes(file, old, old);
      failSidecarWrites = failure === "sidecar";
      failIndexWrites = failure === "index";
      const uploader = new DemoUploader(config, dir);
      await uploader.sweep();
      expect(await fsp.readdir(dir)).toEqual(["labels.rec.json"]);
      failSidecarWrites = false;
      failIndexWrites = false;
      await uploader.sweep();
      expect(JSON.parse(storedIndex!)[0].games[0].title).toBe("Final 1");
      expect(await fsp.readdir(dir)).toEqual([]);
    },
  );

  it("retains a conditional intent of any age until it can commit", async () => {
    const record = seedRemote();
    const file = path.join(dir, "labels.rec.json.edit");
    await fsp.writeFile(file, JSON.stringify(intent(record)));
    const old = new Date(Date.now() - PUBLISHED_DEMO_SIDECAR_CACHE_MS * 100);
    await fsp.utimes(file, old, old);
    failSidecarWrites = true;
    const uploader = new DemoUploader(config, dir);
    await uploader.sweep();
    expect(await fsp.readdir(dir)).toEqual(["labels.rec.json.edit"]);
    failSidecarWrites = false;
    await uploader.sweep();
    expect(JSON.parse(storedIndex!)[0].games[0].title).toBe("Final 1");
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("retains an old metadata cache while its recording is still uploading", async () => {
    const record = seedRemote();
    const file = path.join(dir, record.filename);
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(`${file}.json`, JSON.stringify(record));
    const old = new Date(Date.now() - PUBLISHED_DEMO_SIDECAR_CACHE_MS - 1000);
    await fsp.utimes(`${file}.json`, old, old);
    let release!: () => void;
    uploadGate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const uploader = new DemoUploader(config, dir);
    try {
      await uploader.sweep();
      await vi.waitFor(() => expect(uploadCalls).toHaveLength(1));
      expect(await fsp.readdir(dir)).toEqual(["labels.rec", "labels.rec.json"]);
      expect(uploader.getStats().uploaded).toBe(0);
    } finally {
      release();
    }
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
    await uploader.sweep();
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("saves delayed edits after upload to the actual sidecar and updates the index", async () => {
    const record = seedRemote();
    const file = path.join(dir, record.filename);
    const uploader = new DemoUploader(config, dir);
    await uploader.saveGamePresentation(file, savedGame(1));
    await uploader.publishGamePresentations();
    const local = JSON.parse(await fsp.readFile(`${file}.json`, "utf8"));
    const remote = JSON.parse(
      storedSidecars.get(`demos/${record.filename}.json`)!.body,
    );
    expect(local.games[0]).toMatchObject({
      gameId: "game",
      presentationRevision: 1,
      ...savedGame(1).presentation,
    });
    expect(remote).toEqual(local);
    expect(JSON.parse(storedIndex!)).toEqual([local]);
    expect(uploadCalls).toEqual([]);
    expect(
      s3Commands.filter(
        (command) =>
          command.type === "PutObject" &&
          !command.input.Key.endsWith("index.json"),
      ),
    ).toEqual([
      expect.objectContaining({
        input: expect.objectContaining({
          IfMatch: '"0"',
          CacheControl: "no-cache",
        }),
      }),
    ]);
  });

  it.each(["sidecar", "index"])(
    "retains durable edits and retries a failed %s publish after restart",
    async (failure) => {
      const record = seedRemote();
      const file = path.join(dir, record.filename);
      failSidecarWrites = failure === "sidecar";
      failIndexWrites = failure === "index";
      const uploader = new DemoUploader(config, dir);
      await uploader.saveGamePresentation(file, savedGame(1));
      await expect(uploader.publishGamePresentations()).rejects.toThrow(
        "upload failed",
      );
      expect(
        JSON.parse(await fsp.readFile(`${file}.json`, "utf8")).games[0].title,
      ).toBe("Final 1");
      failSidecarWrites = false;
      failIndexWrites = false;
      await new DemoUploader(config, dir).sweep();
      expect(JSON.parse(storedIndex!).at(0).games[0]).toMatchObject({
        title: "Final 1",
        presentationRevision: 1,
      });
      expect(uploadCalls).toEqual([]);
      expect(await fsp.readdir(dir)).toEqual([`${record.filename}.json`]);
    },
  );

  it("removes cleared labels from both sidecar and index without changing the game identity", async () => {
    const record = seedRemote();
    const uploader = new DemoUploader(config, dir);
    const file = path.join(dir, record.filename);
    await uploader.saveGamePresentation(file, savedGame(1));
    await uploader.publishGamePresentations();
    await uploader.saveGamePresentation(file, {
      id: "game",
      revision: 2,
      presentation: {},
    });
    await uploader.publishGamePresentations();
    const remote = JSON.parse(
      storedSidecars.get(`demos/${record.filename}.json`)!.body,
    );
    expect(remote.games[0]).toMatchObject({
      gameId: "game",
      presentationRevision: 2,
    });
    expect(remote.games[0]).not.toHaveProperty("title");
    expect(remote.games[0]).not.toHaveProperty("teamNames");
    expect(JSON.parse(storedIndex!)).toEqual([remote]);
  });

  it("retries a sidecar conflict while preserving unrelated repairs in sidecar and index", async () => {
    const record = seedRemote();
    beforeSidecarPut = () => {
      const repaired = {
        ...record,
        hasCommentary: true,
        players: ["Repaired"],
      };
      storedSidecars.set(`demos/${record.filename}.json`, {
        body: JSON.stringify(repaired),
        version: 1,
      });
      storedIndex = JSON.stringify([repaired]);
      indexVersion++;
    };
    const uploader = new DemoUploader(config, dir);
    await uploader.saveGamePresentation(
      path.join(dir, record.filename),
      savedGame(1),
    );
    await uploader.publishGamePresentations();
    const remote = JSON.parse(
      storedSidecars.get(`demos/${record.filename}.json`)!.body,
    );
    expect(remote).toMatchObject({
      hasCommentary: true,
      players: ["Repaired"],
      games: [{ title: "Final 1" }],
    });
    expect(JSON.parse(storedIndex!)).toEqual([remote]);
    expect(
      s3Commands
        .filter(
          (command) =>
            command.type === "PutObject" &&
            command.input.Key.endsWith(".rec.json"),
        )
        .map((command) => command.input.IfMatch),
    ).toEqual(['"0"', '"1"']);
  });

  it("serializes a second save arriving during publication so old labels cannot overwrite it", async () => {
    const record = seedRemote();
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const started = vi.fn();
    beforeSidecarPut = async () => {
      started();
      await gate;
    };
    const uploader = new DemoUploader(config, dir);
    const file = path.join(dir, record.filename);
    await uploader.saveGamePresentation(file, savedGame(1));
    await vi.waitFor(() => expect(started).toHaveBeenCalledOnce());
    const second = uploader.saveGamePresentation(file, savedGame(2));
    unblock();
    await second;
    await uploader.publishGamePresentations();
    expect(JSON.parse(storedIndex!)[0].games[0]).toMatchObject({
      title: "Final 2",
      presentationRevision: 2,
    });
    expect(
      s3Commands
        .filter(
          (command) =>
            command.type === "PutObject" &&
            command.input.Key.endsWith(".rec.json"),
        )
        .map(
          (command) =>
            JSON.parse(command.input.Body!).games[0].presentationRevision,
        ),
    ).toEqual([1, 2]);
  });

  it("does not resurrect an index entry or sidecar removed from the bucket", async () => {
    const record = seedRemote();
    storedIndex = "[]";
    const uploader = new DemoUploader(config, dir);
    const file = path.join(dir, record.filename);
    await uploader.saveGamePresentation(file, savedGame(1));
    await uploader.publishGamePresentations();
    expect(JSON.parse(storedIndex!)).toEqual([]);
    storedSidecars.clear();
    await uploader.saveGamePresentation(file, savedGame(2));
    await uploader.publishGamePresentations();
    expect(storedSidecars.size).toBe(0);
    expect(JSON.parse(storedIndex!)).toEqual([]);
  });

  it.each(["upload", "checkpoints"])(
    "commits live edits without waiting for blocked %s work",
    async (blocked) => {
      const record = makeGameRecord();
      const file = path.join(dir, record.filename);
      await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
      await fsp.writeFile(`${file}.json`, JSON.stringify(record));
      let unblock!: () => void;
      const gate = new Promise<void>((resolve) => {
        unblock = resolve;
      });
      if (blocked === "upload") uploadGate = gate;
      const publishCheckpoints = vi.fn(() =>
        blocked === "checkpoints" ? gate : Promise.resolve(),
      );
      const uploader = new DemoUploader(config, dir, { publishCheckpoints });
      uploader.enqueue(file);
      await vi.waitFor(() =>
        blocked === "upload"
          ? expect(uploadCalls).toHaveLength(1)
          : expect(publishCheckpoints).toHaveBeenCalledOnce(),
      );
      let committed = false;
      const saving = uploader
        .saveGamePresentation(file, savedGame(1))
        .then(() => {
          committed = true;
        });
      try {
        await vi.waitFor(() => expect(committed).toBe(true));
        expect(
          JSON.parse(await fsp.readFile(`${file}.json`, "utf8")).games[0].title,
        ).toBe("Final 1");
        expect(uploader.getStats().uploaded).toBe(0);
        expect(storedIndex).toBeNull();
      } finally {
        unblock();
      }
      await saving;
      await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
      await uploader.publishGamePresentations();
      expect(JSON.parse(storedIndex!)[0].games[0]).toMatchObject({
        title: "Final 1",
        presentationRevision: 1,
      });
      expect(await fsp.readdir(dir)).toEqual([`${record.filename}.json`]);
      expect(uploadCalls).toHaveLength(1);
    },
  );

  it("uploads a demo enqueued while the previous pump is flushing metadata", async () => {
    const record = seedRemote();
    const uploader = new DemoUploader(config, dir);
    failSidecarWrites = true;
    await uploader.saveGamePresentation(
      path.join(dir, record.filename),
      savedGame(1),
    );
    await expect(uploader.publishGamePresentations()).rejects.toThrow(
      "upload failed",
    );
    failSidecarWrites = false;
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const flushing = vi.fn();
    beforeIndexPut = () => {
      beforeSidecarPut = async () => {
        flushing();
        await gate;
      };
    };
    const first = path.join(dir, "first.rec");
    await fsp.writeFile(first, new Uint8Array([1]));
    await fsp.writeFile(
      `${first}.json`,
      JSON.stringify(makeRecord("first.rec")),
    );
    uploader.enqueue(first);
    await vi.waitFor(() => expect(flushing).toHaveBeenCalledOnce());
    const second = path.join(dir, "second.rec");
    await fsp.writeFile(second, new Uint8Array([2]));
    uploader.enqueue(second);
    unblock();
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(2));
    expect(uploadCalls.map((upload) => upload.Key)).toEqual([
      "demos/first.rec",
      "demos/second.rec",
    ]);
  });

  it("never uploads or salvages recordings awaiting a match-end decision", async () => {
    const pending = path.join(dir, "pending", "current-match");
    await fsp.mkdir(pending, { recursive: true });
    for (const name of [
      "held.rec",
      "held.rec.json",
      "interrupted.rec.partial",
      "policy.json",
    ]) {
      await fsp.writeFile(path.join(pending, name), "held");
      await fsp.utimes(path.join(pending, name), new Date(0), new Date(0));
    }
    const uploader = new DemoUploader(config, dir);
    await uploader.sweep();
    expect(uploadCalls).toEqual([]);
    expect(s3Commands).toEqual([]);
    expect((await fsp.readdir(pending)).sort()).toEqual([
      "held.rec",
      "held.rec.json",
      "interrupted.rec.partial",
      "policy.json",
    ]);
  });

  it("uploads with the prefixed key and unlinks on success", async () => {
    const filePath = path.join(dir, "auto-capture_test.rec");
    await fsp.writeFile(filePath, new Uint8Array([1, 2, 3]));
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(filePath);

    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toEqual([
      { Bucket: "t2-demos", Key: "demos/auto-capture_test.rec" },
    ]);
    expect(uploader.getStats()).toMatchObject({
      enabled: true,
      queued: 0,
      uploading: null,
      uploaded: 1,
      failed: 0,
      lastUploaded: { key: "demos/auto-capture_test.rec" },
      lastError: null,
    });
  });

  it("retries a demo the bucket already holds the same copy of", async () => {
    const file = path.join(dir, "again.rec");
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    // MD5 of bytes 1, 2, 3: the upload that landed before a crash.
    bucketEtags.set("demos/again.rec", "5289df737df57326fcdd22597afb1fac");
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(file);
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
    expect(uploadCalls).toEqual([
      { Bucket: "t2-demos", Key: "demos/again.rec" },
    ]);
  });

  it("keeps the bucket's copy of a demo rewritten since it was uploaded", async () => {
    const file = path.join(dir, "rewritten.rec");
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(
      `${file}.json`,
      JSON.stringify(makeRecord("rewritten.rec")),
    );
    bucketEtags.set("demos/rewritten.rec", "0123456789abcdef0123456789abcdef");
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(file);
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
    expect(uploadCalls).toEqual([]);
    expect(
      s3Commands.filter(
        (cmd) =>
          cmd.type === "PutObject" && !cmd.input.Key.endsWith("index.json"),
      ),
    ).toEqual([]);
    expect(JSON.parse(storedIndex!)).toEqual([makeRecord("rewritten.rec")]);
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("uploads the sidecar and appends its record to the index", async () => {
    const info = vi.spyOn(demoLog, "info").mockImplementation(() => {});
    const record = makeRecord("a.rec");
    await fsp.writeFile(path.join(dir, "a.rec"), new Uint8Array([1, 2, 3]));
    await fsp.writeFile(path.join(dir, "a.rec.json"), JSON.stringify(record));
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(path.join(dir, "a.rec"));

    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toEqual([{ Bucket: "t2-demos", Key: "demos/a.rec" }]);
    const puts = s3Commands.filter((c) => c.type === "PutObject");
    expect(puts.map((c) => c.input.Key)).toEqual([
      "demos/a.rec.json",
      "demos/index.json",
    ]);
    expect(puts[0].input.CacheControl).toBe("no-cache");
    expect(JSON.parse(String(puts[0].input.Body))).toEqual(record);
    // The index mutates — it must never be cached as immutable.
    expect(puts[1].input.CacheControl).toBe("no-cache");
    expect(JSON.parse(storedIndex!)).toEqual([record]);
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ file: "a.rec" }),
      "Demo queued for upload",
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ file: "a.rec", key: "demos/a.rec" }),
      "Demo upload starting",
    );
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ file: "a.rec", key: "demos/a.rec" }),
      "Demo uploaded",
    );
  });

  it("appends to an existing index and dedupes retries by filename", async () => {
    const existing = makeRecord("old.rec");
    storedIndex = JSON.stringify([existing]);
    const record = makeRecord("b.rec");
    const uploader = new DemoUploader(config, dir);

    await fsp.writeFile(path.join(dir, "b.rec"), new Uint8Array([1]));
    await fsp.writeFile(path.join(dir, "b.rec.json"), JSON.stringify(record));
    uploader.enqueue(path.join(dir, "b.rec"));
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(JSON.parse(storedIndex!)).toEqual([existing, record]);

    // Retry after a crash between index update and unlink: the record
    // is already present, so the re-upload must not duplicate it.
    await fsp.writeFile(path.join(dir, "b.rec"), new Uint8Array([1]));
    await fsp.writeFile(path.join(dir, "b.rec.json"), JSON.stringify(record));
    await uploader.sweep();
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(JSON.parse(storedIndex!)).toEqual([existing, record]);
  });

  it("retries an index conflict without overwriting a backfill or another upload", async () => {
    const old = makeRecord("old.rec");
    const repaired = {
      ...old,
      games: [{ ...old.games[0], missionSequence: 42 }],
    };
    const other = makeRecord("other.rec");
    const record = makeRecord("new.rec");
    storedIndex = JSON.stringify([old]);
    beforeIndexPut = () => {
      storedIndex = JSON.stringify([repaired, other]);
      indexVersion++;
    };
    await fsp.writeFile(path.join(dir, "new.rec"), new Uint8Array([1]));
    await fsp.writeFile(path.join(dir, "new.rec.json"), JSON.stringify(record));
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(path.join(dir, "new.rec"));
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
    expect(JSON.parse(storedIndex!)).toEqual([repaired, other, record]);
    expect(
      s3Commands
        .filter(
          (c) => c.type === "PutObject" && c.input.Key.endsWith("index.json"),
        )
        .map((c) => c.input.IfMatch),
    ).toEqual(['"0"', '"1"']);
  });

  it("uploads legacy demos without a sidecar and skips the index", async () => {
    await fsp.writeFile(path.join(dir, "legacy.rec"), new Uint8Array([1]));
    const onPublished = vi.fn();
    const uploader = new DemoUploader(config, dir, { onPublished });
    uploader.enqueue(path.join(dir, "legacy.rec"));
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toHaveLength(1);
    expect(s3Commands.map((cmd) => cmd.type)).toEqual(["HeadObject"]);
    expect(storedIndex).toBeNull();
    expect(onPublished).not.toHaveBeenCalled();
  });

  it("preserves pre-games sidecars when uploading leftovers from an older relay", async () => {
    const { games: _games, ...base } = makeRecord("legacy-metadata.rec");
    const record = {
      ...base,
      mission: "Katabatic",
      gameType: "Capture the Flag",
    };
    const file = path.join(dir, record.filename);
    await fsp.writeFile(file, new Uint8Array([1]));
    await fsp.writeFile(`${file}.json`, JSON.stringify(record));
    const uploader = new DemoUploader(config, dir);
    uploader.enqueue(file);
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
    expect(JSON.parse(storedIndex!)).toEqual([record]);
    expect(await fsp.readdir(dir)).toEqual([]);
  });

  it("waits for checkpoints before publishing metadata/index and removes both sidecars", async () => {
    const file = path.join(dir, "checkpoint.rec");
    const record = makeRecord("checkpoint.rec");
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(`${file}.json`, JSON.stringify(record));
    let complete!: () => void;
    const gate = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const publishCheckpoints = vi.fn(async () => {
      await fsp.writeFile(`${file}.checkpoints.json`, "{}");
      await gate;
    });
    const uploader = new DemoUploader(config, dir, { publishCheckpoints });
    uploader.enqueue(file);
    await vi.waitFor(() =>
      expect(publishCheckpoints).toHaveBeenCalledWith(
        file,
        "demos/checkpoint.rec",
      ),
    );
    expect(uploadCalls).toHaveLength(1);
    expect(s3Commands.map((cmd) => cmd.type)).toEqual(["HeadObject"]);
    complete();
    await vi.waitFor(async () => expect(await fsp.readdir(dir)).toEqual([]));
    expect(JSON.parse(storedIndex!)).toEqual([record]);
  });

  it("publishes a recording's private sidecar by its bucket-relative key", async () => {
    const file = path.join(dir, "private.rec");
    const record = makeRecord("private.rec");
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(`${file}.json`, JSON.stringify(record));
    const publish = vi.fn(async () => {
      throw new Error("Private bucket unavailable");
    });
    const error = vi.spyOn(demoLog, "error").mockImplementation(() => {});
    new DemoUploader(config, dir, {
      privateSidecars: { publish, delete: vi.fn() },
    }).enqueue(file);
    await vi.waitFor(async () => expect(await fsp.readdir(dir)).toEqual([]));
    expect(publish).toHaveBeenCalledExactlyOnceWith(file, "private.rec");
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ demoKey: "private.rec" }),
      "Private demo sidecar publication failed",
    );
    expect(JSON.parse(storedIndex!)).toEqual([record]);
  });

  it("notifies background work only after private sidecars and the public index are ready", async () => {
    const file = path.join(dir, "ready.rec");
    const record = makeRecord("ready.rec");
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(`${file}.json`, JSON.stringify(record));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const events: string[] = [];
    const publish = vi.fn(async () => {
      await gate;
      events.push("private");
    });
    const onPublished = vi.fn((demoKey: string) => {
      expect(demoKey).toBe("ready.rec");
      expect(JSON.parse(storedIndex!)).toEqual([record]);
      expect(storedSidecars.has("demos/ready.rec.json")).toBe(true);
      events.push("published");
    });
    const uploader = new DemoUploader(config, dir, {
      privateSidecars: { publish, delete: vi.fn() },
      onPublished,
    });
    uploader.enqueue(file);
    try {
      await vi.waitFor(() => expect(publish).toHaveBeenCalledOnce());
      expect(onPublished).not.toHaveBeenCalled();
      expect(storedIndex).toBeNull();
    } finally {
      release();
    }
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
    expect(onPublished).toHaveBeenCalledExactlyOnceWith("ready.rec");
    expect(events).toEqual(["private", "published"]);
  });

  it("does not notify background work for a failed index commit, then notifies its successful retry", async () => {
    const file = path.join(dir, "retry-profile.rec");
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(
      `${file}.json`,
      JSON.stringify(makeRecord(path.basename(file))),
    );
    const onPublished = vi.fn();
    const uploader = new DemoUploader(config, dir, { onPublished });
    failIndexWrites = true;
    uploader.enqueue(file);
    await vi.waitFor(() => expect(uploader.getStats().failed).toBe(1));
    expect(onPublished).not.toHaveBeenCalled();
    failIndexWrites = false;
    await uploader.sweep();
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
    expect(onPublished).toHaveBeenCalledExactlyOnceWith("retry-profile.rec");
  });

  it("keeps a successful public demo when queuing its follow-up throws", async () => {
    const file = path.join(dir, "follow-up-error.rec");
    const record = makeRecord(path.basename(file));
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(`${file}.json`, JSON.stringify(record));
    const error = vi.spyOn(demoLog, "error").mockImplementation(() => {});
    const uploader = new DemoUploader(config, dir, {
      onPublished: () => {
        throw new Error("Queue unavailable");
      },
    });
    uploader.enqueue(file);
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
    expect(uploader.getStats().failed).toBe(0);
    expect(JSON.parse(storedIndex!)).toEqual([record]);
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ demoKey: "follow-up-error.rec" }),
      "Demo publication follow-up could not be queued",
    );
  });

  it.each([undefined, 0])(
    "adopts an untouched backfilled game during initial publication (revision %s)",
    async (presentationRevision) => {
      const record = {
        ...makeGameRecord("backfilled.rec"),
        reason: "patrol pin, peak 12 players, match started",
      };
      const file = path.join(dir, record.filename);
      await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
      await fsp.writeFile(`${file}.json`, JSON.stringify(record));
      const backfilled = {
        ...makeRecord(record.filename),
        players: ["Repaired"],
        reason: "backfilled: 2 players, 1 game",
        extra: "backfill extension",
        games: [
          { ...makeRecord(record.filename).games[0], presentationRevision },
        ],
      };
      const publishCheckpoints = vi.fn(async () => {
        storedSidecars.set(`demos/${record.filename}.json`, {
          body: JSON.stringify(backfilled),
          version: 0,
        });
        beforeSidecarPut = () => {
          storedSidecars.set(`demos/${record.filename}.json`, {
            body: JSON.stringify({ ...backfilled, hasCommentary: true }),
            version: 1,
          });
        };
      });
      const uploader = new DemoUploader(config, dir, { publishCheckpoints });
      uploader.enqueue(file);
      await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
      const remote = JSON.parse(
        storedSidecars.get(`demos/${record.filename}.json`)!.body,
      );
      expect(remote).toMatchObject({
        players: ["Repaired"],
        hasCommentary: true,
        reason: record.reason,
        extra: "backfill extension",
        games: [{ gameId: "game", presentationRevision: 0 }],
      });
      expect(JSON.parse(storedIndex!)).toEqual([remote]);
      expect(
        s3Commands
          .filter(
            (command) =>
              command.type === "PutObject" &&
              command.input.Key === `demos/${record.filename}.json`,
          )
          .map((command) => command.input.IfMatch),
      ).toEqual(['"0"', '"1"']);
      await expect(fsp.access(file)).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("retains an identified sidecar's reason during an upload retry", async () => {
    const record = {
      ...makeGameRecord("identified.rec"),
      reason: "original local reason",
    };
    const file = path.join(dir, record.filename);
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(`${file}.json`, JSON.stringify(record));
    const current = { ...record, reason: "current remote reason" };
    const publishCheckpoints = vi.fn(async () => {
      storedSidecars.set(`demos/${record.filename}.json`, {
        body: JSON.stringify(current),
        version: 0,
      });
    });
    const uploader = new DemoUploader(config, dir, { publishCheckpoints });
    uploader.enqueue(file);
    await vi.waitFor(() => expect(uploader.getStats().uploaded).toBe(1));
    expect(
      JSON.parse(storedSidecars.get(`demos/${record.filename}.json`)!.body),
    ).toEqual(current);
    expect(JSON.parse(storedIndex!)).toEqual([current]);
  });

  it.each([
    {
      kind: "ambiguous boundaries",
      games: (game: ReturnType<typeof makeRecord>["games"][number]) => [
        game,
        { ...game },
      ],
    },
    {
      kind: "conflicting identity",
      games: (game: ReturnType<typeof makeRecord>["games"][number]) => [
        { ...game, gameId: "other", presentationRevision: 0 },
      ],
    },
    {
      kind: "authored title",
      games: (game: ReturnType<typeof makeRecord>["games"][number]) => [
        { ...game, title: "Legacy final" },
      ],
    },
    {
      kind: "authored default team name",
      games: (game: ReturnType<typeof makeRecord>["games"][number]) => [
        { ...game, teamNames: { 1: "Storm" } },
      ],
    },
    {
      kind: "revisioned clear",
      games: (game: ReturnType<typeof makeRecord>["games"][number]) => [
        { ...game, presentationRevision: 1 },
      ],
    },
    {
      kind: "missing boundary",
      games: (game: ReturnType<typeof makeRecord>["games"][number]) => [
        { ...game, startMs: 1000 },
      ],
    },
    {
      kind: "duplicate stable identity",
      games: (game: ReturnType<typeof makeRecord>["games"][number]) => [
        { ...game, gameId: "game", presentationRevision: 0 },
        { ...game, gameId: "game", presentationRevision: 0 },
      ],
    },
  ])("does not adopt a sidecar with $kind", async ({ games }) => {
    const record = makeGameRecord("conflicting.rec");
    const file = path.join(dir, record.filename);
    await fsp.writeFile(file, new Uint8Array([1, 2, 3]));
    await fsp.writeFile(`${file}.json`, JSON.stringify(record));
    const backfilled = {
      ...makeRecord(record.filename),
      games: games(makeRecord(record.filename).games[0]),
    };
    const body = JSON.stringify(backfilled);
    const publishCheckpoints = vi.fn(async () => {
      storedSidecars.set(`demos/${record.filename}.json`, { body, version: 0 });
    });
    const uploader = new DemoUploader(config, dir, { publishCheckpoints });
    uploader.enqueue(file);
    await vi.waitFor(() => expect(uploader.getStats().failed).toBe(1));
    expect(uploader.getStats().lastError?.message).toContain(
      "The recorded game identity changed",
    );
    expect(storedSidecars.get(`demos/${record.filename}.json`)!.body).toBe(
      body,
    );
    expect(storedIndex).toBeNull();
    expect(
      s3Commands.filter((command) => command.type === "PutObject"),
    ).toEqual([]);
    await expect(fsp.access(file)).resolves.toBeUndefined();
  });

  it("retains the demo and generated checkpoints when checkpoint upload fails", async () => {
    const file = path.join(dir, "retry.rec");
    await fsp.writeFile(file, new Uint8Array([1]));
    const publishCheckpoints = vi.fn(async (): Promise<void> => {
      await fsp.writeFile(`${file}.checkpoints.json`, "{}");
      throw new Error("checkpoint upload failed");
    });
    const uploader = new DemoUploader(config, dir, { publishCheckpoints });
    uploader.enqueue(file);
    await vi.waitFor(() => expect(uploader.getStats().failed).toBe(1));
    expect(await fsp.readdir(dir)).toEqual([
      "retry.rec",
      "retry.rec.checkpoints.json",
    ]);
    expect(storedIndex).toBeNull();
    publishCheckpoints.mockImplementationOnce(async () => {});
    await uploader.sweep();
    await vi.waitFor(async () => expect(await fsp.readdir(dir)).toEqual([]));
    expect(publishCheckpoints).toHaveBeenCalledTimes(2);
  });

  it("never generates checkpoints for unreadable failed spools", async () => {
    const file = path.join(dir, "bad.rec.partial.failed");
    await fsp.writeFile(file, new Uint8Array([1]));
    const publishCheckpoints = vi.fn();
    new DemoUploader(config, dir, { publishCheckpoints }).enqueue(file);
    await vi.waitFor(async () => expect(await fsp.readdir(dir)).toEqual([]));
    expect(publishCheckpoints).not.toHaveBeenCalled();
  });

  it("sweep removes stale orphan sidecars, keeps fresh ones", async () => {
    const staleOrphan = path.join(dir, "gone.rec.json");
    const freshOrphan = path.join(dir, "racing.rec.json");
    await fsp.writeFile(staleOrphan, "{}");
    const checkpointOrphan = path.join(dir, "gone.rec.checkpoints.json");
    const temporaryOrphan = `${checkpointOrphan}.tmp`;
    await fsp.writeFile(checkpointOrphan, "{}");
    await fsp.writeFile(temporaryOrphan, "partial");
    await fsp.writeFile(freshOrphan, "{}");
    const past = new Date(Date.now() - 10 * 60_000);
    await fsp.utimes(staleOrphan, past, past);
    await fsp.utimes(checkpointOrphan, past, past);
    await fsp.utimes(temporaryOrphan, past, past);
    const uploader = new DemoUploader(config, dir);
    await uploader.sweep();
    await settle();
    expect(await fsp.readdir(dir)).toEqual(["racing.rec.json"]);
    expect(uploadCalls).toEqual([]);
  });

  it("keeps the file on failure; sweep re-enqueues and retries", async () => {
    const filePath = path.join(dir, "keepme.rec");
    await fsp.writeFile(filePath, new Uint8Array([1]));
    const uploader = new DemoUploader(config, dir);
    failUploads = true;
    uploader.enqueue(filePath);
    await vi.waitFor(() => expect(uploadCalls).toHaveLength(1));
    await settle();
    await expect(fsp.access(filePath)).resolves.toBeUndefined();
    expect(uploader.getStats()).toMatchObject({
      uploaded: 0,
      failed: 1,
      lastError: { file: "keepme.rec", message: "Error: upload failed" },
    });

    failUploads = false;
    await uploader.sweep();
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toHaveLength(2);
  });

  it("sweep sets aside unreadable .partial debris and enqueues completed demos", async () => {
    const partial = path.join(dir, "crashed.rec.partial");
    const complete = path.join(dir, "complete.rec");
    await fsp.writeFile(partial, new Uint8Array([1]));
    await fsp.writeFile(complete, new Uint8Array([1]));
    // Age the partial past the staleness threshold (crash debris).
    const past = new Date(Date.now() - 10 * 60_000);
    await fsp.utimes(partial, past, past);
    const uploader = new DemoUploader(config, dir);
    await uploader.sweep();

    // The unreadable spool is parked in the bucket under failed/ (no
    // sidecar, no index entry) and leaves the volume with the demo.
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toEqual([
      { Bucket: "t2-demos", Key: "demos/complete.rec" },
      { Bucket: "t2-demos", Key: "demos/failed/crashed.rec.partial.failed" },
    ]);
    expect(s3Commands.filter((c) => c.type === "PutObject")).toEqual([]);
  });

  it("sweep salvages a cold crashed spool and uploads the demo", async () => {
    const finalPath = path.join(dir, "crashed.rec");
    const writer = new DemoFileWriter(finalPath, { flushIntervalMs: 0 });
    writer.begin(
      buildInitialBlock({
        connectSequence: 1,
        missionName: "Katabatic",
        demoValues: buildDemoValues({
          recorderName: "Observer",
          serverName: "the cut",
          serverAddress: "1.2.3.4:28000",
          date: new Date(),
          missionDisplayName: "Katabatic",
          mod: "classic",
          gameType: "Capture the Flag",
        }),
      }),
    );
    for (let i = 0; i < 3; i++) writer.writeMove();
    await writer.strand();
    const past = new Date(Date.now() - 10 * 60_000);
    await fsp.utimes(writer.partialPath, past, past);

    const uploader = new DemoUploader(config, dir, { salvageMinLengthMs: 64 });
    await uploader.sweep();
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual([]);
    });
    expect(uploadCalls).toEqual([
      { Bucket: "t2-demos", Key: "demos/crashed.rec" },
    ]);
    const sidecar = s3Commands.find(
      (c) => c.type === "PutObject" && c.input.Key === "demos/crashed.rec.json",
    );
    expect(sidecar).toBeDefined();
    expect(JSON.parse(sidecar!.input.Body!)).toMatchObject({
      server: "the cut",
      durationMs: 96,
      players: [],
    });
  });

  it("sweep leaves fresh .partial files alone (live spools)", async () => {
    const partial = path.join(dir, "recording.rec.partial");
    await fsp.writeFile(partial, new Uint8Array([1]));
    const uploader = new DemoUploader(config, dir);
    await uploader.sweep();
    await settle();
    expect(await fsp.readdir(dir)).toEqual(["recording.rec.partial"]);
    expect(uploadCalls).toEqual([]);
  });

  it("sweep never removes a live recorder's spool, however stale its mtime", async () => {
    // Deflate only emits once its symbol buffer fills: a quiet live spool
    // can sit unwritten past the staleness window. Ownership, not mtime,
    // is what protects it.
    const live = path.join(dir, "live.rec.partial");
    const debris = path.join(dir, "crashed.rec.partial");
    const past = new Date(Date.now() - 60 * 60_000);
    for (const file of [live, debris]) {
      await fsp.writeFile(file, new Uint8Array([1]));
      await fsp.utimes(file, past, past);
    }
    const uploader = new DemoUploader(config, dir, {
      isLive: (filePath) => filePath === live,
    });
    await uploader.sweep();
    await settle();
    // The debris (not a valid spool) is parked in the bucket; the live
    // spool is untouched.
    await vi.waitFor(async () => {
      expect(await fsp.readdir(dir)).toEqual(["live.rec.partial"]);
    });
    expect(uploadCalls).toEqual([
      { Bucket: "t2-demos", Key: "demos/failed/crashed.rec.partial.failed" },
    ]);
  });

  it("does nothing without config (demos stay local)", async () => {
    const filePath = path.join(dir, "local.rec");
    await fsp.writeFile(filePath, new Uint8Array([1]));
    const uploader = new DemoUploader(null, dir);
    expect(uploader.enabled).toBe(false);
    uploader.enqueue(filePath);
    await uploader.sweep();
    await settle();
    expect(uploadCalls).toEqual([]);
    await expect(fsp.access(filePath)).resolves.toBeUndefined();
  });
});
