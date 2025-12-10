/**
 * Per-object-type lighting intensity multipliers.
 *
 * These allow fine-tuning of directional and ambient light contributions
 * for each object type to match Tribes 2's original appearance.
 *
 * The Torque engine uses distinctly different lighting systems for each object type:
 * - Terrain: Pre-baked lightmaps with directional sun dot-product calculation
 * - Interiors: Vertex colors or lightmaps with animated light states
 * - DTS Shapes: OpenGL hardware lighting with per-material flags
 *
 * Values are multipliers applied to the global Sun intensity (which is set to 1.0/1.0):
 * - directional: Multiplier for directional (sun) light contribution
 * - ambient: Multiplier for ambient light contribution (affects shadow darkness)
 */

/**
 * Terrain lighting is handled via custom shader in terrainMaterial.ts.
 *
 * The shader implements Torque's gamma-space rendering formula (terrLighting.cc):
 *   output = clamp(lighting × texture, 0, 1)
 *
 * Where:
 *   - lighting = clamp(ambient + NdotL × shadowFactor × sunColor, 0, 1)
 *   - NdotL from pre-computed terrain lightmap (smooth per-pixel normals)
 *   - shadowFactor from Three.js real-time shadow maps
 *
 * No intensity multipliers are needed - the shader uses mission sun/ambient
 * colors directly and performs gamma-space math to match Torque's output.
 */

/**
 * Interior lighting is handled via custom shader in interiorMaterial.ts.
 *
 * The shader implements Torque's gamma-space rendering formula:
 *   output = clamp((scene_lighting + lightmap) × texture, 0, 1)
 *
 * Where:
 *   - Outside surfaces (SurfaceOutsideVisible): scene lighting + lightmap
 *   - Inside surfaces: lightmap only
 *
 * No intensity multipliers are needed - the shader extracts lighting values
 * from Three.js and performs gamma-space math to match Torque's output.
 */

export const SHAPE_LIGHTING = {
  directional: 1,
  ambient: 1.5,
};

// Note: Water does not use lighting - Tribes 2's Phase 2 (lightmap) is disabled.
// Water textures are rendered directly without scene lighting.
