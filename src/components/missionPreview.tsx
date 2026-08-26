import { useEffect, useMemo, useState } from "react";
import { getUrlForPath, RESOURCE_ROOT_URL } from "../loaders";
import {
  findMissionInfo,
  getMissionList,
  getStandardTextureResourceKey,
} from "../manifest";

/**
 * The app's pick for preview tiles with no map art (NOT a game concept —
 * the game's own fallback is the sparse gui/Loading strip): the shell's
 * Hammers faction background. Pinned to the stock textures.vl2 source —
 * manifest priority would serve the HD pack's 16:9 re-crop, which loses
 * the top/bottom bands.
 */
export const TILE_FALLBACK_ART_URL = `${RESOURCE_ROOT_URL}@vl2/textures.vl2/textures/gui/bg_Hammers.png`;

function loadScreenUrlExact(missionName: string): string | null {
  try {
    return getUrlForPath(
      getStandardTextureResourceKey(`textures/gui/Load_${missionName}`),
    );
  } catch {
    return null;
  }
}

/**
 * URL of a mission's loading-screen texture (the exact Load_<MissionName>
 * convention the game uses), or null when we don't ship one.
 *
 * `fallbacks` are tried in order ONLY when the exact name has no art:
 * each regex is matched against the mission name and its first capture
 * group becomes the backup name to look up — e.g. `/^(.+)LT$/` resolves
 * "DangerousCrossingLT" to Load_DangerousCrossing. Non-matching patterns
 * (or matches without art) are skipped.
 */
export function missionLoadScreenUrl(
  missionName: string,
  fallbacks?: readonly RegExp[],
): string | null {
  if (!missionName) return null;
  const exact = loadScreenUrlExact(missionName);
  if (exact) return exact;
  for (const pattern of fallbacks ?? []) {
    const backupName = missionName.match(pattern)?.[1];
    if (!backupName || backupName === missionName) continue;
    const url = loadScreenUrlExact(backupName);
    if (url) return url;
  }
  return null;
}

/** Lowercased mission DISPLAY name → internal mission name, built lazily
 *  (server queries report display names like "Dangerous Crossing"). */
let _displayNameIndex: Map<string, string> | null = null;

function internalNameForDisplayName(displayName: string): string | undefined {
  if (!_displayNameIndex) {
    _displayNameIndex = new Map();
    for (const name of getMissionList()) {
      const display = findMissionInfo(name)?.displayName;
      if (display) _displayNameIndex.set(display.toLowerCase(), name);
    }
  }
  return _displayNameIndex.get(displayName.toLowerCase());
}

/**
 * Load-screen URL for a server-reported map name, which is usually the
 * mission's DISPLAY name ("Dangerous Crossing") rather than the internal
 * Load_ key ("DX_Ice") — try it as an internal name first, then resolve
 * through the manifest's display names.
 */
export function mapNameLoadScreenUrl(mapName: string): string | null {
  if (!mapName) return null;
  const direct = loadScreenUrlExact(mapName);
  if (direct) return direct;
  const internal = internalNameForDisplayName(mapName);
  return internal ? loadScreenUrlExact(internal) : null;
}

/** The t2-maps gallery of rendered map screenshots ("<slug>.1.webp"). */
const GALLERY_BASE_URL = "https://exogen.github.io/t2-maps/images";

/**
 * Candidate gallery screenshot URL for a mission's internal name.
 * Whether it actually exists is only known by fetching it — feed it to
 * useFirstAvailableImage, which skips 404s.
 */
export function missionGalleryArtUrl(missionName: string): string | null {
  if (!missionName) return null;
  return `${GALLERY_BASE_URL}/${encodeURIComponent(missionName)}.1.webp`;
}

/** Gallery URL for a server-reported map name (display name → internal
 *  slug when the manifest knows it; else try the name as-is). */
export function mapNameGalleryArtUrl(mapName: string): string | null {
  if (!mapName) return null;
  return missionGalleryArtUrl(internalNameForDisplayName(mapName) ?? mapName);
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
