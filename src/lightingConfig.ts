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

export const TERRAIN_LIGHTING = {
  directional: 4,
  ambient: 1.5,
};

export const INTERIOR_LIGHTING = {
  directional: 3,
  ambient: 1,
};

export const SHAPE_LIGHTING = {
  directional: 1,
  ambient: 1.5,
};

// Note: Water does not use lighting - Tribes 2's Phase 2 (lightmap) is disabled.
// Water textures are rendered directly without scene lighting.
