import { getActualResourcePath, getSource } from "./manifest";
import { parseMissionScript } from "./mission";
import { parseTerrainBuffer } from "./terrain";

export const BASE_URL = "/t2-mapper";
export const RESOURCE_ROOT_URL = `${BASE_URL}/base/`;

export function getUrlForPath(resourcePath: string, fallbackUrl?: string) {
  resourcePath = getActualResourcePath(resourcePath);
  let sourcePath: string;
  try {
    sourcePath = getSource(resourcePath);
  } catch (err) {
    if (fallbackUrl) {
      // console.error(err);
      return fallbackUrl;
    } else {
      throw err;
    }
  }
  if (!sourcePath) {
    return `${RESOURCE_ROOT_URL}${resourcePath}`;
  } else {
    return `${RESOURCE_ROOT_URL}@vl2/${sourcePath}/${resourcePath}`;
  }
}

export function interiorToUrl(name: string) {
  const difUrl = getUrlForPath(`interiors/${name}`);
  return difUrl.replace(/\.dif$/i, ".gltf");
}

export function shapeToUrl(name: string) {
  const difUrl = getUrlForPath(`shapes/${name}`);
  return difUrl.replace(/\.dts$/i, ".glb");
}

export function terrainTextureToUrl(name: string) {
  name = name.replace(/^terrain\./, "");
  return getUrlForPath(`textures/terrain/${name}.png`, `${BASE_URL}/black.png`);
}

export function interiorTextureToUrl(name: string, fallbackUrl?: string) {
  name = name.replace(/\.\d+$/, "");
  return getUrlForPath(`textures/${name}.png`, fallbackUrl);
}

export function shapeTextureToUrl(name: string, fallbackUrl?: string) {
  name = name.replace(/\.\d+$/, "");
  return getUrlForPath(`textures/skins/${name}.png`, fallbackUrl);
}

export function textureToUrl(name: string) {
  try {
    return getUrlForPath(`textures/${name}.png`);
  } catch (err) {
    return `${BASE_URL}/black.png`;
  }
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
  const res = await fetch(getUrlForPath(`missions/${name}.mis`));
  const missionScript = await res.text();
  return parseMissionScript(missionScript);
}

export async function loadTerrain(fileName: string) {
  const res = await fetch(getUrlForPath(`terrains/${fileName}`));
  const terrainBuffer = await res.arrayBuffer();
  return parseTerrainBuffer(terrainBuffer);
}
