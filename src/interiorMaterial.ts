/**
 * Interior material shader modifications.
 * Injects per-object-type lighting multipliers into MeshLambertMaterial.
 */

import { INTERIOR_LIGHTING } from "./lightingConfig";

/**
 * Inject lighting multipliers into a MeshLambertMaterial shader.
 * Call this from onBeforeCompile after other shader modifications (e.g., fog).
 */
export function injectInteriorLighting(shader: any): void {
  // Add lighting multiplier uniforms
  shader.uniforms.interiorDirectionalFactor = {
    value: INTERIOR_LIGHTING.directional,
  };
  shader.uniforms.interiorAmbientFactor = { value: INTERIOR_LIGHTING.ambient };

  // Declare uniforms in fragment shader
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <common>",
    `#include <common>
uniform float interiorDirectionalFactor;
uniform float interiorAmbientFactor;
`,
  );

  // Scale directional light contribution
  shader.fragmentShader = shader.fragmentShader.replace(
    "#include <lights_fragment_end>",
    `#include <lights_fragment_end>
  // Apply interior-specific lighting multipliers
  reflectedLight.directDiffuse *= interiorDirectionalFactor;
  reflectedLight.indirectDiffuse *= interiorAmbientFactor;
`,
  );
}
