import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Database from "better-sqlite3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { afterEach, expect, it, vi } from "vitest";
import { migrateAccountSchema } from "./accountDatabase.js";
import type { AccountUser } from "./accountTypes.js";
import { Clips, type ClipsOptions } from "./clips.js";
import type {
  ClipCreateRequest,
  ClipPage,
  ClipTake,
  ClipView,
} from "./clipTypes.js";
import { DEMO_CHECKPOINT_VERSION } from "../src/stream/demoCheckpoints";

const ORIGIN = "https://play.tribes2.online";
const OWNER = "126767979894407168";
const OTHER = "234567890123456789";
const SOURCE_ETAG = '"source"';
const account: AccountUser = {
  id: "user",
  name: "Tester",
  image: null,
  discordId: OWNER,
  discordUsername: "tester",
  t2AccountNames: [],
  t2Profile: null,
  role: "user",
};
const fixtures: Array<{ close(): Promise<void> }> = [];
const releases: Array<() => void> = [];

afterEach(async () => {
  for (const release of releases.splice(0)) release();
  for (const fixture of fixtures.splice(0)) await fixture.close();
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  releases.push(resolve);
  return { promise, resolve };
}

function take(sourceDemo = "match.rec"): ClipTake {
  return {
    version: 1,
    sourceDemo,
    samples: [0, 1000].map((timeMs) => ({
      timeMs,
      demoTimeSec: 10 + timeMs / 1000,
      position: [timeMs, 0, 10],
      quaternion: [0, 0, 0, 1],
      fov: 60,
      aspect: 16 / 9,
      projection: "perspective",
      cameraMode: "freeFly",
      targetId: null,
      flagSlot: null,
      rate: 1,
      playing: true,
    })),
  };
}

function payload(sourceDemo = "match.rec"): ClipCreateRequest {
  return {
    requestId: randomUUID(),
    sourceSha256: "a".repeat(64),
    take: take(sourceDemo),
    trimStartMs: 250,
    trimEndMs: 750,
  };
}

async function fixture() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys=ON");
  database.exec(
    'CREATE TABLE "user" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL); CREATE TABLE "account" ("userId" TEXT, "providerId" TEXT, "accountId" TEXT);',
  );
  database.transaction(() => migrateAccountSchema(database))();
  const objects = new Map<
    string,
    { body: string; etag: string; metadata?: Record<string, string> }
  >([
    ["demos/match.rec", { body: "recording", etag: SOURCE_ETAG }],
    [
      "demos/match.rec.json",
      {
        body: JSON.stringify({
          filename: "match.rec",
          recordedAt: "2026-11-14T20:00:00.000Z",
          games: [
            {
              mission: "S5-Damnation",
              gameType: "Capture the Flag",
              startMs: 0,
            },
          ],
        }),
        etag: '"metadata"',
      },
    ],
  ]);
  const getAccount = vi.fn<ClipsOptions["getAccount"]>(async () => account);
  const prepare: ReturnType<typeof vi.fn<ClipsOptions["prepare"]>> = vi.fn(
    async (options) => {
      options.signal?.throwIfAborted();
      return {
        text: '{"checkpoint":"prepared"}',
        sourceSha256: "a".repeat(64),
        sourceBytes: 9,
      };
    },
  );
  const send = vi.fn(
    async (command: unknown, options?: { abortSignal?: AbortSignal }) => {
      options?.abortSignal?.throwIfAborted();
      if (command instanceof PutObjectCommand) {
        const { Key, Body } = command.input;
        objects.set(Key!, {
          body: String(Body),
          etag: '"asset"',
          metadata: command.input.Metadata,
        });
        return {};
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(command.input.Key!);
        return {};
      }
      if (
        command instanceof HeadObjectCommand ||
        command instanceof GetObjectCommand
      ) {
        const object = objects.get(command.input.Key!);
        if (!object)
          throw Object.assign(new Error("Missing"), { name: "NoSuchKey" });
        return {
          ETag: object.etag,
          Metadata: object.metadata,
          ContentLength: object.body.length,
          Body: { transformToString: async () => object.body },
        };
      }
      throw new Error("Unexpected storage request");
    },
  );
  let now = 1000;
  const options: ClipsOptions = {
    database,
    config: {
      endpoint: "https://storage.invalid",
      bucket: "public",
      prefix: "demos/",
      accessKeyId: "key",
      secretAccessKey: "secret",
    },
    assetRoot: "/assets",
    trustedOrigins: [ORIGIN],
    getAccount,
    prepare,
    client: { send } as unknown as S3Client,
    now: () => now,
  };
  let service = new Clips(options);
  service.start();
  const server: Server = createServer((req, res) => {
    void service
      .handle(req, res)
      .then((handled) => {
        if (!handled) {
          res.writeHead(404);
          res.end();
        }
      })
      .catch((error) => {
        res.writeHead(500);
        res.end(String(error));
      });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const request = (
    method: string,
    url = "/api/clips",
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}${url}`, {
      method,
      headers: {
        Origin: ORIGIN,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const rows = () =>
    database.prepare("SELECT * FROM clip ORDER BY createdAt,id").all() as Array<
      Record<string, unknown>
    >;
  const close = async () => {
    await service.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    database.close();
  };
  fixtures.push({ close });
  return {
    database,
    objects,
    getAccount,
    prepare,
    send,
    request,
    rows,
    options,
    get service() {
      return service;
    },
    advance(ms: number) {
      now += ms;
    },
    async restart() {
      await service.close();
      service = new Clips(options);
      service.start();
      await service.idle();
    },
  };
}

async function save(f: Awaited<ReturnType<typeof fixture>>, body = payload()) {
  const response = await f.request("POST", "/api/clips", body);
  expect(response.status).toBe(202);
  const clip = (await response.json()) as ClipView;
  await f.service.idle();
  return clip;
}

function clipRowSeeder(database: Database.Database) {
  const insert = database.prepare(
    `INSERT INTO clip (id,ownerDiscordId,requestId,payloadHash,sourceDemo,sourceETag,
      sourceSha256,title,createdAt,startSec,endSec,durationMs,state,checkpointVersion)
     VALUES (@id,@owner,@id,'private payload','match.rec',@etag,@sha,@id,@time,0,1,1000,@state,@version)`,
  );
  return (index: number, owner = OWNER, state = "ready", time = index) => {
    const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    insert.run({
      id,
      owner,
      state,
      time,
      etag: SOURCE_ETAG,
      sha: "a".repeat(64),
      version: DEMO_CHECKPOINT_VERSION,
    });
    return id;
  };
}

it("paginates ready clips globally and by creator, limiting management to the owner", async () => {
  const f = await fixture();
  f.database.exec(`
    INSERT INTO user (id, name) VALUES
      ('owner', 'Clip Creator'), ('other', 'Another Creator'), ('unrelated', 'Unrelated');
    INSERT INTO account (userId, providerId, accountId) VALUES
      ('owner', 'discord', '${OWNER}'), ('other', 'discord', '${OTHER}'),
      ('unrelated', 'other', '${OTHER}');
  `);
  const seed = clipRowSeeder(f.database);
  const ids: string[] = [];
  for (let index = 1; index <= 8; index++)
    ids.push(seed(index, OWNER, "ready", Math.min(index, 7)));
  const otherClip = seed(9, OTHER);
  seed(10, OWNER, "receiving");
  seed(11, OWNER, "processing");
  seed(12, OWNER, "failed");
  seed(13, OWNER, "deleting");
  f.getAccount.mockResolvedValue(null);
  const read = async (owner?: string, page?: number) => {
    const params = new URLSearchParams();
    if (owner) params.set("owner", owner);
    if (page) params.set("page", String(page));
    const response = await f.request("GET", `/api/clips?${params}`, undefined, {
      Origin: "",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    return response.json() as Promise<ClipPage>;
  };
  const first = await read(OWNER);
  expect(first).toMatchObject({ total: 8, pending: 2, page: 1, pageSize: 6 });
  expect(first.clips.map((clip) => clip.id)).toEqual(
    ids.toReversed().slice(0, 6),
  );
  expect(
    first.clips.every(
      (clip) => clip.ownerDiscordId === OWNER && clip.state === "ready",
    ),
  ).toBe(true);
  expect(first.clips.map((clip) => clip.startSec)).toEqual(Array(6).fill(0));
  expect(first.clips.map((clip) => clip.durationMs)).toEqual(
    Array(6).fill(1000),
  );
  expect(JSON.stringify(first)).not.toMatch(
    /sourceSha256|sourceETag|payloadHash|timeline/,
  );
  const last = await read(OWNER, 2);
  expect(last.clips.map((clip) => clip.id)).toEqual(ids.toReversed().slice(6));
  expect(await read(OWNER, 999)).toEqual(last);
  expect(await read(OTHER)).toMatchObject({
    total: 1,
    pending: 0,
    page: 1,
    pageSize: 6,
  });
  expect(await read("345678901234567890", 99)).toEqual({
    clips: [],
    total: 0,
    pending: 0,
    page: 1,
    pageSize: 6,
  });
  const feed = await read();
  expect(feed).toMatchObject({ total: 9, pending: 0, page: 1, pageSize: 6 });
  const allIds = [otherClip, ...ids.toReversed()];
  expect(feed.clips.map((clip) => clip.id)).toEqual(allIds.slice(0, 6));
  expect(feed.clips.map((clip) => clip.creatorName)).toEqual([
    "Another Creator",
    ...Array(5).fill("Clip Creator"),
  ]);
  const lastFeed = await read(undefined, 2);
  expect(lastFeed.clips.map((clip) => clip.id)).toEqual(allIds.slice(6));
  expect(await read(undefined, 999)).toEqual(lastFeed);
  f.database
    .prepare("INSERT INTO account VALUES ('unrelated', 'discord', ?)")
    .run(OTHER);
  const ambiguous = await read();
  expect(ambiguous.clips.map((clip) => clip.id)).toEqual(allIds.slice(0, 6));
  expect(ambiguous.clips[0]).not.toHaveProperty("creatorName");
  expect(f.getAccount).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();

  const manage = () => f.request("GET", `/api/clips?owner=${OWNER}&manage=1`);
  expect((await manage()).status).toBe(403);
  f.getAccount.mockResolvedValue({ ...account, discordId: OTHER });
  expect((await manage()).status).toBe(403);
  f.getAccount.mockResolvedValue(account);
  const managed = (await (await manage()).json()) as ClipPage;
  expect(managed).toMatchObject({ total: 11, pending: 2, page: 1 });
  expect(managed.clips.slice(0, 3).map((clip) => clip.state)).toEqual([
    "failed",
    "processing",
    "processing",
  ]);
  expect(managed.clips.every((clip) => clip.ownerDiscordId === OWNER)).toBe(
    true,
  );
  const deleted = await f.request(
    "DELETE",
    `/api/clips/${managed.clips[0].id}`,
  );
  expect(deleted.status).toBe(202);
  expect(((await (await manage()).json()) as ClipPage).total).toBe(10);
});

it("returns the latest 1,000 ready clips in a single public request", async () => {
  const f = await fixture();
  const seed = clipRowSeeder(f.database);
  const ids = Array.from({ length: 1002 }, (_, i) =>
    seed(i + 1, i % 2 ? OTHER : OWNER, "ready", Math.min(i + 1, 1001)),
  );
  seed(1003, OWNER, "processing");
  seed(1004, OTHER, "failed");
  seed(1005, OWNER, "deleting");
  f.getAccount.mockResolvedValue(null);

  const response = await f.request("GET", "/api/clips?limit=1000");
  expect(response.status).toBe(200);
  const feed = (await response.json()) as ClipPage;
  expect(feed).toMatchObject({
    total: 1002,
    pending: 0,
    page: 1,
    pageSize: 1000,
  });
  expect(feed.clips.map((clip) => clip.id)).toEqual(
    ids.toReversed().slice(0, 1000),
  );
  expect(feed.clips.every((clip) => clip.state === "ready")).toBe(true);
  expect(f.getAccount).not.toHaveBeenCalled();
  expect(f.send).not.toHaveBeenCalled();
});

it.each([
  "?manage=1",
  "?owner=bad",
  "?page=0",
  "?limit=0",
  "?limit=2.5",
  "?limit=1001",
  `?owner=${OWNER}&page=0`,
  `?owner=${OWNER}&page=-1`,
  `?owner=${OWNER}&page=1.5`,
  `?owner=${OWNER}&page=nope`,
  `?owner=${OWNER}&page=1000001`,
  `?owner=${OWNER}&limit=1000`,
])("rejects invalid clip pagination or ownership %s", async (query) => {
  const f = await fixture();
  expect((await f.request("GET", `/api/clips${query}`)).status).toBe(400);
  expect(f.send).not.toHaveBeenCalled();
});

it("reads ready clip status without downloading its camera timeline", async () => {
  const f = await fixture();
  const clip = await save(f);
  f.send.mockClear();
  const response = await f.request("GET", `/api/clips/${clip.id}?summary=1`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    id: clip.id,
    state: "ready",
    startSec: 10.25,
    durationMs: 500,
  });
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
});

it.each([
  { name: "paused", speed: 0, start: 10, end: 10 },
  { name: "fast playback", speed: 4, start: 11, end: 13 },
])(
  "persists recorded duration independently of $name source time",
  async ({ speed, start, end }) => {
    const f = await fixture();
    const body = payload();
    body.take.samples = body.take.samples.map((sample) => ({
      ...sample,
      demoTimeSec: 10 + (sample.timeMs * speed) / 1000,
      rate: Math.max(1, speed),
      playing: speed > 0,
    }));
    const clip = await save(f, body);
    expect(clip.durationMs).toBe(500);
    expect(f.rows()[0]).toMatchObject({
      startSec: start,
      endSec: end,
      durationMs: 500,
    });
  },
);

it("backfills legacy clip duration once after restart without rebuilding checkpoints", async () => {
  const f = await fixture();
  const clip = await save(f);
  f.database
    .prepare("UPDATE clip SET durationMs=NULL,retryAt=999999 WHERE id=?")
    .run(clip.id);
  f.prepare.mockClear();
  f.send.mockClear();
  await f.restart();
  expect(f.rows()[0]).toMatchObject({
    state: "ready",
    durationMs: 500,
    attempts: 0,
    retryAt: 0,
  });
  expect(f.prepare).not.toHaveBeenCalled();
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  f.send.mockClear();
  const page = (await (
    await f.request("GET", `/api/clips?owner=${OWNER}`)
  ).json()) as ClipPage;
  expect(page).toMatchObject({
    pending: 0,
    clips: [{ id: clip.id, durationMs: 500 }],
  });
  expect(f.send).not.toHaveBeenCalled();
  await f.restart();
  expect(f.send).not.toHaveBeenCalled();
});

it.each(["invalid json", JSON.stringify(take("other.rec"))])(
  "bounds malformed duration recovery without hiding the ready clip: %s",
  async (timeline) => {
    const f = await fixture();
    const clip = await save(f);
    f.database
      .prepare("UPDATE clip SET durationMs=NULL WHERE id=?")
      .run(clip.id);
    f.objects.set(`demos/clips/${clip.id}/timeline.json`, {
      body: timeline,
      etag: '"bad"',
    });
    f.prepare.mockClear();
    for (let attempts = 1; attempts <= 3; attempts++) {
      await f.restart();
      expect(f.rows()[0]).toMatchObject({
        state: "ready",
        durationMs: null,
        attempts,
      });
      const page = (await (
        await f.request("GET", `/api/clips?owner=${OWNER}`)
      ).json()) as ClipPage;
      expect(page.total).toBe(1);
      expect(page.pending).toBe(attempts < 3 ? 1 : 0);
      expect(page.clips[0].durationMs).toBeUndefined();
    }
    f.send.mockClear();
    await f.restart();
    expect(f.send).not.toHaveBeenCalled();
    expect(f.prepare).not.toHaveBeenCalled();
  },
);

it("requires a signed-in owner and trusted mutation origin", async () => {
  const f = await fixture();
  f.getAccount.mockResolvedValue(null);
  expect((await f.request("POST", "/api/clips", payload())).status).toBe(401);
  f.getAccount.mockResolvedValue(account);
  expect(
    (
      await f.request("POST", "/api/clips", payload(), {
        Origin: "https://evil.invalid",
      })
    ).status,
  ).toBe(403);
  expect(
    (await f.request("POST", "/api/clips", payload(), { Origin: "" })).status,
  ).toBe(403);
  expect(f.rows()).toEqual([]);
  expect(f.send).not.toHaveBeenCalled();
});

it.each([
  "blob:local",
  "sources/tribesforever/123.rec",
  "https://external.invalid/game.rec",
  "../private.rec",
])("rejects nonhosted source %s", async (source) => {
  const f = await fixture();
  expect((await f.request("POST", "/api/clips", payload(source))).status).toBe(
    400,
  );
  expect(f.send).not.toHaveBeenCalled();
  expect(f.rows()).toEqual([]);
});

it("trims camera data, generates its own title and serves a ready clip/checkpoint to anonymous viewers", async () => {
  const f = await fixture();
  const body = { ...payload(), title: "CLIENT TITLE MUST NOT APPEAR" };
  body.take.hud = {
    showChat: false,
    chatHudStyle: "transparent",
    showMatchHud: true,
    matchHudStyle: "broadcast",
  };
  body.take.graphicsEffects = {
    intensity: { bloom: 0.4, tiltShift: 0.6 },
    grade: { name: "Kodak Portra 160 NC", intensity: 0.5 },
  };
  const created = await save(f, body);
  expect(f.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      sourceDemo: "match.rec",
      sourceETag: SOURCE_ETAG,
      startSec: 10.25,
      endSec: 10.75,
      assetRoot: "/assets",
    }),
  );
  f.getAccount.mockResolvedValue(null);
  const response = await f.request("GET", `/api/clips/${created.id}`);
  expect(response.status).toBe(200);
  const clip = (await response.json()) as ClipView;
  expect(clip).toMatchObject({
    state: "ready",
    ownerDiscordId: OWNER,
    sourceDemo: "match.rec",
    title: "Clip of S5-Damnation CTF from Sat, Nov 14, 2026",
  });
  expect(
    clip.timeline?.samples.map((sample) => [
      sample.timeMs,
      sample.demoTimeSec,
      sample.position[0],
    ]),
  ).toEqual([
    [0, 10.25, 250],
    [500, 10.75, 750],
  ]);
  expect(JSON.stringify(clip)).not.toContain("CLIENT TITLE");
  const presentation = {
    hud: body.take.hud,
    graphicsEffects: body.take.graphicsEffects,
  };
  expect(clip.timeline).toMatchObject(presentation);
  expect(
    JSON.parse(f.objects.get(`demos/clips/${created.id}/timeline.json`)!.body),
  ).toMatchObject(presentation);
  const checkpoint = await f.request("GET", clip.checkpointUrl);
  expect(checkpoint.status).toBe(200);
  expect(await checkpoint.text()).toBe('{"checkpoint":"prepared"}');
  expect(checkpoint.headers.get("Cache-Control")).toBe("no-store");
  expect(
    [...f.objects.keys()].filter((key) => key.startsWith("demos/match.rec.")),
  ).toEqual(["demos/match.rec.json"]);
});

it("titles the map at the trimmed start and reuses the stored title on retries", async () => {
  const f = await fixture();
  f.objects.set("demos/match.rec.json", {
    body: JSON.stringify({
      filename: "match.rec",
      recordedAt: "2026-11-14T20:00:00.000Z",
      games: [
        { mission: "First map", gameType: "CTF", startMs: 0 },
        { mission: "Next map", gameType: "Team Deathmatch", startMs: 10_500 },
      ],
    }),
    etag: '"metadata"',
  });
  const body = { ...payload(), trimStartMs: 750, trimEndMs: 1000 };
  const created = await save(f, body);
  expect(created.title).toBe("Clip of Next map TDM from Sat, Nov 14, 2026");
  const metadataRequests = () =>
    f.send.mock.calls.filter(
      ([command]) =>
        command instanceof GetObjectCommand &&
        command.input.Key === "demos/match.rec.json",
    );
  expect(metadataRequests()).toHaveLength(1);
  f.objects.delete("demos/match.rec.json");
  const retried = await save(f, body);
  expect(retried.title).toBe(created.title);
  expect(metadataRequests()).toHaveLength(1);
});

it.each([null, "invalid json", JSON.stringify({ filename: "wrong.rec" })])(
  "still saves a clip when its metadata is unavailable or invalid: %s",
  async (metadata) => {
    const f = await fixture();
    if (metadata === null) f.objects.delete("demos/match.rec.json");
    else
      f.objects.set("demos/match.rec.json", { body: metadata, etag: '"bad"' });
    const created = await save(f, payload());
    expect(created.title).toBe("Tribes 2 clip");
    expect(created.state).toBe("processing");
  },
);

it("uses legacy map metadata without inventing a recording date", async () => {
  const f = await fixture();
  f.objects.set("demos/match.rec.json", {
    body: JSON.stringify({
      filename: "match.rec",
      mission: "DX",
      gameType: "Capture the Flag",
      recordedAt: "not a date",
    }),
    etag: '"legacy"',
  });
  expect((await save(f, payload())).title).toBe("Clip of DX CTF");
});

it("rejects invalid HUD settings before creating or processing a clip", async () => {
  const f = await fixture();
  const body = payload();
  const response = await f.request("POST", "/api/clips", {
    ...body,
    take: {
      ...body.take,
      hud: { showChat: false, showMatchHud: true, matchHudStyle: "invalid" },
    },
  });
  expect(response.status).toBe(400);
  expect(f.rows()).toEqual([]);
  expect(f.send).not.toHaveBeenCalled();
  expect(f.prepare).not.toHaveBeenCalled();
});

it("supports clipping another user's uploaded recording", async () => {
  const f = await fixture();
  const source = `users/${OTHER}/uploaded.rec`;
  f.objects.set(`demos/${source}`, { body: "recording", etag: SOURCE_ETAG });
  const clip = await save(f, payload(source));
  expect(clip.ownerDiscordId).toBe(OWNER);
  expect(f.prepare).toHaveBeenCalledWith(
    expect.objectContaining({ sourceDemo: source }),
  );
});

it("deduplicates a repeated create request and rejects reuse for a different trim", async () => {
  const f = await fixture();
  const body = payload();
  const first = await save(f, body);
  const repeated = await save(f, body);
  expect(repeated.id).toBe(first.id);
  expect(f.rows()).toHaveLength(1);
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(
    (await f.request("POST", "/api/clips", { ...body, trimStartMs: 0 })).status,
  ).toBe(409);
  expect(f.rows()).toHaveLength(1);
  expect(
    (
      await f.request("POST", "/api/clips", {
        ...body,
        sourceSha256: "b".repeat(64),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.request("POST", "/api/clips", {
        ...body,
        take: {
          ...body.take,
          hud: {
            showChat: false,
            showMatchHud: false,
            matchHudStyle: "classic",
          },
        },
      })
    ).status,
  ).toBe(409);
});

it("does not publish a checkpoint for source bytes different from the recording the client watched", async () => {
  const f = await fixture();
  f.prepare.mockResolvedValue({
    text: "wrong source checkpoint",
    sourceSha256: "b".repeat(64),
    sourceBytes: 9,
  });
  const clip = await save(f);
  expect(f.rows()[0].state).not.toBe("ready");
  expect(f.rows()[0].checkpointVersion).toBeNull();
  expect(f.objects.has(`demos/clips/${clip.id}/checkpoint.json`)).toBe(false);
  expect(
    f.send.mock.calls.some(
      ([command]) =>
        command instanceof PutObjectCommand &&
        command.input.Key?.endsWith("checkpoint.json"),
    ),
  ).toBe(false);
});

it("deduplicates simultaneous retries while the timeline PUT is still pending", async () => {
  const f = await fixture();
  const entered = deferred(),
    release = deferred();
  const send = f.send.getMockImplementation()!;
  f.send.mockImplementation(async (command) => {
    if (
      command instanceof PutObjectCommand &&
      command.input.Key?.endsWith("timeline.json")
    ) {
      entered.resolve();
      await release.promise;
    }
    return send(command);
  });
  const body = payload();
  const first = f.request("POST", "/api/clips", body);
  await entered.promise;
  const second = f.request("POST", "/api/clips", body);
  await vi.waitFor(() => expect(f.getAccount).toHaveBeenCalledTimes(2));
  release.resolve();
  const responses = await Promise.all([first, second]);
  expect(responses.map((response) => response.status)).toEqual([202, 202]);
  const clips = await Promise.all(
    responses.map((response) => response.json() as Promise<ClipView>),
  );
  expect(clips[0].id).toBe(clips[1].id);
  await f.service.idle();
  expect(f.rows()).toHaveLength(1);
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(
    f.send.mock.calls.filter(
      ([command]) =>
        command instanceof PutObjectCommand &&
        command.input.Key?.endsWith("timeline.json"),
    ),
  ).toHaveLength(1);
});

it("continues queued cleanup past a full batch of in-flight timeline uploads", async () => {
  const f = await fixture();
  const clip = await save(f);
  f.database.prepare("UPDATE clip SET createdAt=2000 WHERE id=?").run(clip.id);
  const entered = deferred(),
    release = deferred();
  const send = f.send.getMockImplementation()!;
  let uploading = 0;
  f.send.mockImplementation(async (command, options) => {
    if (
      command instanceof PutObjectCommand &&
      command.input.Key?.endsWith("timeline.json")
    ) {
      if (++uploading === 32) entered.resolve();
      await release.promise;
    }
    return send(command, options);
  });
  f.getAccount.mockImplementation(async (headers) => ({
    ...account,
    discordId:
      typeof headers["x-test-owner"] === "string"
        ? headers["x-test-owner"]
        : OWNER,
  }));
  const requests = Array.from({ length: 32 }, (_, index) =>
    f.request("POST", "/api/clips", payload(), {
      "x-test-owner": String(100000000000000000n + BigInt(index)),
    }),
  );
  await entered.promise;
  expect((await f.request("DELETE", `/api/clips/${clip.id}`)).status).toBe(202);
  await f.service.idle();
  expect(f.rows().find((row) => row.id === clip.id)).toBeUndefined();
  expect(f.rows()).toHaveLength(32);
  expect(f.prepare).toHaveBeenCalledOnce();
  release.resolve();
  expect(
    (await Promise.all(requests)).every((response) => response.status === 202),
  ).toBe(true);
  await f.service.idle();
  expect(f.rows().every((row) => row.state === "ready")).toBe(true);
});

it("unlists clips for a deleted upload and prevents a pending job from relisting them", async () => {
  const f = await fixture();
  const sourceDemo = `users/${OWNER}/upload.rec`;
  const sourceKey = `demos/${sourceDemo}`;
  f.objects.set(sourceKey, f.objects.get("demos/match.rec")!);
  const ready = await save(f, payload(sourceDemo));
  const unrelated = await save(f);

  const validating = deferred();
  const release = deferred();
  const send = f.send.getMockImplementation()!;
  f.send.mockImplementation(async (command, options) => {
    const response = await send(command, options);
    if (
      command instanceof HeadObjectCommand &&
      command.input.Key === sourceKey &&
      f.prepare.mock.calls.length === 3
    ) {
      validating.resolve();
      await release.promise;
    }
    return response;
  });
  const pending = await f.request("POST", "/api/clips", payload(sourceDemo));
  expect(pending.status).toBe(202);
  const { id } = (await pending.json()) as ClipView;
  await validating.promise;

  f.objects.delete(sourceKey);
  f.service.sourceDeleted(sourceDemo);
  release.resolve();
  await f.service.idle();

  const feed = (await (await f.request("GET")).json()) as ClipPage;
  expect(feed.total).toBe(1);
  expect(feed.clips.map((clip) => clip.id)).toEqual([unrelated.id]);
  for (const clipId of [ready.id, id]) {
    expect(f.rows().find((row) => row.id === clipId)).toMatchObject({
      state: "failed",
      error: "The clip source has changed or been removed",
    });
    expect(f.objects.has(`demos/clips/${clipId}/checkpoint.json`)).toBe(true);
  }
});

it.each(["changed", "deleted"])(
  "does not serve a clip whose source was %s",
  async (change) => {
    const f = await fixture();
    const clip = await save(f);
    if (change === "deleted") f.objects.delete("demos/match.rec");
    else
      f.objects.set("demos/match.rec", { body: "new source", etag: '"new"' });
    expect((await f.request("GET", `/api/clips/${clip.id}`)).status).toBe(410);
    expect(
      (await f.request("GET", `/api/clips/${clip.id}/checkpoint`)).status,
    ).toBe(410);
    expect(f.rows()[0]).toMatchObject({ state: "failed" });
    const listing = await f.request("GET", `/api/clips?owner=${OWNER}`);
    expect(await listing.json()).toMatchObject({
      clips: [],
      total: 0,
      pending: 0,
    });
  },
);

it.each(["timeline", "checkpoint", "summary"])(
  "does not serve a %s response after the clip is deleted during its storage read",
  async (asset) => {
    const f = await fixture();
    const clip = await save(f);
    const reading = deferred(),
      release = deferred();
    const send = f.send.getMockImplementation()!;
    f.send.mockImplementation(async (command, options) => {
      const response = await send(command, options);
      if (
        asset === "summary"
          ? command instanceof HeadObjectCommand
          : command instanceof GetObjectCommand &&
            command.input.Key === `demos/clips/${clip.id}/${asset}.json`
      ) {
        reading.resolve();
        await release.promise;
      }
      return response;
    });
    const suffix =
      asset === "checkpoint"
        ? "/checkpoint"
        : asset === "summary"
          ? "?summary=1"
          : "";
    const request = f.request("GET", `/api/clips/${clip.id}${suffix}`);
    await reading.promise;
    expect((await f.request("DELETE", `/api/clips/${clip.id}`)).status).toBe(
      202,
    );
    await f.service.idle();
    expect(f.rows()).toEqual([]);
    release.resolve();
    expect((await request).status).toBe(404);
  },
);

it.each(["timeline", "checkpoint"])(
  "does not serve a stale %s when checkpoint rebuilding begins during its read",
  async (asset) => {
    const f = await fixture();
    const clip = await save(f);
    const reading = deferred(),
      releaseRead = deferred(),
      preparing = deferred(),
      releasePrepare = deferred();
    const send = f.send.getMockImplementation()!;
    let held = false;
    f.send.mockImplementation(async (command, options) => {
      const response = await send(command, options);
      if (
        !held &&
        command instanceof GetObjectCommand &&
        command.input.Key === `demos/clips/${clip.id}/${asset}.json`
      ) {
        held = true;
        reading.resolve();
        await releaseRead.promise;
      }
      return response;
    });
    f.prepare.mockImplementationOnce(async () => {
      preparing.resolve();
      await releasePrepare.promise;
      return { text: "repaired", sourceSha256: "a".repeat(64), sourceBytes: 9 };
    });
    const request = f.request(
      "GET",
      `/api/clips/${clip.id}${asset === "checkpoint" ? "/checkpoint" : ""}`,
    );
    await reading.promise;
    f.objects.delete(`demos/clips/${clip.id}/checkpoint.json`);
    expect(
      (await f.request("GET", `/api/clips/${clip.id}/checkpoint`)).status,
    ).toBe(409);
    await preparing.promise;
    releaseRead.resolve();
    const response = await request;
    if (asset === "checkpoint") expect(response.status).toBe(409);
    else {
      expect(response.status).toBe(200);
      const current = (await response.json()) as ClipView;
      expect(current.state).toBe("processing");
      expect(current.timeline).toBeUndefined();
    }
    releasePrepare.resolve();
    await f.service.idle();
    expect(f.rows()[0].state).toBe("ready");
  },
);

it.each(["receiving", "processing"])(
  "recovers durable %s work after restart",
  async (state) => {
    const f = await fixture();
    const clip = await save(f);
    f.database
      .prepare("UPDATE clip SET state=?,retryAt=? WHERE id=?")
      .run(state, 999999, clip.id);
    f.objects.delete(`demos/clips/${clip.id}/checkpoint.json`);
    await f.restart();
    expect(f.prepare).toHaveBeenCalledTimes(2);
    expect(
      (
        (await (
          await f.request("GET", `/api/clips/${clip.id}`)
        ).json()) as ClipView
      ).state,
    ).toBe("ready");
  },
);

it("retries preparation errors from durable state without resubmitting the camera data", async () => {
  const f = await fixture();
  f.prepare.mockRejectedValueOnce(new Error("Temporary worker failure"));
  const body = payload();
  const clip = await save(f, body);
  expect(f.rows()[0]).toMatchObject({ state: "processing", attempts: 1 });
  f.advance(30_001);
  await f.request("POST", "/api/clips", body);
  await f.service.idle();
  expect(f.prepare).toHaveBeenCalledTimes(2);
  expect(
    (
      (await (
        await f.request("GET", `/api/clips/${clip.id}`)
      ).json()) as ClipView
    ).state,
  ).toBe("ready");
});

it("aborts final source validation on shutdown and resumes the durable job after restart", async () => {
  const f = await fixture();
  const entered = deferred();
  const send = f.send.getMockImplementation()!;
  f.send.mockImplementation(async (command, options) => {
    if (command instanceof HeadObjectCommand && f.prepare.mock.calls.length) {
      entered.resolve();
      await new Promise<void>((_resolve, reject) => {
        const signal = options!.abortSignal!;
        if (signal.aborted) reject(signal.reason);
        else
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
      });
    }
    return send(command, options);
  });
  const created = await f.request("POST", "/api/clips", payload());
  expect(created.status).toBe(202);
  await entered.promise;
  await f.service.close();
  expect(f.rows()[0]).toMatchObject({
    state: "processing",
    checkpointVersion: null,
  });
  f.send.mockImplementation(send);
  await f.restart();
  expect(f.rows()[0]).toMatchObject({
    state: "ready",
    checkpointVersion: DEMO_CHECKPOINT_VERSION,
  });
  expect(f.prepare).toHaveBeenCalledTimes(2);
});

it.each(["checkpoint upload", "deletion"])(
  "retries a timed-out %s without blocking later work",
  async (operation) => {
    const f = await fixture();
    const body = payload();
    const clip = operation === "deletion" ? await save(f, body) : null;
    const entered = deferred();
    const deadline = new AbortController();
    const send = f.send.getMockImplementation()!;
    let pending = true;
    f.send.mockImplementation(async (command, options) => {
      if (
        pending &&
        (operation === "deletion"
          ? command instanceof DeleteObjectCommand
          : command instanceof PutObjectCommand &&
            command.input.Key?.endsWith("checkpoint.json"))
      ) {
        pending = false;
        entered.resolve();
        await new Promise<void>((_resolve, reject) => {
          options!.abortSignal!.addEventListener(
            "abort",
            () => reject(options!.abortSignal!.reason),
            { once: true },
          );
        });
      }
      return send(command, options);
    });
    const setDeadline = () =>
      vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(deadline.signal);
    if (operation === "deletion") {
      setDeadline();
      expect((await f.request("DELETE", `/api/clips/${clip!.id}`)).status).toBe(
        202,
      );
    } else {
      f.prepare.mockImplementationOnce(async () => {
        setDeadline();
        return {
          text: "checkpoint",
          sourceSha256: "a".repeat(64),
          sourceBytes: 9,
        };
      });
      expect((await f.request("POST", "/api/clips", body)).status).toBe(202);
    }
    await entered.promise;
    deadline.abort(new DOMException("Storage timed out", "TimeoutError"));
    await f.service.idle();
    expect(f.rows()[0]).toMatchObject({
      state: operation === "deletion" ? "deleting" : "processing",
      attempts: 1,
    });
    f.advance(30_001);
    if (operation === "deletion")
      await f.request("DELETE", `/api/clips/${clip!.id}`);
    else await f.request("POST", "/api/clips", body);
    await f.service.idle();
    if (operation === "deletion") expect(f.rows()).toEqual([]);
    else expect(f.rows()[0].state).toBe("ready");
  },
);

it("applies the pending-work quota when a failed clip is retried", async () => {
  const f = await fixture();
  const body = payload();
  const clip = await save(f, body);
  f.database.prepare("UPDATE clip SET state='failed' WHERE id=?").run(clip.id);
  const release = deferred();
  f.prepare.mockImplementation(async () => {
    await release.promise;
    return { text: "checkpoint", sourceSha256: "a".repeat(64), sourceBytes: 9 };
  });
  for (let index = 0; index < 3; index++)
    expect((await f.request("POST", "/api/clips", payload())).status).toBe(202);
  expect((await f.request("POST", "/api/clips", body)).status).toBe(429);
  expect(f.rows().find((row) => row.id === clip.id)?.state).toBe("failed");
  release.resolve();
  await f.service.idle();
});

it("rebuilds obsolete or missing checkpoint artifacts", async () => {
  const f = await fixture();
  const clip = await save(f);
  const setVersion = f.database.prepare(
    "UPDATE clip SET checkpointVersion=? WHERE id=?",
  );
  setVersion.run(DEMO_CHECKPOINT_VERSION, clip.id);
  expect(
    (
      (await (
        await f.request("GET", `/api/clips/${clip.id}`)
      ).json()) as ClipView
    ).state,
  ).toBe("ready");
  expect(f.prepare).toHaveBeenCalledOnce();
  setVersion.run(23, clip.id);
  const rebuilding = await f.request("GET", `/api/clips/${clip.id}`);
  expect(((await rebuilding.json()) as ClipView).state).toBe("processing");
  await f.service.idle();
  expect(f.prepare).toHaveBeenCalledTimes(2);
  f.objects.delete(`demos/clips/${clip.id}/checkpoint.json`);
  expect(
    (await f.request("GET", `/api/clips/${clip.id}/checkpoint`)).status,
  ).toBe(409);
  await f.service.idle();
  expect(f.prepare).toHaveBeenCalledTimes(3);
});

it("repairs the reported cached checkpoint once, even if the rebuilt bytes have the same ETag", async () => {
  const f = await fixture();
  const clip = await save(f);
  const path = clip.checkpointUrl;
  const cached = await f.request("GET", path);
  const report = (etag: string, version = DEMO_CHECKPOINT_VERSION) =>
    f.request(
      "POST",
      path +
        "?" +
        new URLSearchParams({ rejected: etag, version: String(version) }),
    );
  const etag = cached.headers.get("etag")!;
  expect(etag).toBe('"asset"');
  await report('"old"');
  await report(etag, DEMO_CHECKPOINT_VERSION - 1);
  expect(f.prepare).toHaveBeenCalledOnce();
  await Promise.all([report(etag), report(etag)]);
  await f.service.idle();
  expect(f.prepare).toHaveBeenCalledTimes(2);
  await report(etag);
  await f.service.idle();
  expect(f.prepare).toHaveBeenCalledTimes(2);
  expect((await f.request("GET", path)).status).toBe(200);
});

it("does not rebuild a missing checkpoint after its clip was deleted", async () => {
  const f = await fixture();
  const clip = await save(f);
  const reading = deferred(),
    releaseRead = deferred(),
    deleting = deferred(),
    releaseDelete = deferred();
  const send = f.send.getMockImplementation()!;
  f.send.mockImplementation(async (command) => {
    if (
      command instanceof GetObjectCommand &&
      command.input.Key === `demos/clips/${clip.id}/checkpoint.json`
    ) {
      reading.resolve();
      await releaseRead.promise;
      throw Object.assign(new Error("Missing"), { name: "NoSuchKey" });
    }
    if (command instanceof DeleteObjectCommand) {
      deleting.resolve();
      await releaseDelete.promise;
    }
    return send(command);
  });
  const checkpoint = f.request("GET", `/api/clips/${clip.id}/checkpoint`);
  await reading.promise;
  expect((await f.request("DELETE", `/api/clips/${clip.id}`)).status).toBe(202);
  await deleting.promise;
  releaseRead.resolve();
  expect((await checkpoint).status).toBe(404);
  expect(f.rows()[0].state).toBe("deleting");
  releaseDelete.resolve();
  await f.service.idle();
  expect(f.rows()).toEqual([]);
  expect(f.prepare).toHaveBeenCalledOnce();
  expect(
    [...f.objects.keys()].some((key) =>
      key.startsWith(`demos/clips/${clip.id}/`),
    ),
  ).toBe(false);
});

it("authorizes deletion by clip owner and cancels active preparation before removing artifacts", async () => {
  const f = await fixture();
  const entered = deferred(),
    release = deferred();
  f.prepare.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
    return {
      text: "late checkpoint",
      sourceSha256: "a".repeat(64),
      sourceBytes: 9,
    };
  });
  const response = await f.request("POST", "/api/clips", payload());
  expect(response.status).toBe(202);
  const clip = (await response.json()) as ClipView;
  await entered.promise;
  f.getAccount.mockResolvedValue({ ...account, discordId: OTHER });
  expect((await f.request("DELETE", `/api/clips/${clip.id}`)).status).toBe(404);
  f.getAccount.mockResolvedValue(account);
  expect((await f.request("DELETE", `/api/clips/${clip.id}`)).status).toBe(202);
  release.resolve();
  await f.service.idle();
  expect(f.rows()).toEqual([]);
  expect(
    [...f.objects.keys()].some((key) =>
      key.startsWith(`demos/clips/${clip.id}/`),
    ),
  ).toBe(false);
  expect(
    f.send.mock.calls.some(
      ([command]) =>
        command instanceof PutObjectCommand &&
        command.input.Key?.endsWith("checkpoint.json"),
    ),
  ).toBe(false);
});

it("does not resurrect a clip deleted while its timeline upload is pending", async () => {
  const f = await fixture();
  const entered = deferred(),
    release = deferred();
  const send = f.send.getMockImplementation()!;
  f.send.mockImplementation(async (command) => {
    if (
      command instanceof PutObjectCommand &&
      command.input.Key?.endsWith("timeline.json")
    ) {
      entered.resolve();
      await release.promise;
    }
    return send(command);
  });
  const creating = f.request("POST", "/api/clips", payload());
  await entered.promise;
  const id = f.rows()[0].id as string;
  expect((await f.request("DELETE", `/api/clips/${id}`)).status).toBe(202);
  release.resolve();
  const response = await creating;
  expect(response.status).toBe(404);
  await f.service.idle();
  expect(f.rows()).toEqual([]);
  expect(f.prepare).not.toHaveBeenCalled();
  expect(
    [...f.objects.keys()].some((key) => key.startsWith(`demos/clips/${id}/`)),
  ).toBe(false);
});
