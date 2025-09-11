import hxDif from "@/generated/hxDif.cjs";

export function parseInteriorBuffer(arrayBuffer: ArrayBufferLike) {
  return hxDif.Dif.LoadFromArrayBuffer(arrayBuffer);
}
