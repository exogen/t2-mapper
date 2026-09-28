import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream } from "node:stream/web";
import { browserIdentity } from "./browserAudit.js";
import {
  DEMO_DOWNLOAD_PREFIX,
  resolveRemoteDemo,
  type RemoteDemo,
} from "./demoSources.js";
import { DemoSourceNotFound, type DemoSourceCache } from "./demoSourceCache.js";
import { relayLog } from "./logger.js";
import { throttleDemoDownload } from "./demoBandwidth.js";
import {
  demoImportQueue,
  DemoImportQueueFull,
  DEMO_TRANSFER_TIMEOUT_MS,
} from "./demoImportQueue.js";
import {
  DemoValidationError,
  DemoTooLargeError,
  sourceDemoLength,
  validateSourceDemo,
} from "./demoSourceValidation.js";

/** CORS bridge for known demo sources, never an arbitrary-URL proxy. */
export async function handleDemoDownload(
  req: IncomingMessage,
  res: ServerResponse,
  trustFlyProxy: boolean,
  cache: Pick<DemoSourceCache, "ensure"> | null = null,
): Promise<boolean> {
  if (!req.url?.startsWith(DEMO_DOWNLOAD_PREFIX)) return false;
  const log = relayLog.child(browserIdentity(req, trustFlyProxy), {
    level: "info",
  });
  log.info(
    {
      event: "browser_input",
      inputSeq: 1,
      frameType: "http",
      input: { method: req.method, url: req.url },
    },
    "Browser demo download requested",
  );
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Expose-Headers", "Retry-After");
  // Don't cache errors or redirects: a cache object may be removed/repaired.
  res.setHeader("Cache-Control", "no-store");
  const fail = (status: number, message: string) => {
    if (status === 503) res.setHeader("Retry-After", "30");
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(message);
  };
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    fail(405, "Method not allowed");
    return true;
  }
  const match = /^\/demo-download\/([^/]+)\/([^/]+)$/.exec(req.url);
  let demo: RemoteDemo;
  try {
    if (!match) throw new Error("Invalid demo route");
    demo = resolveRemoteDemo(match[1], match[2]);
  } catch {
    fail(404, "Unknown demo source or invalid demo ID");
    return true;
  }
  if (cache) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disconnected!: () => void;
    const closed = new Promise<null>((resolve) => {
      disconnected = () => resolve(null);
    });
    res.once("close", disconnected);
    try {
      // Keep the shared import running even if this browser leaves. Other
      // waiters (and later visitors) can still use the completed R2 object.
      const waiting: Promise<string | null>[] = [cache.ensure(demo), closed];
      // Existing clients expect only demo bytes or a redirect, never 202.
      if (req.headers.accept?.includes("application/json"))
        waiting.push(
          new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), 1_000);
            timer.unref();
          }),
        );
      const url = await Promise.race(waiting);
      if (!res.destroyed) {
        if (url === null) {
          // Keep HTTP requests short even when the import queue is slow.
          res.writeHead(202, {
            "Retry-After": "2",
            "Content-Type": "application/json",
          });
          res.end(JSON.stringify({ status: "pending" }));
          return true;
        }
        log.info(
          { source: demo.source, id: demo.id, url },
          "Serving external demo from R2",
        );
        res.writeHead(302, { Location: url });
        res.end();
      }
    } catch (err) {
      log.warn(
        { err, source: demo.source, id: demo.id },
        "External demo cache failed",
      );
      if (!res.destroyed)
        fail(
          err instanceof DemoSourceNotFound
            ? 404
            : err instanceof DemoImportQueueFull
              ? 503
              : err instanceof DemoTooLargeError
                ? 413
                : err instanceof DemoValidationError
                  ? 422
                  : 502,
          err instanceof DemoValidationError ||
            err instanceof DemoImportQueueFull
            ? err.message
            : "Couldn't cache the demo",
        );
    } finally {
      clearTimeout(timer);
      res.off("close", disconnected);
    }
    return true;
  }
  const abort = new AbortController();
  const cancel = () => abort.abort();
  res.on("close", cancel);
  // Without R2 there is no background import to poll. Ask the browser to
  // retry if its streaming request cannot acquire a slot promptly.
  const queueTimer = setTimeout(
    () => abort.abort(new DemoImportQueueFull()),
    20_000,
  );
  queueTimer.unref();
  try {
    await demoImportQueue.run(async () => {
      clearTimeout(queueTimer);
      let body: Readable | undefined;
      const timer = setTimeout(() => abort.abort(), DEMO_TRANSFER_TIMEOUT_MS);
      timer.unref();
      try {
        const upstream = await fetch(demo.url, {
          signal: abort.signal,
          headers: { "Accept-Encoding": "identity" },
          // A redirect must not turn this fixed-origin route into an open proxy.
          redirect: "error",
        });
        if (!upstream.ok || !upstream.body) {
          await upstream.body?.cancel();
          fail(
            upstream.status === 404 ? 404 : 502,
            "Couldn't download the demo",
          );
          return;
        }
        let size: number;
        try {
          size = sourceDemoLength(upstream.headers);
        } catch (err) {
          await upstream.body.cancel();
          throw err;
        }
        body = throttleDemoDownload(
          Readable.fromWeb(upstream.body as ReadableStream<Uint8Array>),
          abort.signal,
          size,
        );
        body.on("error", () => {});
        await validateSourceDemo(body);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Length", String(size));
        await pipeline(body, res, { signal: abort.signal });
      } finally {
        clearTimeout(timer);
        body?.destroy();
      }
    }, abort.signal);
  } catch (err) {
    if (!res.destroyed) {
      log.warn({ err }, "Demo download failed");
      if (!res.headersSent && !res.destroyed)
        fail(
          err instanceof DemoImportQueueFull
            ? 503
            : err instanceof DemoTooLargeError
              ? 413
              : err instanceof DemoValidationError
                ? 422
                : 502,
          err instanceof DemoValidationError ||
            err instanceof DemoImportQueueFull
            ? err.message
            : "Couldn't download the demo",
        );
      else res.destroy();
    }
  } finally {
    clearTimeout(queueTimer);
    abort.abort();
    res.off("close", cancel);
  }
  return true;
}
