/**
 * What counts as a collider, and which meshes make one up.
 *
 * Shared by browser and headless worlds so camera queries use the same
 * authored geometry and placement in both environments.
 */

import type { Mesh, Object3D } from "three";
import { getDTSCollisionMeshes } from "../dts/dtsCollision";
import { DIFCollisionMesh } from "../dif/difCollision";
import type { DIFModel } from "../dif/difLoader";

/**
 * Mission-placed statics occlude a camera exactly like interior walls.
 * This registry covers mission statics. Dynamic entities have separate
 * lifecycles and are not registered as static-world geometry.
 */
export const OCCLUDER_SHAPE_TYPES = new Set(["TSStatic", "StaticShape"]);

/**
 * A native DIF collider at the model group's placement. The collision
 * instance stays outside the render graph, and shares detail 0's data.
 * Ordinary groups (procedural geometry/tests) retain direct-child semantics.
 */
export function interiorColliderMeshes(
  group: Object3D,
  model?: DIFModel,
): Mesh[] {
  group.updateWorldMatrix(true, true);
  if (model) {
    const mesh = new DIFCollisionMesh(
      model.collision,
      model.collisionLightMaps,
    );
    mesh.matrixWorld.copy(group.matrixWorld);
    return [mesh];
  }
  return group.children.filter(
    (child): child is Mesh => (child as Mesh).isMesh,
  );
}

/**
 * The meshes a mission static contributes as a camera occluder, or null
 * if it does not qualify.
 *
 * Use the engine's named collision/LOS details, irrespective of the
 * shape's filename, size, render visibility, or material transparency.
 */
export function staticShapeColliderMeshes(options: {
  root: Object3D;
  /** Entity class — `TSStatic`, `StaticShape`, `Item`, `Turret`. */
  type: string;
}): Mesh[] | null {
  const { root, type } = options;
  if (!OCCLUDER_SHAPE_TYPES.has(type)) return null;
  const meshes = getDTSCollisionMeshes(
    root,
    type === "TSStatic" ? "TSStatic" : "ShapeBase",
  );
  return meshes.length ? meshes : null;
}
