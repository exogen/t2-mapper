import { parseImageFileList } from "./imageFileList";
import {
  getActualResourceKey,
  getMissionInfo,
  getSourceAndPath,
  getStandardTextureResourceKey,
} from "./manifest";
import { parseMissionScript } from "./mission";
import { normalizePath } from "./stringUtils";
import { parseTerrainBuffer, type TerrainFile } from "./terrain";

export type { TerrainFile };

export const BASE_URL = "/t2-mapper";
export const RESOURCE_ROOT_URL = `${BASE_URL}/base/`;
export const FALLBACK_TEXTURE_URL = `${BASE_URL}/magenta.png`;

export function getUrlForPath(resourcePath: string, fallbackUrl?: string) {
  let resourceKey;
  try {
    resourceKey = getActualResourceKey(resourcePath);
  } catch (err) {
    if (fallbackUrl) {
      console.warn(
        `Resource "${resourcePath}" not found - rendering fallback.`,
      );
      return fallbackUrl;
    } else {
      throw err;
    }
  }
  const [sourcePath, actualPath] = getSourceAndPath(resourceKey);
  if (sourcePath) {
    return `${RESOURCE_ROOT_URL}@vl2/${sourcePath}/${actualPath}`;
  } else {
    return `${RESOURCE_ROOT_URL}${actualPath}`;
  }
}

export function interiorToUrl(name: string) {
  const url = getUrlForPath(`interiors/${name}`);
  return url.replace(/\.dif$/i, ".glb");
}

export function shapeToUrl(name: string) {
  const url = getUrlForPath(`shapes/${name}`);
  return url.replace(/\.dts$/i, ".glb");
}

export function terrainTextureToUrl(name: string) {
  name = name.replace(/^terrain\./, "");
  const resourceKey = getStandardTextureResourceKey(`textures/terrain/${name}`);
  return getUrlForPath(resourceKey, FALLBACK_TEXTURE_URL);
}

export function iflTextureToUrl(name: string, iflPath: string) {
  // Paths inside IFL files are relative to the IFL file, so we need to prepend
  // the IFL's dir (if any) to the parsed paths.
  const pathParts = normalizePath(iflPath).split("/");
  const iflDir =
    pathParts.length > 1 ? pathParts.slice(0, -1).join("/") + "/" : "";
  const finalPath = `${iflDir}${name}`;
  const resourceKey = getStandardTextureResourceKey(finalPath);
  return getUrlForPath(resourceKey, FALLBACK_TEXTURE_URL);
}

export function textureToUrl(name: string) {
  const resourceKey = getStandardTextureResourceKey(`textures/${name}`);
  return getUrlForPath(resourceKey, FALLBACK_TEXTURE_URL);
}

export function audioToUrl(fileName: string) {
  return getUrlForPath(`audio/${fileName}`);
}

export async function loadDetailMapList(name: string) {
  const url = getUrlForPath(`textures/${name}`);
  const res = await fetch(url);
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

export async function loadMission(name: string) {
  const missionInfo = getMissionInfo(name);
  const res = await fetch(getUrlForPath(missionInfo.resourcePath));
  const missionScript = await res.text();
  return parseMissionScript(missionScript);
}

export async function loadTerrain(fileName: string) {
  const res = await fetch(getUrlForPath(`terrains/${fileName}`));
  const terrainBuffer = await res.arrayBuffer();
  return parseTerrainBuffer(terrainBuffer);
}

export async function loadImageFrameList(iflPath: string) {
  const url = getUrlForPath(iflPath);
  const res = await fetch(url);
  const source = await res.text();
  return parseImageFileList(source);
}
