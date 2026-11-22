import {
  MAX_PUBLIC_CLIPS,
  type ClipCreateRequest,
  type ClipPage,
  type ClipView,
} from "../../relay/clipTypes";
import { DEMO_CHECKPOINT_VERSION, demoSha256 } from "./demoCheckpoints";
import { createLogger } from "../logger";
import { appApiBaseUrl } from "../account/authClient";

export class ClipApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ClipApiError(
      typeof body?.error === "string"
        ? body.error
        : "The clip request failed. Please try again.",
      response.status,
    );
  }
  return response.json();
}

function readClipJson<T>(
  url: URL,
  signal: AbortSignal,
  credentials: RequestCredentials = "omit",
): Promise<T> {
  return fetch(url, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    credentials,
    cache: "no-store",
  }).then(readResponse<T>);
}

export function readClip(id: string, signal: AbortSignal): Promise<ClipView> {
  return readClipJson(
    new URL(`/api/clips/${encodeURIComponent(id)}`, appApiBaseUrl),
    signal,
  );
}

export function readClipStatus(
  id: string,
  signal: AbortSignal,
): Promise<ClipView> {
  return readClipJson(
    new URL(`/api/clips/${encodeURIComponent(id)}?summary=1`, appApiBaseUrl),
    signal,
  );
}

export function readUserClips(
  discordId: string,
  page: number,
  signal: AbortSignal,
  manage = false,
): Promise<ClipPage> {
  const url = new URL("/api/clips", appApiBaseUrl);
  url.searchParams.set("owner", discordId);
  url.searchParams.set("page", String(page));
  if (manage) url.searchParams.set("manage", "1");
  return readClipJson(url, signal, manage ? "include" : "omit");
}

export function readPublicClips(signal: AbortSignal): Promise<ClipPage> {
  const url = new URL("/api/clips", appApiBaseUrl);
  url.searchParams.set("limit", String(MAX_PUBLIC_CLIPS));
  return readClipJson(url, signal);
}

export function clipRefetchInterval(query: {
  state: { data?: Pick<ClipView, "state">; error: unknown };
}): number | false {
  const { data, error } = query.state;
  if (error instanceof ClipApiError && [400, 404, 410].includes(error.status))
    return false;
  return data?.state === "processing" || !data ? 1500 : false;
}

export function saveClip(
  request: ClipCreateRequest,
  owner: string,
  signal: AbortSignal,
): Promise<ClipView> {
  const url = new URL("/api/clips", appApiBaseUrl);
  url.searchParams.set("owner", owner);
  return fetch(url, {
    method: "POST",
    credentials: "include",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  }).then(readResponse<ClipView>);
}

export async function deleteClip(
  id: string,
  signal: AbortSignal,
): Promise<void> {
  await fetch(new URL(`/api/clips/${encodeURIComponent(id)}`, appApiBaseUrl), {
    method: "DELETE",
    credentials: "include",
    signal,
  }).then(readResponse<{ deleted: boolean }>);
}

export async function readClipCheckpoint(
  clip: ClipView,
  buffer: ArrayBuffer,
  signal: AbortSignal,
): Promise<{ text: string; etag: string | null } | null> {
  try {
    const response = await fetch(new URL(clip.checkpointUrl, appApiBaseUrl), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) await readResponse(response);
    if (response.status !== 204)
      return {
        text: await response.text(),
        etag: response.headers.get("ETag"),
      };
  } catch (cause) {
    signal.throwIfAborted();
    if (
      cause instanceof ClipApiError &&
      cause.status < 500 &&
      cause.status !== 409
    )
      throw cause;
  }
  await recoverClipCheckpoint(clip, buffer, null, signal);
  return null;
}

const log = createLogger("clipApi");

/** Allow a normal seek only after checking the recording independently of the bad sidecar. */
export async function recoverClipCheckpoint(
  clip: ClipView,
  buffer: ArrayBuffer,
  etag: string | null,
  signal: AbortSignal,
): Promise<void> {
  if (!clip.sourceSha256)
    throw new Error(
      "Could not verify the clip’s source recording. Please try again.",
    );
  if ((await demoSha256(buffer)) !== clip.sourceSha256)
    throw new Error("The downloaded recording does not match this clip.");
  signal.throwIfAborted();
  if (!etag) return;
  const url = new URL(clip.checkpointUrl, appApiBaseUrl);
  url.searchParams.set("rejected", etag);
  url.searchParams.set("version", String(DEMO_CHECKPOINT_VERSION));
  // The viewer can seek immediately while the relay repairs its shared cache.
  void fetch(url, {
    method: "POST",
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    })
    .catch((error) =>
      log.warn(
        "Could not report the checkpoint for clip %s: %o",
        clip.id,
        error,
      ),
    );
}

export function clipShareUrl(
  clip: Pick<ClipView, "id" | "sourceDemo">,
): string {
  const url = new URL(import.meta.env.BASE_URL || "/", window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("mode", "demo");
  url.searchParams.set("demo", clip.sourceDemo);
  url.searchParams.set("clip", clip.id);
  return url.href;
}
