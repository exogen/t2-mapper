/**
 * Pure geometry for the shocklance bolt, binary-verified against
 * Tribes2.exe ShockLanceProjectile: lightning point generation
 * (FUN_00650c20), the ribbon it is drawn with (FUN_00650fe0), the two
 * textured strips of a pinned bolt (FUN_00650150) and the zap overlay's
 * texture cycling and projection (FUN_006518a0 / FUN_00651d50).
 */
import { Vector3 } from "three";
import type { BufferAttribute } from "three";

/** Each of the two bolts holds at most 50 points (FUN_0064eb50). */
export const SHOCK_LANCE_MAX_POINTS = 50;
/** A missed bolt is a short spark at the live muzzle: 0.2 m along the
 *  muzzle vector (FUN_0064f960), jittered with 20 points/m at 0.1 m
 *  amplitude (advanceTime FUN_0064f840 constants). */
export const SHOCK_LANCE_MISS_LENGTH = 0.2;
export const SHOCK_LANCE_MISS_DENSITY = 20;
export const SHOCK_LANCE_MISS_AMP = 0.1;
/** The zap redraws the target 5% larger about its origin. */
export const SHOCK_LANCE_ZAP_SCALE = 1.05;
/** Zap texture cycle: frame = round(fmod(age, 1/10) × 10 × 2.9999),
 *  so it steps through texture[0..3] ten times a second (the fourth
 *  frame is ELFBeam — the engine indexes past its three lightning
 *  frames). */
const ZAP_FRAME_RATE = 10;
const ZAP_FRAME_SPAN = 2.9999;
/** Zap texture matrix translate: (2 × age, age). */
export const ZAP_SCROLL_S = 2;
/** Object-linear texgen: 0.25 texture repeats per meter on both planes. */
export const ZAP_TEXGEN_SCALE = 0.25;

const _seg = new Vector3();
const _side = new Vector3();
const _point = new Vector3();

/**
 * Generate one bolt's points along +X in the bolt's local frame:
 * round(density × length) points (capped at 50), evenly spaced, each
 * displaced by a random unit vector × amp except the pinned ends.
 * Returns the point count written (0 for a degenerate bolt).
 */
export function generateLightningPoints(
  length: number,
  density: number,
  amp: number,
  out: Float32Array,
  random: () => number = Math.random,
): number {
  const requested = Math.round(density * length);
  const count = Math.min(requested, SHOCK_LANCE_MAX_POINTS);
  if (count <= 0) return 0;
  const step = length / requested;
  for (let i = 0; i < count; i++) {
    let jx = 0;
    let jy = 0;
    let jz = 0;
    if (i !== 0 && i !== requested - 1) {
      _point.set(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1);
      if (_point.lengthSq() > 1e-4) _point.normalize();
      jx = _point.x * amp;
      jy = _point.y * amp;
      jz = _point.z * amp;
    }
    const o = i * 3;
    out[o] = i * step + jx;
    out[o + 1] = jy;
    out[o + 2] = jz;
  }
  return count;
}

/**
 * Write a bolt as a two-verts-per-point ribbon (pair with
 * ribbonIndices). The engine sides each point with
 * normalize((p − cam) × segment) — with the bolt's LOCAL points and the
 * WORLD camera position, so `cam` must be the raw camera position, not
 * one brought into the bolt's frame. U alternates 0/1 per point; V is
 * 1 on the −side vertex and 0 on the +side one.
 */
export function writeLightningRibbon(
  posAttr: BufferAttribute,
  uvAttr: BufferAttribute,
  points: Float32Array,
  count: number,
  halfWidth: number,
  cam: Vector3,
): void {
  const pos = posAttr.array as Float32Array;
  const uv = uvAttr.array as Float32Array;
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    const px = points[o];
    const py = points[o + 1];
    const pz = points[o + 2];
    if (i === count - 1) {
      _seg.set(px - points[o - 3], py - points[o - 2], pz - points[o - 1]);
    } else {
      _seg.set(points[o + 3] - px, points[o + 4] - py, points[o + 5] - pz);
    }
    if (_seg.lengthSq() > 1e-4) _seg.normalize();
    _side.set(px - cam.x, py - cam.y, pz - cam.z).cross(_seg);
    if (_side.lengthSq() > 1e-4) _side.normalize();
    _side.multiplyScalar(halfWidth);
    const v = i * 6;
    pos[v] = px - _side.x;
    pos[v + 1] = py - _side.y;
    pos[v + 2] = pz - _side.z;
    pos[v + 3] = px + _side.x;
    pos[v + 4] = py + _side.y;
    pos[v + 5] = pz + _side.z;
    const u = i & 1;
    const t = i * 4;
    uv[t] = u;
    uv[t + 1] = 1;
    uv[t + 2] = u;
    uv[t + 3] = 0;
  }
  posAttr.needsUpdate = true;
  uvAttr.needsUpdate = true;
}

/**
 * Write one of a pinned bolt's textured strips (a quad, indices
 * 0 1 2 / 0 2 3): start±right at U = u0 with alpha 0, end∓right at
 * U = u1 with `endAlpha`; V is 0 on the +right edge and 1 on the −right
 * edge. Colors are white with per-vertex alpha.
 */
export function writeShockStrip(
  posAttr: BufferAttribute,
  uvAttr: BufferAttribute,
  colorAttr: BufferAttribute,
  start: Vector3,
  end: Vector3,
  scaledRight: Vector3,
  u0: number,
  u1: number,
  endAlpha: number,
): void {
  const pos = posAttr.array as Float32Array;
  const uv = uvAttr.array as Float32Array;
  const color = colorAttr.array as Float32Array;
  pos[0] = start.x + scaledRight.x;
  pos[1] = start.y + scaledRight.y;
  pos[2] = start.z + scaledRight.z;
  pos[3] = start.x - scaledRight.x;
  pos[4] = start.y - scaledRight.y;
  pos[5] = start.z - scaledRight.z;
  pos[6] = end.x - scaledRight.x;
  pos[7] = end.y - scaledRight.y;
  pos[8] = end.z - scaledRight.z;
  pos[9] = end.x + scaledRight.x;
  pos[10] = end.y + scaledRight.y;
  pos[11] = end.z + scaledRight.z;
  uv[0] = u0;
  uv[1] = 0;
  uv[2] = u0;
  uv[3] = 1;
  uv[4] = u1;
  uv[5] = 1;
  uv[6] = u1;
  uv[7] = 0;
  for (let i = 0; i < 4; i++) {
    const c = i * 4;
    color[c] = 1;
    color[c + 1] = 1;
    color[c + 2] = 1;
    color[c + 3] = i < 2 ? 0 : endAlpha;
  }
  posAttr.needsUpdate = true;
  uvAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
}

/** Which of texture[0..3] the zap shows at `age` seconds. */
export function zapFrameIndex(age: number): number {
  const phase = (age % (1 / ZAP_FRAME_RATE)) * ZAP_FRAME_RATE;
  return Math.min(3, Math.max(0, Math.round(phase * ZAP_FRAME_SPAN)));
}

/**
 * The zap's S texgen plane runs along the target's longest Torque axis
 * (FUN_00651d50): X unless Y is strictly the longest (Z, the height,
 * also selects X). T always runs along Z.
 */
export function zapProjectionAxis(extents: {
  x: number;
  y: number;
  z: number;
}): "x" | "y" {
  const ax = Math.abs(extents.x);
  const ay = Math.abs(extents.y);
  const az = Math.abs(extents.z);
  if (az > ay && az > ax) return "x";
  if (ay > az && ay > ax) return "y";
  return "x";
}
