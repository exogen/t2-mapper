import type { LinkPreviewImage } from "../../relay/linkPreview";
import { findMissionInfo, getMissionList } from "../../src/manifest";
import galleryCatalog from "./linkPreviewGallery.json";

const DEFAULT_GALLERY_BASE_URL = "https://exogen.github.io/t2-maps/images/";

type GalleryEntry = {
  missionName: string;
  displayName: string | null;
  imageCount: number;
};

/** The snapshot includes only missions with at least one generated screenshot. */
const galleryMissions = new Map<string, GalleryEntry>();
const galleryDisplayNames = new Map<string, string>();
for (const [missionName, displayName, imageCount] of galleryCatalog.entries) {
  const entry = {
    missionName: missionName as string,
    displayName: displayName as string | null,
    imageCount: imageCount as number,
  };
  galleryMissions.set(entry.missionName.toLowerCase(), entry);
  // An unqualified display name can identify several variants. Prefer the
  // catalog's first entry (the base map) rather than overwriting it with Lak.
  if (
    entry.displayName &&
    !galleryDisplayNames.has(entry.displayName.toLowerCase())
  )
    galleryDisplayNames.set(entry.displayName.toLowerCase(), entry.missionName);
}

const missionNames = new Map<string, string>();
for (const name of getMissionList()) missionNames.set(name.toLowerCase(), name);
const displayNames = new Map<string, string>();
for (const name of getMissionList()) {
  const displayName = findMissionInfo(name)?.displayName;
  if (displayName && !displayNames.has(displayName.toLowerCase()))
    displayNames.set(displayName.toLowerCase(), name);
}

function internalMissionName(name: string): string {
  const trimmed = name.trim();
  return (
    missionNames.get(trimmed.toLowerCase()) ??
    galleryMissions.get(trimmed.toLowerCase())?.missionName ??
    galleryDisplayNames.get(trimmed.toLowerCase()) ??
    displayNames.get(trimmed.toLowerCase()) ??
    trimmed
  );
}

/** Resolve both demo-internal names and server-reported display names. */
export function linkPreviewMissionDisplayName(name: string): string {
  const internal = internalMissionName(name);
  return (
    findMissionInfo(internal)?.displayName ||
    galleryMissions.get(internal.toLowerCase())?.displayName ||
    internal
  );
}

/**
 * Use only exact screenshots listed in the t2-maps gallery catalog. Loading
 * screens and base-map substitutions aren't suitable share images. A missing
 * screenshot is left to the renderer's configured default image.
 *
 * Refresh the snapshot with scripts/update-link-preview-gallery.ts when the
 * gallery changes. The renderer performs no network requests.
 */
export function linkPreviewMissionImage(
  name: string,
  galleryBaseUrl = DEFAULT_GALLERY_BASE_URL,
): LinkPreviewImage | undefined {
  const internal = internalMissionName(name);
  const entry = galleryMissions.get(internal.toLowerCase());
  if (!entry || entry.imageCount < 1) return undefined;
  const base = new URL(galleryBaseUrl);
  if (!["http:", "https:"].includes(base.protocol))
    throw new Error("Gallery base URL must use HTTP or HTTPS");
  base.search = "";
  base.hash = "";
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const url = new URL(`${encodeURIComponent(entry.missionName)}.1.webp`, base);
  return {
    url: url.href,
    alt: `${linkPreviewMissionDisplayName(name)} map screenshot`,
    type: "image/webp",
    // The t2-maps gallery captures these screenshots at a fixed viewport size.
    width: 1280,
    height: 720,
  };
}
