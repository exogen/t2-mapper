import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  createServer,
  request as httpRequest,
  type IncomingHttpHeaders,
} from "node:http";
import { connect } from "node:net";
import zlib from "node:zlib";
import Database from "better-sqlite3";
import { BlockTypeMove } from "t2-demo-parser";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CHECKPOINT_INTERVAL_TICKS,
  DEMO_CHECKPOINT_VERSION,
} from "../src/stream/demoCheckpoints";
import type { AccountUser } from "./accountTypes";
import { analyzeDemoRecording, validateDemoUploadBytes } from "./demoAnalysis";
import type { PreparedDemoCheckpoints } from "./demoCheckpointGenerator";
import { isUserDemoKey } from "./demoKeys";
import { DemoUploadProcessingError } from "./demoUploadProcess";
import {
  buildDemoValues,
  buildHeader,
  buildInitialBlock,
  DEMO_LENGTH_MS_OFFSET,
  ZERO_MOVE,
} from "./demoWriter";
import {
  UserDemoUploads,
  type UserDemoUploadsOptions,
} from "./userDemoUploads";
import {
  MAX_USER_DEMO_BYTES,
  MAX_USER_DEMO_SIDECAR_BYTES,
  USER_DEMO_UPLOAD_PATH,
  type UserDemoUploadList,
  type UserDemoUploadResponse,
} from "./userDemoTypes";

const ORIGIN = "https://play.tribes2.online";
const OWNER = "126767979894407168";
const AUTHORIZATION = "Bearer integration-fixture";
const account: AccountUser = {
  id: "fixture-user",
  discordId: OWNER,
  discordUsername: "tester",
  name: "Tester",
  image: null,
  role: "user",
  t2Profile: null,
};

function validDemo(): Buffer {
  const initial = buildInitialBlock({
    connectSequence: 0,
    missionName: "TWL_Katabatic",
    demoValues: buildDemoValues({
      recorderName: "Recorder",
      serverName: "Server | CTF",
      serverAddress: "localhost",
      date: new Date("2020-04-05T12:00:00.000Z"),
      missionDisplayName: "",
      mod: "classic",
      gameType: "CTF",
    }),
  });
  const frame = Buffer.alloc(2);
  frame.writeUInt16LE((BlockTypeMove << 12) | ZERO_MOVE.length);
  return Buffer.concat([
    buildHeader(initial.length),
    initial,
    zlib.deflateRawSync(Buffer.concat([frame, ZERO_MOVE])),
  ]);
}

interface HttpResult {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

const fixtures: Array<{ close(): Promise<void> }> = [];

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "demo-upload-http-"));
  const database = new Database(path.join(root, "accounts.sqlite"));
  const directory = path.join(root, "private-uploads");
  const receivedRequests: string[] = [];
  const serverErrors: unknown[] = [];
  const processed: Buffer[] = [];
  const getAccount = vi.fn(async (headers: IncomingHttpHeaders) =>
    headers.authorization === AUTHORIZATION ? account : null,
  );
  const processDemo = vi.fn(
    async (file: string, _assets: string, signal: AbortSignal) => {
      signal.throwIfAborted();
      const bytes = await fs.readFile(file);
      processed.push(bytes);
      try {
        validateDemoUploadBytes(bytes);
        const { metadata, startMission } = await analyzeDemoRecording(
          bytes,
          path.basename(file),
          { strict: true },
        );
        await fs.writeFile(`${file}.checkpoints.json`, "{}");
        const checkpoints: PreparedDemoCheckpoints = {
          version: DEMO_CHECKPOINT_VERSION,
          demoBytes: bytes.length,
          demoSha256: createHash("sha256").update(bytes).digest("hex"),
          count: 0,
          bytes: 2,
          elapsedMS: 1,
          reused: false,
          intervalTicks: DEFAULT_CHECKPOINT_INTERVAL_TICKS,
          maxCount: 1,
        };
        return { metadata, startMission, checkpoints };
      } catch (error) {
        throw new DemoUploadProcessingError(
          error instanceof Error ? error.message : "Invalid recording",
        );
      }
    },
  );
  const publishDemo = vi.fn<UserDemoUploadsOptions["publishDemo"]>(
    async () => {},
  );
  const service = new UserDemoUploads({
    database,
    directory,
    assetRoot: "/unused-fixture-assets",
    getAccount,
    trustedOrigins: [ORIGIN],
    trustFlyProxy: false,
    minFreeDiskBytes: 256_000_000,
    processDemo,
    publishDemo,
    deleteDemo: async () => {},
  });
  await service.start();
  const server = createServer((req, res) => {
    receivedRequests.push(`${req.method} ${req.url}`);
    res.on("error", (error) => serverErrors.push(error));
    void service
      .handle(req, res)
      .then((handled) => {
        if (!handled) {
          res.writeHead(404);
          res.end();
        }
      })
      .catch((error) => {
        serverErrors.push(error);
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
  });
  fixtures.push({
    close: async () => {
      await service.close();
      server.closeAllConnections();
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      database.close();
      await fs.rm(root, { recursive: true, force: true });
      expect(serverErrors).toEqual([]);
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing fixture port");
  const port = address.port;
  const request = (
    method = "POST",
    body?: Buffer,
    headers: Record<string, string | undefined> = {},
    requestPath = `${USER_DEMO_UPLOAD_PATH}?filename=recording.rec`,
  ): Promise<HttpResult> =>
    new Promise((resolve, reject) => {
      const outgoing: Record<string, string> = {
        Origin: ORIGIN,
        Authorization: AUTHORIZATION,
        "Content-Type": "application/octet-stream",
        ...(body ? { "Content-Length": String(body.length) } : {}),
      };
      for (const [key, value] of Object.entries(headers)) {
        for (const existing of Object.keys(outgoing))
          if (existing.toLowerCase() === key.toLowerCase())
            delete outgoing[existing];
        if (value !== undefined) outgoing[key] = value;
      }
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          method,
          path: requestPath,
          headers: outgoing,
          agent: false,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode!,
              headers: res.headers,
              body: Buffer.concat(chunks).toString("utf8"),
            }),
          );
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.end(body);
    });
  const raw = async (parts: Array<Buffer | string>): Promise<string> => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setNoDelay(true);
    const response = new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      socket.on("data", (chunk: Buffer) => chunks.push(chunk));
      socket.on("error", (error) =>
        chunks.length
          ? resolve(Buffer.concat(chunks).toString())
          : reject(error),
      );
      socket.on("close", () => resolve(Buffer.concat(chunks).toString()));
      socket.setTimeout(3000, () =>
        socket.destroy(new Error("Fixture socket timed out")),
      );
    });
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    for (const part of parts) {
      await new Promise<void>((resolve, reject) =>
        socket.write(part, (error) => (error ? reject(error) : resolve())),
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    return response;
  };
  const list = async () =>
    JSON.parse(
      (await request("GET", undefined, {}, USER_DEMO_UPLOAD_PATH)).body,
    ) as UserDemoUploadList;
  return {
    directory,
    database,
    getAccount,
    processDemo,
    publishDemo,
    processed,
    receivedRequests,
    request,
    raw,
    list,
  };
}

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

describe("real HTTP demo uploads", () => {
  it("rejects missing sessions and untrusted origins before receiving a recording", async () => {
    const f = await fixture();
    expect(
      (await f.request("POST", validDemo(), { Authorization: undefined }))
        .status,
    ).toBe(401);
    const before = f.getAccount.mock.calls.length;
    const rejected = await f.request("POST", validDemo(), {
      Origin: "https://untrusted.example",
    });
    expect(rejected.status).toBe(403);
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
    expect(f.getAccount).toHaveBeenCalledTimes(before);
    expect(f.processDemo).not.toHaveBeenCalled();
    expect(
      f.database
        .prepare("SELECT COUNT(*) AS count FROM user_demo_uploads")
        .get(),
    ).toEqual({ count: 0 });
  });

  it("rejects multipart bodies, encoded files, and oversized declarations before parsing", async () => {
    const f = await fixture();
    expect(
      (
        await f.request("POST", Buffer.from("--boundary\r\nnot a demo"), {
          "Content-Type": "multipart/form-data; boundary=boundary",
        })
      ).status,
    ).toBe(415);
    expect(
      (await f.request("POST", validDemo(), { "Content-Encoding": "gzip" }))
        .status,
    ).toBe(415);
    const oversized = await f.request("POST", undefined, {
      "Content-Length": "50000001",
    });
    expect(oversized.status).toBe(413);
    expect(oversized.headers.connection).toBe("close");
    expect(f.processDemo).not.toHaveBeenCalled();
    expect(await fs.readdir(f.directory)).toEqual([]);
  });

  it("keeps disk space reserved for uploads that have not finished writing", async () => {
    const f = await fixture();
    f.database
      .prepare(
        "INSERT INTO user_demo_uploads(id, owner_discord_id, original_filename, state, raw_bytes, reserved_bytes, created_at, updated_at) VALUES (?, ?, 'receiving.rec', 'receiving', ?, ?, 1, 1)",
      )
      .run(
        randomUUID(),
        OWNER,
        MAX_USER_DEMO_BYTES,
        MAX_USER_DEMO_BYTES + MAX_USER_DEMO_SIDECAR_BYTES,
      );
    f.getAccount.mockResolvedValue({
      ...account,
      discordId: "234567890123456789",
    });
    const disk = await fs.statfs(f.directory);
    const freeSpace = vi.spyOn(fs, "statfs").mockResolvedValue({
      ...disk,
      bavail: 450_000_000,
      bsize: 1,
    });
    try {
      const rejected = await f.request("POST", validDemo());
      expect(rejected.status).toBe(503);
      expect(rejected.body).toContain("disk space");
      expect(f.processDemo).not.toHaveBeenCalled();
      expect(
        f.database
          .prepare("SELECT COUNT(*) AS count FROM user_demo_uploads")
          .get(),
      ).toEqual({ count: 1 });

      freeSpace.mockResolvedValue({ ...disk, bavail: 800_000_000, bsize: 1 });
      expect((await f.request("POST", validDemo())).status).toBe(202);
    } finally {
      freeSpace.mockRestore();
    }
  });

  it("rejects unsupported builds and garbage headers before invoking the worker", async () => {
    const f = await fixture();
    const wrongBuild = validDemo();
    wrongBuild.writeUInt32LE(0x330003, DEMO_LENGTH_MS_OFFSET - 4);
    expect((await f.request("POST", wrongBuild)).status).toBe(422);
    expect(
      (await f.request("POST", Buffer.from("not a Tribes 2 recording"))).status,
    ).toBe(422);
    expect(f.processDemo).not.toHaveBeenCalled();
    expect(f.publishDemo).not.toHaveBeenCalled();
    expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
  });

  it.each([
    "Content-Length: 3\r\nTransfer-Encoding: chunked",
    "Content-Length: 3\r\nContent-Length: 4",
  ])(
    "lets Node reject ambiguous request framing before the handler (%s)",
    async (framing) => {
      const f = await fixture();
      const response = await f.raw([
        `POST ${USER_DEMO_UPLOAD_PATH}?filename=recording.rec HTTP/1.1\r\nHost: localhost\r\nOrigin: ${ORIGIN}\r\nAuthorization: ${AUTHORIZATION}\r\nContent-Type: application/octet-stream\r\n${framing}\r\nConnection: close\r\n\r\n`,
      ]);
      expect(response).toMatch(/^HTTP\/1\.1 400 /);
      expect(f.receivedRequests).toEqual([]);
      expect(f.getAccount).not.toHaveBeenCalled();
      expect(f.processDemo).not.toHaveBeenCalled();
    },
  );

  it("rejects chunked uploads without a fixed length and unsupported routes", async () => {
    const f = await fixture();
    const chunked = await f.raw([
      `POST ${USER_DEMO_UPLOAD_PATH}?filename=recording.rec HTTP/1.1\r\nHost: localhost\r\nOrigin: ${ORIGIN}\r\nAuthorization: ${AUTHORIZATION}\r\nContent-Type: application/octet-stream\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n0\r\n\r\n`,
    ]);
    expect(chunked).toMatch(/^HTTP\/1\.1 411 /);
    expect(
      (
        await f.request(
          "POST",
          validDemo(),
          {},
          `${USER_DEMO_UPLOAD_PATH}/unexpected`,
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await f.request(
          "POST",
          validDemo(),
          {},
          `${USER_DEMO_UPLOAD_PATH}-elsewhere`,
        )
      ).status,
    ).toBe(404);
    expect(f.processDemo).not.toHaveBeenCalled();
  });

  it("preserves a recording split across socket writes, hashes it on the server, and deduplicates it", async () => {
    const f = await fixture();
    const bytes = validDemo();
    const response = await f.raw([
      `POST ${USER_DEMO_UPLOAD_PATH}?filename=recording.rec HTTP/1.1\r\nHost: localhost\r\nOri`,
      `gin: ${ORIGIN}\r\nAuthorization: ${AUTHORIZATION}\r\nContent-Type: application/octet-stream\r\nContent-Length: ${bytes.length}\r\nConnection: close\r\n\r\n`,
      bytes.subarray(0, 3),
      bytes.subarray(3, 19),
      bytes.subarray(19),
    ]);
    expect(response).toMatch(/^HTTP\/1\.1 202 /);
    await vi.waitFor(async () =>
      expect((await f.list()).demos[0]?.state).toBe("ready"),
    );
    expect(f.processed).toEqual([bytes]);
    const key = (await f.list()).demos[0].filename!;
    expect(key).toMatch(
      /^users\/126767979894407168\/server-ctf_20200405T1200_twl-katabatic_[a-f0-9]{6}\.rec$/,
    );
    expect(isUserDemoKey(key)).toBe(true);
    const processed = await f.processDemo.mock.results[0].value;
    expect(f.publishDemo).toHaveBeenCalledWith(
      key,
      expect.any(String),
      expect.objectContaining({
        bytes: bytes.length,
        recordedAt: "2020-04-05T12:00:00.000Z",
        discordHandleAtUploadTime: account.discordUsername,
        discordDisplayNameAtUploadTime: account.name,
      }),
      processed.checkpoints,
    );
    expect(f.publishDemo.mock.calls[0][3]).toBe(processed.checkpoints);
    const duplicate = await f.request("POST", bytes);
    expect(duplicate.status).toBe(200);
    expect(JSON.parse(duplicate.body) as UserDemoUploadResponse).toMatchObject({
      duplicate: true,
      demo: { filename: key },
    });
    expect(f.processDemo).toHaveBeenCalledTimes(1);
    expect((await f.list()).usage.count).toBe(1);
    expect((await f.list()).usage.bytes).toBe(
      bytes.length +
        Buffer.byteLength(JSON.stringify(f.publishDemo.mock.calls[0][2])) +
        2,
    );
    expect(await fs.readdir(f.directory)).toEqual([]);
  });

  it("keeps a correctly framed but truncated recording out of public storage", async () => {
    const f = await fixture();
    const truncated = validDemo().subarray(0, -2);
    expect((await f.request("POST", truncated)).status).toBe(202);
    await vi.waitFor(async () =>
      expect((await f.list()).demos[0]?.state).toBe("failed"),
    );
    expect(f.processDemo).toHaveBeenCalledTimes(1);
    expect(f.publishDemo).not.toHaveBeenCalled();
    expect((await f.list()).usage).toEqual({ bytes: 0, count: 0 });
    expect(await fs.readdir(f.directory)).toEqual([]);
  });
});
