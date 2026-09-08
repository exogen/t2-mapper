/** Terrain grid size in squares — the .ter heightfield is TERRAIN_SIZE². */
export const TERRAIN_SIZE = 256;

/**
 * Lightmap texels per terrain square, matching stock Tribes 2. At the usual
 * 8 m squares this is a 512 texel map at 4 m per texel.
 *
 * Building shadows are baked into this same texture (see terrainLightmap.ts),
 * so this sets how sharply a shadow edge resolves — a 4 m ramp here. It does
 * NOT change how much ground ends up shadowed: measured across 512, 1024 and
 * 2048 the shadowed area agrees to within a quarter of a percent, because the
 * edge pass averages coverage rather than rounding it to whole texels.
 * Raising it costs roughly 4x the bake per doubling.
 */
export const LIGHTMAP_TEXELS_PER_SQUARE = 2;

/** Lightmap texture size, a square of TERRAIN_SIZE x texels-per-square. */
export const LIGHTMAP_SIZE = TERRAIN_SIZE * LIGHTMAP_TEXELS_PER_SQUARE;

/**
 * Convert a raw heightfield sample to world units. Heights are stored as
 * 11.5 fixed-point: world = raw / 32 (Tribes2.exe multiplies the stored
 * shorts by exactly 0.03125 — NOT raw/65535 normalization).
 */
export function terrainHeightToWorld(raw: number): number {
  return raw / 32;
}

export interface TerrainFile {
  version: number;
  textureNames: string[];
  heightMap: Uint16Array;
  alphaMaps: Uint8Array[];
  /** Smallest raw heightfield sample (convert via terrainHeightToWorld). */
  minHeight: number;
  /** Largest raw heightfield sample (convert via terrainHeightToWorld). */
  maxHeight: number;
}

export function parseTerrainBuffer(arrayBuffer: ArrayBufferLike): TerrainFile {
  const dataView = new DataView(arrayBuffer);
  let offset = 0;
  const version = dataView.getUint8(offset++);

  const heightMap1d = new Uint16Array(TERRAIN_SIZE * TERRAIN_SIZE);
  const textureNames: string[] = [];

  const readString = (length: number) => {
    let result = "";
    for (let i = 0; i < length; i++) {
      const byte = dataView.getUint8(offset + i);
      if (byte === 0) break; // Stop at null terminator if present
      result += String.fromCharCode(byte);
    }
    offset += length;
    return result;
  };

  let minHeight = 0xffff;
  let maxHeight = 0;
  for (let i = 0; i < TERRAIN_SIZE * TERRAIN_SIZE; i++) {
    const height = dataView.getUint16(offset, true);
    offset += 2;
    heightMap1d[i] = height;
    if (height < minHeight) minHeight = height;
    if (height > maxHeight) maxHeight = height;
  }

  offset += 256 * 256;

  const heightMap = heightMap1d;

  for (let i = 0; i < 8; i++) {
    const strSize = dataView.getUint8(offset++);
    const textureName = readString(strSize);
    if (i < 6 && strSize > 0) {
      textureNames.push(textureName);
    }
  }

  const alphaMaps = [];

  for (const _textureName of textureNames) {
    const alphaMap = new Uint8Array(TERRAIN_SIZE * TERRAIN_SIZE);
    for (let j = 0; j < TERRAIN_SIZE * TERRAIN_SIZE; j++) {
      const alphaMats = dataView.getUint8(offset++);
      alphaMap[j] = alphaMats;
    }
    alphaMaps.push(alphaMap);
  }

  return {
    version,
    textureNames,
    heightMap,
    alphaMaps,
    minHeight,
    maxHeight,
  };
}
