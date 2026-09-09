/**
 * Asset worker for assets.tribes2.online.
 *
 * Serves the R2 bucket, and for formats that have a precompressed sibling
 * (`<name>.dts.br` and `<name>.dif.br`, written by scripts/sync-assets.ts)
 * hands the compressed copy to any client that accepts brotli. The client
 * always asks for the plain file; the swap is invisible to it.
 *
 * Cloudflare compresses `application/octet-stream` not at all, which is why
 * shapes and interiors go over the wire raw without this. Brotli quality 11
 * takes both to about a third of their size.
 */

/**
 * Extensions with a `<name>.br` sibling in the bucket. Kept in step with
 * PRECOMPRESS_EXTENSIONS in scripts/lib/precompress.ts — an extension listed
 * here but not written by the sync just misses the cache and falls back.
 */
const PRECOMPRESSED_EXTENSIONS = [".dts", ".dif"];

/**
 * CORS, matching what the R2 custom domain served before the worker took
 * over the hostname: the app is on tribes2.online and the assets are not,
 * so every fetch of a shape or interior is cross-origin. Reading through
 * the R2 binding bypasses the bucket's own CORS policy entirely, so it has
 * to be reproduced here or every asset request fails.
 *
 * A constant `*` needs no `Vary: Origin`, unlike echoing the request origin.
 */
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

/**
 * @param {Headers} headers
 * @returns {Headers}
 */
function withCors(headers) {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}

/**
 * @param {string} body
 * @param {number} status
 * @returns {Response}
 */
function errorResponse(body, status) {
  return new Response(body, { status, headers: withCors(new Headers()) });
}

/**
 * Whether the client accepts brotli, honouring q-values.
 *
 * `br;q=0` is an explicit refusal, and a bare `*` covers brotli unless brotli
 * is named separately. A substring test for "br" gets both of those wrong.
 *
 * @param {string | null} header
 * @returns {boolean}
 */
export function acceptsBrotli(header) {
  if (!header) return false;
  let wildcardQuality = null;
  for (const part of header.split(",")) {
    const [rawToken, ...parameters] = part.split(";");
    const token = rawToken.trim().toLowerCase();
    if (!token) continue;
    let quality = 1;
    for (const parameter of parameters) {
      const match = /^\s*q=([0-9](?:\.[0-9]{1,3})?)\s*$/i.exec(parameter);
      if (match) quality = Number.parseFloat(match[1]);
    }
    if (token === "br") return quality > 0;
    if (token === "*") wildcardQuality = quality;
  }
  return wildcardQuality !== null && wildcardQuality > 0;
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function hasSibling(key) {
  return PRECOMPRESSED_EXTENSIONS.some((extension) => key.endsWith(extension));
}

/**
 * Response headers for an R2 object. `writeHttpMetadata` carries whatever the
 * upload stored, including the sibling's Content-Encoding, so the metadata
 * table in scripts/lib/assetMetadata.ts stays the single source of truth.
 *
 * @param {R2Object} object
 * @param {string | null} encoding
 * @returns {Headers}
 */
function responseHeaders(object, encoding) {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  // Mandatory: the body depends on the request's Accept-Encoding, and without
  // this a shared cache may hand compressed bytes to a client that cannot
  // read them.
  headers.set("Vary", "Accept-Encoding");
  headers.set("Accept-Ranges", "bytes");
  if (encoding) headers.set("Content-Encoding", encoding);
  return withCors(headers);
}

/**
 * @param {Response} response
 * @param {string} method
 * @returns {Response}
 */
function forMethod(response, method) {
  if (method !== "HEAD") return response;
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * Re-wrap a cached response so an already-encoded body is not encoded again
 * on its way out, the same reason the fresh path passes encodeBody.
 *
 * @param {Response} response
 * @returns {Response}
 */
function fromCache(response) {
  if (!response.headers.has("Content-Encoding")) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    encodeBody: "manual",
  });
}

export default {
  /**
   * @param {Request} request
   * @param {{ BUCKET: R2Bucket }} env
   * @param {ExecutionContext} ctx
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      const headers = withCors(new Headers());
      headers.set("Allow", "GET, HEAD, OPTIONS");
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      const headers = withCors(new Headers());
      headers.set("Allow", "GET, HEAD, OPTIONS");
      return new Response("Method not allowed", { status: 405, headers });
    }

    const url = new URL(request.url);
    let key;
    try {
      key = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    } catch {
      return errorResponse("Bad request", 400);
    }
    if (!key || key.endsWith("/")) {
      return errorResponse("Not found", 404);
    }

    // A compressed variant has entirely different byte offsets, so a ranged
    // request has to be answered from the original object.
    const rangeHeader = request.headers.get("Range");
    const useSibling =
      !rangeHeader &&
      hasSibling(key) &&
      acceptsBrotli(request.headers.get("Accept-Encoding"));

    // The body differs by encoding, so the variant needs its own cache
    // entry; relying on Vary alone would let one answer for the other.
    //
    // The compressed variant is keyed on the sibling's REAL url rather than
    // a synthetic query param. A purge is by url, so a made-up key like
    // `x.dts?__enc=br` is a url nothing ever purges: the deploy purges
    // `x.dts` and `x.dts.br`, and the compressed copy would have stayed
    // stale behind a year-long s-maxage. Keying on `x.dts.br` means the
    // upload of that sibling already invalidates it.
    const cacheKey = new Request(
      useSibling ? `${url.origin}/${key}.br${url.search}` : url.toString(),
      { method: "GET" },
    );
    const cache = caches.default;

    const conditional =
      request.headers.has("If-None-Match") ||
      request.headers.has("If-Modified-Since");

    if (!rangeHeader && !conditional) {
      const hit = await cache.match(cacheKey);
      if (hit) return forMethod(fromCache(hit), request.method);
    }

    try {
      const options = { onlyIf: request.headers };
      if (rangeHeader) options.range = request.headers;

      // A missing sibling must not become a 404 for a shape that exists, so
      // fall back to the original. R2 returns null only when the key is
      // absent; a failed precondition still returns an object, without a body.
      let object = useSibling
        ? await env.BUCKET.get(`${key}.br`, options)
        : null;
      let encoding = object ? "br" : null;
      if (!object) object = await env.BUCKET.get(key, options);
      if (!object) return errorResponse("Not found", 404);

      const headers = responseHeaders(object, encoding);
      const body = "body" in object ? object.body : null;

      if (!body) {
        // The precondition matched what the client already holds.
        return new Response(null, { status: 304, headers });
      }

      if (object.range && rangeHeader) {
        // R2 answers `bytes=-500` with { suffix }, where defaulting offset to
        // 0 and length to the whole object would describe the wrong bytes.
        const suffix = object.range.suffix;
        const offset =
          suffix === undefined
            ? (object.range.offset ?? 0)
            : Math.max(object.size - suffix, 0);
        const length =
          suffix === undefined
            ? (object.range.length ?? object.size - offset)
            : Math.min(suffix, object.size);
        headers.set(
          "Content-Range",
          `bytes ${offset}-${offset + length - 1}/${object.size}`,
        );
        headers.set("Content-Length", String(length));
        return forMethod(
          new Response(body, {
            status: 206,
            headers,
            ...(encoding ? { encodeBody: "manual" } : {}),
          }),
          request.method,
        );
      }

      headers.set("Content-Length", String(object.size));
      // The body is ALREADY brotli. Without this the runtime treats it as
      // identity and applies Content-Encoding itself, so the client inflates
      // once and is left holding still-compressed bytes.
      const response = new Response(body, {
        status: 200,
        headers,
        ...(encoding ? { encodeBody: "manual" } : {}),
      });
      // Only a complete, unconditional 200 is safe to store.
      if (!rangeHeader && !conditional) {
        ctx.waitUntil(
          cache.put(cacheKey, response.clone()).catch((error) => {
            console.error("asset worker cache.put failed", key, error);
          }),
        );
      }
      return forMethod(response, request.method);
    } catch (error) {
      // Never surface a stack to the client, and never fail closed silently.
      console.error("asset worker error", key, error);
      return errorResponse("Bad gateway", 502);
    }
  },
};
