import { gzipSync } from "node:zlib";
import type { WebSocket } from "ws";
import {
  MAX_CATCHUP_COMPRESSED_BYTES,
  MAX_CATCHUP_DECOMPRESSED_BYTES,
} from "./catchupLimits.js";
import type { ServerMessage } from "./types.js";

const CATCHUP_CHUNK_BYTES = 256 * 1024;

export const VIEWER_BUFFER_BYTES = 8 * 1024 * 1024;

/** A reconnect hydrates a fresh picture. Skipping individual packets would corrupt it. */
export function canQueueViewerData(
  ws: WebSocket,
  bytes: number,
  limit: number,
): boolean {
  if (ws.readyState !== ws.OPEN) return false;
  if (ws.bufferedAmount + bytes > limit) {
    ws.close(1013, "Viewer fell behind; reconnect to sync");
    return false;
  }
  return true;
}

export function compressCatchup(json: string): Buffer {
  if (Buffer.byteLength(json) > MAX_CATCHUP_DECOMPRESSED_BYTES)
    throw new Error("Snapshot exceeds the decoded size limit");
  const bytes = gzipSync(json, { level: 3 });
  if (bytes.byteLength > MAX_CATCHUP_COMPRESSED_BYTES)
    throw new Error("Snapshot exceeds the compressed size limit");
  return bytes;
}

/** Reserve room for the complete snapshot before opening its binary framing. */
export function sendViewerCatchup(
  ws: WebSocket,
  address: string,
  epoch: number,
  bytes: Uint8Array,
  limit: number,
): boolean {
  // The queue budget includes the compressed payload. A maximum-size replay
  // snapshot still fits on an empty socket, with its two small framing messages.
  if (!canQueueViewerData(ws, bytes.byteLength, limit)) return false;
  const begin = JSON.stringify({
    type: "catchupBegin",
    address,
    epoch,
    totalBytes: bytes.byteLength,
    chunkCount: Math.ceil(bytes.byteLength / CATCHUP_CHUNK_BYTES),
    encoding: "gzip",
  } satisfies ServerMessage);
  const end = JSON.stringify({ type: "catchupEnd" } satisfies ServerMessage);
  ws.send(begin);
  for (let i = 0; i < bytes.byteLength; i += CATCHUP_CHUNK_BYTES) {
    ws.send(bytes.subarray(i, i + CATCHUP_CHUNK_BYTES), { binary: true });
  }
  ws.send(end);
  return true;
}
