import { Mesh, Object3D, Vector3, type Camera } from "three";
import type { ScreenRect } from "./screenAnchor";

const _corner = new Vector3();

export function isAttachedToScene(object: Object3D, scene: Object3D): boolean {
  let node: Object3D | null = object;
  while (node.parent) node = node.parent;
  return node === scene;
}

function collectMeshes(root: Object3D): Mesh[] {
  const meshes: Mesh[] = [];
  root.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh && mesh.geometry) meshes.push(mesh);
  });
  return meshes;
}

/**
 * Whether the mesh would actually render — shapes keep hidden meshes
 * around (damage states, vis/IFL sequences), which must not contribute to
 * the visible bounds. Checked per frame since visibility is animated.
 */
function isEffectivelyVisible(object: Object3D, root: Object3D): boolean {
  let node: Object3D | null = object;
  while (node) {
    if (!node.visible) return false;
    if (node === root) return true;
    node = node.parent;
  }
  return true;
}

/**
 * Frame-by-frame projector of an object's screen-space bounding rectangle:
 * the 8 corners of each mesh's (cached) geometry bounding box go through
 * the camera to viewport pixels, accumulating `rect`. Mesh lists are
 * cached per target and rebuilt when the target changes, is replaced (e.g.
 * a Suspense placeholder swapping for the streamed model), or detaches;
 * targets with no meshes yet fall back to their world position.
 */
export class ScreenRectTracker {
  readonly rect: ScreenRect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  /**
   * Incremented whenever the mesh list is rebuilt (target change or model
   * swap) — lets callers invalidate anything derived from the bounds.
   */
  meshesVersion = 0;
  private cachedRoot: Object3D | null = null;
  private meshes: Mesh[] = [];

  /**
   * Resolves the target from an explicit object or a scene-object name
   * (caching name lookups until the object detaches). Null when missing.
   */
  resolveTarget(
    object: Object3D | null | undefined,
    objectName: string | undefined,
    scene: Object3D,
  ): Object3D | null {
    let root = object ?? null;
    if (!root && objectName) {
      root =
        this.cachedRoot &&
        this.cachedRoot.name === objectName &&
        isAttachedToScene(this.cachedRoot, scene)
          ? this.cachedRoot
          : (scene.getObjectByName(objectName) ?? null);
    }
    if (!root || !isAttachedToScene(root, scene)) return null;
    return root;
  }

  /**
   * Projects the target's bounds into `rect`. Returns false (rect invalid)
   * when every corner is behind the camera.
   */
  update(
    root: Object3D,
    scene: Object3D,
    camera: Camera,
    width: number,
    height: number,
  ): boolean {
    if (
      this.cachedRoot !== root ||
      (this.meshes.length > 0 && !isAttachedToScene(this.meshes[0], scene))
    ) {
      this.cachedRoot = root;
      this.meshes = collectMeshes(root);
      this.meshesVersion++;
    } else if (this.meshes.length === 0) {
      // The model may still be streaming in; retry until meshes exist.
      this.meshes = collectMeshes(root);
      if (this.meshes.length > 0) this.meshesVersion++;
    }

    camera.updateMatrixWorld();
    // World matrices only refresh during render prep, after frame
    // callbacks — meshes added THIS frame (e.g. the tour flash clones)
    // still carry identity matrices and would project at the world origin,
    // wildly inflating the rect. Force the subtree current first.
    root.updateWorldMatrix(true, true);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let inFront = 0;

    const project = () => {
      // To camera space first for the behind-camera test (camera looks
      // down local -Z), then through the projection to the viewport.
      _corner.applyMatrix4(camera.matrixWorldInverse);
      if (_corner.z >= 0) return;
      inFront++;
      _corner.applyMatrix4(camera.projectionMatrix);
      const x = ((_corner.x + 1) / 2) * width;
      const y = ((1 - _corner.y) / 2) * height;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    };

    let projectedMeshes = 0;
    for (const mesh of this.meshes) {
      if (!isEffectivelyVisible(mesh, root)) continue;
      projectedMeshes++;
      const geometry = mesh.geometry;
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      for (let i = 0; i < 8; i++) {
        _corner.set(
          i & 1 ? box.max.x : box.min.x,
          i & 2 ? box.max.y : box.min.y,
          i & 4 ? box.max.z : box.min.z,
        );
        _corner.applyMatrix4(mesh.matrixWorld);
        project();
      }
    }
    if (projectedMeshes === 0) {
      root.getWorldPosition(_corner);
      project();
    }

    if (inFront === 0) return false;
    this.rect.minX = minX;
    this.rect.minY = minY;
    this.rect.maxX = maxX;
    this.rect.maxY = maxY;
    return true;
  }

  reset() {
    this.cachedRoot = null;
    this.meshes = [];
  }
}
