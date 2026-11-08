import { DemoParser, DemoIdentString } from "t2-demo-parser";
import type { DemoSourceCache } from "./demoSourceCache.js";
import { resolveRemoteDemo } from "./demoSources.js";
import { DEMO_TRANSFER_TIMEOUT_MS } from "./demoImportQueue.js";
import { SOURCE_DEMO_PROTOCOL_VERSION } from "./demoSourceMetadata.js";
import { MAX_SOURCE_DEMO_BYTES } from "./demoSourceValidation.js";
import { readDemoGames, type DemoGame } from "./demoMetadata.js";

const MAX_METADATA_BYTES = 128 * 1024;
const METADATA_TIMEOUT_MS = 2_000;

export interface ReplayDemoDownload {
  bytes: Uint8Array;
  games: DemoGame[];
}

export interface ReplayDemoLoaderOptions {
  baseUrl?: string;
  cache?: Pick<DemoSourceCache, "ensure"> | null;
  fetch?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
}

/** Validate before reserving a room; references never contain user-supplied URLs. */
export function validateReplayDemoReference(reference: string): void {
  if (typeof reference !== "string" || !reference || reference.length > 1024)
    throw new Error("Invalid demo reference");
  const separator = reference.indexOf(":");
  if (separator >= 0) {
    resolveRemoteDemo(
      reference.slice(0, separator),
      reference.slice(separator + 1),
    );
    return;
  }
  if (
    !reference.toLowerCase().endsWith(".rec") ||
    /[/\\\x00-\x1f\x7f]/.test(reference) ||
    reference === "." ||
    reference === ".."
  )
    throw new Error("Choose a published demo or a supported demo source");
}

async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let cancel!: () => void;
  const stopped = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason);
    signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([promise, stopped]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

async function responseBytes(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const length = response.headers.get("content-length");
  if (length && /^\d+$/.test(length) && Number(length) > maxBytes) {
    await response.body?.cancel();
    throw new Error("Demo is too large for a replay session");
  }
  if (!response.body) throw new Error("The demo source returned no data");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes)
        throw new Error("Demo is too large for a replay session");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** Optional labels only come from a sibling of a validated published filename. */
async function publishedGames(
  url: string,
  fetchDemo: typeof fetch,
  signal: AbortSignal,
): Promise<DemoGame[]> {
  const metadataSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(METADATA_TIMEOUT_MS),
  ]);
  try {
    const response = await abortable(
      fetchDemo(`${url}.json`, {
        signal: metadataSignal,
        redirect: "error",
        cache: "no-store",
        headers: { "Accept-Encoding": "identity" },
      }),
      metadataSignal,
    );
    if (!response.ok) {
      await response.body?.cancel();
      return [];
    }
    const bytes = await responseBytes(
      response,
      MAX_METADATA_BYTES,
      metadataSignal,
    );
    return readDemoGames(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return [];
  }
}

/** Bounded download from the configured bucket or an allowlisted external source. */
export function createReplayDemoLoader(options: ReplayDemoLoaderOptions = {}) {
  const base = new URL(
    options.baseUrl ??
      process.env.DEMOS_BASE_URL ??
      "https://demos.tribes2.online/demos",
  );
  if (
    !/^https?:$/.test(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new Error("DEMOS_BASE_URL must be an HTTP(S) directory URL");
  base.pathname = base.pathname.replace(/\/+$/, "") + "/";
  const fetchDemo = options.fetch ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_SOURCE_DEMO_BYTES;
  const timeoutMs = options.timeoutMs ?? DEMO_TRANSFER_TIMEOUT_MS;
  return async (
    reference: string,
    signal: AbortSignal,
  ): Promise<ReplayDemoDownload> => {
    validateReplayDemoReference(reference);
    const downloadSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(timeoutMs),
    ]);
    downloadSignal.throwIfAborted();
    let url: string;
    const separator = reference.indexOf(":");
    if (separator >= 0) {
      const demo = resolveRemoteDemo(
        reference.slice(0, separator),
        reference.slice(separator + 1),
      );
      url = options.cache
        ? await abortable(options.cache.ensure(demo), downloadSignal)
        : demo.url;
    } else {
      // Encode the complete filename so even percent-encoded slashes cannot
      // escape the configured directory after URL resolution.
      url = new URL(encodeURIComponent(reference), base).href;
    }
    const responseTask = fetchDemo(url, {
      signal: downloadSignal,
      redirect: "error",
      headers: { "Accept-Encoding": "identity" },
    });
    const games =
      separator < 0
        ? publishedGames(url, fetchDemo, downloadSignal)
        : Promise.resolve([]);
    const response = await responseTask;
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        response.status === 404
          ? "Demo not found"
          : "Couldn't download the demo",
      );
    }
    const bytes = await responseBytes(response, maxBytes, downloadSignal);
    let header;
    try {
      header = DemoParser.peekHeader(bytes).header;
    } catch {
      throw new Error("The source did not return a Tribes 2 demo");
    }
    if (
      header.identString !== DemoIdentString ||
      header.protocolVersion !== SOURCE_DEMO_PROTOCOL_VERSION
    )
      throw new Error("Only supported Tribes 2 demos can be replayed");
    const metadata = await games;
    signal.throwIfAborted();
    return { bytes, games: metadata };
  };
}
