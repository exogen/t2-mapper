export function uint16ToFloat32(src: Uint16Array) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    out[i] = src[i] / 65535;
  }
  return out;
}
