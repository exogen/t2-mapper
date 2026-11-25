import type { ClipView } from "../../relay/clipTypes";
import { appApiBaseUrl } from "../account/authClient";
import { createLogger } from "../logger";
import { ClipApiError, readClipResponse } from "./clipApi";
import { DEMO_CHECKPOINT_VERSION } from "./demoCheckpoints";

export async function readClipCheckpoint(
  clip: ClipView,
  signal: AbortSignal,
): Promise<{ text: string; etag: string | null } | null> {
  signal.throwIfAborted();
  try {
    const response = await fetch(new URL(clip.checkpointUrl, appApiBaseUrl), {
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) await readClipResponse(response);
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
  return null;
}

const log = createLogger("clipApi");

export async function recoverClipCheckpoint(
  clip: ClipView,
  etag: string | null,
  signal: AbortSignal,
): Promise<void> {
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
