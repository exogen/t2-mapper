import { guiTextureToUrl, RESOURCE_ROOT_URL } from "../loaders";
import { findMissionInfo, getMissionList } from "../manifest";

/**
 * The app's pick for preview tiles with no map art (NOT a game concept —
 * the game's own fallback is the sparse gui/Loading strip): the shell's
 * Hammers faction background. Pinned to the stock textures.vl2 source —
 * manifest priority would serve the HD pack's 16:9 re-crop, which loses
 * the top/bottom bands.
 */
export const TILE_FALLBACK_ART_URL = `${RESOURCE_ROOT_URL}@vl2/textures.vl2/textures/gui/bg_Hammers.png`;

/** Loading-screen fallbacks for renamed mission variants. */
export const MISSION_ART_NAME_FALLBACKS: readonly RegExp[] = [
  /^(.+)LT$/,
  /^(.+)Lak$/,
  /^(.+)_b$/,
];

function loadScreenUrlExact(missionName: string): string | null {
  return guiTextureToUrl(`Load_${missionName}`);
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
 * Its existence is known only after loading; callers advance to fallback
 * art when the image is unavailable.
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
