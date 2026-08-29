/**
 * Shared projectile ribbon geometry: the camera-facing quad and path
 * ribbons every beam/tracer renderer in this folder builds from. All
 * conventions are binary-verified against Tribes2.exe (the tracer/bolt
 * quad, the sniper-beam passes, and the ELF/repair path ribbons all
 * pair these vertex orders with their UV layouts).
 */
import { Vector3 } from "three";
import type { BufferAttribute } from "three";

const _linkPoint = new Vector3();
const _linkPrev = new Vector3();
const _linkTangent = new Vector3();
const _linkCross = new Vector3();

/** Write the shared camera-facing ribbon quad (A+c, A−c, B−c, B+c —
 *  the vertex order every ribbon in this file pairs with its UVs). */
export function writeRibbonQuad(
  attr: BufferAttribute,
  a: Vector3,
  b: Vector3,
  scaledCross: Vector3,
): void {
  const p = attr.array as Float32Array;
  p[0] = a.x + scaledCross.x;
  p[1] = a.y + scaledCross.y;
  p[2] = a.z + scaledCross.z;
  p[3] = a.x - scaledCross.x;
  p[4] = a.y - scaledCross.y;
  p[5] = a.z - scaledCross.z;
  p[6] = b.x - scaledCross.x;
  p[7] = b.y - scaledCross.y;
  p[8] = b.z - scaledCross.z;
  p[9] = b.x + scaledCross.x;
  p[10] = b.y + scaledCross.y;
  p[11] = b.z + scaledCross.z;
  attr.needsUpdate = true;
}

/** Quad indices for a two-verts-per-point ribbon of `count` points. */
export function ribbonIndices(count: number): Uint16Array {
  const idx = new Uint16Array((count - 1) * 6);
  for (let i = 0; i < count - 1; i++) {
    const v = i * 2;
    idx.set([v, v + 1, v + 3, v, v + 3, v + 2], i * 6);
  }
  return idx;
}

/**
 * Write a camera-facing ribbon along `sample(t)` into indexed-quad
 * attributes (two verts per point). Mirrors the engine's FUN_0044da90:
 * cross = normalize((p − cam) x tangent) x halfWidth; u = t x length x
 * repeat + offset; v spans 0..1.
 */
export function writeLinkRibbon(
  posAttr: BufferAttribute,
  uvAttr: BufferAttribute,
  sample: (t: number, out: Vector3) => Vector3,
  count: number,
  halfWidth: number,
  camera: { position: Vector3 },
  origin: Vector3,
  u0: number,
  uLength: number,
): void {
  const pos = posAttr.array as Float32Array;
  const uv = uvAttr.array as Float32Array;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    sample(t, _linkPoint);
    if (i === count - 1) {
      sample(t - 0.5 / count, _linkPrev);
      _linkTangent.copy(_linkPoint).sub(_linkPrev);
    } else {
      sample(t + 0.5 / count, _linkPrev);
      _linkTangent.copy(_linkPrev).sub(_linkPoint);
    }
    _linkCross.copy(_linkPoint).sub(camera.position).cross(_linkTangent);
    if (_linkCross.lengthSq() < 1e-10) _linkCross.set(0, 1, 0);
    _linkCross.normalize().multiplyScalar(halfWidth);
    const u = u0 + uLength * t;
    const o = i * 6;
    pos[o] = _linkPoint.x + _linkCross.x - origin.x;
    pos[o + 1] = _linkPoint.y + _linkCross.y - origin.y;
    pos[o + 2] = _linkPoint.z + _linkCross.z - origin.z;
    pos[o + 3] = _linkPoint.x - _linkCross.x - origin.x;
    pos[o + 4] = _linkPoint.y - _linkCross.y - origin.y;
    pos[o + 5] = _linkPoint.z - _linkCross.z - origin.z;
    const uo = i * 4;
    uv[uo] = u;
    uv[uo + 1] = 0;
    uv[uo + 2] = u;
    uv[uo + 3] = 1;
  }
  posAttr.needsUpdate = true;
  uvAttr.needsUpdate = true;
}
