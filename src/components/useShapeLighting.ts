import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import type { Object3D } from "three";
import {
  createShapeLightState,
  updateShapeLighting,
  type ShapeLightUniforms,
} from "../shapeLighting";

export { shapeBoxCenter } from "../shapeLighting";

/**
 * Runs the engine's per-object lighting probe for a cloned shape (see
 * shapeLighting.ts) and keeps its materials' uniforms current. Call it
 * right after the clone's materials exist and before its first render, so
 * the materials compile with this shape's uniforms.
 */
export function useShapeLighting(
  root: Object3D,
  shapeName?: string,
): ShapeLightUniforms {
  const state = useMemo(
    () => createShapeLightState(root, shapeName),
    [root, shapeName],
  );
  useFrame((_, delta) => {
    updateShapeLighting(state, delta * 1000);
  });
  return state.uniforms;
}
