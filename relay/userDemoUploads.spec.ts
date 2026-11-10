import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CHECKPOINT_INTERVAL_TICKS,
  DEMO_CHECKPOINT_VERSION,
} from "../src/stream/demoCheckpoints";
import type { AccountUser } from "./accountTypes.js";
import type { PreparedDemoCheckpoints } from "./demoCheckpointGenerator.js";
import { isUserDemoKey } from "./demoKeys.js";
import type { DemoMetadata } from "./demoMetadata.js";
import { DemoUploadProcessingError } from "./demoUploadProcess.js";
import { buildHeader, DEMO_LENGTH_MS_OFFSET } from "./demoWriter.js";
import { UserDemoUploads } from "./userDemoUploads.js";
import {
  MAX_USER_DEMO_STORAGE_BYTES,
  MAX_USER_DEMOS,
  USER_DEMO_UPLOAD_PATH,
  type UserDemoUploadList,
  type UserDemoUploadResponse,
} from "./userDemoTypes.js";

const ORIGIN = "https://play.tribes2.online";
const OWNER = "126767979894407168";
const OTHER = "234567890123456789";
const BODY = Buffer.concat([
  Buffer.from(buildHeader(3)),
  Buffer.from([1, 2, 3, 4, 5]),
]);
const HASH = createHash("sha256").update(BODY).digest("hex");
const checkpoints: PreparedDemoCheckpoints = {
  version: DEMO_CHECKPOINT_VERSION,
  demoBytes: BODY.length,
  demoSha256: HASH,
  count: 0,
  bytes: 2,
  elapsedMS: 1,
  reused: false,
  intervalTicks: DEFAULT_CHECKPOINT_INTERVAL_TICKS,
  maxCount: 1,
};
const BASENAME = "a-server_20261001T1200_katabatic_0a1b2c.rec";
const KEY = `users/${OWNER}/${BASENAME}`;
const account: AccountUser = {
  id: "local-user",
  name: "Tester",
  image: null,
  role: "user",
  discordId: OWNER,
  discordUsername: "tester",
};
const metadata: DemoMetadata = {
  filename: "demo.rec",
  bytes: BODY.length,
  recordedAt: "2026-10-01T12:00:00.000Z",
  server: "A server",
  address: "127.0.0.1:28000",
  games: [],
  mod: "Base",
  recorder: "Recorder",
  durationMs: 32_000,
  players: [],
};

class Response extends EventEmitter {
  headers: Record<string, string | number> = {};
  statusCode = 200;
  writableEnded = false;
  writableFinished = false;
  destroyed = false;
  body = "";
  setHeader(name: string, value: string | number) {
    this.headers[name.toLowerCase()] = value;
  }
  writeHead(status: number, headers: Record<string, string> = {}) {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers))
      this.setHeader(name, value);
  }
  end(body = "") {
    this.body = body;
    this.writableEnded = true;
    this.writableFinished = true;
    this.emit("finish");
  }
  json<T>() {
    return JSON.parse(this.body) as T;
  }
}

function incoming(
  method: string,
  url: string,
  body?: Buffer,
  headers: Record<string, string | undefined> = {},
) {
  const request = Object.assign(new PassThrough(), {
    method,
    url,
    headers: {
      origin: ORIGIN,
      "content-type": "application/octet-stream",
      ...(body ? { "content-length": String(body.length) } : {}),
      ...headers,
    },
    socket: { remoteAddress: "127.0.0.1" },
    complete: true,
  });
  request.end(body);
  return request as unknown as IncomingMessage;
}

function streamingRequest(length = BODY.length) {
  const stream = Object.assign(new PassThrough(), {
    method: "POST",
    url: `${USER_DEMO_UPLOAD_PATH}?filename=streamed.rec`,
    headers: {
      origin: ORIGIN,
      "content-type": "application/octet-stream",
      "content-length": String(length),
    },
    socket: { remoteAddress: "127.0.0.1" },
    complete: false,
  });
  return { stream, req: stream as unknown as IncomingMessage };
}

const fixtures: Array<{
  service: UserDemoUploads;
  database: Database.Database;
  root: string;
}> = [];

async function fixture(start = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "user-demo-uploads-"));
  const directory = path.join(root, "uploads");
  const database = new Database(path.join(root, "app.sqlite"));
  const getAccount = vi.fn(async () => account as AccountUser | null);
  const processDemo = vi.fn(
    async (file: string, _assets: string, signal?: AbortSignal) => {
      signal?.throwIfAborted();
      await fs.writeFile(`${file}.checkpoints.json`, "{}");
      return { metadata, startMission: "Katabatic", checkpoints };
    },
  );
  const publishDemo = vi.fn(
    async (
      _key: string,
      _file: string,
      _metadata: DemoMetadata,
      _checkpoints: PreparedDemoCheckpoints,
    ) => {},
  );
  const deleteDemo = vi.fn(async () => {});
  const options = {
    database,
    directory,
    assetRoot: "/assets",
    getAccount,
    trustedOrigins: [ORIGIN],
    trustFlyProxy: false,
    minFreeDiskBytes: 256_000_000,
    processDemo,
    publishDemo,
    deleteDemo,
  };
  const service = new UserDemoUploads(options);
  fixtures.push({ service, database, root });
  if (start) await service.start();
  const request = async (
    method: string,
    suffix = "",
    body?: Buffer,
    headers: Record<string, string | undefined> = {},
  ) => {
    const req = incoming(
      method,
      `${USER_DEMO_UPLOAD_PATH}${suffix}`,
      body,
      headers,
    );
    const res = new Response();
    expect(await service.handle(req, res as unknown as ServerResponse)).toBe(
      true,
    );
    req.destroy();
    return res;
  };
  const upload = (body = BODY) =>
    request("POST", "?filename=original.rec", body);
  const rows = () =>
    database.prepare("SELECT * FROM user_demo_uploads").all() as Array<
      Record<string, unknown>
    >;
  const list = async () => (await request("GET")).json<UserDemoUploadList>();
  return {
    ...options,
    options,
    service,
    request,
    upload,
    rows,
    list,
    root,
  };
}

afterEach(async () => {
  for (const { service, database, root } of fixtures.splice(0)) {
    await service.close();
    database.close();
    await fs.rm(root, { recursive: true, force: true });
  }
});

describe("user demo upload admission", () => {
  it("requires a session and a trusted mutation origin, including on DELETE", async () => {
    const f = await fixture();
    f.getAccount.mockResolvedValue(null);
    expect((await f.upload()).statusCode).toBe(401);
    f.getAccount.mockResolvedValue(account);
    expect(
      (
        await f.request("POST", "?filename=demo.rec", BODY, {
          origin: "https://evil.invalid",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.request("DELETE", `/${randomUUID()}`, undefined, {
          origin: undefined,
        })
      ).statusCode,
    ).toBe(403);
    const preflight = await f.request("OPTIONS");
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-credentials"]).toBe("true");
    expect(preflight.headers["access-control-allow-methods"]).toContain(
      "DELETE",
    );
    expect(f.rows()).toEqual([]);
  });

  it.each(["GET", "POST", "DELETE"])(
    "rejects a stale account on %s before reading or changing its demo library",
    async (method) => {
      const f = await fixture();
      const id = randomUUID();
      f.database
        .prepare(
          "INSERT INTO user_demo_uploads(id, owner_discord_id, original_filename, object_key, sha256, state, raw_bytes, charged_bytes, created_at, updated_at) VALUES (?, ?, 'private.rec', ?, ?, 'ready', ?, ?, 1, 1)",
        )
        .run(
          id,
          OTHER,
          `users/${OTHER}/${BASENAME}`,
          HASH,
          BODY.length,
          BODY.length,
        );
      f.getAccount.mockResolvedValue({ ...account, discordId: OTHER });
      const before = f.rows();
      const suffix =
        method === "DELETE"
          ? `/${id}?owner=${OWNER}`
          : `?owner=${OWNER}${method === "POST" ? "&filename=recording.rec" : ""}`;
      const response = await f.request(
        method,
        suffix,
        method === "POST" ? BODY : undefined,
      );
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: "Your signed-in account changed. Please try again.",
      });
      expect(f.rows()).toEqual(before);
      expect(f.processDemo).not.toHaveBeenCalled();
      expect(f.publishDemo).not.toHaveBeenCalled();
      expect(f.deleteDemo).not.toHaveBeenCalled();
      expect(
        f.database
          .prepare("SELECT COUNT(*) AS count FROM user_demo_upload_rates")
          .get(),
      ).toEqual({ count: 0 });
    },
  );

  it.each([`owner=${OTHER}`, "owner=", `owner=${OWNER}&owner=${OWNER}`])(
    "rejects an unmatched or ambiguous expected owner (%s)",
    async (query) => {
      const f = await fixture();
      expect((await f.request("GET", `?${query}`)).statusCode).toBe(401);
    },
  );

  it.each(["", `?owner=${OWNER}`])(
    "accepts the current account with matching or legacy owner parameters (%s)",
    async (query) => {
      const f = await fixture();
      const response = await f.request(
        "POST",
        `${query}${query ? "&" : "?"}filename=recording.rec`,
        BODY,
      );
      expect(response.statusCode).toBe(202);
      const { demo } = response.json<UserDemoUploadResponse>();
      await vi.waitFor(() => expect(f.rows()[0]?.state).toBe("ready"));
      const listed = await f.request("GET", query);
      expect(listed.statusCode).toBe(200);
      expect(listed.json<UserDemoUploadList>().demos[0].id).toBe(demo.id);
      expect(
        (await f.request("DELETE", `/${demo.id}${query}`)).statusCode,
      ).toBe(202);
      await vi.waitFor(() => expect(f.rows()).toEqual([]));
    },
  );

  it("rejects invalid paths, body types, encodings and size declarations before reserving storage", async () => {
    const f = await fixture();
    expect(
      (await f.request("POST", "?filename=..%2Fdemo.rec", BODY)).statusCode,
    ).toBe(400);
    expect(
      (
        await f.request("POST", "?filename=demo.rec", BODY, {
          "content-type": "text/html",
        })
      ).statusCode,
    ).toBe(415);
    expect(
      (
        await f.request("POST", "?filename=demo.rec", BODY, {
          "content-encoding": "gzip",
        })
      ).statusCode,
    ).toBe(415);
    expect(
      (
        await f.request("POST", "?filename=demo.rec", BODY, {
          "content-length": "50000001",
        })
      ).statusCode,
    ).toBe(413);
    expect(
      (
        await f.request("POST", "?filename=demo.rec", BODY, {
          "content-length": undefined,
        })
      ).statusCode,
    ).toBe(411);
    expect(
      (
        await f.request("POST", "?filename=demo.rec", BODY, {
          "content-length": "3.5",
        })
      ).statusCode,
    ).toBe(411);
    expect(
      (
        await f.request("POST", "?filename=demo.rec", BODY, {
          "content-length": undefined,
          "transfer-encoding": "chunked",
        })
      ).statusCode,
    ).toBe(411);
    expect(
      (
        await f.request("POST", "?filename=demo.rec", BODY, {
          "transfer-encoding": "chunked",
        })
      ).statusCode,
    ).toBe(400);
    expect(f.rows()).toEqual([]);
    expect(await fs.readdir(f.directory)).toEqual([]);
  });

  it.each(["short", "long"])(
    "rejects a %s body independently of the declared length",
    async (kind) => {
      const f = await fixture();
      const length = BODY.length + (kind === "short" ? 1 : -1);
      expect(
        (
          await f.request("POST", "?filename=demo.rec", BODY, {
            "content-length": String(length),
          })
        ).statusCode,
      ).toBe(400);
      expect(f.processDemo).not.toHaveBeenCalled();
      expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
      expect(await fs.readdir(f.directory)).toEqual([]);
    },
  );

  it.each(["identifier", "version", "initial-state", "incomplete"])(
    "rejects invalid %s headers before streaming the recording to disk",
    async (kind) => {
      const f = await fixture();
      let body = Buffer.from(BODY);
      if (kind === "identifier") body[1] = 88;
      if (kind === "version")
        body.writeUInt32LE(0x330003, DEMO_LENGTH_MS_OFFSET - 4);
      if (kind === "initial-state")
        body.writeUInt32LE(100000, DEMO_LENGTH_MS_OFFSET + 4);
      if (kind === "incomplete") body = body.subarray(0, 8);
      expect((await f.upload(body)).statusCode).toBe(422);
      expect(f.processDemo).not.toHaveBeenCalled();
      expect(f.publishDemo).not.toHaveBeenCalled();
      expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
      expect(await fs.readdir(f.directory)).toEqual([]);
    },
  );

  it("preserves split header/body chunks while writing a private original file", async () => {
    const f = await fixture();
    const originalProcess = f.processDemo.getMockImplementation()!;
    f.processDemo.mockImplementation(async (file, assets, signal) => {
      expect(await fs.readFile(file)).toEqual(BODY);
      expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
      expect((await fs.stat(path.dirname(file))).mode & 0o777).toBe(0o700);
      return originalProcess(file, assets, signal);
    });
    const { stream, req } = streamingRequest();
    const res = new Response();
    const handled = f.service.handle(req, res as unknown as ServerResponse);
    for (let offset = 0; offset < BODY.length; offset += 3)
      stream.write(BODY.subarray(offset, offset + 3));
    stream.complete = true;
    stream.end();
    await handled;
    expect(res.statusCode).toBe(202);
    await vi.waitFor(() => expect(f.rows()[0].state).toBe("ready"));
  });

  it("stops reading bytes beyond the declared length", async () => {
    const f = await fixture();
    const oversized = Buffer.alloc(50_000_001);
    BODY.copy(oversized);
    const response = await f.request("POST", "?filename=demo.rec", oversized, {
      "content-length": "50000000",
    });
    expect(response.statusCode).toBe(400);
    expect(f.processDemo).not.toHaveBeenCalled();
    expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
    expect(await fs.readdir(f.directory)).toEqual([]);
  });

  it.each(["aborted", "disconnected"])(
    "cleans an upload when its client is %s",
    async (kind) => {
      const f = await fixture();
      const { stream, req } = streamingRequest();
      const res = new Response();
      const handled = f.service.handle(req, res as unknown as ServerResponse);
      stream.write(BODY.subarray(0, 8));
      await vi.waitFor(() => expect(f.rows()[0]?.state).toBe("receiving"));
      if (kind === "aborted") stream.emit("aborted");
      else res.emit("close");
      await handled;
      expect(res.statusCode).toBe(400);
      expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
      expect(await fs.readdir(f.directory)).toEqual([]);
      expect(f.processDemo).not.toHaveBeenCalled();
      stream.destroy();
    },
  );

  it("bounds an idle header upload with the total five-minute transfer deadline", async () => {
    const f = await fixture();
    const { stream, req } = streamingRequest();
    const res = new Response();
    vi.useFakeTimers();
    try {
      const handled = f.service.handle(req, res as unknown as ServerResponse);
      await vi.waitFor(() => expect(f.rows()[0]?.state).toBe("receiving"));
      await vi.advanceTimersByTimeAsync(300_001);
      await handled;
      expect(res.statusCode).toBe(408);
      expect(f.rows()[0]).toMatchObject({ state: "failed", reserved_bytes: 0 });
      expect(f.processDemo).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      stream.destroy();
    }
    expect(await fs.readdir(f.directory)).toEqual([]);
  });

  it("reserves quota and a slot before receiving another concurrent upload", async () => {
    const f = await fixture();
    let finish!: () => void;
    f.processDemo.mockImplementation(async (file, assets, signal) => {
      await new Promise<void>((resolve, reject) => {
        finish = resolve;
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
      await fs.writeFile(`${file}.checkpoints.json`, "{}");
      return { metadata, startMission: "Katabatic", checkpoints };
    });
    expect((await f.upload()).statusCode).toBe(202);
    await vi.waitFor(() => expect(f.processDemo).toHaveBeenCalledTimes(1));
    const busy = await f.upload(Buffer.from("another demo"));
    expect(busy.statusCode).toBe(409);
    expect((await f.list()).usage).toEqual({
      bytes: BODY.length + 128_000_000,
      count: 1,
    });
    finish();
    await vi.waitFor(() => expect(f.rows()[0].state).toBe("ready"));
  });

  it.each(["count", "bytes"])(
    "enforces the per-owner %s cap transactionally",
    async (kind) => {
      const f = await fixture();
      const insert = f.database.prepare(
        "INSERT INTO user_demo_uploads(id, owner_discord_id, original_filename, state, raw_bytes, charged_bytes, created_at, updated_at) VALUES (?, ?, 'saved.rec', 'ready', 1, ?, 1, 1)",
      );
      const count = kind === "count" ? MAX_USER_DEMOS : 1;
      for (let i = 0; i < count; i++)
        insert.run(
          randomUUID(),
          OWNER,
          kind === "bytes" ? MAX_USER_DEMO_STORAGE_BYTES : 1,
        );
      expect((await f.upload()).statusCode).toBe(409);
      expect(f.rows()).toHaveLength(count);
    },
  );

  it("bounds outstanding uploads globally across different owners", async () => {
    const f = await fixture();
    f.processDemo.mockImplementation(async (_file, _assets, signal) => {
      signal?.throwIfAborted();
      return new Promise((_resolve, reject) =>
        signal!.addEventListener("abort", () => reject(signal!.reason), {
          once: true,
        }),
      );
    });
    for (let index = 0; index < 8; index++) {
      f.getAccount.mockResolvedValue({
        ...account,
        discordId: String(BigInt(OWNER) + BigInt(index)),
      });
      expect((await f.upload()).statusCode).toBe(202);
    }
    f.getAccount.mockResolvedValue({ ...account, discordId: OTHER });
    expect((await f.upload()).statusCode).toBe(503);
    expect(f.rows()).toHaveLength(8);
    await vi.waitFor(() => expect(f.processDemo).toHaveBeenCalledTimes(8));
  });

  it("does not let rejected files reset the account upload-attempt budget", async () => {
    const f = await fixture();
    for (let index = 0; index < 10; index++)
      expect((await f.upload(Buffer.from("not a recording"))).statusCode).toBe(
        422,
      );
    expect((await f.upload()).statusCode).toBe(429);
    expect((await f.list()).usage.count).toBe(0);
    expect(f.processDemo).not.toHaveBeenCalled();
  });
});

describe("user demo publication and ownership", () => {
  it("names the key like a relay recording and charges actual sidecar bytes only after generation", async () => {
    const f = await fixture();
    const uploaded = await f.upload();
    expect(uploaded.statusCode).toBe(202);
    const { id, filename } = uploaded.json<UserDemoUploadResponse>().demo;
    expect(filename).toBeNull();
    await vi.waitFor(() => expect(f.rows()[0].state).toBe("ready"));
    const key = f.rows()[0].object_key as string;
    expect(key).toMatch(
      /^users\/126767979894407168\/a-server_20261001T1200_katabatic_[a-f0-9]{6}\.rec$/,
    );
    expect(isUserDemoKey(key)).toBe(true);
    expect(f.publishDemo).toHaveBeenCalledWith(
      key,
      path.join(f.directory, id, "demo.rec"),
      expect.objectContaining({ filename: key, recorder: "Recorder" }),
      checkpoints,
    );
    expect(f.publishDemo.mock.calls[0][3]).toBe(checkpoints);
    const list = await f.list();
    expect(list.demos[0]).toMatchObject({
      filename: key,
      originalFilename: "original.rec",
      recordedAt: metadata.recordedAt,
      state: "ready",
    });
    expect(list.usage.count).toBe(1);
    expect(list.usage.bytes).toBe(
      BODY.length +
        Buffer.byteLength(
          JSON.stringify({
            ...metadata,
            filename: key,
            discordHandleAtUploadTime: account.discordUsername,
            discordDisplayNameAtUploadTime: account.name,
          }),
        ) +
        2,
    );
    expect(await fs.readdir(f.directory)).toEqual([]);
  });

  it("returns the user's identical file without processing or charging it twice", async () => {
    const f = await fixture();
    await f.upload();
    await vi.waitFor(() => expect(f.rows()[0].state).toBe("ready"));
    const before = (await f.list()).usage;
    f.getAccount.mockResolvedValue({
      ...account,
      name: "Renamed after the first upload",
      discordUsername: "renamed_after_first_upload",
    });
    const duplicate = await f.upload();
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json<UserDemoUploadResponse>().duplicate).toBe(true);
    expect(f.processDemo).toHaveBeenCalledTimes(1);
    expect(f.publishDemo).toHaveBeenCalledTimes(1);
    expect((await f.list()).usage).toEqual(before);
    expect(f.rows()).toHaveLength(1);
    expect(f.rows()[0]).toMatchObject({
      discord_handle_at_upload_time: account.discordUsername,
      discord_display_name_at_upload_time: account.name,
    });
  });

  it("freezes the authenticated upload-time profile before processing and ignores supplied names", async () => {
    const f = await fixture();
    const original = {
      ...account,
      name: "D'Artagnan <Player>",
      discordUsername: "original_handle",
    };
    f.getAccount.mockResolvedValue(original);
    let finish!: () => void;
    const originalProcess = f.processDemo.getMockImplementation()!;
    f.processDemo.mockImplementationOnce(async (file, assets, signal) => {
      await new Promise<void>((resolve, reject) => {
        finish = resolve;
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
      const result = await originalProcess(file, assets, signal);
      return {
        ...result,
        metadata: {
          ...result.metadata,
          discordHandleAtUploadTime: "forged_header_handle",
          discordDisplayNameAtUploadTime: "Forged header name",
        },
      };
    });
    expect(
      (
        await f.request(
          "POST",
          "?filename=game.rec&discordHandleAtUploadTime=forged_query&discordDisplayNameAtUploadTime=Forged",
          BODY,
        )
      ).statusCode,
    ).toBe(202);
    await vi.waitFor(() => expect(f.processDemo).toHaveBeenCalledOnce());
    expect(f.rows()[0]).toMatchObject({
      discord_handle_at_upload_time: original.discordUsername,
      discord_display_name_at_upload_time: original.name,
    });
    f.getAccount.mockResolvedValue({
      ...account,
      name: "Changed after acceptance",
      discordUsername: "changed_after_acceptance",
    });
    finish();
    await vi.waitFor(() => expect(f.rows()[0].state).toBe("ready"));
    expect(f.publishDemo.mock.calls[0][2]).toMatchObject({
      discordHandleAtUploadTime: original.discordUsername,
      discordDisplayNameAtUploadTime: original.name,
    });
    expect(f.getAccount).toHaveBeenCalledOnce();
  });

  it("keeps the original profile snapshot when processing resumes after a restart", async () => {
    const f = await fixture();
    f.processDemo.mockImplementationOnce(
      async (_file, _assets, signal) =>
        new Promise((_resolve, reject) =>
          signal!.addEventListener("abort", () => reject(signal!.reason), {
            once: true,
          }),
        ),
    );
    expect((await f.upload()).statusCode).toBe(202);
    await vi.waitFor(() => expect(f.processDemo).toHaveBeenCalledOnce());
    await f.service.close();
    expect(f.rows()[0]).toMatchObject({
      state: "queued",
      discord_handle_at_upload_time: account.discordUsername,
      discord_display_name_at_upload_time: account.name,
    });
    f.getAccount.mockResolvedValue({
      ...account,
      name: "Changed since upload",
      discordUsername: "changed_since_upload",
    });
    const resumed = new UserDemoUploads(f.options);
    try {
      await resumed.start();
      await vi.waitFor(() => expect(f.rows()[0].state).toBe("ready"));
      expect(f.publishDemo.mock.calls[0][2]).toMatchObject({
        discordHandleAtUploadTime: account.discordUsername,
        discordDisplayNameAtUploadTime: account.name,
      });
      expect(f.getAccount).toHaveBeenCalledOnce();
    } finally {
      await resumed.close();
    }
  });

  it("never publishes a rejected demo and releases its reservation", async () => {
    const f = await fixture();
    f.processDemo.mockRejectedValue(
      new DemoUploadProcessingError(
        "Demo exceeds the 128 MB expanded size limit",
      ),
    );
    await f.upload();
    await vi.waitFor(() => expect(f.rows()[0].state).toBe("failed"));
    expect(f.publishDemo).not.toHaveBeenCalled();
    expect(f.deleteDemo).not.toHaveBeenCalled();
    expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
    expect((await f.list()).demos[0].error).toContain("128 MB");
    expect(await fs.readdir(f.directory)).toEqual([]);
  });

  it("limits deletion to the owner and releases quota after remote cleanup completes", async () => {
    const f = await fixture();
    let finishLocalCleanup!: () => void;
    const localCleanup = new Promise<void>((resolve) => {
      finishLocalCleanup = resolve;
    });
    let finishRemoteCleanup!: () => void;
    const remoteCleanup = new Promise<void>((resolve) => {
      finishRemoteCleanup = resolve;
    });
    const rm = fs.rm;
    // A ready upload can still be finishing its local publication cleanup.
    const removeLocal = vi
      .spyOn(fs, "rm")
      .mockImplementationOnce(async (...args) => {
        await localCleanup;
        await rm(...args);
      });
    f.deleteDemo.mockReturnValue(remoteCleanup);
    try {
      const { demo } = (await f.upload()).json<UserDemoUploadResponse>();
      await vi.waitFor(() => expect(f.rows()[0].state).toBe("ready"));
      f.getAccount.mockResolvedValue({ ...account, discordId: OTHER });
      expect((await f.list()).demos).toEqual([]);
      expect((await f.request("DELETE", `/${demo.id}`)).statusCode).toBe(404);
      f.getAccount.mockResolvedValue(account);
      const usage = (await f.list()).usage;
      expect((await f.request("DELETE", `/${demo.id}`)).statusCode).toBe(202);
      expect(f.deleteDemo).not.toHaveBeenCalled();
      expect((await f.list()).usage).toEqual(usage);
      expect((await f.list()).demos[0].state).toBe("deleting");
      finishLocalCleanup();
      await vi.waitFor(() => expect(f.deleteDemo).toHaveBeenCalledOnce());
      expect(f.deleteDemo).toHaveBeenCalledWith(f.rows()[0].object_key);
      expect((await f.list()).usage).toEqual(usage);
      finishRemoteCleanup();
      await vi.waitFor(() => expect(f.rows()).toHaveLength(0));
      expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
    } finally {
      finishLocalCleanup();
      finishRemoteCleanup();
      removeLocal.mockRestore();
    }
  });

  it("deleting during processing aborts the job and cannot publish a late result", async () => {
    const f = await fixture();
    f.processDemo.mockImplementation(
      async (_file, _assets, signal) =>
        new Promise((_resolve, reject) =>
          signal!.addEventListener("abort", () => reject(signal!.reason), {
            once: true,
          }),
        ),
    );
    const { demo } = (await f.upload()).json<UserDemoUploadResponse>();
    await vi.waitFor(() => expect(f.processDemo).toHaveBeenCalledTimes(1));
    expect((await f.request("DELETE", `/${demo.id}`)).statusCode).toBe(202);
    await vi.waitFor(() => expect(f.rows()).toHaveLength(0));
    expect(f.publishDemo).not.toHaveBeenCalled();
    expect(f.deleteDemo).not.toHaveBeenCalled();
  });
});

it("cleans an interrupted receive on startup and keeps the failure out of quota", async () => {
  const f = await fixture(false);
  const id = randomUUID();
  f.database
    .prepare(
      "INSERT INTO user_demo_uploads(id, owner_discord_id, original_filename, state, raw_bytes, reserved_bytes, created_at, updated_at) VALUES (?, ?, 'interrupted.rec', 'receiving', 100, 128000100, 1, 1)",
    )
    .run(id, OWNER);
  await fs.mkdir(path.join(f.directory, id), { recursive: true });
  await fs.writeFile(path.join(f.directory, id, "demo.rec"), "partial");
  await f.service.start();
  expect(f.rows()[0]).toMatchObject({
    state: "failed",
    reserved_bytes: 0,
    charged_bytes: 0,
  });
  expect(await fs.readdir(f.directory)).toEqual([]);
});

it("retains a deleting record and its storage charge until a retried cleanup succeeds", async () => {
  const f = await fixture(false);
  const id = randomUUID();
  f.database
    .prepare(
      "INSERT INTO user_demo_uploads(id, owner_discord_id, original_filename, object_key, sha256, state, raw_bytes, charged_bytes, created_at, updated_at) VALUES (?, ?, 'saved.rec', ?, ?, 'deleting', ?, 1000, 1, 1)",
    )
    .run(id, OWNER, KEY, HASH, BODY.length);
  f.deleteDemo.mockRejectedValueOnce(new Error("Temporary R2 failure"));
  await f.service.start();
  await vi.waitFor(() => expect(f.deleteDemo).toHaveBeenCalledTimes(1));
  expect((await f.list()).usage).toEqual({ bytes: 1000, count: 1 });
  expect(f.rows()[0].state).toBe("deleting");
  await f.service.close();
  const resumed = new UserDemoUploads(f.options);
  try {
    await resumed.start();
    await vi.waitFor(() => expect(f.rows()).toHaveLength(0));
    expect(f.deleteDemo).toHaveBeenCalledTimes(2);
  } finally {
    await resumed.close();
  }
});

it("retries publication in place, then cleans published objects before freeing quota", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    const f = await fixture();
    f.publishDemo.mockRejectedValue(new Error("Temporary R2 failure"));
    await f.upload();
    await vi.waitFor(() =>
      expect(f.rows()[0]).toMatchObject({
        state: "publishing",
        error: "Could not publish this demo. Retrying shortly.",
      }),
    );
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(f.publishDemo).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(f.rows()[0].state).toBe("failed"));
    expect(f.publishDemo).toHaveBeenCalledTimes(3);
    expect(f.processDemo).toHaveBeenCalledOnce();
    for (const call of f.publishDemo.mock.calls)
      expect(call[3]).toBe(checkpoints);
    expect(f.deleteDemo).toHaveBeenCalledWith(f.publishDemo.mock.calls[0][0]);
    expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
  } finally {
    vi.useRealTimers();
  }
});

it("honors an explicit deletion while failed-job cleanup is in flight", async () => {
  const f = await fixture(false);
  const id = randomUUID();
  // The saved original is gone, so reprocessing fails and cleans up the key.
  f.database
    .prepare(
      "INSERT INTO user_demo_uploads(id, owner_discord_id, original_filename, object_key, sha256, state, raw_bytes, charged_bytes, created_at, updated_at) VALUES (?, ?, 'saved.rec', ?, ?, 'publishing', ?, 1000, 1, 1)",
    )
    .run(id, OWNER, KEY, HASH, BODY.length);
  let finishCleanup!: () => void;
  f.deleteDemo.mockImplementation(
    () => new Promise<void>((resolve) => (finishCleanup = resolve)),
  );
  await f.service.start();
  await vi.waitFor(() => expect(f.deleteDemo).toHaveBeenCalledOnce());
  expect(f.deleteDemo).toHaveBeenCalledWith(KEY);
  expect(f.rows()[0]).toMatchObject({
    state: "deleting",
    error: "Could not process this demo. Please try again.",
  });
  expect((await f.request("DELETE", `/${id}`)).statusCode).toBe(202);
  finishCleanup();
  await vi.waitFor(() => expect(f.rows()).toHaveLength(0));
  expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
});

it.each(["processing", "publishing"])(
  "reprocesses the fsynced original under its assigned key after an interrupted %s job",
  async (state) => {
    const f = await fixture(false);
    const id = randomUUID();
    f.database
      .prepare(
        "INSERT INTO user_demo_uploads(id,owner_discord_id,discord_handle_at_upload_time,discord_display_name_at_upload_time,original_filename,object_key,sha256,state,raw_bytes,reserved_bytes,created_at,updated_at) VALUES (?,?,'saved_handle','Saved display name','saved.rec',?,?,?,?,128000100,1,1)",
      )
      .run(id, OWNER, KEY, HASH, state, BODY.length);
    const directory = path.join(f.directory, id);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, "demo.rec"), BODY);
    await fs.writeFile(
      path.join(directory, "demo.rec.checkpoints.json"),
      "stale output",
    );
    await f.service.start();
    await vi.waitFor(() => expect(f.rows()[0].state).toBe("ready"));
    expect(f.processDemo).toHaveBeenCalledOnce();
    expect(f.publishDemo).toHaveBeenCalledExactlyOnceWith(
      KEY,
      path.join(directory, "demo.rec"),
      expect.objectContaining({
        filename: KEY,
        discordHandleAtUploadTime: "saved_handle",
        discordDisplayNameAtUploadTime: "Saved display name",
      }),
      checkpoints,
    );
    expect(f.getAccount).not.toHaveBeenCalled();
  },
);

it.each(["both", "handle", "display name"])(
  "migrates an existing upload table missing %s snapshot columns without inventing old values",
  async (missing) => {
    const f = await fixture(false);
    const id = randomUUID();
    f.database
      .prepare(
        "INSERT INTO user_demo_uploads(id, owner_discord_id, original_filename, state, raw_bytes, charged_bytes, created_at, updated_at) VALUES (?, ?, 'legacy.rec', 'ready', 1, 2, 1, 1)",
      )
      .run(id, OWNER);
    f.database
      .prepare(
        "UPDATE user_demo_uploads SET discord_handle_at_upload_time = ?, discord_display_name_at_upload_time = ? WHERE id = ?",
      )
      .run("saved_handle", "Saved display name", id);
    await f.service.close();
    if (missing !== "display name")
      f.database.exec(
        "ALTER TABLE user_demo_uploads DROP COLUMN discord_handle_at_upload_time",
      );
    if (missing !== "handle")
      f.database.exec(
        "ALTER TABLE user_demo_uploads DROP COLUMN discord_display_name_at_upload_time",
      );
    const migrated = new UserDemoUploads(f.options);
    const repeated = new UserDemoUploads(f.options);
    try {
      expect(f.rows()).toEqual([
        expect.objectContaining({
          id,
          state: "ready",
          charged_bytes: 2,
          discord_handle_at_upload_time:
            missing === "display name" ? "saved_handle" : null,
          discord_display_name_at_upload_time:
            missing === "handle" ? "Saved display name" : null,
        }),
      ]);
      expect(f.getAccount).not.toHaveBeenCalled();
    } finally {
      await migrated.close();
      await repeated.close();
    }
  },
);
