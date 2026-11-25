import { parseImageFileList } from "./imageFileList";
import { createLogger } from "./logger";
import {
  getActualResourceKey,
  getMissionInfo,
  getStandardDefinitionSourcePath,
  getStandardTextureResourceKey,
  getWinningSourcePath,
} from "./manifest";
import { parseMissionScript } from "./mission";
import { shapeResourcePath } from "./resourcePaths";
import { settingsStore } from "./state/settingsStore";
import { normalizePath } from "./stringUtils";
import { parseTerrainBuffer, type TerrainFile } from "./terrain";

const log = createLogger("loaders");

export type { TerrainFile };

export const RESOURCE_ROOT_URL = process.env.GAME_ASSETS_BASE_URL;
export const FALLBACK_TEXTURE_URL = `${process.env.BASE_PATH}white.png`;

export function getUrlForPath(
  resourcePath: string,
  fallbackUrl?: string,
  hdTexturesEnabled = true,
) {
  try {
    const resourceKey = getActualResourceKey(resourcePath);
    const sourcePath = hdTexturesEnabled
      ? getWinningSourcePath(resourceKey)
      : getStandardDefinitionSourcePath(resourceKey);
    if (sourcePath === undefined)
      throw new Error(`No standard-definition source for ${resourcePath}`);
    return `${RESOURCE_ROOT_URL}${sourcePath}`;
  } catch (error) {
    if (!fallbackUrl) throw error;
    log.warn('Resource "%s" not found — rendering fallback', resourcePath);
    return fallbackUrl;
  }
}

export function interiorToUrl(name: string) {
  return getUrlForPath(`interiors/${name}`);
}

export function shapeToUrl(name: string) {
  return getUrlForPath(shapeResourcePath(name));
}

function getTextureUrlForPath(
  resourcePath: string,
  fallbackUrl?: string,
  hdTexturesEnabled = settingsStore.getState().hdTexturesEnabled,
): string {
  return getUrlForPath(
    getStandardTextureResourceKey(resourcePath, hdTexturesEnabled),
    fallbackUrl,
    hdTexturesEnabled,
  );
}

export function terrainTextureToUrl(name: string) {
  name = name.replace(/^terrain\./, "");
  return getTextureUrlForPath(`textures/terrain/${name}`, FALLBACK_TEXTURE_URL);
}

export function iflTextureToUrl(name: string, iflPath: string) {
  // Paths inside IFL files are relative to the IFL file, so we need to prepend
  // the IFL's dir (if any) to the parsed paths.
  const pathParts = normalizePath(iflPath).split("/");
  const iflDir =
    pathParts.length > 1 ? pathParts.slice(0, -1).join("/") + "/" : "";
  return getTextureUrlForPath(`${iflDir}${name}`, FALLBACK_TEXTURE_URL);
}

export function textureToUrl(
  name: string,
  fallbackUrl: string | null = FALLBACK_TEXTURE_URL,
): string {
  return getTextureUrlForPath(`textures/${name}`, fallbackUrl ?? undefined);
}

/** URL of a `textures/gui/` texture, or null when we don't ship it. */
export function guiTextureToUrl(
  name: string,
  hdTexturesEnabled?: boolean,
): string | null {
  try {
    return getTextureUrlForPath(
      `textures/gui/${name}`,
      undefined,
      hdTexturesEnabled,
    );
  } catch {
    return null;
  }
}

export function audioToUrl(fileName: string) {
  // AudioProfile filenames from datablocks may omit the .wav extension
  // (e.g. "fx/armor/thrust"). Torque tries extensions automatically.
  const withExt = /\.\w+$/.test(fileName) ? fileName : `${fileName}.wav`;
  const url = getUrlForPath(`audio/${withExt}`);
  return url.replace(/\.wav$/i, ".m4a");
}

export async function loadDetailMapList(name: string, signal?: AbortSignal) {
  const url = getUrlForPath(`textures/${name}`);
  const res = await fetch(url, { signal });
  const text = await res.text();
  return text
    .split(/(?:\r\n|\r|\n)/)
    .map((line) => {
      line = line.trim();
      if (!line.startsWith(";")) {
        return line;
      }
    })
    .filter(Boolean);
}

export async function loadMission(name: string, signal?: AbortSignal) {
  const missionInfo = getMissionInfo(name);
  const res = await fetch(getUrlForPath(missionInfo.resourcePath), { signal });
  const script = await res.text();
  signal?.throwIfAborted();
  return parseMissionScript(script);
}

export async function loadTerrain(fileName: string, signal?: AbortSignal) {
  const url = getUrlForPath(`terrains/${fileName}`);
  log.debug("Fetching terrain: %s", url);
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(
      `[loadTerrain] Failed to fetch ${url}: ${res.status} ${res.statusText}`,
    );
  }
  const terrainBuffer = await res.arrayBuffer();
  signal?.throwIfAborted();
  log.debug("Loaded terrain %s: %d bytes", fileName, terrainBuffer.byteLength);
  return parseTerrainBuffer(terrainBuffer);
}

export async function loadImageFrameList(
  iflPath: string,
  signal?: AbortSignal,
) {
  const url = getUrlForPath(iflPath);
  const res = await fetch(url, { signal });
  const source = await res.text();
  signal?.throwIfAborted();
  return parseImageFileList(source);
}
