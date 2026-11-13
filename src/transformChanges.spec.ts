import { afterEach, expect, it } from "vitest";
import { Group, Scene, Vector3 } from "three";
import { attachFrozen } from "./engine/staticMatrices";
import {
  flushTransformChanges,
  markTransformChanged,
} from "./transformChanges";

afterEach(() => flushTransformChanges());

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

it("keeps another renderer's changes pending until that scene renders", () => {
  const game = frozenTree();
  const portrait = frozenTree();
  game.root.position.x = 10;
  markTransformChanged(game.root);
  portrait.root.position.x = 20;
  markTransformChanged(portrait.root);
  flushTransformChanges(portrait.scene);
  portrait.scene.updateMatrixWorld();
  expect(portrait.child.matrixWorld.elements[12]).toBe(20);

  // World queries after the portrait frame can still consume a pending
  // game's dirty flag; the game's own flush must be able to restore it.
  game.root.getWorldPosition(new Vector3());
  expect(game.root.matrixWorldNeedsUpdate).toBe(false);
  flushTransformChanges(game.scene);
  game.scene.updateMatrixWorld();
  expect(game.child.matrixWorld.elements[12]).toBe(10);
});

it("flushes a root itself, and only consumes changes once", () => {
  const { scene, root, child } = frozenTree();
  root.position.x = 10;
  markTransformChanged(root);
  root.getWorldPosition(new Vector3());
  flushTransformChanges(root);
  scene.updateMatrixWorld();
  expect(child.matrixWorld.elements[12]).toBe(10);
  root.matrixWorldNeedsUpdate = false;
  flushTransformChanges(root);
  expect(root.matrixWorldNeedsUpdate).toBe(false);
});

it("retires detached roots and changes inside detached groups", () => {
  const scene = new Scene();
  const detachedRoot = new Group();
  const detachedGroup = new Group();
  const detachedChild = new Group();
  detachedGroup.add(detachedChild);
  for (const object of [detachedRoot, detachedChild]) {
    markTransformChanged(object);
    object.getWorldPosition(new Vector3());
    expect(object.matrixWorldNeedsUpdate).toBe(false);
  }
  flushTransformChanges(scene);
  for (const object of [detachedRoot, detachedChild]) {
    expect(object.matrixWorldNeedsUpdate).toBe(true);
    object.matrixWorldNeedsUpdate = false;
  }
  // A later global flush must not find a retained reference to either one.
  flushTransformChanges();
  expect(detachedRoot.matrixWorldNeedsUpdate).toBe(false);
  expect(detachedChild.matrixWorldNeedsUpdate).toBe(false);
});

it("refreshes a reused subtree after its detached changes were retired", () => {
  const { scene, root, child } = frozenTree();
  scene.remove(root);
  root.position.x = 10;
  markTransformChanged(root);
  flushTransformChanges(scene);
  attachFrozen(scene, root);
  root.getWorldPosition(new Vector3());
  expect(root.matrixWorldNeedsUpdate).toBe(false);
  flushTransformChanges(scene);
  scene.updateMatrixWorld();
  expect(child.matrixWorld.elements[12]).toBe(10);
});
