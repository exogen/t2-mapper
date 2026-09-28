import type { IncomingMessage, ServerResponse } from "node:http";
import { Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const logs = vi.hoisted(() => [] as Record<string, any>[]);
vi.mock("./logger", async () => {
  const { default: pino } = await import("pino");
  return {
    relayLog: pino(
      { level: "silent" },
      {
        write(line) {
          logs.push(JSON.parse(line));
        },
      },
    ),
  };
});
import { buildHeader, DEMO_LENGTH_MS_OFFSET } from "./demoWriter";
import {
  DemoValidationError,
  DemoTooLargeError,
  MAX_SOURCE_DEMO_BYTES,
} from "./demoSourceValidation";
import {
  demoImportQueue,
  DemoImportQueueFull,
  MAX_QUEUED_DEMO_IMPORTS,
} from "./demoImportQueue";
import { handleDemoDownload } from "./demoDownload";
import { DemoSourceNotFound, type DemoSourceCache } from "./demoSourceCache";

const data = buildHeader(0);

class ResponseSink extends Writable {
  headers = new Map<string, string>();
  statusCode = 200;
  headersSent = false;
  chunks: Buffer[] = [];
  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }
  writeHead(status: number, headers: Record<string, string>) {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers))
      this.setHeader(name, value);
    this.headersSent = true;
    return this;
  }
  _write(chunk: Buffer, _encoding: string, callback: () => void) {
    this.headersSent = true;
    this.chunks.push(chunk);
    callback();
  }
}

function request(
  url = "/demo-download/tribesforever/22945",
  method = "GET",
  cache: Pick<DemoSourceCache, "ensure"> | null = null,
  polling = true,
) {
  const req = {
    url,
    method,
    headers: polling
      ? { accept: "application/octet-stream, application/json" }
      : {},
    socket: { remoteAddress: "192.0.2.20", remotePort: 50000 },
  } as IncomingMessage;
  const res = new ResponseSink();
  return {
    res,
    run: () =>
      handleDemoDownload(req, res as unknown as ServerResponse, false, cache),
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  logs.length = 0;
});

describe("external demo download relay", () => {
  it("keeps older clients waiting for a redirect instead of sending them status JSON", async () => {
    vi.useFakeTimers();
    let ready!: (url: string) => void;
    const shared = new Promise<string>((resolve) => {
      ready = resolve;
    });
    const { res, run } = request(
      undefined,
      "GET",
      { ensure: () => shared },
      false,
    );
    const pending = run();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(res.headersSent).toBe(false);
    ready("https://demos.example/cached.rec");
    await pending;
    expect(res.statusCode).toBe(302);
  });
  it("returns a poll response while an import is still pending", async () => {
    vi.useFakeTimers();
    let ready!: (url: string) => void;
    const shared = new Promise<string>((resolve) => {
      ready = resolve;
    });
    const cache = { ensure: vi.fn(() => shared) };
    const first = request(undefined, "GET", cache);
    const pending = first.run();
    await vi.advanceTimersByTimeAsync(1_000);
    await pending;
    expect(first.res.statusCode).toBe(202);
    expect(first.res.headers.get("retry-after")).toBe("2");
    expect(first.res.headers.get("access-control-expose-headers")).toBe(
      "Retry-After",
    );
    expect(first.res.headers.has("location")).toBe(false);
    ready("https://demos.example/cached.rec");
    const next = request(undefined, "GET", cache);
    await next.run();
    expect(next.res.statusCode).toBe(302);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("releases a disconnected HTTP waiter before its shared import finishes", async () => {
    let reject!: (reason: Error) => void;
    const shared = new Promise<string>((_, r) => {
      reject = r;
    });
    const { res, run } = request(undefined, "GET", { ensure: () => shared });
    const pending = run();
    res.destroy();
    await pending;
    expect(res.headersSent).toBe(false);
    // A later shared failure must not become an unhandled rejection.
    reject(new Error("upload failed after browser left"));
    await Promise.resolve();
  });

  it("redirects to R2 only after the cache is ready", async () => {
    let ready!: (url: string) => void;
    const ensure = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          ready = resolve;
        }),
    );
    vi.stubGlobal("fetch", vi.fn());
    const { res, run } = request(undefined, "GET", { ensure });
    const pending = run();
    expect(res.headersSent).toBe(false);
    const url = "https://demos.example/demos/sources/tribesforever/22945.rec";
    ready(url);
    await pending;
    expect(res.statusCode).toBe(302);
    expect(res.headers.get("location")).toBe(url);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(fetch).not.toHaveBeenCalled();
    expect(ensure).toHaveBeenCalledWith(
      expect.objectContaining({ source: "tribesforever", id: "22945" }),
    );
  });

  it.each([
    [new DemoSourceNotFound(), 404],
    [new DemoTooLargeError(), 413],
    [new DemoValidationError("Only Tribes 2 v25034 demos are supported"), 422],
    [new DemoImportQueueFull(), 503],
    [new Error("R2 failure"), 502],
  ])(
    "returns a cache failure without refetching the source (%s)",
    async (error, status) => {
      vi.stubGlobal("fetch", vi.fn());
      const { res, run } = request(undefined, "GET", {
        ensure: vi.fn().mockRejectedValue(error),
      });
      await run();
      expect(res.statusCode).toBe(status);
      if (status === 503) expect(res.headers.get("retry-after")).toBe("30");
      expect(res.headers.has("location")).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("does not cancel a shared import when a browser leaves", async () => {
    let ready!: (url: string) => void;
    const shared = new Promise<string>((resolve) => {
      ready = resolve;
    });
    const cache = { ensure: vi.fn(() => shared) };
    const first = request(undefined, "GET", cache);
    const second = request(undefined, "GET", cache);
    const pending = [first.run(), second.run()];
    first.res.destroy();
    ready("https://demos.example/cached.rec");
    await Promise.all(pending);
    expect(first.res.headersSent).toBe(false);
    expect(second.res.statusCode).toBe(302);
  });

  it("streams the fixed source with CORS and audit attribution", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(data, {
            headers: {
              "Content-Length": String(data.length),
            },
          }),
      ),
    );
    const { res, run } = request();
    expect(await run()).toBe(true);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://tribesforever.com/demo/22945/download",
      {
        signal: expect.any(AbortSignal),
        headers: { "Accept-Encoding": "identity" },
        redirect: "error",
      },
    );
    expect(Buffer.concat(res.chunks)).toEqual(Buffer.from(data));
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("content-length")).toBe(String(data.length));
    expect(logs[0]).toMatchObject({
      event: "browser_input",
      clientIp: "192.0.2.20",
      connectionId: expect.any(String),
      input: { method: "GET", url: "/demo-download/tribesforever/22945" },
    });
  });

  it.each([
    "/demo-download/unknown/1",
    "/demo-download/tribesforever/0",
    "/demo-download/tribesforever/22945/../../secret",
    "/demo-download/tribesforever/22945?url=https://example.com",
    "/demo-download/tribesforever/https://example.com",
  ])("does not fetch unsupported or malformed routes (%s)", async (url) => {
    vi.stubGlobal("fetch", vi.fn());
    const { res, run } = request(url);
    expect(await run()).toBe(true);
    expect(res.statusCode).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(logs[0]).toHaveProperty("clientIp", "192.0.2.20");
  });

  it("rejects non-GET requests and leaves unrelated HTTP routes alone", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { res, run } = request(undefined, "POST");
    expect(await run()).toBe(true);
    expect(res.statusCode).toBe(405);
    expect(await request("/health").run()).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(logs).toHaveLength(1);
  });

  it.each([
    [404, 404],
    [500, 502],
  ])(
    "maps upstream HTTP %s to %s without leaking the upstream error body",
    async (upstream, expected) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response("upstream internal details", { status: upstream }),
        ),
      );
      const { res, run } = request();
      await run();
      expect(res.statusCode).toBe(expected);
      expect(Buffer.concat(res.chunks).toString()).toBe(
        "Couldn't download the demo",
      );
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
    },
  );

  it("rejects unsupported versions even without R2", async () => {
    const invalid = new Uint8Array(data);
    new DataView(invalid.buffer).setUint32(
      DEMO_LENGTH_MS_OFFSET - 4,
      0x330003,
      true,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(invalid, {
            headers: { "Content-Length": String(invalid.length) },
          }),
      ),
    );
    const { res, run } = request();
    await run();
    expect(res.statusCode).toBe(422);
    expect(Buffer.concat(res.chunks).toString()).toContain(
      "Only Tribes 2 v25034 demos are supported",
    );
    expect(res.headers.has("content-disposition")).toBe(false);
  });

  it("reports network failures with a CORS-readable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { res, run } = request();
    await run();
    expect(res.statusCode).toBe(502);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects encoded source bodies with an unusable content length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(data, {
            headers: { "Content-Length": "999", "Content-Encoding": "gzip" },
          }),
      ),
    );
    const { res, run } = request();
    await run();
    expect(res.statusCode).toBe(422);
    expect(res.headers.has("content-length")).toBe(false);
    expect(res.headers.has("content-encoding")).toBe(false);
  });

  it("cancels the upstream download when the browser disconnects", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(data);
              },
              cancel,
            }),
            { headers: { "Content-Length": String(data.length + 1) } },
          ),
      ),
    );
    const { res, run } = request();
    const pending = run();
    await vi.waitFor(() => expect(res.chunks).toHaveLength(1));
    const signal = vi.mocked(fetch).mock.calls[0][1]!.signal!;
    res.destroy();
    await pending;
    expect(signal.aborted).toBe(true);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("queues fallback streams too and removes disconnected waiters", async () => {
    let finish!: () => void;
    const blocked = demoImportQueue.run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(data, {
            headers: { "Content-Length": String(data.length) },
          }),
      ),
    );
    const canceled = request();
    const next = request("/demo-download/tribesforever/22946");
    const pending = [canceled.run(), next.run()];
    expect(fetch).not.toHaveBeenCalled();
    canceled.res.destroy();
    await pending[0];
    finish();
    await Promise.all([blocked, ...pending]);
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "https://tribesforever.com/demo/22946/download",
      expect.anything(),
    );
    expect(Buffer.concat(next.res.chunks)).toEqual(Buffer.from(data));
  });

  it("releases a fallback slot on timeout even when the browser stops reading", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(data, {
            headers: { "Content-Length": String(data.length) },
          }),
      ),
    );
    const stalled = request();
    stalled.res._write = (chunk) => {
      stalled.res.chunks.push(chunk);
      // Never acknowledge the write: simulate a browser that stopped reading.
    };
    const pending = stalled.run();
    await vi.waitFor(() => expect(stalled.res.chunks).toHaveLength(1));
    const next = request("/demo-download/tribesforever/22946");
    const queued = next.run();
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    await Promise.all([pending, queued]);
    expect(stalled.res.destroyed).toBe(true);
    expect(next.res.statusCode).toBe(503);
    const retry = request("/demo-download/tribesforever/22946");
    const retried = retry.run();
    await vi.advanceTimersByTimeAsync(100);
    await retried;
    expect(Buffer.concat(retry.res.chunks)).toEqual(Buffer.from(data));
  });

  it("returns 503 when the fallback queue fills without fetching rejected demos", async () => {
    let finish!: () => void;
    const blocked = demoImportQueue.run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();
    vi.stubGlobal("fetch", vi.fn());
    const waiters = Array.from({ length: MAX_QUEUED_DEMO_IMPORTS }, () =>
      request(),
    );
    const pending = waiters.map(({ run }) => run());
    const overflow = request();
    await overflow.run();
    expect(overflow.res.statusCode).toBe(503);
    expect(overflow.res.headers.get("retry-after")).toBe("30");
    expect(fetch).not.toHaveBeenCalled();
    for (const waiter of waiters) waiter.res.destroy();
    await Promise.all(pending);
    finish();
    await blocked;
  });

  it("bounds the fallback wait and removes timed-out requests from the queue", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const blocked = demoImportQueue.run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", vi.fn());
    const { res, run } = request();
    const pending = run();
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    expect(res.statusCode).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    finish();
    await blocked;
    expect(await demoImportQueue.run(async () => "next")).toBe("next");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("rejects oversized source responses before streaming, even without R2", async () => {
    const cancel = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(new ReadableStream({ cancel }), {
            headers: { "Content-Length": String(MAX_SOURCE_DEMO_BYTES + 1) },
          }),
      ),
    );
    const { res, run } = request();
    await run();
    expect(res.statusCode).toBe(413);
    expect(Buffer.concat(res.chunks).toString()).toBe(
      "Demo exceeds the 150 MB size limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(res.headers.has("content-length")).toBe(false);
  });
});
