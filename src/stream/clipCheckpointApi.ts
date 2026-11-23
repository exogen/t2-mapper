import type { ClipView } from "../../relay/clipTypes";
import { appApiBaseUrl } from "../account/authClient";
import { createLogger } from "../logger";
import { ClipApiError, readClipResponse } from "./clipApi";
import { DEMO_CHECKPOINT_VERSION, demoSha256 } from "./demoCheckpoints";

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
