import { useEffect, useMemo, useState } from "react";

/**
 * Processed object URLs by source URL. Kept for the session (never
 * revoked): entries are shared across mounts — the demo cards process the
 * same handful of images on every page flip otherwise — and the set is
 * bounded by the distinct art actually viewed.
 */
const _processedUrls = new Map<string, Promise<string | null>>();

function processRawImage(src: string): Promise<string | null> {
  let promise = _processedUrls.get(src);
  if (!promise) {
    promise = fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => createImageBitmap(blob, { colorSpaceConversion: "none" }))
      .then(
        (bitmap) =>
          new Promise<Blob | null>((resolve) => {
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
            bitmap.close();
            canvas.toBlob(resolve);
          }),
      )
      .then((blob) => (blob ? URL.createObjectURL(blob) : null))
      .catch((err) => {
        // HTTP errors (404 gallery probes) and decode failures are
        // permanent — keep the null cached so they cost one request per
        // session. A network-level failure (fetch rejects with
        // TypeError: offline, DNS blip) is transient — evict so the
        // next mount retries instead of the art staying demoted.
        if (err instanceof TypeError) _processedUrls.delete(src);
        return null;
      });
    _processedUrls.set(src, promise);
  }
  return promise;
}

/**
 * The first candidate source URL that actually loads and processes
 * (404s and decode failures skip to the next), resolved through the
 * shared processed-image cache so the winning RawPreviewImage render is
 * free. `pending` is true while candidates are still being checked.
 */
export function useFirstAvailableImage(
  candidates: readonly (string | null | undefined)[],
): { url: string | null; pending: boolean } {
  // Key on the joined URLs so the effect isn't re-run by unstable array
  // identity from per-render candidate construction.
  const key = candidates.filter(Boolean).join("|");
  const list = useMemo(() => key.split("|").filter(Boolean), [key]);
  const [state, setState] = useState<{
    key: string;
    url: string | null;
    pending: boolean;
  }>({ key, url: null, pending: true });

  useEffect(() => {
    let cancelled = false;
    setState({ key, url: null, pending: true });
    void (async () => {
      for (const src of list) {
        const processed = await processRawImage(src);
        if (cancelled) return;
        if (processed) {
          setState({ key, url: src, pending: false });
          return;
        }
      }
      setState({ key, url: null, pending: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [key, list]);

  // A stale result from the previous key reads as pending.
  return state.key === key
    ? { url: state.url, pending: state.pending }
    : { url: null, pending: true };
}

/**
 * Renders a preview image bypassing browser color management, matching how
 * Tribes 2 displayed these textures (raw pixel values, no gamma conversion).
 * Many T2 preview PNGs embed an incorrect gAMA chunk (22727 = gamma 4.4
 * instead of the correct 45455 = gamma 2.2), which causes browsers to
 * over-darken them. `colorSpaceConversion: "none"` ignores gAMA/ICC data.
 */
export function RawPreviewImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setObjectUrl(null);
    void processRawImage(src).then((url) => {
      if (!cancelled) setObjectUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (!objectUrl) return null;

  return <img src={objectUrl} alt={alt} className={className} />;
}
