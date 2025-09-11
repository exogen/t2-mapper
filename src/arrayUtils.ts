export function rotateHeightMap(
  src: Uint16Array,
  width: number,
  height: number,
  degrees: 90 | 180 | 270
) {
  let outW: number;
  let outH: number;

  switch (degrees) {
    case 90:
    case 270:
      outW = height;
      outH = width;
      break;
    case 180:
      outW = width;
      outH = height;
      break;
  }

  const out = new Uint16Array(outW * outH);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = src[y * width + x];

      let nx, ny;
      switch (degrees) {
        case 90:
          nx = height - 1 - y;
          ny = x;
          break;
        case 180:
          nx = width - 1 - x;
          ny = height - 1 - y;
          break;
        case 270:
          nx = y;
          ny = width - 1 - x;
      }

      out[ny * outW + nx] = val;
    }
  }

  return out;
}
