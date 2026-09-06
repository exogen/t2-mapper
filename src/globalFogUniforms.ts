/**
 * Global fog shader uniforms that can be shared across all materials.
 *
 * This module provides a singleton set of fog uniforms that:
 * 1. Sky component updates each frame with camera height and fog volume data
 * 2. Materials reference directly via import (avoiding React context issues)
 *
 * The uniform objects themselves are stable - only their .value properties change.
 * This allows Three.js materials to reference them once and get automatic updates.
 */

const MAX_FOG_VOLUMES = 3;
/** Floats per fog volume: [factor, minH, maxH, 0] — see packFogVolumeData. */
const FLOATS_PER_VOLUME = 4;

/**
 * Shared fog shader uniform objects.
 * Materials should import and use these directly in onBeforeCompile.
 */
export const globalFogUniforms = {
  fogVolumeData: {
    value: new Float32Array(MAX_FOG_VOLUMES * FLOATS_PER_VOLUME),
  },
  cameraHeight: { value: 0 },
  fogEnabled: { value: true },
  /** Scales all fog distances (haze + volumes). 1.0 = normal, >1 = less fog.
   *  Used by camera tour to reduce fog when orbiting far from targets. */
  fogDistanceScale: { value: 1 },
  /** Volume-fog height-row grid (Tribes2.exe fog texture emulation):
   *  world height of row 0's center, and the step between rows.
   *  Step 0 disables quantization (no terrain loaded — the engine builds
   *  no fog texture then either). See setFogTerrainRows. */
  fogRowBase: { value: 0 },
  fogRowStep: { value: 0 },
};

/**
 * Configure the volume-fog height rows from the terrain's height range,
 * mirroring Tribes2.exe's SceneGraph::buildFogTexture (0x569fc0): the
 * engine samples volume fog into a 64-row texture whose rows span the
 * terrain heightfield's min..max, each row centered half a step up, and
 * bilinear filtering blends adjacent rows. Quantizing our per-fragment
 * fog to the same grid reproduces the soft volume boundaries of the
 * real renderer.
 */
export function setFogTerrainRows(minHeight: number, maxHeight: number): void {
  const step = (maxHeight - minHeight) / 64;
  globalFogUniforms.fogRowStep.value = step > 0 ? step : 0;
  globalFogUniforms.fogRowBase.value = minHeight + step * 0.5;
}

export function clearFogTerrainRows(): void {
  globalFogUniforms.fogRowStep.value = 0;
  globalFogUniforms.fogRowBase.value = 0;
}

/**
 * Update the global fog uniforms with new values.
 * Called by Sky component each frame.
 */
export function updateGlobalFogUniforms(
  cameraHeight: number,
  fogVolumeData: Float32Array,
  enabled: boolean = true,
): void {
  globalFogUniforms.cameraHeight.value = cameraHeight;
  globalFogUniforms.fogVolumeData.value.set(fogVolumeData);
  globalFogUniforms.fogEnabled.value = enabled;
}

/**
 * Reset global fog uniforms to default values.
 * Called when Sky unmounts to clean up fog state for next mission.
 */
export function resetGlobalFogUniforms(): void {
  globalFogUniforms.cameraHeight.value = 0;
  globalFogUniforms.fogVolumeData.value.fill(0);
  globalFogUniforms.fogEnabled.value = true;
  globalFogUniforms.fogDistanceScale.value = 1;
  clearFogTerrainRows();
}

/**
 * Pack fog volume data for the shader as vec4[3]: [factor, minH, maxH, 0]
 * where factor is Torque's percentage / (visibleDistance * visibleDistanceMod)
 * (mod = 1), precomputed here so fragments don't divide per volume.
 * Inactive volumes are all-zero (factor 0 skips them in the shader).
 *
 * Note: Per-volume colors are NOT used in Tribes 2 ($specialFog defaults to false).
 * All fog uses the global fogColor, so we don't pack color data.
 */
export function packFogVolumeData(
  fogVolumes: Array<{
    visibleDistance: number;
    minHeight: number;
    maxHeight: number;
    percentage: number;
  }>,
): Float32Array {
  const data = new Float32Array(MAX_FOG_VOLUMES * FLOATS_PER_VOLUME);

  for (let i = 0; i < MAX_FOG_VOLUMES; i++) {
    const offset = i * FLOATS_PER_VOLUME;
    const vol = fogVolumes[i];

    if (vol && vol.visibleDistance > 0) {
      data[offset + 0] = vol.percentage / vol.visibleDistance;
      data[offset + 1] = vol.minHeight;
      data[offset + 2] = vol.maxHeight;
    }
  }

  return data;
}

/**
 * SceneState::getHazeAndFog (Tribes2.exe 0x570b40) for one object: the
 * quadratic distance haze between `near` and `far` (1 beyond `far`), plus
 * the fog-volume walk from the camera height to the object's height —
 * each volume adds its factor times the length of the sight line inside
 * it (similar triangles: dist × overlap / |deltaHeight|; a level line
 * inside a volume counts the whole distance) — clamped to 1. Objects that
 * take a single haze value (force fields, shapes, interiors) use this;
 * terrain samples the same maths through its row-quantized fog texture.
 */
export function hazeAndFog(
  dist: number,
  objectHeight: number,
  near: number,
  far: number,
): number {
  if (!globalFogUniforms.fogEnabled.value) return 0;
  const scaledDist = dist / globalFogUniforms.fogDistanceScale.value;
  if (scaledDist > far) return 1;
  let total = 0;
  if (scaledDist > near) {
    const distFactor = (scaledDist - near) / (far - near) - 1;
    total = 1 - distFactor * distFactor;
  }
  const cameraHeight = globalFogUniforms.cameraHeight.value;
  const deltaHeight = objectHeight - cameraHeight;
  const absDelta = Math.abs(deltaHeight);
  const volumes = globalFogUniforms.fogVolumeData.value;
  const rayMin = Math.min(cameraHeight, objectHeight);
  const rayMax = Math.max(cameraHeight, objectHeight);
  for (let i = 0; i < MAX_FOG_VOLUMES; i++) {
    const factor = volumes[i * FLOATS_PER_VOLUME];
    if (factor <= 0) continue;
    const minH = volumes[i * FLOATS_PER_VOLUME + 1];
    const maxH = volumes[i * FLOATS_PER_VOLUME + 2];
    if (absDelta > 0.01) {
      if (rayMin < maxH && rayMax > minH) {
        const overlap = Math.min(rayMax, maxH) - Math.max(rayMin, minH);
        total += scaledDist * (overlap / absDelta) * factor;
      }
    } else if (cameraHeight >= minH && cameraHeight <= maxH) {
      total += scaledDist * factor;
    }
  }
  return Math.min(total, 1);
}
