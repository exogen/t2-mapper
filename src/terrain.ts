const SIZE = 256;
const SCALE = 8;

export function parseTerrainBuffer(arrayBuffer: ArrayBufferLike) {
  const dataView = new DataView(arrayBuffer);
  let offset = 0;
  const version = dataView.getUint8(offset++);

  const heightMap1d = new Uint16Array(SIZE * SIZE);
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

  for (let i = 0; i < SIZE * SIZE; i++) {
    let height = dataView.getUint16(offset, true);
    offset += 2;
    heightMap1d[i] = height;
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

  for (const textureName of textureNames) {
    const alphaMap = new Uint8Array(SIZE * SIZE);
    for (let j = 0; j < SIZE * SIZE; j++) {
      var alphaMats = dataView.getUint8(offset++);
      alphaMap[j] = alphaMats;
    }
    alphaMaps.push(alphaMap);
  }

  return {
    version,
    textureNames,
    heightMap,
    alphaMaps,
  };
}
