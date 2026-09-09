import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error -- plain JS worker module, no types package installed
import handler from "./index.js";

/** A stand-in for an R2 object, shaped like what the binding returns. */
function r2Object(
  key: string,
  body: string | Uint8Array | null,
  { encoding }: { encoding?: string } = {},
) {
  const object: Record<string, unknown> = {
    size: body === null ? 42 : body.length,
    httpEtag: `"etag-${key}"`,
    writeHttpMetadata(headers: Headers) {
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Cache-Control", "public, max-age=7200");
      if (encoding) headers.set("Content-Encoding", encoding);
    },
  };
  // A failed precondition returns an object with NO body property at all.
  if (body !== null)
    object.body = typeof body === "string" ? body : new Uint8Array(body);
  return object;
}

let bucket: Record<string, ReturnType<typeof r2Object>>;
let getCalls: string[];
let cacheStore: Map<string, Response>;
let putKeys: string[];
let pendingWrites: Promise<unknown>[];
let manualResponses: WeakSet<Response>;

const NativeResponse = Response;
type WorkerResponseInit = ResponseInit & {
  encodeBody?: "manual" | "automatic";
};

// Model the workerd boundary that Node's Response doesn't implement:
// clone() drops encodeBody, and cache.put() serializes/compresses the response.
class WorkerResponse extends NativeResponse {
  constructor(body?: BodyInit | null, init?: WorkerResponseInit) {
    super(body, init);
    if (init?.encodeBody === "manual") manualResponses.add(this);
  }
}

async function wireBody(response: Response) {
  const body = Buffer.from(await response.arrayBuffer());
  return response.headers.get("Content-Encoding") === "br" &&
    !manualResponses.has(response)
    ? brotliCompressSync(body)
    : body;
}

const env = {
  BUCKET: {
    async get(key: string) {
      getCalls.push(key);
      return bucket[key] ?? null;
    },
  },
};
const ctx = { waitUntil: (p: Promise<unknown>) => pendingWrites.push(p) };

beforeEach(() => {
  getCalls = [];
  putKeys = [];
  pendingWrites = [];
  manualResponses = new WeakSet();
  vi.stubGlobal("Response", WorkerResponse);
  cacheStore = new Map();
  bucket = {
    "game/base/shapes/a.dts": r2Object("plain", "PLAIN-DTS-BYTES"),
    "game/base/shapes/a.dts.br": r2Object(
      "br",
      brotliCompressSync("PLAIN-DTS-BYTES"),
      {
        encoding: "br",
      },
    ),
    "game/base/shapes/lonely.dts": r2Object("lonely", "NO-SIBLING"),
    "game/base/textures/t.png": r2Object("png", "PNG"),
  };
  vi.stubGlobal("caches", {
    default: {
      async match(request: Request) {
        const stored = cacheStore.get(request.url);
        if (!stored) return undefined;
        const headers = new Headers(stored.headers);
        let body = Buffer.from(await stored.clone().arrayBuffer());
        if (headers.get("Content-Encoding") === "br") {
          body = brotliDecompressSync(body);
          // The cache negotiates its response independently of the client.
          if (request.headers.get("Accept-Encoding") !== "br") {
            headers.delete("Content-Encoding");
            headers.delete("Content-Length");
          }
        }
        // Native cached responses expose decoded bytes when read and perform
        // automatic encoding/passthrough when returned to the client.
        return new Response(body, { headers });
      },
      async put(request: Request, response: Response) {
        putKeys.push(request.url);
        cacheStore.set(
          request.url,
          new NativeResponse(await wireBody(response), {
            headers: response.headers,
          }),
        );
      },
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

const ORIGIN = "https://assets.tribes2.online";
async function get(
  path: string,
  headers: Record<string, string> = {},
  method = "GET",
  clientAcceptEncoding?: string | null,
) {
  const request = new Request(`${ORIGIN}${path}`, { method, headers });
  if (clientAcceptEncoding !== undefined) {
    Object.assign(request, { cf: { clientAcceptEncoding } });
  }
  const response = await handler.fetch(request, env, ctx);
  await Promise.all(pendingWrites);
  return response;
}

describe("asset worker", () => {
  describe("temporary encoding diagnostics", () => {
    const key = "game/base/@vl2/shapes.vl2/shapes/borg3.dts";
    const probePath = `/${key}?__t2_encoding_debug=test-run`;

    beforeEach(() => {
      bucket[key] = bucket["game/base/shapes/a.dts"];
      bucket[`${key}.br`] = bucket["game/base/shapes/a.dts.br"];
      vi.spyOn(console, "log").mockImplementation(() => {});
    });
    afterEach(() => vi.restoreAllMocks());

    it("records cold and warm headers without consuming response bodies", async () => {
      for (let i = 0; i < 2; i++) {
        const response = await get(
          probePath,
          { "Accept-Encoding": "br, gzip" },
          "GET",
          "br, identity;q=0",
        );
        expect(response.bodyUsed).toBe(false);
        expect(brotliDecompressSync(await wireBody(response)).toString()).toBe(
          "PLAIN-DTS-BYTES",
        );
      }
      const entries = vi.mocked(console.log).mock.calls.map(([label, json]) => {
        expect(label).toBe("asset-encoding-debug");
        return JSON.parse(json);
      });
      expect(entries.map(({ stage }) => stage)).toEqual([
        "cache-match",
        "r2-response",
        "cache-put",
        "cache-match",
      ]);
      expect(entries[0].response).toBeNull();
      for (const entry of entries) {
        expect(entry).toMatchObject({
          url: `${ORIGIN}${probePath}`,
          method: "GET",
          clientAcceptEncoding: "br, identity;q=0",
          workerAcceptEncoding: "br, gzip",
          cacheUrl: `${ORIGIN}/${key}.br?__t2_encoding_debug=test-run`,
          cacheAcceptEncoding: "br",
        });
      }
      for (const entry of entries.slice(1)) {
        expect(entry.response).toMatchObject({
          contentEncoding: "br",
          contentLength: String(brotliCompressSync("PLAIN-DTS-BYTES").length),
          etag: '"etag-br"',
          cacheControl: "public, max-age=7200, no-transform",
        });
      }
      expect(entries[2].response.cacheVersion).toBe("2");
      expect(entries[3].response.cacheVersion).toBe("2");
      expect(getCalls).toEqual([`${key}.br`]);
    });

    it("returns a transformed cache hit unchanged and records its actual headers", async () => {
      const hit = new Response("PLAIN-DTS-BYTES", {
        headers: {
          "X-T2-Asset-Cache-Version": "2",
          "CF-Cache-Status": "HIT",
          ETag: 'W/"etag-br"',
        },
      });
      vi.spyOn(caches.default, "match").mockResolvedValueOnce(hit);
      const response = await get(probePath, { "Accept-Encoding": "br" });
      expect(response).toBe(hit);
      expect(response.bodyUsed).toBe(false);
      expect(getCalls).toEqual([]);
      expect(putKeys).toEqual([]);
      expect(console.log).toHaveBeenCalledExactlyOnceWith(
        "asset-encoding-debug",
        expect.any(String),
      );
      const entry = JSON.parse(vi.mocked(console.log).mock.calls[0][1]);
      expect(entry).toMatchObject({
        stage: "cache-match",
        response: {
          contentEncoding: null,
          etag: 'W/"etag-br"',
          cacheStatus: "HIT",
        },
      });
    });

    it("does not log unmarked requests or other assets", async () => {
      await get(`/${key}`, { "Accept-Encoding": "br" });
      await get("/game/base/shapes/a.dts?__t2_encoding_debug=test-run", {
        "Accept-Encoding": "br",
      });
      expect(console.log).not.toHaveBeenCalled();
    });
  });

  it("serves the brotli sibling when the client accepts it", async () => {
    const response = await get("/game/base/shapes/a.dts", {
      "Accept-Encoding": "gzip, br",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Encoding")).toBe("br");
    expect(getCalls[0]).toBe("game/base/shapes/a.dts.br");
  });

  it("serves the original when the client refuses brotli", async () => {
    const response = await get("/game/base/shapes/a.dts", {
      "Accept-Encoding": "gzip, br;q=0",
    });
    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(getCalls).toEqual(["game/base/shapes/a.dts"]);
    expect(await response.text()).toBe("PLAIN-DTS-BYTES");
  });

  it.each(["identity", "gzip", "br;q=0", ""])(
    "uses the original client encoding %j when Cloudflare rewrites the header",
    async (original) => {
      const response = await get(
        "/game/base/shapes/a.dts",
        {
          "Accept-Encoding": "br, gzip",
        },
        "GET",
        original,
      );
      expect(response.headers.get("Content-Encoding")).toBeNull();
      expect(await response.text()).toBe("PLAIN-DTS-BYTES");
      expect(getCalls).toEqual(["game/base/shapes/a.dts"]);
    },
  );

  it.each([
    ["identity", "br", "identity", "br", "gzip", "identity"],
    ["br", "identity", "br", "identity", "gzip", "br"],
  ])(
    "preserves bytes across cold and warm alternating clients (%j)",
    async (...encodings) => {
      for (const encoding of encodings) {
        const response = await get(
          "/game/base/shapes/a.dts",
          {
            "Accept-Encoding": "br, gzip",
          },
          "GET",
          encoding,
        );
        const bytes = await wireBody(response);
        expect(response.headers.get("Content-Encoding")).toBe(
          encoding === "br" ? "br" : null,
        );
        expect(response.headers.get("Cache-Control")).toBe(
          encoding === "br"
            ? "public, max-age=7200, no-transform"
            : "public, max-age=7200",
        );
        expect(
          (encoding === "br" ? brotliDecompressSync(bytes) : bytes).toString(),
        ).toBe("PLAIN-DTS-BYTES");
      }
      // Both representations are served from cache after their first request.
      expect(getCalls).toHaveLength(2);
    },
  );

  it("ignores legacy cache entries that may have been encoded twice", async () => {
    cacheStore.set(
      `${ORIGIN}/game/base/shapes/a.dts.br`,
      new NativeResponse(
        brotliCompressSync(brotliCompressSync("PLAIN-DTS-BYTES")),
        { headers: { "Content-Encoding": "br" } },
      ),
    );
    const response = await get("/game/base/shapes/a.dts", {
      "Accept-Encoding": "br",
    });
    expect(brotliDecompressSync(await wireBody(response)).toString()).toBe(
      "PLAIN-DTS-BYTES",
    );
    expect(getCalls).toEqual(["game/base/shapes/a.dts.br"]);
  });

  it("replaces version 1 entries that allowed compression transforms", async () => {
    cacheStore.set(
      `${ORIGIN}/game/base/shapes/a.dts.br`,
      new NativeResponse(brotliCompressSync("PLAIN-DTS-BYTES"), {
        headers: {
          "Content-Encoding": "br",
          "Cache-Control": "public, max-age=7200",
          "X-T2-Asset-Cache-Version": "1",
        },
      }),
    );
    const fresh = await get("/game/base/shapes/a.dts", {
      "Accept-Encoding": "br",
    });
    const hit = await get("/game/base/shapes/a.dts", {
      "Accept-Encoding": "br",
    });
    for (const response of [fresh, hit]) {
      expect(response.headers.get("Cache-Control")).toBe(
        "public, max-age=7200, no-transform",
      );
      expect(brotliDecompressSync(await wireBody(response)).toString()).toBe(
        "PLAIN-DTS-BYTES",
      );
    }
    expect(getCalls).toEqual(["game/base/shapes/a.dts.br"]);
  });

  it("falls back to the original when the sibling is missing", async () => {
    const response = await get("/game/base/shapes/lonely.dts", {
      "Accept-Encoding": "br",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Encoding")).toBeNull();
    expect(getCalls).toEqual([
      "game/base/shapes/lonely.dts.br",
      "game/base/shapes/lonely.dts",
    ]);
    expect(putKeys).toEqual([]);
    // The fallback must not make the missing .br file appear to exist.
    expect((await get("/game/base/shapes/lonely.dts.br")).status).toBe(404);
  });

  it("never swaps in a sibling for a format that has none", async () => {
    await get("/game/base/textures/t.png", { "Accept-Encoding": "br" });
    expect(getCalls).toEqual(["game/base/textures/t.png"]);
  });

  it("caches the compressed variant under the sibling's real url", async () => {
    // A synthetic key like `a.dts?__enc=br` is a url nothing ever purges.
    await get("/game/base/shapes/a.dts", { "Accept-Encoding": "br" });
    expect(putKeys).toEqual([`${ORIGIN}/game/base/shapes/a.dts.br`]);
  });

  it("preserves escaped path characters and query parameters in the cache key", async () => {
    bucket["game/base/shapes/a#b?c.dts.br"] =
      bucket["game/base/shapes/a.dts.br"];
    await get("/game/base/shapes/a%23b%3Fc.dts?v=3", {
      "Accept-Encoding": "br",
    });
    expect(getCalls).toEqual(["game/base/shapes/a#b?c.dts.br"]);
    expect(putKeys).toEqual([
      `${ORIGIN}/game/base/shapes/a%23b%3Fc.dts.br?v=3`,
    ]);
  });

  it("caches the plain variant under the plain url", async () => {
    await get("/game/base/shapes/a.dts", { "Accept-Encoding": "identity" });
    expect(putKeys).toEqual([`${ORIGIN}/game/base/shapes/a.dts`]);
  });

  it("keeps the two variants in separate cache entries", async () => {
    await get("/game/base/shapes/a.dts", { "Accept-Encoding": "br" });
    await get("/game/base/shapes/a.dts", { "Accept-Encoding": "identity" });
    expect(putKeys).toHaveLength(2);
    expect(new Set(putKeys).size).toBe(2);
  });

  it("sets CORS on success, on errors and on preflight", async () => {
    const ok = await get("/game/base/shapes/a.dts");
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const missing = await get("/game/base/nope.dts");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("Access-Control-Allow-Origin")).toBe("*");

    const preflight = await get("/game/base/shapes/a.dts", {}, "OPTIONS");
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain(
      "GET",
    );

    const bad = await get("/game/base/shapes/a.dts", {}, "DELETE");
    expect(bad.status).toBe(405);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("passes through a directly requested .br with its stored encoding", async () => {
    // Stored Content-Encoding needs the same handling as a negotiated sibling.
    const response = await get("/game/base/shapes/a.dts.br", {
      "Accept-Encoding": "identity",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Encoding")).toBe("br");
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=7200, no-transform",
    );
    // Fetched directly; no sibling lookup for something already a sibling.
    expect(getCalls).toEqual(["game/base/shapes/a.dts.br"]);
    expect(brotliDecompressSync(await wireBody(response)).toString()).toBe(
      "PLAIN-DTS-BYTES",
    );
    const hit = await get("/game/base/shapes/a.dts.br", {
      "Accept-Encoding": "br",
    });
    expect(hit.headers.get("Cache-Control")).toBe(
      "public, max-age=7200, no-transform",
    );
    expect(brotliDecompressSync(await wireBody(hit)).toString()).toBe(
      "PLAIN-DTS-BYTES",
    );
    expect(getCalls).toHaveLength(1);
  });

  it("stores a single Brotli encoding in its own cache", async () => {
    await get("/game/base/shapes/a.dts", { "Accept-Encoding": "br" });
    const stored = cacheStore.get(`${ORIGIN}/game/base/shapes/a.dts.br`);
    expect(stored).toBeDefined();
    expect(stored!.headers.get("Cache-Control")).toBe(
      "public, max-age=7200, no-transform",
    );
    expect(
      brotliDecompressSync(Buffer.from(await stored!.arrayBuffer())).toString(),
    ).toBe("PLAIN-DTS-BYTES");
  });

  it("advertises Vary and range support", async () => {
    const response = await get("/game/base/shapes/a.dts");
    expect(response.headers.get("Vary")).toBe("Accept-Encoding");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
  });

  it("answers a range from the original, never the compressed copy", async () => {
    bucket["game/base/shapes/a.dts"] = {
      ...r2Object("plain", "PLAIN"),
      range: { offset: 2, length: 3 },
      size: 15,
    };
    const response = await get("/game/base/shapes/a.dts", {
      "Accept-Encoding": "br",
      Range: "bytes=2-4",
    });
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 2-4/15");
    expect(getCalls).toEqual(["game/base/shapes/a.dts"]);
    expect(putKeys).toEqual([]);
  });

  it("handles a suffix range, where offset and length are absent", async () => {
    bucket["game/base/shapes/a.dts"] = {
      ...r2Object("plain", "TAIL"),
      range: { suffix: 4 },
      size: 20,
    };
    const response = await get("/game/base/shapes/a.dts", {
      Range: "bytes=-4",
    });
    expect(response.headers.get("Content-Range")).toBe("bytes 16-19/20");
  });

  it("returns 304 when the precondition matches, and does not cache it", async () => {
    bucket["game/base/shapes/a.dts"] = r2Object("plain", null);
    const response = await get("/game/base/shapes/a.dts", {
      "If-None-Match": '"etag-plain"',
    });
    expect(response.status).toBe(304);
    expect(putKeys).toEqual([]);
  });

  it("serves a HEAD with headers and no body", async () => {
    const response = await get("/game/base/shapes/a.dts", {}, "HEAD");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe(
      "application/octet-stream",
    );
    expect(await response.text()).toBe("");
  });

  it("keeps the Brotli GET cached when serving cold and warm HEADs", async () => {
    for (let i = 0; i < 2; i++) {
      const response = await get(
        "/game/base/shapes/a.dts",
        { "Accept-Encoding": "br" },
        "HEAD",
      );
      expect(response.headers.get("Content-Encoding")).toBe("br");
      expect(await response.text()).toBe("");
    }
    const response = await get("/game/base/shapes/a.dts", {
      "Accept-Encoding": "br",
    });
    expect(brotliDecompressSync(await wireBody(response)).toString()).toBe(
      "PLAIN-DTS-BYTES",
    );
    expect(getCalls).toHaveLength(1);
  });

  it("turns a bucket failure into a 502 rather than a stack", async () => {
    const failing = {
      BUCKET: {
        async get() {
          throw new Error("r2 exploded");
        },
      },
    };
    const response = await handler.fetch(
      new Request(`${ORIGIN}/game/base/shapes/a.dts`),
      failing,
      ctx,
    );
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("exploded");
  });

  it("404s a directory-ish path without touching the bucket", async () => {
    const response = await get("/game/base/shapes/");
    expect(response.status).toBe(404);
    expect(getCalls).toEqual([]);
  });
});
