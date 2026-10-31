import { expect, it } from "vitest";
import { Group, Scene, Vector3 } from "three";
import {
  flushTransformChanges,
  markTransformChanged,
} from "./transformChanges";

function frozenTree() {
  const scene = new Scene();
  scene.matrixAutoUpdate = false;
  const root = new Group();
  root.matrixAutoUpdate = false;
  const child = new Group();
  child.position.set(0, 1, 0);
  child.updateMatrix();
  child.matrixAutoUpdate = false;
  root.add(child);
  scene.add(root);
  markTransformChanged(root);
  flushTransformChanges();
  scene.updateMatrixWorld();
  return { scene, root, child };
}

it("refreshes a moved frozen subtree even after a world query cleared its flag", () => {
  const { scene, root, child } = frozenTree();
  root.position.set(10, 0, 0);
  markTransformChanged(root);
  // A label or camera reads the root's world position mid-frame.
  expect(root.getWorldPosition(new Vector3()).x).toBe(10);
  expect(root.matrixWorldNeedsUpdate).toBe(false);
  flushTransformChanges();
  scene.updateMatrixWorld();
  expect(child.getWorldPosition(new Vector3()).toArray()).toEqual([10, 1, 0]);
});

it("leaves unmoved frozen subtrees alone", () => {
  const { scene, root, child } = frozenTree();
  root.position.set(10, 0, 0);
  flushTransformChanges();
  scene.updateMatrixWorld();
  expect(child.matrixWorld.elements[12]).toBe(0);
});
