import {
  MAX_REPLAY_UPLOAD_BYTES,
  REPLAY_UPLOAD_PATH,
  REPLAY_UPLOAD_TIMEOUT_MS,
  REPLAY_CLIENT_ID_HEADER,
  isReplayCreatorId,
  type ReplayUploadResponse,
} from "../../relay/replayTypes";

export interface ReplayUploadOptions {
  creatorId: string;
  tick?: number;
  signal?: AbortSignal;
  /** Correlates server-received byte counts on the existing relay socket. */
  uploadId?: string;
}

/** Uploads belong to a temporary replay room, never the public demo library. */
export async function uploadReplay(
  relayUrl: string,
  buffer: ArrayBuffer,
  name: string,
  options: ReplayUploadOptions,
): Promise<ReplayUploadResponse> {
  const { creatorId, tick, signal, uploadId } = options;
  if (!isReplayCreatorId(creatorId))
    throw new Error("The replay creator identity is invalid");
  if (!buffer.byteLength) throw new Error("The demo file is empty");
  if (buffer.byteLength > MAX_REPLAY_UPLOAD_BYTES)
    throw new Error("The demo exceeds the 150 MB replay upload limit");
  if (tick !== undefined && (!Number.isSafeInteger(tick) || tick < 0))
    throw new Error("Replay position must be a non-negative tick");
  const url = new URL(relayUrl);
  if (url.protocol === "wss:") url.protocol = "https:";
  else if (url.protocol === "ws:") url.protocol = "http:";
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("The replay relay URL is invalid");
  url.pathname = REPLAY_UPLOAD_PATH;
  url.search = "";
  url.hash = "";
  url.searchParams.set("name", name || "Uploaded demo.rec");
  if (tick !== undefined) url.searchParams.set("tick", String(tick));
  if (uploadId !== undefined) url.searchParams.set("uploadId", uploadId);
  const timeout = AbortSignal.timeout(REPLAY_UPLOAD_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  combined.throwIfAborted();
  try {
    const response = await fetch(url.href, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        [REPLAY_CLIENT_ID_HEADER]: creatorId,
      },
      body: buffer,
      redirect: "error",
      signal: combined,
    });
    combined.throwIfAborted();
    if (!response.ok) {
      const text = (await response.text()).slice(0, 512);
      let message = text;
      if (response.headers.get("content-type")?.includes("application/json")) {
        try {
          const error = JSON.parse(text) as { error?: unknown };
          message = typeof error.error === "string" ? error.error : "";
        } catch {
          message = "";
        }
      }
      throw new Error(
        message || `Couldn't upload the demo (HTTP ${response.status})`,
      );
    }
    let result: Partial<ReplayUploadResponse> | null;
    try {
      result = (await response.json()) as Partial<ReplayUploadResponse> | null;
    } catch {
      throw new Error("The relay returned an invalid replay session");
    }
    combined.throwIfAborted();
    if (
      !result ||
      typeof result.sessionId !== "string" ||
      !result.sessionId ||
      result.sessionId.length > 256 ||
      typeof result.ownerToken !== "string" ||
      !result.ownerToken ||
      result.ownerToken.length > 1024
    )
      throw new Error("The relay returned an invalid replay session");
    return { sessionId: result.sessionId, ownerToken: result.ownerToken };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (timeout.aborted)
      throw new Error("Uploading the demo timed out; try again");
    throw error;
  }
}
