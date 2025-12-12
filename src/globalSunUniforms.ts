/**
 * Global sun shader uniforms shared across all materials.
 *
 * Used to communicate sun light direction to shaders that need to adjust
 * their lighting calculations (e.g., terrain ignores light from below).
 */

export const globalSunUniforms = {
  /** True if sun light points downward (negative Y). False if pointing up. */
  sunLightPointsDown: { value: true },
};

/**
 * Update sun light direction state. Called by Sun component when direction changes.
 */
export function updateGlobalSunUniforms(sunLightPointsDown: boolean): void {
  globalSunUniforms.sunLightPointsDown.value = sunLightPointsDown;
}
