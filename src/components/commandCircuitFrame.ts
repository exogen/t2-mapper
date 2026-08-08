import type { SceneMissionArea } from "../scene/types";

export interface CommandCircuitFrame {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
}

/**
 * Fraction of each span added as padding on each side.
 */
const PADDING = 0.1;

/**
 * Terrain default extent in Three space when no MissionArea exists.
 */
const FALLBACK_EXTENT = 1024;

/**
 * Computes the top-down viewable area (in Three.js world space) for command
 * circuit mode from the mission's MissionArea bounds. The MissionArea rect is
 * in Torque coordinates, where Torque Y maps to Three X and Torque X maps to
 * Three Z.
 */
export function computeCommandCircuitFrame(
  missionArea: SceneMissionArea | null,
): CommandCircuitFrame {
  let minX = -FALLBACK_EXTENT;
  let maxX = FALLBACK_EXTENT;
  let minZ = -FALLBACK_EXTENT;
  let maxZ = FALLBACK_EXTENT;
  if (missionArea) {
    const { x, y, w, h } = missionArea.area;
    minX = y;
    maxX = y + h;
    minZ = x;
    maxZ = x + w;
  }
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: spanX * (1 + PADDING * 2),
    depth: spanZ * (1 + PADDING * 2),
  };
}
