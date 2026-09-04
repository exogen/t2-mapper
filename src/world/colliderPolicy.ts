/**
 * What counts as a collider, and which meshes make one up.
 *
 * These rules used to live inside React effects in `InteriorInstance`
 * and `GenericShape`. They are POLICY, not rendering: change the
 * minimum occluder size or start including skinned meshes and the
 * director frames different shots. A headless scan that reproduces the
 * geometry but not these filters will silently disagree with the
 * browser, which is the failure this module exists to prevent.
 */

import {
  Box3,
  Vector3,
  type Mesh,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { isOrganicShape } from "../organicShapes";

/**
 * Mission-placed statics occlude a camera exactly like interior walls.
 * Only these two class types are treated as occluders; Items, Turrets
 * and players are excluded because they move or are too small to
 * matter.
 */
export const OCCLUDER_SHAPE_TYPES = new Set(["TSStatic", "StaticShape"]);

/**
 * Smallest bounding-box extent (world units) worth registering. Below
 * this a static is scenery — a crate, a console — and registering it
 * costs BVH build time while never meaningfully blocking a frame.
 */
export const MIN_OCCLUDER_EXTENT = 3;

const _box = new Box3();
const _size = new Vector3();

/**
 * Direct-child meshes of an interior's model group.
 *
 * Deliberately NOT a traverse: the browser flattens a loaded interior
 * into one mesh per material directly under the model group, and debug
 * helpers (labels, bounds) live in nested groups that must not become
 * collision geometry.
 */
export function interiorColliderMeshes(group: Object3D): Mesh[] {
  group.updateWorldMatrix(true, true);
  return group.children.filter(
    (child): child is Mesh => (child as Mesh).isMesh,
  );
}

/**
 * The meshes a mission static contributes as a camera occluder, or null
 * if it does not qualify.
 *
 * Vegetation is skipped: crossed alpha planes read solid to a ray while
 * looking sparse, so a tree would block shots the viewer can see
 * straight through. Skinned meshes are skipped because their bind-pose
 * geometry does not match where the animated surface actually is.
 */
export function staticShapeColliderMeshes(options: {
  root: Object3D;
  /** Entity class — `TSStatic`, `StaticShape`, `Item`, `Turret`. */
  type: string;
  /** Shape name, used to detect vegetation. Pass undefined to skip the
   *  organic check when the caller has already done it. */
  shapeName?: string;
  /** Precomputed organic flag, when the caller already knows. */
  isOrganic?: boolean;
}): Mesh[] | null {
  const { root, type, shapeName } = options;
  if (!OCCLUDER_SHAPE_TYPES.has(type)) return null;
  const organic =
    options.isOrganic ?? (shapeName ? isOrganicShape(shapeName) : false);
  if (organic) return null;

  root.updateWorldMatrix(true, true);
  const meshes: Mesh[] = [];
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (mesh.isMesh && !(mesh as unknown as SkinnedMesh).isSkinnedMesh) {
      meshes.push(mesh);
    }
  });
  if (meshes.length === 0) return null;

  _box.setFromObject(root);
  _box.getSize(_size);
  if (Math.max(_size.x, _size.y, _size.z) < MIN_OCCLUDER_EXTENT) return null;

  return meshes;
}
