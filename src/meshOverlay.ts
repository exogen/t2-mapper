import { DetachedBindMode, Mesh, SkinnedMesh, type Material } from "three";

/** An overlay borrows its source's surface; it never owns a separate snapshot.
 * Read through to the source even when LOD or morph topology changes after
 * matrix updates. onBeforeRender is too late: Three already captured geometry
 * in its render list by then. Install once, after constructing the overlay. */
export function shareMeshSurface(
  overlay: Mesh,
  source: Mesh,
  prepare?: () => void,
): void {
  Object.defineProperties(overlay, {
    geometry: {
      get: () => {
        prepare?.();
        return source.geometry;
      },
    },
    morphTargetInfluences: { get: () => source.morphTargetInfluences },
    morphTargetDictionary: { get: () => source.morphTargetDictionary },
  });
}

/** A detached silhouette following the source's world-space pose. Neither its
 * geometry nor its skeleton belongs to the overlay. */
export function createWorldMeshOverlay(source: Mesh, material: Material): Mesh {
  let overlay: Mesh;
  const skinned = source instanceof SkinnedMesh ? source : null;
  if (skinned) {
    const skin = new SkinnedMesh(source.geometry, material);
    skin.bind(skinned.skeleton, skinned.bindMatrix);
    skin.bindMode = DetachedBindMode;
    overlay = skin;
  } else {
    overlay = new Mesh(source.geometry, material);
  }
  shareMeshSurface(overlay, source);
  overlay.frustumCulled = false;
  overlay.matrixAutoUpdate = false;
  overlay.matrixWorldAutoUpdate = false;
  overlay.onBeforeRender = () => {
    overlay.matrixWorld.copy(source.matrixWorld);
    if (skinned) {
      (overlay as SkinnedMesh).bindMatrixInverse.copy(
        skinned.bindMatrixInverse,
      );
    }
  };
  return overlay;
}
