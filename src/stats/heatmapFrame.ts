import type { CommandCircuitFrame } from "./commandCircuitFrame";
import { HEATMAP_RADIUS_WORLD, HEATMAP_RESOLUTION } from "./rasterize";
import type { PositionSamples } from "./types";

// Keep stationary players' textures from spending most of their pixels on
// each repeated splat. At this span the default grid is at most 1 px per unit.
const MIN_FRAME_SPAN = 512;

/**
 * Fit the texture to the selected player's actual positions. MissionArea is
 * only a gameplay boundary: players can travel arbitrarily far beyond it.
 * Leave a full splat radius plus a transparent border around every sample.
 */
export function computeHeatmapFrame(
  samples: PositionSamples,
  playerId: number,
): CommandCircuitFrame | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < samples.count; i++) {
    if (samples.playerId[i] !== playerId) continue;
    const x = samples.x[i];
    const z = samples.z[i];
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (!Number.isFinite(minX)) return null;

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  const padding = Math.max(
    HEATMAP_RADIUS_WORLD * 2,
    (Math.max(spanX, spanZ) / HEATMAP_RESOLUTION) * 2,
  );
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: Math.max(MIN_FRAME_SPAN, spanX + padding * 2),
    depth: Math.max(MIN_FRAME_SPAN, spanZ + padding * 2),
  };
}
