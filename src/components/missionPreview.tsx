import { useEffect, useState } from "react";
import { getUrlForPath } from "../loaders";
import { getStandardTextureResourceKey } from "../manifest";

/**
 * URL of a mission's loading-screen texture (the exact Load_<MissionName>
 * convention the game uses — no fuzzy matching), or null when we don't
 * ship one.
 */
export function missionLoadScreenUrl(missionName: string): string | null {
  if (!missionName) return null;
  try {
    return getUrlForPath(
      getStandardTextureResourceKey(`textures/gui/Load_${missionName}`),
    );
  } catch {
    return null;
  }
}

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
      .then((r) => r.blob())
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
      .catch(() => null);
    _processedUrls.set(src, promise);
  }
  return promise;
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
