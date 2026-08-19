/**
 * Module-level water state, bridging WaterBlock (React) to non-React
 * consumers (projectile physics, the underwater screen filter). Tribes 2
 * water blocks are flat planes and retail maps have at most one water
 * body, so a single registration is a faithful model.
 */

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

let waterInfo: WaterInfo | null = null;
let waterTime = 0;

/** Called by WaterBlock on mount/unmount. */
export function setWaterInfo(info: WaterInfo | null): void {
  waterInfo = info;
}

export function getWaterInfo(): WaterInfo | null {
  return waterInfo;
}

/**
 * Driven by the water surface animation each frame so the submersion
 * test's wave phase matches the rendered surface exactly.
 */
export function setWaterTime(seconds: number): void {
  waterTime = seconds;
}

export function getWaterLevel(): number | null {
  return waterInfo ? waterInfo.surfaceZ : null;
}

/**
 * Torque's eye-submersion test (fluidQuadTree.cc RunQuadTree +
 * fluid::IsFluidAtXY): the surface height at a point includes the wave
 * displacement, and the fluid region repeats every 2048 units (terrain
 * reps) — coordinates wrap with & 2047 before the extent check. We test
 * the block extent instead of the engine's 64-unit accept-bit mask, a
 * sub-block-granularity difference at the water's edges.
 */
export function isPointSubmerged(
  torqueX: number,
  torqueY: number,
  torqueZ: number,
): boolean {
  const info = waterInfo;
  if (!info) return false;
  const wave =
    (Math.sin(torqueY * 0.05 + waterTime) +
      Math.sin(torqueX * 0.05 + waterTime)) *
    info.waveMagnitude *
    0.25;
  if (torqueZ >= info.surfaceZ + wave) return false;
  const relX = (Math.floor(torqueX + 1024) - info.minX) & 2047;
  const relY = (Math.floor(torqueY + 1024) - info.minY) & 2047;
  return relX < info.sizeX && relY < info.sizeY;
}
