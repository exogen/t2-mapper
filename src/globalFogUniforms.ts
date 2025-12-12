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
/** Floats per fog volume: [visDist, minH, maxH, percentage] */
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
};

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
}

/**
 * Pack fog volume data into a flat array for shaders.
 * Format: [visDist, minH, maxH, percentage] x 3 = 12 floats
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

    if (vol) {
      data[offset + 0] = vol.visibleDistance;
      data[offset + 1] = vol.minHeight;
      data[offset + 2] = vol.maxHeight;
      data[offset + 3] = vol.percentage;
    }
    // Inactive volumes default to 0 (Float32Array is zero-initialized)
  }

  return data;
}
