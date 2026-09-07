/**
 * The engine's per-object projected shadows (Tribes2.exe shadow.cc:
 * Shadow::prepare FUN_00652e70, build FUN_006531f0, light basis
 * FUN_00652990, tables FUN_00652760, setShadowDetailLevel FUN_00652350),
 * as pure math the ShadowPool drives. Everything here is in Three world
 * space (x = Torque y, y = Torque z, z = Torque x).
 */
import { Matrix4, Vector3 } from "three";

/** The shadow light is a constant, NOT the mission sun: Torque
 *  (0.57, 0.57, -0.57), here in Three axes. */
const SHADOW_LIGHT_DIR = new Vector3(0.57, -0.57, 0.57).normalize();
/** Receiver polys are gathered up to this many shape radii along the light. */
export const SHADOW_REACH_FACTOR = 10;
/** The generic blob is drawn with 0.4 x the shape radius. */
export const SHADOW_GENERIC_RADIUS_SCALE = 0.4;
/** Smallest on-screen radius that still casts at full detail (level 1). */
export const SHADOW_MIN_PIXELS = 6;
/** Fade-in begins when the minimum is more than half the projected size. */
const SHADOW_FADE_START = 0.5;
/** Shadows this faded are not drawn at all. */
const SHADOW_FADE_CUTOFF = 0.99;

/**
 * Camera-distance table (dist, tilt, reachLoss): past 100 m the light
 * tilts to vertical (fully by 500 m) and the projection reach shrinks
 * to half at 500 m and 30% at 1 km.
 */
const SHADOW_DISTANCE_TABLE: readonly [number, number, number][] = [
  [0, 0, 0],
  [100, 0, 0],
  [500, 1, 0.5],
  [1000, 1, 0.7],
];

export interface ShadowTileSpec {
  /** Projected radius (px) at or above which this row applies. */
  minPixels: number;
  /** Silhouette refresh period. */
  intervalMs: number;
  /** Silhouette bitmap size; 0 = the generic blob. */
  size: number;
  /** 3x3 blur of the 1-bit mask (64 px rows only). */
  blur: boolean;
}

/** Bitmap size / refresh by projected radius (FUN_00652890's table). */
export const SHADOW_TILE_TABLE: readonly ShadowTileSpec[] = [
  { minPixels: 130, intervalMs: 25, size: 64, blur: true },
  { minPixels: 25, intervalMs: 100, size: 64, blur: true },
  { minPixels: 10, intervalMs: 100, size: 32, blur: false },
  { minPixels: 0, intervalMs: 0, size: 0, blur: false },
];

/**
 * Receiver polygons must face the light: the shadow poly list drops any
 * poly whose normal · lightDir ≥ -0.05 (end-poly callback FUN_004211c0,
 * threshold DAT_0074f224), so surfaces edge-on or turned away — the far
 * side of a wall, the back of a hill — never receive a shadow.
 */
export const SHADOW_RECEIVER_FACING = -0.05;

/** The 32-px generic blob: alpha 180/255 x (1 - r²) inside the unit disc. */
export const SHADOW_GENERIC_ALPHA = 180 / 255;

/** Projected radius in pixels of a sphere `radius` at `dist`. */
export function projectedRadiusPx(
  radius: number,
  dist: number,
  viewportHeight: number,
  fovDeg: number,
): number {
  if (!(dist > 1e-3)) return Infinity;
  const pixelScale =
    (viewportHeight * 0.5) / Math.tan((fovDeg * Math.PI) / 360);
  return (radius / dist) * pixelScale;
}

/**
 * Whether a shadow draws at all and how faded it is near the cutoff:
 * projected px x (0.5 x level + 0.5) must reach max(smallestVisible,
 * SHADOW_MIN_PIXELS); the alpha fade grows linearly once the minimum
 * exceeds half the projected size. `fade` is 1 - alpha scale.
 */
export function shadowVisibility(
  px: number,
  smallestVisiblePx = 0,
  level = 1,
): { visible: boolean; fade: number } {
  const minPx = Math.max(smallestVisiblePx, SHADOW_MIN_PIXELS);
  const scaled = px * (0.5 * level + 0.5);
  if (!(scaled >= minPx)) return { visible: false, fade: 1 };
  const ratio = minPx / scaled;
  const fade = ratio > SHADOW_FADE_START ? (ratio - SHADOW_FADE_START) * 2 : 0;
  return { visible: fade < SHADOW_FADE_CUTOFF, fade };
}

/** Bitmap row for a projected radius. */
export function shadowTileSpec(px: number): ShadowTileSpec {
  for (const spec of SHADOW_TILE_TABLE) {
    if (px >= spec.minPixels) return spec;
  }
  return SHADOW_TILE_TABLE[SHADOW_TILE_TABLE.length - 1];
}

/** Camera-distance tilt (0..1) and reach loss (0..1), interpolated. */
export function shadowDistanceFade(dist: number): {
  tilt: number;
  reachLoss: number;
} {
  const table = SHADOW_DISTANCE_TABLE;
  if (dist <= table[0][0]) return { tilt: table[0][1], reachLoss: table[0][2] };
  for (let i = 1; i < table.length; i++) {
    if (dist <= table[i][0]) {
      const [d0, t0, r0] = table[i - 1];
      const [d1, t1, r1] = table[i];
      const f = (dist - d0) / (d1 - d0);
      return { tilt: t0 + (t1 - t0) * f, reachLoss: r0 + (r1 - r0) * f };
    }
  }
  const last = table[table.length - 1];
  return { tilt: last[1], reachLoss: last[2] };
}

/**
 * The light direction for a caster `dist` from the camera: the constant
 * direction pulled toward straight down by the tilt (its vertical
 * component becomes v x k - (1 - k), k = 1 - tilt).
 */
export function shadowLightDir(dist: number, out: Vector3): Vector3 {
  const k = 1 - shadowDistanceFade(dist).tilt;
  out.copy(SHADOW_LIGHT_DIR);
  if (k < SHADOW_FADE_CUTOFF) {
    out.y = out.y * k - (1 - k);
    out.normalize();
  }
  return out;
}

const _xAxis = new Vector3();
const _zAxis = new Vector3();
const _worldUp = new Vector3(0, 1, 0);

/**
 * Light-space → world matrix with the light along +Y, lateral X/Z
 * (engine: x = dir x up, z = x x dir), translated to the caster centre.
 * The silhouette camera and the receiver projection share this frame.
 */
export function shadowLightToWorld(
  dir: Vector3,
  center: Vector3,
  out: Matrix4,
): Matrix4 {
  if (Math.abs(dir.y) <= 0.99) {
    _xAxis.crossVectors(dir, _worldUp).normalize();
    _zAxis.crossVectors(_xAxis, dir);
  } else {
    // Near-vertical light: the engine seeds z from the light's own
    // horizontal components instead of the degenerate up-cross.
    _zAxis.set(dir.y, -dir.x, 0).normalize();
    _xAxis.crossVectors(dir, _zAxis);
  }
  out.makeBasis(_xAxis, dir, _zAxis);
  out.setPosition(center);
  return out;
}
