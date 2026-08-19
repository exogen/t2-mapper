/**
 * Tribes 2 fog state types and parsing.
 *
 * Tribes 2 has two fog systems:
 * 1. Distance-based haze: Global fog from fogDistance to visibleDistance with quadratic falloff
 * 2. Height-based volumetric fog: Up to 3 fog volumes with independent height ranges
 *
 * The fog density depends on how much of the view ray passes through each fog volume,
 * which varies based on camera height relative to volume boundaries. Shader materials
 * get fog uniforms from globalFogUniforms (updated by Sky).
 */
import { Color } from "three";
import type { SceneSky } from "../scene/types";

/**
 * A single fog volume with height boundaries and visibility settings.
 *
 * Note: Per-volume colors are NOT used in Tribes 2 ($specialFog defaults to false).
 * All fog uses the global fogColor regardless of fogVolumeColor values in mission files.
 */
export interface FogVolume {
  /** Distance at which objects are fully obscured within this volume */
  visibleDistance: number;
  /** Bottom height boundary of the fog volume */
  minHeight: number;
  /** Top height boundary of the fog volume */
  maxHeight: number;
  /** Fog density percentage (0-1), can be animated for storm effects */
  percentage: number;
}

/** Complete fog state parsed from a Sky object */
export interface FogState {
  /** Distance at which fog starts (near plane) */
  fogDistance: number;
  /** Distance at which fog is fully opaque (far plane) */
  visibleDistance: number;
  /** Color for distance-based haze */
  fogColor: Color;
  /** Height-based fog volumes (up to 3) */
  fogVolumes: FogVolume[];
  /** Highest point of any fog volume (used for optimization) */
  fogLine: number;
  /** Whether fog is enabled */
  enabled: boolean;
}

/** Build FogState directly from a typed SceneSky (no string parsing). */
export function fogStateFromScene(sky: SceneSky): FogState {
  const fogDistance = sky.fogDistance;
  const visibleDistance = sky.visibleDistance > 0 ? sky.visibleDistance : 1000;
  const { r, g, b } = sky.fogColor;
  const fogColor = new Color().setRGB(r, g, b).convertSRGBToLinear();

  const fogVolumes: FogVolume[] = [];
  for (const vol of sky.fogVolumes) {
    if (vol.visibleDistance <= 0 || vol.maxHeight <= vol.minHeight) continue;
    fogVolumes.push({
      visibleDistance: vol.visibleDistance,
      minHeight: vol.minHeight,
      maxHeight: vol.maxHeight,
      percentage: 1.0,
    });
  }

  const fogLine = fogVolumes.reduce(
    (max, vol) => Math.max(max, vol.maxHeight),
    0,
  );

  // Fog is ALWAYS active in the engine — fog volumes apply regardless of
  // the haze distances, and visibleDistance == fogDistance (e.g. Training4)
  // just degenerates the haze ramp into a hard edge at the clip distance
  // (SceneState::setupFog special-cases equality with fogScale = 1000).
  const enabled = visibleDistance > 0;

  return {
    fogDistance,
    visibleDistance,
    fogColor,
    fogVolumes,
    fogLine,
    enabled,
  };
}
