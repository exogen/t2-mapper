import { beforeEach, describe, expect, it } from "vitest";
// @ts-expect-error -- plain JS worker module, no types package installed
import handler from "./index.js";

/** A stand-in for an R2 object, shaped like what the binding returns. */
function r2Object(
  key: string,
  body: string | null,
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
  if (body !== null) object.body = body;
  return object;
}

let bucket: Record<string, ReturnType<typeof r2Object>>;
let getCalls: string[];
let cacheStore: Map<string, Response>;
let putKeys: string[];

const env = {
  BUCKET: {
    async get(key: string) {
      getCalls.push(key);
      return bucket[key] ?? null;
    },
  },
};
const ctx = { waitUntil: (p: Promise<unknown>) => void p };

beforeEach(() => {
  getCalls = [];
  putKeys = [];
  cacheStore = new Map();
  bucket = {
    "game/base/shapes/a.dts": r2Object("plain", "PLAIN-DTS-BYTES"),
    "game/base/shapes/a.dts.br": r2Object("br", "BROTLI-BYTES", {
      encoding: "br",
    }),
    "game/base/shapes/lonely.dts": r2Object("lonely", "NO-SIBLING"),
    "game/base/textures/t.png": r2Object("png", "PNG"),
  };
  (globalThis as unknown as { caches: unknown }).caches = {
    default: {
      async match(request: Request) {
        return cacheStore.get(request.url);
      },
      async put(request: Request, response: Response) {
        putKeys.push(request.url);
        cacheStore.set(request.url, response);
      },
    },
  };
});

const ORIGIN = "https://assets.tribes2.online";
function get(
  path: string,
  headers: Record<string, string> = {},
  method = "GET",
) {
  return handler.fetch(
    new Request(`${ORIGIN}${path}`, { method, headers }),
    env,
    ctx,
  );
}

describe("asset worker", () => {
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
