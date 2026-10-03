import { describe, expect, it, vi } from "vitest";
import { Group, Object3D, Vector3 } from "three";
import { DTSNode, DTSObject } from "./dtsModel";

describe.each([DTSNode, DTSObject])("%s identity transforms", (Type) => {
  it("matches Three through direct edits, identity resets and parent motion", () => {
    const actual = new Type();
    const expected = new Object3D();
    const roots = [actual, expected].map((object) => {
      const root = new Group();
      root.position.set(12, -3, 5);
      root.rotation.set(0.3, 0.7, -0.2);
      root.scale.set(2, 3, 4);
      root.add(object);
      const child = new Group();
      child.position.set(3, 1, -4);
      child.rotation.set(0.1, 0.4, 0.2);
      object.add(child);
      return root;
    });
    const edits = [
      () => {},
      (object: Object3D) => object.position.set(3, -2, 4),
      (object: Object3D) => object.rotation.set(0.5, -0.9, 0.3),
      (object: Object3D) => object.scale.set(-2, 3, 0.5),
      (object: Object3D) => {
        object.position.set(0, 0, 0);
        object.quaternion.identity();
        object.scale.set(1, 1, 1);
      },
      (object: Object3D) => {
        object.pivot = new Vector3(1, 2, 3);
        object.rotation.y = 0.7;
      },
      (object: Object3D) => {
        object.pivot = null;
        object.quaternion.identity();
      },
    ];
    for (const edit of edits) {
      for (const force of [undefined, false, true]) {
        for (const root of roots) {
          edit(root.children[0]);
          root.rotation.y += 0.2;
          root.updateMatrixWorld(force);
        }
        expect(actual.matrix.elements).toEqual(expected.matrix.elements);
        expect(actual.matrixWorld.elements).toEqual(
          expected.matrixWorld.elements,
        );
        expect(actual.children[0].matrixWorld.elements).toEqual(
          expected.children[0].matrixWorld.elements,
        );
        expect(actual.matrixWorldNeedsUpdate).toBe(false);
      }
    }
    // Queries remain current before the next renderer traversal.
    roots.forEach((root) => (root.position.x += 7));
    expect(actual.getWorldPosition(new Vector3())).toEqual(
      expected.getWorldPosition(new Vector3()),
    );
    // Detached nodes and newly mounted children must update too.
    for (const object of [actual, expected]) {
      object.removeFromParent();
      const child = new Group();
      child.position.y = 9;
      object.add(child);
      object.updateMatrixWorld();
    }
    expect(actual.matrixWorld.elements).toEqual(expected.matrixWorld.elements);
    expect(actual.children[1].matrixWorld.elements).toEqual(
      expected.children[1].matrixWorld.elements,
    );
  });

  it("retains manual local/world matrices and custom updateMatrix behavior", () => {
    const object = new Type();
    object.matrixAutoUpdate = false;
    object.matrix.makeTranslation(1, 2, 3);
    object.updateMatrixWorld(true);
    expect(object.matrixWorld.elements).toEqual(object.matrix.elements);
    object.matrixAutoUpdate = true;
    object.matrixWorldAutoUpdate = false;
    object.matrixWorld.makeTranslation(4, 5, 6);
    const world = object.matrixWorld.clone();
    object.updateMatrixWorld(true);
    expect(object.matrixWorld.elements).toEqual(world.elements);
    object.matrixWorldAutoUpdate = true;
    object.updateMatrix = () => {
      object.matrix.makeTranslation(7, 8, 9);
      object.matrixWorldNeedsUpdate = true;
    };
    object.updateMatrixWorld();
    expect(object.matrixWorld.elements).toEqual(object.matrix.elements);
    expect(object.matrixWorld.elements[12]).toBe(7);
  });

  it("avoids compose/multiply for identity controls while updating children", () => {
    const parent = new Group();
    parent.rotation.y = 0.7;
    const object = new Type();
    parent.add(object);
    const child = new Group();
    child.position.x = 2;
    object.add(child);
    const compose = vi.spyOn(object.matrix, "compose");
    const multiply = vi.spyOn(object.matrixWorld, "multiplyMatrices");
    parent.updateMatrixWorld();
    expect(compose).not.toHaveBeenCalled();
    expect(multiply).not.toHaveBeenCalled();
    expect(object.matrixWorld.elements).toEqual(parent.matrixWorld.elements);
    expect(child.matrixWorld.elements[12]).toBeCloseTo(2 * Math.cos(0.7));
  });
});
