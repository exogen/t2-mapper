import {
  Box3,
  BufferGeometry,
  InstancedMesh,
  Matrix4,
  SkinnedMesh,
  type Object3D,
} from "three";
import { isDTSMeshBatch } from "./dts/dtsModel";

const meshBounds = new Box3();
const transformedBounds = new Box3();
const inverseRoot = new Matrix4();
const relativeMatrix = new Matrix4();

/** On-demand scene measurements, including branches skipped by render updates.
 * Local sizing excludes the root transform and uses one tile for instanced
 * terrain; world bounds include all instances. */
export function computeObjectBounds(
  object: Object3D,
  worldBounds: Box3,
  {
    localBounds,
    visibleOnly = false,
  }: {
    localBounds?: Box3;
    visibleOnly?: boolean;
  } = {},
): void {
  // DTS skips hidden/merged branches during rendering. Force propagation even
  // when an earlier query or render has already cleared the parent's dirty bit.
  object.updateWorldMatrix(true, true, true);
  worldBounds.makeEmpty();
  localBounds?.makeEmpty();
  if (localBounds) inverseRoot.copy(object.matrixWorld).invert();

  const measure = (child: Object3D) => {
    if (!("geometry" in child) || !(child.geometry instanceof BufferGeometry))
      return;
    if (child instanceof SkinnedMesh) {
      // updateWorldMatrix does not refresh Three's attached-skin bind inverse.
      child.updateMatrixWorld(true);
      // Raw batch vertices are bone-local. Measure the current posed mesh,
      // refreshing any bounds cached before its last animation update.
      child.computeBoundingBox();
      meshBounds.copy(child.boundingBox!);
    } else {
      if (!child.geometry.boundingBox) child.geometry.computeBoundingBox();
      meshBounds.copy(child.geometry.boundingBox!);
    }
    if (localBounds) {
      relativeMatrix.multiplyMatrices(inverseRoot, child.matrixWorld);
      localBounds.union(
        transformedBounds.copy(meshBounds).applyMatrix4(relativeMatrix),
      );
    }
    if (child instanceof InstancedMesh) {
      child.computeBoundingBox();
      meshBounds.copy(child.boundingBox!);
    }
    worldBounds.union(meshBounds.applyMatrix4(child.matrixWorld));
  };
  const visit = (child: Object3D) => {
    if (visibleOnly && !child.visible) return;
    // With hidden parts included, authored DTS meshes already describe the
    // whole shape. Inactive synthetic batches can still contain its old pose.
    if (!visibleOnly && isDTSMeshBatch(child)) return;
    measure(child);
    for (const descendant of child.children) visit(descendant);
  };
  visit(object);
}
