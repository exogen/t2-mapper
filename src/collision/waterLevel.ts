/**
 * The map's water bodies, bridging WaterBlock (React) and the headless
 * world builder to non-React consumers (projectile physics, the
 * underwater screen filter).
 *
 * This module used to hold ONE body, on the stated assumption that
 * "retail maps have at most one water body, so a single registration is
 * a faithful model". That is simply false. The renderer mounts a
 * component per WaterBlock ghost and draws all of them; Damnation has
 * two pools at the same height in different places, BeachBlitz has an
 * ocean plus two map-wide lava planes. With one slot, whichever
 * registered last won — so the other pools had no collision at all, and
 * any single block unmounting wiped water for the entire map.
 *
 * Bodies are therefore keyed, and the queries are position-aware: ask
 * for the level or the containing body AT a point, not for "the" water.
 *
 * The state lives on the collision world rather than this module, so
 * two worlds in one process do not share it.
 */
import { collisionState } from "./collisionContext";
import type { Vec3 } from "./terrainCollision";

/** WaterBlock::EWaterType — 0-3 are water, 4-6 lava, 7 quicksand. */
export const LIQUID_TYPES: Record<string, number> = {
  water: 0,
  oceanwater: 1,
  riverwater: 2,
  stagnantwater: 3,
  lava: 4,
  hotlava: 5,
  crustylava: 6,
  quicksand: 7,
};

/** WaterBlock::isWater — binary-verified to cover types 0-3. */
export function isWaterType(liquidType: number): boolean {
  return liquidType <= 3;
}

/** What a liquid type is, in words a commentator can use. The
 *  distinction is not cosmetic: a player or a dropped flag sits safely
 *  in water, while lava and quicksand kill. */
export function liquidLabel(
  liquidType: number,
): "water" | "lava" | "quicksand" {
  if (liquidType <= 3) return "water";
  if (liquidType <= 6) return "lava";
  return "quicksand";
}

export interface WaterInfo {
  /** Surface height (Torque Z): position.z + scale.z, per WaterBlock's mSurfaceZ. */
  surfaceZ: number;
  waveMagnitude: number;
  liquidType: number;
  /** Fluid region min corner in terrain space (world + 1024), snapped to squares. */
  minX: number;
  minY: number;
  sizeX: number;
  sizeY: number;
}

// Held per collision world (see collision/collisionContext) so two
// worlds in one process do not share water.

/**
 * Register (or with null, remove) one water body by id.
 *
 * Keyed rather than singular because maps really do have several, and
 * they matter: Damnation has TWO pools at the same height in different
 * places — (-472, 232) and (128, -168) — and BeachBlitz has an ocean at
 * z=148 plus two map-wide lava planes at z=-990. A single slot kept
 * whichever registered last, so the other pools had no collision at
 * all, and any one block unmounting wiped water for the whole map.
 */
export function setWaterBody(id: string, info: WaterInfo | null): void {
  const bodies = collisionState().water;
  if (info) bodies.set(id, info);
  else bodies.delete(id);
}

export function clearWaterBodies(): void {
  collisionState().water.clear();
}

/** Replace all water with a single body. Convenience for tests and
 *  fixtures; production registers per-block via `setWaterBody`. */
export function setWaterInfo(info: WaterInfo | null): void {
  clearWaterBodies();
  if (info) setWaterBody("default", info);
}

/** Every registered body. For diagnostics and tests. */
export function getWaterBodies(): WaterInfo[] {
  return [...collisionState().water.values()];
}

/**
 * Driven by the water surface animation each frame so the submersion
 * test's wave phase matches the rendered surface exactly.
 */
export function setWaterTime(seconds: number): void {
  collisionState().waterTime = seconds;
}

/**
 * Whether a body's fluid region covers this column.
 *
 * The region repeats every 2048 units (terrain reps), so coordinates
 * wrap with & 2047 before the extent check — fluid::IsFluidAtXY. We
 * test the block extent rather than the engine's 64-unit accept-bit
 * mask, a sub-block-granularity difference at the water's edges.
 */
function coversColumn(
  info: WaterInfo,
  torqueX: number,
  torqueY: number,
): boolean {
  const relX = (Math.floor(torqueX + 1024) - info.minX) & 2047;
  const relY = (Math.floor(torqueY + 1024) - info.minY) & 2047;
  return relX < info.sizeX && relY < info.sizeY;
}

/** Local surface height including wave displacement. */
function surfaceAt(info: WaterInfo, torqueX: number, torqueY: number): number {
  const { waterTime } = collisionState();
  const wave =
    (Math.sin(torqueY * 0.05 + waterTime) +
      Math.sin(torqueX * 0.05 + waterTime)) *
    info.waveMagnitude *
    0.25;
  return info.surfaceZ + wave;
}

/**
 * The still surface height at a column, or null if no body covers it.
 *
 * Where bodies overlap the HIGHEST wins: something falling from above
 * meets the topmost surface first. On BeachBlitz that correctly picks
 * the ocean at z=148 over the map-wide lava at z=-990, which a
 * last-one-wins registry could get backwards.
 */
export function waterLevelAt(torqueX: number, torqueY: number): number | null {
  let best: number | null = null;
  for (const info of collisionState().water.values()) {
    if (!coversColumn(info, torqueX, torqueY)) continue;
    if (best == null || info.surfaceZ > best) best = info.surfaceZ;
  }
  return best;
}

/**
 * The water body a point is inside, or null. Highest surface wins where
 * bodies overlap, so a swimmer near the top of the ocean is reported as
 * being in the ocean rather than the lava far beneath it.
 *
 * Torque's eye-submersion test (fluidQuadTree.cc RunQuadTree +
 * fluid::IsFluidAtXY) — the surface includes the wave displacement.
 */
export function submergedWaterAt(
  torqueX: number,
  torqueY: number,
  torqueZ: number,
): WaterInfo | null {
  let best: WaterInfo | null = null;
  for (const info of collisionState().water.values()) {
    if (!coversColumn(info, torqueX, torqueY)) continue;
    if (torqueZ >= surfaceAt(info, torqueX, torqueY)) continue;
    if (best == null || info.surfaceZ > best.surfaceZ) best = info;
  }
  return best;
}

export function isPointSubmerged(
  torqueX: number,
  torqueY: number,
  torqueZ: number,
): boolean {
  return submergedWaterAt(torqueX, torqueY, torqueZ) !== null;
}

/**
 * WaterBlock::isPointSubmergedSimple — the still-surface test, with NO
 * wave displacement:
 *
 *     if (Pos.z > mSurfaceZ) return false;
 *     return mFluid.IsFluidAtXY(Pos.x + 1024, Pos.y + 1024);
 *
 * This is the one `LinearProjectile::determineWetStart` uses, and it is
 * deliberately not the wavy variant: whether a shot counts as fired
 * underwater picks its muzzle speed (disc 55 vs 95), so letting a wave
 * crest flip that at the boundary would be wrong.
 */
export function isPointSubmergedSimple(
  torqueX: number,
  torqueY: number,
  torqueZ: number,
): boolean {
  for (const info of collisionState().water.values()) {
    if (torqueZ > info.surfaceZ) continue;
    if (coversColumn(info, torqueX, torqueY)) return true;
  }
  return false;
}

export interface WaterRayHit {
  /** Parametric position along the segment, 0..1. */
  t: number;
  point: Vec3;
  /** Water surfaces are horizontal planes, so always +Z. */
  normal: Vec3;
  info: WaterInfo;
}

/**
 * Where a segment first crosses a water surface, in either direction.
 *
 * Torque casts against the block's real geometry with `WaterObjectType`;
 * we model a body as its surface plane within the fluid region, which
 * gives the same answer for anything arriving through the surface.
 * `WaterBlock::castRay` bails only when both ends are on the SAME side
 * of the surface, so an upward crossing counts too — a shot that starts
 * below the waterline but outside the fluid footprint (hence not a wet
 * start) can travel into the body and exit through the top.
 */
export function castWaterRay(start: Vec3, end: Vec3): WaterRayHit | null {
  let best: WaterRayHit | null = null;
  for (const info of collisionState().water.values()) {
    const surface = info.surfaceZ;
    // Both ends the same side of the plane: no crossing.
    if (start[2] > surface === end[2] > surface) continue;
    if (start[2] === end[2]) continue;
    const t = (start[2] - surface) / (start[2] - end[2]);
    const point: Vec3 = [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      surface,
    ];
    // The crossing has to land inside this body's fluid region.
    if (!coversColumn(info, point[0], point[1])) continue;
    if (best == null || t < best.t) {
      best = { t, point, normal: [0, 0, 1], info };
    }
  }
  return best;
}
