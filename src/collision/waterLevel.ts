/**
 * Module-level water surface height (Torque Z), bridging WaterBlock
 * (React) and projectile physics (non-React). Tribes 2 water blocks are
 * flat planes; the renderer draws the plane effectively infinite, so a
 * single height is a faithful collision model for retail maps (which
 * have at most one water body).
 */
let waterLevel: number | null = null;

/** Called by WaterBlock on mount/unmount. */
export function setWaterLevel(torqueZ: number | null): void {
  waterLevel = torqueZ;
}

export function getWaterLevel(): number | null {
  return waterLevel;
}
