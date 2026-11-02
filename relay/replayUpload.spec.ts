import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { buildHeader } from "./demoWriter";
import { handleReplayUpload } from "./replayUpload";
import { MAX_REPLAY_UPLOAD_BYTES } from "./replayTypes";
import {
  ReplayCapacityError,
  type UploadedReplayRequest,
} from "./replaySession";

const CREATOR_ID = "a".repeat(48);

function request(
  options: {
    url?: string;
    method?: string;
    headers?: Record<string, string | undefined>;
    chunks?: Iterable<Uint8Array>;
    autoFinish?: boolean;
  } = {},
) {
  const req = Object.assign(new EventEmitter(), {
    url: options.url ?? "/replay-upload?name=match.rec&tick=12",
    method: options.method ?? "POST",
    headers: {
      "x-replay-client-id": CREATOR_ID,
      ...(options.headers ?? { "content-type": "application/octet-stream" }),
    },
    complete: false,
    destroy: vi.fn(),
    iterator() {
      return (async function* () {
        for (const chunk of options.chunks ?? [buildHeader(0)]) yield chunk;
        req.complete = true;
      })();
    },
  });
  const headers = new Map<string, unknown>();
  const res = Object.assign(new EventEmitter(), {
    destroyed: false,
    writableEnded: false,
    writableFinished: false,
    status: 0,
    text: "",
    setHeader(name: string, value: unknown) {
      headers.set(name, value);
    },
    writeHead(status: number, values?: Record<string, string>) {
      res.status = status;
      for (const [key, value] of Object.entries(values ?? {}))
        headers.set(key, value);
    },
    end(value?: string) {
      res.text = value ?? "";
      res.writableEnded = true;
      if (options.autoFinish !== false) {
        res.writableFinished = true;
        res.emit("finish");
      }
    },
  });
  return {
    req,
    res,
    headers,
    httpReq: req as unknown as IncomingMessage,
    httpRes: res as unknown as ServerResponse,
  };
}

function manager() {
  return {
    discardUnclaimedUpload: vi.fn(),
    createUploadedDemo: vi.fn(
      async ({ read, signal }: UploadedReplayRequest) => {
        await read(signal);
        return { sessionId: "room", ownerToken: "private" };
      },
    ),
  };
}

describe("temporary replay HTTP uploads", () => {
  it("correlates the optional upload observer and reports actual received chunk bytes", async () => {
    const header = buildHeader(0);
    const chunks = [header, new Uint8Array(10), new Uint8Array(20)];
    const uploadId = "01234567-89ab-4cde-8fab-0123456789ab";
    const ctx = request({
      url: `/replay-upload?name=match.rec&uploadId=${uploadId}`,
      chunks,
    });
    const report = vi.fn();
    const rooms = {
      discardUnclaimedUpload: vi.fn(),
      createUploadedDemo: vi.fn(async (input: UploadedReplayRequest) => {
        await input.read(input.signal, report);
        return { sessionId: "room", ownerToken: "private" };
      }),
    };
    await handleReplayUpload(ctx.httpReq, ctx.httpRes, rooms);
    expect(rooms.createUploadedDemo).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId }),
    );
    expect(report.mock.calls.map(([received]) => received)).toEqual([
      header.byteLength,
      header.byteLength + 10,
      header.byteLength + 30,
    ]);
    expect(ctx.res.status).toBe(201);
  });

  it("reads bounded raw bytes and responds privately with a prepared room capability", async () => {
    const ctx = request();
    const rooms = manager();
    expect(await handleReplayUpload(ctx.httpReq, ctx.httpRes, rooms)).toBe(
      true,
    );
    expect(rooms.createUploadedDemo).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "match.rec",
        tick: 12,
        creatorId: CREATOR_ID,
      }),
    );
    expect(ctx.res.status).toBe(201);
    expect(JSON.parse(ctx.res.text)).toEqual({
      sessionId: "room",
      ownerToken: "private",
    });
    expect(ctx.headers.get("Cache-Control")).toBe("no-store");
    expect(ctx.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("handles preflight and ignores unrelated or malformed routes", async () => {
    const rooms = manager();
    const preflight = request({ method: "OPTIONS" });
    expect(
      await handleReplayUpload(preflight.httpReq, preflight.httpRes, rooms),
    ).toBe(true);
    expect(preflight.res.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, X-Replay-Client-Id",
    );
    for (const url of ["/health", "http://[invalid"]) {
      const ctx = request({ url });
      expect(await handleReplayUpload(ctx.httpReq, ctx.httpRes, rooms)).toBe(
        false,
      );
    }
    expect(rooms.createUploadedDemo).not.toHaveBeenCalled();
  });

  it.each([
    { method: "GET", status: 405 },
    {
      headers: {
        "content-type": "application/octet-stream",
        "x-replay-client-id": undefined,
      },
      status: 400,
    },
    {
      headers: {
        "content-type": "application/octet-stream",
        "x-replay-client-id": "A".repeat(48),
      },
      status: 400,
    },
    {
      headers: {
        "content-type": "application/octet-stream",
        "x-replay-client-id": "a".repeat(47),
      },
      status: 400,
    },
    { url: "/replay-upload?name=x.rec&tick=-1", status: 400 },
    { url: "/replay-upload?name=x.rec&tick=0.5", status: 400 },
    { url: "/replay-upload?name=x.rec&name=y.rec", status: 400 },
    { url: "/replay-upload?name=x.rec&uploadId=one&uploadId=two", status: 400 },
    { headers: { "content-type": "multipart/form-data" }, status: 415 },
    {
      headers: {
        "content-type": "application/octet-stream",
        "content-encoding": "gzip",
      },
      status: 415,
    },
    {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": "NaN",
      },
      status: 400,
    },
    {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(MAX_REPLAY_UPLOAD_BYTES + 1),
      },
      status: 413,
    },
  ])(
    "rejects invalid metadata/headers before allocating a room: %j",
    async ({ status, ...options }) => {
      const ctx = request(options);
      const rooms = manager();
      await handleReplayUpload(ctx.httpReq, ctx.httpRes, rooms);
      expect(ctx.res.status).toBe(status);
      expect(rooms.createUploadedDemo).not.toHaveBeenCalled();
      expect(ctx.req.destroy).toHaveBeenCalledOnce();
    },
  );

  it("enforces the streamed size limit without trusting Content-Length", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const ctx = request({
      chunks: [buildHeader(0), ...Array.from({ length: 144 }, () => chunk)],
    });
    await handleReplayUpload(ctx.httpReq, ctx.httpRes, manager());
    expect(ctx.res.status).toBe(413);
    expect(ctx.req.destroy).toHaveBeenCalledOnce();
  });

  it.each([
    { chunks: [new Uint8Array([1, 2, 3])], length: undefined },
    { chunks: [buildHeader(0)], length: String(buildHeader(0).byteLength + 1) },
  ])(
    "rejects invalid demo bytes or a truncated body",
    async ({ chunks, length }) => {
      const ctx = request({
        chunks,
        headers: {
          "content-type": "application/octet-stream",
          ...(length ? { "content-length": length } : {}),
        },
      });
      await handleReplayUpload(ctx.httpReq, ctx.httpRes, manager());
      expect(ctx.res.status).toBe(400);
    },
  );

  it("links an interrupted response to room preparation cancellation", async () => {
    const ctx = request();
    let observed!: AbortSignal;
    const rooms = {
      discardUnclaimedUpload: vi.fn(),
      createUploadedDemo: vi.fn(({ signal }: UploadedReplayRequest) => {
        observed = signal;
        return new Promise<never>((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          }),
        );
      }),
    };
    const pending = handleReplayUpload(ctx.httpReq, ctx.httpRes, rooms);
    ctx.res.destroyed = true;
    ctx.res.emit("close");
    await pending;
    expect(observed.aborted).toBe(true);
  });

  it("returns capacity errors without consuming a request body", async () => {
    const ctx = request();
    const rooms = {
      discardUnclaimedUpload: vi.fn(),
      createUploadedDemo: vi.fn(async () => {
        throw new ReplayCapacityError();
      }),
    };
    await handleReplayUpload(ctx.httpReq, ctx.httpRes, rooms);
    expect(ctx.res.status).toBe(503);
  });

  it("discards a prepared upload when its capability response closes before flushing", async () => {
    const ctx = request({ autoFinish: false });
    const rooms = manager();
    await handleReplayUpload(ctx.httpReq, ctx.httpRes, rooms);
    expect(ctx.res.writableEnded).toBe(true);
    expect(rooms.discardUnclaimedUpload).not.toHaveBeenCalled();
    ctx.res.destroyed = true;
    ctx.res.emit("close");
    expect(rooms.discardUnclaimedUpload).toHaveBeenCalledExactlyOnceWith(
      "room",
      "private",
    );
    expect(ctx.res.listenerCount("close")).toBe(0);
  });

  it("preserves a normally flushed capability for a later WebSocket owner claim", async () => {
    const ctx = request({ autoFinish: false });
    const rooms = manager();
    await handleReplayUpload(ctx.httpReq, ctx.httpRes, rooms);
    ctx.res.writableFinished = true;
    ctx.res.emit("finish");
    ctx.res.emit("close");
    expect(rooms.discardUnclaimedUpload).not.toHaveBeenCalled();
    expect(ctx.req.listenerCount("aborted")).toBe(0);
    expect(ctx.res.listenerCount("close")).toBe(0);
  });

  it("discards a late result if the response was already interrupted", async () => {
    const ctx = request();
    let finish!: (result: { sessionId: string; ownerToken: string }) => void;
    const rooms = {
      discardUnclaimedUpload: vi.fn(),
      createUploadedDemo: vi.fn(
        () =>
          new Promise<{ sessionId: string; ownerToken: string }>((resolve) => {
            finish = resolve;
          }),
      ),
    };
    const pending = handleReplayUpload(ctx.httpReq, ctx.httpRes, rooms);
    ctx.res.destroyed = true;
    ctx.res.emit("close");
    finish({ sessionId: "room", ownerToken: "private" });
    await pending;
    expect(rooms.discardUnclaimedUpload).toHaveBeenCalledExactlyOnceWith(
      "room",
      "private",
    );
  });
});
