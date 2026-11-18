import type {
  ClipCreateRequest,
  ClipPage,
  ClipView,
} from "../../relay/clipTypes";
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

export function readPublicClips(
  page: number,
  signal: AbortSignal,
): Promise<ClipPage> {
  const url = new URL("/api/clips", appApiBaseUrl);
  url.searchParams.set("page", String(page));
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
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch(new URL(clip.checkpointUrl, appApiBaseUrl), {
    signal,
    credentials: "omit",
    cache: "no-store",
  });
  if (!response.ok) {
    await readResponse(response);
  }
  return response.text();
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
