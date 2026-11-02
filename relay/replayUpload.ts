import type { IncomingMessage, ServerResponse } from "node:http";
import { DemoParser, DemoIdentString } from "t2-demo-parser";
import { SOURCE_DEMO_PROTOCOL_VERSION } from "./demoSourceMetadata.js";
import {
  ReplayCapacityError,
  type ReplaySessionManager,
} from "./replaySession.js";
import {
  MAX_REPLAY_UPLOAD_BYTES,
  REPLAY_UPLOAD_PATH,
  REPLAY_CLIENT_ID_HEADER,
  isReplayCreatorId,
} from "./replayTypes.js";
import type { ReplayUploadResponse } from "./replayTypes.js";

class UploadRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function nextChunk<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  let cancel!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    cancel = () => reject(signal.reason);
    if (signal.aborted) cancel();
    else signal.addEventListener("abort", cancel, { once: true });
  });
  try {
    return await Promise.race([task, aborted]);
  } finally {
    signal.removeEventListener("abort", cancel);
  }
}

/** Read directly into bounded temporary memory; no file or published object exists. */
async function readUpload(
  req: IncomingMessage,
  signal: AbortSignal,
  length: number | null,
  onProgress?: (receivedBytes: number) => void,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const iterator = req.iterator({ destroyOnReturn: false });
  let size = 0;
  let prefix = Buffer.alloc(0);
  let headerChecked = false;
  try {
    for (;;) {
      signal.throwIfAborted();
      const { value, done } = await nextChunk(iterator.next(), signal);
      if (done) break;
      const chunk = value as Buffer;
      size += chunk.byteLength;
      if (size > MAX_REPLAY_UPLOAD_BYTES)
        throw new UploadRequestError(
          413,
          "Demo exceeds the 150 MB upload limit",
        );
      if (length !== null && size > length)
        throw new UploadRequestError(
          400,
          "Upload size does not match Content-Length",
        );
      if (!headerChecked) {
        prefix = Buffer.concat([
          prefix,
          chunk.subarray(0, 268 - prefix.length),
        ]);
        try {
          const header = DemoParser.peekHeader(prefix).header;
          if (
            header.identString !== DemoIdentString ||
            header.protocolVersion !== SOURCE_DEMO_PROTOCOL_VERSION
          )
            throw new UploadRequestError(
              400,
              "Only supported Tribes 2 demos can be replayed",
            );
          headerChecked = true;
        } catch (error) {
          if (!(error instanceof RangeError) || prefix.byteLength >= 268)
            throw error;
        }
      }
      onProgress?.(size);
      chunks.push(chunk);
    }
    signal.throwIfAborted();
    if (!headerChecked)
      throw new UploadRequestError(400, "Incomplete Tribes 2 demo header");
    if (length !== null && size !== length)
      throw new UploadRequestError(
        400,
        "Upload size does not match Content-Length",
      );
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } finally {
    // A pending next() settles once the response closes the request socket.
    void iterator.return?.().catch(() => {});
  }
}

/** Session-only raw uploads. The response capability is never part of an invite URL. */
export async function handleReplayUpload(
  req: IncomingMessage,
  res: ServerResponse,
  manager: Pick<
    ReplaySessionManager,
    "createUploadedDemo" | "discardUnclaimedUpload"
  >,
): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(req.url ?? "/", "http://relay.invalid");
  } catch {
    return false;
  }
  if (url.pathname !== REPLAY_UPLOAD_PATH) return false;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    `Content-Type, ${REPLAY_CLIENT_ID_HEADER}`,
  );
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  const abort = new AbortController();
  let result: ReplayUploadResponse | undefined;
  const canceled = () =>
    abort.abort(new DOMException("Replay upload canceled", "AbortError"));
  const cleanup = () => {
    req.off("aborted", canceled);
    res.off("close", disconnected);
    res.off("finish", cleanup);
  };
  const disconnected = () => {
    if (!res.writableFinished) {
      canceled();
      if (result)
        manager.discardUnclaimedUpload(result.sessionId, result.ownerToken);
    }
    cleanup();
  };
  req.once("aborted", canceled);
  res.once("close", disconnected);
  res.once("finish", cleanup);
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST, OPTIONS");
      throw new UploadRequestError(405, "Method not allowed");
    }
    const creatorId = req.headers[REPLAY_CLIENT_ID_HEADER.toLowerCase()];
    if (!isReplayCreatorId(creatorId))
      throw new UploadRequestError(400, "Invalid replay client ID");
    if (
      req.headers["content-encoding"] &&
      req.headers["content-encoding"] !== "identity"
    )
      throw new UploadRequestError(415, "Upload the unencoded demo file");
    if (
      !/^application\/octet-stream(?:\s*;|$)/i.test(
        req.headers["content-type"] ?? "",
      )
    )
      throw new UploadRequestError(
        415,
        "Upload the demo as application/octet-stream",
      );
    if (
      url.searchParams.getAll("name").length !== 1 ||
      url.searchParams.getAll("tick").length > 1 ||
      url.searchParams.getAll("uploadId").length > 1
    )
      throw new UploadRequestError(400, "Invalid replay upload metadata");
    const name = url.searchParams.get("name")!;
    const rawTick = url.searchParams.get("tick");
    if (
      rawTick !== null &&
      (!/^(0|[1-9]\d*)$/.test(rawTick) ||
        !Number.isSafeInteger(Number(rawTick)))
    )
      throw new UploadRequestError(
        400,
        "Replay position must be a non-negative tick",
      );
    const rawLength = req.headers["content-length"];
    if (
      rawLength !== undefined &&
      (!/^\d+$/.test(rawLength) ||
        !Number.isSafeInteger(Number(rawLength)) ||
        Number(rawLength) <= 0)
    )
      throw new UploadRequestError(400, "Invalid Content-Length");
    const length = rawLength === undefined ? null : Number(rawLength);
    if (length !== null && length > MAX_REPLAY_UPLOAD_BYTES)
      throw new UploadRequestError(413, "Demo exceeds the 150 MB upload limit");
    result = await manager.createUploadedDemo({
      name,
      creatorId,
      tick: rawTick === null ? undefined : Number(rawTick),
      uploadId: url.searchParams.get("uploadId") ?? undefined,
      signal: abort.signal,
      read: (signal, report) => readUpload(req, signal, length, report),
    });
    if (abort.signal.aborted || res.destroyed) {
      manager.discardUnclaimedUpload(result.sessionId, result.ownerToken);
      return true;
    }
    if (!res.destroyed) {
      res.writeHead(201, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result));
    }
  } catch (error) {
    if (result)
      manager.discardUnclaimedUpload(result.sessionId, result.ownerToken);
    if (!res.destroyed) {
      const status =
        error instanceof UploadRequestError
          ? error.status
          : error instanceof ReplayCapacityError
            ? 503
            : error instanceof Error && error.name === "TimeoutError"
              ? 408
              : 400;
      res.setHeader("Connection", "close");
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      // Stop rejected/aborted uploads after the error response is flushed.
      if (!req.complete) res.once("finish", () => req.destroy());
      res.end(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "Replay upload failed",
        }),
      );
    }
  } finally {
    // end() only queues the capability response. Keep cancellation ownership
    // until finish confirms it flushed, or close proves it was interrupted.
    if (res.writableFinished || res.destroyed) cleanup();
  }
  return true;
}
