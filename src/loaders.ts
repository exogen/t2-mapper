import { parseImageFileList } from "./imageFileList";
import {
  getActualResourceKey,
  getMissionInfo,
  getSourceAndPath,
} from "./manifest";
import { parseMissionScript } from "./mission";
import { normalizePath } from "./stringUtils";
import { parseTerrainBuffer } from "./terrain";

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
  return getUrlForPath(`textures/terrain/${name}.png`, FALLBACK_TEXTURE_URL);
}

export function interiorTextureToUrl(name: string) {
  // name = name.replace(/\.\d+$/, "");
  return getUrlForPath(`textures/${name}.png`, FALLBACK_TEXTURE_URL);
}

export function textureFrameToUrl(fileName: string) {
  return getUrlForPath(`textures/skins/${fileName}`, FALLBACK_TEXTURE_URL);
}

export function shapeTextureToUrl(name: string) {
  // name = name.replace(/\.\d+$/, "");
  return getUrlForPath(`textures/${name}.png`, FALLBACK_TEXTURE_URL);
}

export function textureToUrl(name: string) {
  return getUrlForPath(`textures/${name}.png`, FALLBACK_TEXTURE_URL);
}

export function audioToUrl(fileName: string) {
  return getUrlForPath(`audio/${fileName}`);
}

export async function loadDetailMapList(name: string) {
  const url = getUrlForPath(`textures/${name}`);
  const res = await fetch(url);
  const text = await res.text();
  return text
    .split(/(?:\r\n|\n|\r)/)
    .map((line) => `textures/${line.trim().replace(/\.png$/i, "")}.png`);
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
